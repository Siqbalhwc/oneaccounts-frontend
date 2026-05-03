"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Pencil } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface Product {
  id: number
  code: string
  name: string
  unit_price: number
  cost_price: number
  qty_on_hand: number
  type: string
}

export default function ProductsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!role) return
    if (!canView) {
      setLoading(false)
      return
    }
    supabase
      .from("products")
      .select("*")
      .order("code")
      .then(({ data }) => {
        if (data) setProducts(data)
        setLoading(false)
      })
  }, [role, canView])

  if (!role) return <div style={{ padding: 24, textAlign: "center" }}>Loading...</div>
  if (!canView) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
        <style>{`
          .prd-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
          .prd-title { font-size: 22px; font-weight: 800; color: #1E293B; }
          .prd-subtitle { font-size: 13px; color: #94A3B8; }
          .prd-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
          .prd-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
          .prd-table { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
          .prd-table-header, .prd-table-row { display: grid; grid-template-columns: 80px 1fr 100px 100px 80px 80px; padding: 10px 14px; border-bottom: 1px solid #F1F5F9; font-size: 12px; align-items: center; }
          .prd-table-header { background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; }
          .prd-table-row:hover { background: #FAFBFF; }
          @media (max-width: 768px) {
            .prd-table-header, .prd-table-row { grid-template-columns: 80px 1fr 80px 80px; }
            .prd-hide-mobile { display: none; }
          }
        `}</style>

        <div className="prd-header">
          <div>
            <div className="prd-title">📦 Products</div>
            <div className="prd-subtitle">{canEdit ? "Manage your inventory items" : "View products"}</div>
          </div>
          {canEdit && (
            <button className="prd-btn prd-btn-primary" onClick={() => router.push("/dashboard/products/new")}>
              <Plus size={16} /> Add Product
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading products...</div>
        ) : products.length === 0 ? (
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 40, textAlign: "center", color: "#94A3B8" }}>
            No products found. {canEdit && 'Click "Add Product" to add one.'}
          </div>
        ) : (
          <div className="prd-table">
            <div className="prd-table-header">
              <span>Code</span>
              <span>Name</span>
              <span className="prd-hide-mobile">Sale Price</span>
              <span className="prd-hide-mobile">Cost</span>
              <span>Stock</span>
              <span></span>
            </div>
            {products.map((p) => (
              <div key={p.id} className="prd-table-row">
                <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{p.code}</span>
                <span>{p.name}</span>
                <span className="prd-hide-mobile">{p.unit_price ? `PKR ${p.unit_price.toLocaleString()}` : "—"}</span>
                <span className="prd-hide-mobile">{p.cost_price ? `PKR ${p.cost_price.toLocaleString()}` : "—"}</span>
                <span>{p.qty_on_hand || 0}</span>
                <span>
                  {canEdit && (
                    <button
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B" }}
                      onClick={() => router.push(`/dashboard/products/${p.id}`)}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  )
}