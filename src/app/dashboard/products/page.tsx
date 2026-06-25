"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { useRole } from "@/contexts/RoleContext"
import { Plus, Edit, Trash2, Eye, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react"

interface Product {
  id: number
  code: string
  name: string
  category: string | null
  cost_price: number
  sale_price: number
  opening_qty: number
  qty_on_hand: number
  total_inflow: number
  total_outflow: number
  image_path: string
  created_by?: string | null
  updated_by?: string | null
}

type SortField = "code" | "name" | "cost_price" | "sale_price" | "opening_qty" | "qty_on_hand" | "total_inflow" | "total_outflow"
type SortDir = "asc" | "desc"

function SkeletonRow() {
  return (
    <tr>
      {[60, 70, 40, 40, 50, 50, 50, 50, 60, 60, 60].map((w, i) => (
        <td key={i} style={{ padding: "12px 16px" }}>
          <div style={{
            width: `${w}%`,
            height: 12,
            background: "var(--bg-soft)",
            borderRadius: 4,
            animation: "shimmer 1.5s ease-in-out infinite"
          }} />
        </td>
      ))}
    </tr>
  )
}

export default function StockRegisterPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role, loading: roleLoading } = useRole()
  const canEdit = role === "admin" || role === "accountant"
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [categories, setCategories] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 25

  const [sortField, setSortField] = useState<SortField>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [flash, setFlash] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    supabase
      .from("products")
      .select("category")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .not("category", "is", null)
      .then(({ data }) => {
        if (data) {
          const unique = Array.from(new Set(data.map(item => item.category).filter(Boolean))) as string[]
          setCategories(unique.sort())
        }
      })
  }, [companyId])

  const fetchProducts = () => {
    if (!companyId) return
    setLoading(true)
    const start = (page - 1) * pageSize
    const end = start + pageSize - 1

    let query = supabase
      .from("products")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .is("deleted_at", null)

    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    }
    if (categoryFilter) {
      query = query.eq("category", categoryFilter)
    }

    query = query.order(sortField, { ascending: sortDir === "asc" })
    query.range(start, end).then(async ({ data, count }) => {
      if (!data || data.length === 0) {
        setProducts([])
        setTotal(0)
        setLoading(false)
        return
      }

      const productIds = data.map((p: any) => p.id)
      const { data: moves } = await supabase
        .from("stock_moves")
        .select("product_id, qty")
        .in("product_id", productIds)
        .eq("company_id", companyId)

      const inflowMap: Record<number, number> = {}
      const outflowMap: Record<number, number> = {}
      if (moves) {
        moves.forEach((m: any) => {
          const qty = m.qty || 0
          if (qty > 0) {
            inflowMap[m.product_id] = (inflowMap[m.product_id] || 0) + qty
          } else {
            outflowMap[m.product_id] = (outflowMap[m.product_id] || 0) + Math.abs(qty)
          }
        })
      }

      const enriched = data.map((p: any) => {
        const inflow = inflowMap[p.id] || 0
        const outflow = outflowMap[p.id] || 0
        return {
          ...p,
          total_inflow: inflow,
          total_outflow: outflow,
          qty_on_hand: (p.opening_qty || 0) + inflow - outflow,
        }
      })

      setProducts(enriched)
      setTotal(count || 0)
      setLoading(false)
    })
  }

  useEffect(() => { fetchProducts() }, [companyId, search, categoryFilter, page, sortField, sortDir])

  const handleSort = (col: SortField) => {
    if (sortField === col) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(col)
      setSortDir("asc")
    }
  }

  const getSortIcon = (col: SortField) => {
    if (sortField !== col) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this product?")) return
    await supabase.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", companyId)
    setFlash("Product deleted.")
    fetchProducts()
    setTimeout(() => setFlash(""), 3000)
  }

  const totalStockValue = products.reduce((sum, p) => sum + (p.qty_on_hand * (p.cost_price || 0)), 0)
  const totalProducts = total

  // ── EXACT SAME HEADER STYLES AS INVOICE LIST ──
  const thStyle: React.CSSProperties = {
    padding: "12px 16px",
    background: "var(--card-hover)",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    userSelect: "none",
  }
  const tdStyle: React.CSSProperties = {
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
    verticalAlign: "middle",
  }

  const SortTh = ({ field, children, style }: { field: SortField; children: React.ReactNode; style?: React.CSSProperties }) => (
    <th style={{ ...thStyle, ...style }}>
      <button
        onClick={() => handleSort(field)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          font: "inherit", fontSize: 12, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)",
          display: "inline-flex", alignItems: "center", gap: 4, padding: 0,
          whiteSpace: "nowrap",
        }}
      >
        {children} {getSortIcon(field)}
      </button>
    </th>
  )

  if (roleLoading || !role) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  }
  if (!canView) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>
  }
  if (!companyId) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading company data...</div>
  }

  return (
    <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
        .stock-table { width: 100%; border-collapse: collapse; }
        .stock-table tbody tr:last-child td { border-bottom: none; }
        .stock-table tbody tr:hover td { background: var(--card-hover); }
        .btn {
          padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          color: white; border: none; transition: all 0.2s;
        }
        .btn:hover {
          background: linear-gradient(135deg, #1E55E8 0%, #0F2280 100%);
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(7,19,82,0.45);
        }
        .btn-outline {
          background: transparent; color: var(--text-muted); border: 1.5px solid var(--border);
        }
        .btn-outline:hover {
          background: var(--card-hover);
          transform: translateY(-1px);
          box-shadow: none;
        }
        .btn-icon {
          background: transparent; border: 1.5px solid var(--border);
          color: var(--text-muted); padding: 5px; border-radius: 6px;
          cursor: pointer; display: inline-flex; align-items: center;
          justify-content: center; flex-shrink: 0; line-height: 1;
        }
        .btn-icon:hover { background: var(--card-hover); }
        .search-input {
          width: 100%; height: 38px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px;
          background: var(--card); color: var(--text); outline: none;
          box-sizing: border-box;
        }
        .search-input:focus { border-color: var(--primary); }
        .filter-select {
          height: 38px;
          border: 1.5px solid var(--border);
          border-radius: 8px;
          padding: 0 12px;
          font-size: 13px;
          background: var(--card);
          color: var(--text);
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px; margin-bottom: 20px;
        }
        .summary-item {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px;
        }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
        .card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; overflow: hidden;
          box-shadow: var(--shadow-sm);
        }

        /* ── ENHANCED SCROLL AREA ── */
        .table-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: var(--border) var(--bg);
          /* Ensure the container itself doesn't force a max width */
          width: 100%;
        }
        .table-scroll::-webkit-scrollbar {
          height: 8px;
        }
        .table-scroll::-webkit-scrollbar-track {
          background: var(--bg);
          border-radius: 4px;
        }
        .table-scroll::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 4px;
        }
        .table-scroll::-webkit-scrollbar-thumb:hover {
          background: var(--text-muted);
        }

        /* ── WIDER TABLE MIN-WIDTH TO FORCE SCROLL ── */
        .stock-table {
          min-width: 1200px;
        }

        /* ── MOBILE ADJUSTMENTS ── */
        @media (max-width: 640px) {
          .page-wrap { padding: 12px !important; }
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .filter-bar { flex-direction: column; align-items: stretch; }
          .filter-bar > div { max-width: 100% !important; }
          /* Make the top action bar wrap nicely */
          .page-header {
            flex-direction: column;
            align-items: flex-start;
          }
        }

        .filter-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
          margin-bottom: 16px;
        }
      `}</style>

      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📦 Stock Register</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Manage inventory, view opening / inflow / outflow / closing</p>
        </div>
        {canEdit && (
          <button className="btn" onClick={() => router.push("/dashboard/products/new")}>
            <Plus size={16} /> Add Product
          </button>
        )}
      </div>

      <div className="summary-grid">
        <div className="summary-item"><div className="summary-label">Total Products</div><div className="summary-value">{totalProducts}</div></div>
        <div className="summary-item"><div className="summary-label">Closing Stock Value</div><div className="summary-value" style={{ color: "#10B981" }}>PKR {totalStockValue.toLocaleString()}</div></div>
      </div>

      {flash && (
        <div style={{ background: "var(--card)", border: flash.startsWith("Error") ? "1px solid #EF4444" : "1px solid #065F46", color: flash.startsWith("Error") ? "#FCA5A5" : "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {flash}
        </div>
      )}

      <div className="filter-bar">
        <div style={{ position: "relative", flex: 1, maxWidth: 320, width: "100%" }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="search-input" placeholder="Search by name or code..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} style={{ width: "100%" }} />
        </div>
        <select className="filter-select" value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1) }}>
          <option value="">All Categories</option>
          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        {categoryFilter && (
          <button className="btn btn-outline" onClick={() => { setCategoryFilter(""); setPage(1); }} style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>
            Clear Filter
          </button>
        )}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <div className="table-scroll">
          <table className="stock-table">
            <colgroup>
              <col style={{ minWidth: "150px" }} />
              <col style={{ minWidth: "250px" }} />
              <col style={{ minWidth: "100px" }} />
              <col style={{ minWidth: "100px" }} />
              <col style={{ minWidth: "90px" }} />
              <col style={{ minWidth: "90px" }} />
              <col style={{ minWidth: "90px" }} />
              <col style={{ minWidth: "100px" }} />
              <col style={{ minWidth: "60px" }} />
              <col style={{ minWidth: "150px" }} />
            </colgroup>
            <thead>
              <tr>
                <SortTh field="code">Code</SortTh>
                <SortTh field="name" style={{ textAlign: "left" }}>Name</SortTh>
                <SortTh field="cost_price" style={{ textAlign: "right" }}>Cost</SortTh>
                <SortTh field="sale_price" style={{ textAlign: "right" }}>Sale</SortTh>
                <SortTh field="opening_qty" style={{ textAlign: "right" }}>Opening</SortTh>
                <SortTh field="total_inflow" style={{ textAlign: "right" }}>Inflow</SortTh>
                <SortTh field="total_outflow" style={{ textAlign: "right" }}>Outflow</SortTh>
                <SortTh field="qty_on_hand" style={{ textAlign: "right" }}>Closing</SortTh>
                <th style={{ ...thStyle, textAlign: "center" }}>Img</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                    No products found. {canEdit && "Add a product to get started."}
                  </td>
                </tr>
              ) : (
                products.map((prod) => {
                  const inflow = prod.total_inflow
                  const outflow = prod.total_outflow
                  const closing = prod.qty_on_hand
                  return (
                    <tr key={prod.id}>
                      <td style={tdStyle}><span style={{ fontWeight: 600, color: "var(--primary)" }}>{prod.code}</span></td>
                      <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prod.name}</td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>PKR {prod.cost_price?.toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>PKR {prod.sale_price?.toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>{prod.opening_qty}</td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#10B981" }}>{inflow}</td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#EF4444" }}>{outflow}</td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 600 }}>{closing}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {prod.image_path ? (
                          <img src={prod.image_path} alt="" style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 4 }} />
                        ) : "—"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          <button className="btn-icon" onClick={() => router.push(`/dashboard/products/new?id=${prod.id}`)} title="Edit">
                            <Edit size={13} />
                          </button>
                          <button className="btn-icon" onClick={() => handleDelete(prod.id)} style={{ color: "#EF4444" }} title="Delete">
                            <Trash2 size={13} />
                          </button>
                          <button className="btn-icon" onClick={() => router.push(`/dashboard/reports/product-ledger?productId=${prod.id}`)} title="View Ledger">
                            <Eye size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {total > pageSize && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 13, color: "var(--text-muted)" }}>
          <span>Showing {Math.min(pageSize, total - (page-1)*pageSize)} of {total}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn btn-outline" disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  )
}