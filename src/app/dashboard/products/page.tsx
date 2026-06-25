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
      {[80, 120, 80, 80, 70, 70, 70, 70, 50, 120].map((w, i) => (
        <td key={i} style={{ padding: "12px 8px" }}>
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
    <div className="page-wrap" style={{ padding: "16px 20px", background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.8; }
          100% { opacity: 0.4; }
        }

        /* ── Scrollable Table ── */
        .table-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 4px;
        }
        .table-scroll::-webkit-scrollbar {
          height: 10px;
        }
        .table-scroll::-webkit-scrollbar-track {
          background: var(--bg);
          border-radius: 8px;
        }
        .table-scroll::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 8px;
        }
        .table-scroll::-webkit-scrollbar-thumb:hover {
          background: var(--text-muted);
        }
        .table-scroll {
          scrollbar-color: var(--border) var(--bg);
          scrollbar-width: thin;
        }

        .stock-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1200px;
        }
        .stock-table thead th {
          padding: 12px 8px;
          background: var(--card-hover);
          border-bottom: 2px solid var(--border);
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-muted);
          white-space: nowrap;
          user-select: none;
          text-align: left;
        }
        .stock-table thead th .sort-btn {
          background: none;
          border: none;
          cursor: pointer;
          font: inherit;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-muted);
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 0;
          white-space: nowrap;
        }
        .stock-table thead th .sort-btn:hover {
          color: var(--text);
        }
        .stock-table thead th.text-center {
          text-align: center;
        }
        .stock-table thead th.text-right {
          text-align: right;
        }

        .stock-table tbody td {
          padding: 10px 8px;
          border-bottom: 1px solid var(--border);
          font-size: 13px;
          vertical-align: middle;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .stock-table tbody td.text-center {
          text-align: center;
        }
        .stock-table tbody td.text-right {
          text-align: right;
        }
        .stock-table tbody tr:hover td {
          background: var(--card-hover);
        }

        .product-image {
          width: 28px;
          height: 28px;
          object-fit: cover;
          border-radius: 6px;
          display: block;
          margin: 0 auto;
        }

        .btn {
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          color: white;
          border: none;
          transition: all 0.2s;
          font-family: inherit;
        }
        .btn:hover {
          background: linear-gradient(135deg, #1E55E8 0%, #0F2280 100%);
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(7,19,82,0.45);
        }
        .btn-outline {
          background: transparent;
          color: var(--text-muted);
          border: 1.5px solid var(--border);
        }
        .btn-outline:hover {
          background: var(--card-hover);
          transform: translateY(-1px);
          box-shadow: none;
        }
        .btn-icon {
          background: transparent;
          border: 1.5px solid var(--border);
          color: var(--text-muted);
          padding: 4px 6px;
          border-radius: 6px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          line-height: 1;
          transition: all 0.15s;
        }
        .btn-icon:hover {
          background: var(--card-hover);
          border-color: var(--primary);
        }
        .btn-icon.danger:hover {
          border-color: #EF4444;
          color: #EF4444;
        }

        .search-input {
          width: 100%;
          height: 38px;
          border: 1.5px solid var(--border);
          border-radius: 8px;
          padding: 0 12px 0 36px;
          font-size: 13px;
          background: var(--card);
          color: var(--text);
          outline: none;
          box-sizing: border-box;
        }
        .search-input:focus {
          border-color: var(--primary);
        }

        .filter-select {
          height: 38px;
          border: 1.5px solid var(--border);
          border-radius: 8px;
          padding: 0 12px;
          font-size: 13px;
          background: var(--card);
          color: var(--text);
          outline: none;
        }
        .filter-select:focus {
          border-color: var(--primary);
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }
        .summary-item {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px;
        }
        .summary-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 4px;
        }
        .summary-value {
          font-size: 22px;
          font-weight: 800;
          color: var(--text);
        }

        .filter-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
          margin-bottom: 16px;
        }

        .card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: var(--shadow-sm);
          padding: 0;
        }

        .pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 16px;
          font-size: 13px;
          color: var(--text-muted);
        }

        @media (max-width: 640px) {
          .page-wrap { padding: 12px !important; }
          .summary-grid { grid-template-columns: 1fr 1fr !important; }
          .filter-bar { flex-direction: column; align-items: stretch; }
          .filter-bar > div { max-width: 100% !important; }
          .pagination { flex-direction: column; gap: 8px; align-items: stretch; }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
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

      {/* ── Summary ── */}
      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">Total Products</div>
          <div className="summary-value">{totalProducts}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Closing Stock Value</div>
          <div className="summary-value" style={{ color: "#10B981" }}>PKR {totalStockValue.toLocaleString()}</div>
        </div>
      </div>

      {/* ── Flash ── */}
      {flash && (
        <div style={{ background: "var(--card)", border: flash.startsWith("Error") ? "1px solid #EF4444" : "1px solid #065F46", color: flash.startsWith("Error") ? "#FCA5A5" : "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {flash}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="filter-bar">
        <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="search-input" placeholder="Search by name or code..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="filter-select" value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1) }}>
          <option value="">All Categories</option>
          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        {categoryFilter && (
          <button className="btn btn-outline" onClick={() => { setCategoryFilter(""); setPage(1); }} style={{ padding: "6px 12px" }}>
            Clear Filter
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div className="card">
        <div className="table-scroll">
          <table className="stock-table">
            <colgroup>
              <col style={{ minWidth: "120px" }} />  {/* Code */}
              <col style={{ minWidth: "200px" }} />  {/* Name */}
              <col style={{ minWidth: "80px" }} />   {/* Cost */}
              <col style={{ minWidth: "80px" }} />   {/* Sale */}
              <col style={{ minWidth: "70px" }} />   {/* Opening */}
              <col style={{ minWidth: "70px" }} />   {/* Inflow */}
              <col style={{ minWidth: "70px" }} />   {/* Outflow */}
              <col style={{ minWidth: "80px" }} />   {/* Closing */}
              <col style={{ minWidth: "50px" }} />   {/* Img */}
              <col style={{ minWidth: "130px" }} />  {/* Actions */}
            </colgroup>
            <thead>
              <tr>
                <th>
                  <button className="sort-btn" onClick={() => handleSort("code")}>
                    Code {getSortIcon("code")}
                  </button>
                </th>
                <th>
                  <button className="sort-btn" onClick={() => handleSort("name")}>
                    Name {getSortIcon("name")}
                  </button>
                </th>
                <th className="text-center">
                  <button className="sort-btn" onClick={() => handleSort("cost_price")}>
                    Cost {getSortIcon("cost_price")}
                  </button>
                </th>
                <th className="text-center">
                  <button className="sort-btn" onClick={() => handleSort("sale_price")}>
                    Sale {getSortIcon("sale_price")}
                  </button>
                </th>
                <th className="text-center">
                  <button className="sort-btn" onClick={() => handleSort("opening_qty")}>
                    Opening {getSortIcon("opening_qty")}
                  </button>
                </th>
                <th className="text-center">
                  <button className="sort-btn" onClick={() => handleSort("total_inflow")}>
                    Inflow {getSortIcon("total_inflow")}
                  </button>
                </th>
                <th className="text-center">
                  <button className="sort-btn" onClick={() => handleSort("total_outflow")}>
                    Outflow {getSortIcon("total_outflow")}
                  </button>
                </th>
                <th className="text-center">
                  <button className="sort-btn" onClick={() => handleSort("qty_on_hand")}>
                    Closing {getSortIcon("qty_on_hand")}
                  </button>
                </th>
                <th className="text-center">Img</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
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
                      <td><span style={{ fontWeight: 600, color: "var(--primary)" }}>{prod.code}</span></td>
                      <td style={{ maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{prod.name}</td>
                      <td className="text-center">PKR {prod.cost_price?.toLocaleString()}</td>
                      <td className="text-center">PKR {prod.sale_price?.toLocaleString()}</td>
                      <td className="text-center">{prod.opening_qty}</td>
                      <td className="text-center" style={{ color: "#10B981" }}>{inflow}</td>
                      <td className="text-center" style={{ color: "#EF4444" }}>{outflow}</td>
                      <td className="text-center" style={{ fontWeight: 600 }}>{closing}</td>
                      <td className="text-center">
                        {prod.image_path ? (
                          <img src={prod.image_path} alt="" className="product-image" />
                        ) : "—"}
                      </td>
                      <td className="text-center">
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          <button className="btn-icon" onClick={() => router.push(`/dashboard/products/new?id=${prod.id}`)} title="Edit">
                            <Edit size={13} />
                          </button>
                          <button className="btn-icon danger" onClick={() => handleDelete(prod.id)} title="Delete">
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

      {/* ── Pagination ── */}
      {total > pageSize && (
        <div className="pagination">
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