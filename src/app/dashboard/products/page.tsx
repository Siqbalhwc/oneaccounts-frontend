"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { useRole } from "@/contexts/RoleContext"
import { Plus, Edit, Trash2, ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react"

interface Product {
  id: number
  code: string
  name: string
  cost_price: number
  sale_price: number
  opening_qty: number
  qty_on_hand: number
  total_inflow: number
  total_outflow: number
  image_path: string
}

type SortField = "code" | "name" | "cost_price" | "sale_price" | "opening_qty" | "qty_on_hand" | "total_inflow" | "total_outflow"
type SortDir = "asc" | "desc"

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
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 25

  // Sorting
  const [sortField, setSortField] = useState<SortField>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  // Flash message
  const [flash, setFlash] = useState("")

  // ── Get company ID ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // ── Fetch products (with sorting, search, soft‑delete filter) ──
  const fetchProducts = () => {
    if (!companyId) return
    setLoading(true)
    const start = (page - 1) * pageSize
    const end = start + pageSize - 1

    let query = supabase
      .from("products")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .is("deleted_at", null)               // hide soft‑deleted

    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    }

    query = query.order(sortField, { ascending: sortDir === "asc" })
    query.range(start, end).then(({ data, count }) => {
      const enriched = (data || []).map((p: any) => ({
        ...p,
        total_inflow: p.total_inflow || 0,
        total_outflow: p.total_outflow || 0,
      }))
      setProducts(enriched)
      setTotal(count || 0)
      setLoading(false)
    })
  }

  useEffect(() => { fetchProducts() }, [companyId, search, page, sortField, sortDir])

  // Sort handlers
  const handleSort = (col: SortField) => {
    if (sortField === col) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(col)
      setSortDir("asc")
    }
  }

  const getSortIcon = (col: SortField) => {
    if (sortField !== col) return <ArrowUpDown size={12} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  // ── Soft delete ──
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this product?")) return
    await supabase.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", companyId)
    setFlash("Product deleted.")
    fetchProducts()
    setTimeout(() => setFlash(""), 3000)
  }

  // Summary stats
  const totalStockValue = products.reduce((sum, p) => sum + (p.qty_on_hand || 0) * (p.cost_price || 0), 0)
  const totalProducts = total

  if (roleLoading || !role) {
    return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading...</div>
  }
  if (!canView) {
    return <div style={{ padding: 40, textAlign: "center", color: "#E2E8F0" }}><h2>Access Denied</h2></div>
  }
  if (!companyId) {
    return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading company data...</div>
  }

  return (
    <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .card { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.2); overflow: hidden; }
        .header-row { display: grid; grid-template-columns: 60px 1fr 80px 80px 60px 60px 60px 60px 40px 30px 30px; padding: 12px 20px; background: #1E293B; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94A3B8; border-bottom: 1px solid #1E293B; }
        .data-row { display: grid; grid-template-columns: 60px 1fr 80px 80px 60px 60px 60px 60px 40px 30px 30px; padding: 10px 20px; border-bottom: 1px solid #1E293B; font-size: 13px; align-items: center; transition: background 0.15s; }
        .data-row:hover { background: #1E293B; }
        .data-row:last-child { border-bottom: none; }
        .sort-btn { background: none; border: none; cursor: pointer; font: inherit; color: inherit; display: inline-flex; align-items: center; gap: 4px; padding: 0; font-weight: 700; text-transform: uppercase; font-size: 10px; }
        .sort-btn:hover { color: #93C5FD; }
        .search-input { height: 38px; border: 1.5px solid #334155; border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px; width: 260px; box-sizing: border-box; outline: none; font-family: inherit; background: #1E293B; color: #F1F5F9; }
        .search-input:focus { border-color: #64748B; }
        .btn { padding: 8px 16px; border-radius: 8px; border: 1.5px solid #334155; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-outline { background: transparent; color: white; border-color: #334155; }
        .btn-outline:hover { background: #1E293B; }
        .btn-icon { background: transparent; border: 1.5px solid #334155; color: #CBD5E1; padding: 6px; border-radius: 8px; cursor: pointer; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-item { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 16px; }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94A3B8; margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: #F1F5F9; }
        @media (max-width: 1100px) {
          .header-row, .data-row { grid-template-columns: 50px 1fr 70px 70px 50px 50px 50px 50px 30px 20px 20px; }
          .header-row span:nth-child(5), .data-row span:nth-child(5),
          .header-row span:nth-child(6), .data-row span:nth-child(6),
          .header-row span:nth-child(7), .data-row span:nth-child(7) { display: none; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>📦 Stock Register</h1>
          <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>Manage inventory, view opening / inflow / outflow / closing</p>
        </div>
        {canEdit && (
          <button className="btn btn-outline" onClick={() => router.push("/dashboard/products/new")}>
            <Plus size={16} /> Add Product
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">Total Products</div>
          <div className="summary-value">{totalProducts}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Total Stock Value</div>
          <div className="summary-value" style={{ color: "#10B981" }}>PKR {totalStockValue.toLocaleString()}</div>
        </div>
      </div>

      {flash && (
        <div style={{ background: flash.startsWith("Error") ? "#1E293B" : "#064E3B", border: flash.startsWith("Error") ? "1px solid #EF4444" : "1px solid #065F46", color: flash.startsWith("Error") ? "#FCA5A5" : "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {flash}
        </div>
      )}

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
        <input
          className="search-input"
          placeholder="Search by name or code..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      {/* Products Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading products…</div>
      ) : products.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>
          No products found. {canEdit && "Add a product to get started."}
        </div>
      ) : (
        <div className="card">
          <div className="header-row">
            <button className="sort-btn" onClick={() => handleSort("code")}>Code {getSortIcon("code")}</button>
            <button className="sort-btn" onClick={() => handleSort("name")}>Name {getSortIcon("name")}</button>
            <button className="sort-btn" onClick={() => handleSort("cost_price")}>Cost {getSortIcon("cost_price")}</button>
            <button className="sort-btn" onClick={() => handleSort("sale_price")}>Sale {getSortIcon("sale_price")}</button>
            <span style={{ textAlign: "center" }}>Opening</span>
            <span style={{ textAlign: "center" }}>Inflow</span>
            <span style={{ textAlign: "center" }}>Outflow</span>
            <span style={{ textAlign: "center" }}>Closing</span>
            <span>Img</span>
            <span></span>
            <span></span>
          </div>
          {products.map(prod => {
            const totalInflow = prod.total_inflow || 0
            const totalOutflow = prod.total_outflow || 0
            const closing = (prod.opening_qty || 0) + totalInflow - totalOutflow
            return (
              <div key={prod.id} className="data-row">
                <span style={{ fontWeight: 600, color: "#93C5FD" }}>{prod.code}</span>
                <span style={{ color: "#E2E8F0" }}>{prod.name}</span>
                <span style={{ color: "#E2E8F0" }}>PKR {prod.cost_price?.toLocaleString()}</span>
                <span style={{ color: "#E2E8F0" }}>PKR {prod.sale_price?.toLocaleString()}</span>
                <span style={{ textAlign: "center", color: "#E2E8F0" }}>{prod.opening_qty}</span>
                <span style={{ textAlign: "center", color: "#10B981" }}>{totalInflow}</span>
                <span style={{ textAlign: "center", color: "#EF4444" }}>{totalOutflow}</span>
                <span style={{ textAlign: "center", fontWeight: 600, color: "#E2E8F0" }}>{closing}</span>
                <span style={{ textAlign: "center" }}>
                  {prod.image_path ? (
                    <img src={prod.image_path} alt="" style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 4 }} />
                  ) : "—"}
                </span>
                <button className="btn-icon" onClick={() => router.push(`/dashboard/products/new?id=${prod.id}`)} title="Edit"><Edit size={14} /></button>
                <button className="btn-icon" onClick={() => handleDelete(prod.id)} style={{ color: "#EF4444" }} title="Delete"><Trash2 size={14} /></button>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 13, color: "#94A3B8" }}>
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