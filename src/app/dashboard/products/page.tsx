"use client"

import { fmtQty } from "@/lib/format-number"
import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { useRole } from "@/contexts/RoleContext"
import { Plus, Edit, Trash2, Eye, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react"
import ActionSlots from "@/components/ActionSlots"

interface Product {
  id: number
  code: string
  name: string
  category: string | null
  cost_price: number
  sale_price: number
  opening_qty: number
  qty_on_hand: number
  unit: string
  total_inflow: number
  total_outflow: number
  image_path: string
  created_by?: string | null
  updated_by?: string | null
}

type SortField = "code" | "name" | "cost_price" | "sale_price" | "opening_qty" | "qty_on_hand" | "total_inflow" | "total_outflow"
type SortDir = "asc" | "desc"

function SkeletonRow({ colCount }: { colCount: number }) {
  const widths = [60, 70, 40, 40, 50, 50, 50, 50, 60, 60, 60].slice(0, colCount)
  return (
    <tr>
      {widths.map((w, i) => (
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
  const [expandedCostId, setExpandedCostId] = useState<number | null>(null)
  const [costBreakdown, setCostBreakdown] = useState<Record<number, any[]>>({})
  const [breakdownLoading, setBreakdownLoading] = useState<Record<number, boolean>>({})

  const toggleCostBreakdown = async (productId: number) => {
    if (expandedCostId === productId) {
      setExpandedCostId(null)
      return
    }
    setExpandedCostId(productId)
    if (!costBreakdown[productId]) {
      setBreakdownLoading(prev => ({ ...prev, [productId]: true }))
      const { data } = await supabase.rpc('get_product_cost_breakdown', {
        p_product_id: productId,
        p_company_id: companyId,
      })
      setCostBreakdown(prev => ({ ...prev, [productId]: data || [] }))
      setBreakdownLoading(prev => ({ ...prev, [productId]: false }))
    }
  }
  // ✅ Defaults to "" (falsy / non-construction) until fetched, so every
  // existing business type behaves exactly as before with zero delay —
  // only once we positively confirm businessType === 'construction' does
  // any label or column change take effect.
  const [businessType, setBusinessType] = useState<string>("")
  const isConstruction = businessType === "construction"

  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [categories, setCategories] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 25

  // âœ… New: true stock value across ALL products (all pages), separate
  // from the existing per-page "Closing Stock Value" card. null = not
  // yet loaded (card shows "â€¦" briefly instead of a misleading 0).
  const [allProductsValue, setAllProductsValue] = useState<number | null>(null)

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

  // ✅ New: fetch business_type, same pattern as every other page in the app.
  useEffect(() => {
    if (!companyId) return
    supabase.from("companies").select("business_type").eq("id", companyId).single()
      .then(({ data }) => { if (data) setBusinessType(data.business_type || "") })
  }, [companyId])

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

  // âœ… New: fetch every (non-deleted) product's opening_qty/cost_price plus
  // every stock_move for the company, compute qty_on_hand per product using
  // the exact same formula fetchProducts() already uses per-page, and sum
  // the value across ALL of them. Read-only, no pagination, independent of
  // search/category/page filters so it always reflects the true company total.
  const fetchAllProductsValue = () => {
    if (!companyId) return
    supabase
      .from("products")
      .select("id, opening_qty, cost_price")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .then(async ({ data: allProducts }) => {
        if (!allProducts || allProducts.length === 0) {
          setAllProductsValue(0)
          return
        }
        const allIds = allProducts.map((p: any) => p.id)
        const { data: allMoves } = await supabase
          .from("stock_moves")
          .select("product_id, qty")
          .in("product_id", allIds)
          .eq("company_id", companyId)

        const moveSums: Record<number, number> = {}
        if (allMoves) {
          allMoves.forEach((m: any) => {
            moveSums[m.product_id] = (moveSums[m.product_id] || 0) + Number(m.qty || 0)
          })
        }

        const value = allProducts.reduce((sum: number, p: any) => {
          const qtyOnHand = Number(p.opening_qty || 0) + (moveSums[p.id] || 0)
          return sum + qtyOnHand * Number(p.cost_price || 0)
        }, 0)
        setAllProductsValue(value)
      })
  }

  useEffect(() => { fetchAllProductsValue() }, [companyId])

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
    const label = isConstruction ? "unit/plot" : "product"
    if (!confirm(`Delete this ${label}?`)) return
    await supabase.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", companyId)
    setFlash(`${isConstruction ? "Unit/plot" : "Product"} deleted.`)
    fetchProducts()
    fetchAllProductsValue()
    setTimeout(() => setFlash(""), 3000)
  }

  const totalStockValue = products.reduce((sum, p) => sum + (p.qty_on_hand * (p.cost_price || 0)), 0)
  const totalProducts = total

  // ✅ Construction hides the Inflow/Outflow columns (pure stock-movement
  // language that doesn't fit one-off unit/plot sales) and relabels
  // Opening -> "Qty" and Closing -> "Available". Column count adjusts
  // accordingly so the skeleton loader and colgroup stay in sync.
  const colCount = isConstruction ? 8 : 10

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

  // Shared "average cost working" panel content, used by both the desktop
  // table's expandable row and the mobile card's expandable section.
  const renderCostBreakdown = (prod: Product) => (
    <>
      {breakdownLoading[prod.id] ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading...</div>
      ) : (costBreakdown[prod.id] || []).length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No opening balance or purchases recorded yet.</div>
      ) : (
        <table style={{ width: "100%", minWidth: 460, fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--text-muted)" }}>Step</th>
              <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--text-muted)" }}>Date</th>
              <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--text-muted)" }}>Qty</th>
              <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--text-muted)" }}>Price</th>
              <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--text-muted)" }}>Running Qty</th>
              <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--text-muted)" }}>Running Avg Cost</th>
            </tr>
          </thead>
          <tbody>
            {(costBreakdown[prod.id] || []).map((row: any, idx: number) => (
              <tr key={idx}>
                <td style={{ padding: "4px 8px" }}>{row.step_label}</td>
                <td style={{ padding: "4px 8px" }}>{row.step_date ? new Date(row.step_date).toLocaleDateString() : "-"}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtQty(row.qty)}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtQty(row.unit_price)}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtQty(row.running_qty)}</td>
                <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600 }}>{row.running_avg_cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(costBreakdown[prod.id] || []).length > 0 && (() => {
        const rows = costBreakdown[prod.id] || []
        const totalQty = rows.reduce((s: number, r: any) => s + Number(r.qty || 0), 0)
        const totalValue = rows.reduce((s: number, r: any) => s + Number(r.qty || 0) * Number(r.unit_price || 0), 0)
        const finalAvg = totalQty > 0 ? totalValue / totalQty : 0
        const formula = rows.map((r: any) => "(" + fmtQty(r.qty) + " x " + Number(r.unit_price).toFixed(2) + ")").join(" + ")
        return (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)", fontSize: 12 }}>
            <div>{formula} = {totalValue.toFixed(2)}</div>
            <div>{totalValue.toFixed(2)} / {fmtQty(totalQty)} = <b>{finalAvg.toFixed(2)}</b></div>
            <div style={{ marginTop: 4, color: "var(--text-muted)" }}>Current Average Cost (as of last recorded event, {fmtQty(totalQty)} units): <b>{finalAvg.toFixed(2)}</b></div>
          </div>
        )
      })()}
    </>
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
        .summary-value { font-size: 20px; font-weight: 800; color: var(--text); display: flex; align-items: baseline; gap: 4px; }
        .summary-value sup { font-size: 0.7em; font-weight: 600; color: var(--text-muted); }
        .card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; overflow: hidden;
          box-shadow: var(--shadow-sm);
        }

        .table-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: var(--border) var(--bg);
          width: 100%;
        }
        .table-scroll::-webkit-scrollbar { height: 8px; }
        .table-scroll::-webkit-scrollbar-track { background: var(--bg); border-radius: 4px; }
        .table-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
        .table-scroll::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
        .stock-table { min-width: 1200px; }

        /* -- DESKTOP HEADER -- */
        .header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 12px;
        }
        .header-row .title-area {
          flex: 1;
        }

        /* search + category row */
        .filter-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }
        .filter-row .search-group {
          flex: 1;
          max-width: 320px;
          position: relative;
        }
        .filter-row .filter-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* -- MOBILE -- */
        @media (max-width: 640px) {
          .page-wrap { padding: 12px !important; }
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .header-row {
            flex-direction: column;
            align-items: stretch;
          }
          .header-row .title-area {
            margin-bottom: 8px;
          }
          .filter-row {
            flex-direction: column;
            align-items: stretch;
          }
          .filter-row .search-group {
            max-width: 100%;
          }
          .filter-row .filter-group {
            width: 100%;
            justify-content: flex-end;
          }
        }

        /* -- Mobile card list: hidden by default (desktop/tablet shows the table) -- */
        .prod-cards { display: none; flex-direction: column; gap: 10px; }
        .prod-card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 14px 16px; box-shadow: var(--shadow-sm);
        }
        .prod-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
        .prod-card-name { font-size: 15px; font-weight: 700; color: var(--text); line-height: 1.3; }
        .prod-card-code { font-size: 12px; font-weight: 600; color: var(--primary); margin-top: 2px; }
        .prod-card-closing { font-size: 15px; font-weight: 800; white-space: nowrap; text-align: right; }
        .prod-card-prices { display: flex; gap: 14px; font-size: 13px; color: var(--text-muted); margin-top: 8px; }
        .prod-card-prices b { color: var(--text); font-weight: 600; }
        .prod-card-flow { display: flex; gap: 14px; font-size: 12px; color: var(--text-muted); margin-top: 4px; }
        .prod-card-actions { display: flex; justify-content: flex-end; gap: 4px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
        .prod-card-empty { text-align: center; color: var(--text-muted); padding: 32px 16px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; }
        .prod-card-breakdown { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border); font-size: 12px; overflow-x: auto; }

        /* -- Below 640px: switch from horizontal-scroll table to stacked cards -- */
        @media (max-width: 640px) {
          .desktop-table { display: none; }
          .prod-cards { display: flex; }
        }
      `}</style>

      {/* Header: title left, Add Product right */}
      <div className="header-row">
        <div className="title-area">
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>
            {isConstruction ? "🏗️ Units & Plots" : "📦 Stock Register"}
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            {isConstruction
              ? "Manage the rooms, units, or plots you sell"
              : "Manage inventory, view opening / inflow / outflow / closing"}
          </p>
        </div>
        {canEdit && (
          <button className="btn" onClick={() => router.push("/dashboard/products/new")}>
            <Plus size={16} /> {isConstruction ? "Add Unit / Plot" : "Add Product"}
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">{isConstruction ? "Total Units" : "Total Products"}</div>
          <div className="summary-value">{totalProducts}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">{isConstruction ? "Unsold Units Value" : "Closing Stock Value"}</div>
          <div className="summary-value" style={{ color: "#10B981" }}>
            <sup>PKR</sup> {totalStockValue.toLocaleString()}
          </div>
        </div>
        <div className="summary-item">
          <div className="summary-label">{isConstruction ? "Unsold Units Value (All Pages)" : "Total Stock Value (All Products, All Pages)"}</div>
          <div className="summary-value" style={{ color: "#10B981" }}>
            {allProductsValue === null ? (
              <span style={{ fontSize: 14, color: "var(--text-muted)" }}>Loading...</span>
            ) : (
              <><sup>PKR</sup> {allProductsValue.toLocaleString()}</>
            )}
          </div>
        </div>
      </div>

      {flash && (
        <div style={{ background: "var(--card)", border: flash.startsWith("Error") ? "1px solid #EF4444" : "1px solid #065F46", color: flash.startsWith("Error") ? "#FCA5A5" : "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {flash}
        </div>
      )}

      {/* Search + Category filter row: search left, category right */}
      <div className="filter-row">
        <div className="search-group">
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="search-input" placeholder={isConstruction ? "Search by