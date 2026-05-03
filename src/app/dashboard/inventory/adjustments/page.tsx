"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Pencil, Trash2 } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface Adjustment {
  id: number
  product_id: number
  qty: number
  date: string
  reason: string
  product?: { code: string; name: string }
}

export default function InventoryAdjustmentsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!role) return
    if (!canView) {
      setLoading(false)
      return
    }
    supabase
      .from("stock_moves")          // assuming your inventory adjustments are stored here
      .select("*, product:products(code, name)")
      .order("date", { ascending: false })
      .then(({ data }) => {
        if (data) setAdjustments(data)
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
          .adj-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
          .adj-title { font-size: 22px; font-weight: 800; color: #1E293B; }
          .adj-subtitle { font-size: 13px; color: #94A3B8; }
          .adj-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
          .adj-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
          .adj-table { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
          .adj-table-header, .adj-table-row { display: grid; grid-template-columns: 120px 1fr 100px 120px 1fr 80px 80px; padding: 10px 14px; border-bottom: 1px solid #F1F5F9; font-size: 12px; align-items: center; }
          .adj-table-header { background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; }
          .adj-table-row:hover { background: #FAFBFF; }
          @media (max-width: 768px) {
            .adj-table-header, .adj-table-row { grid-template-columns: 80px 1fr 80px 80px; }
            .adj-hide-mobile { display: none; }
          }
        `}</style>

        <div className="adj-header">
          <div>
            <div className="adj-title">⚖️ Inventory Adjustments</div>
            <div className="adj-subtitle">{canEdit ? "Adjust stock quantities" : "View adjustments"}</div>
          </div>
          {canEdit && (
            <button className="adj-btn adj-btn-primary" onClick={() => router.push("/dashboard/inventory/adjustments/new")}>
              <Plus size={16} /> New Adjustment
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div>
        ) : adjustments.length === 0 ? (
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 40, textAlign: "center", color: "#94A3B8" }}>
            No adjustments yet. {canEdit && 'Click "New Adjustment" to create one.'}
          </div>
        ) : (
          <div className="adj-table">
            <div className="adj-table-header">
              <span>Product</span>
              <span>Name</span>
              <span className="adj-hide-mobile">Quantity</span>
              <span>Date</span>
              <span>Reason</span>
              <span></span>
            </div>
            {adjustments.map((adj) => (
              <div key={adj.id} className="adj-table-row">
                <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{adj.product?.code || "—"}</span>
                <span>{adj.product?.name || "—"}</span>
                <span className="adj-hide-mobile">{adj.qty > 0 ? `+${adj.qty}` : adj.qty}</span>
                <span>{new Date(adj.date).toLocaleDateString()}</span>
                <span>{adj.reason || "—"}</span>
                <span>
                  {canEdit && (
                    <>
                      <button style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B", marginRight: 8 }} onClick={() => router.push(`/dashboard/inventory/adjustments/${adj.id}`)}>
                        <Pencil size={13} />
                      </button>
                      <button style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444" }} onClick={async () => {
                        if (confirm("Delete this adjustment?")) {
                          await supabase.from("stock_moves").delete().eq("id", adj.id)
                          setAdjustments(prev => prev.filter(a => a.id !== adj.id))
                        }
                      }}>
                        <Trash2 size={13} />
                      </button>
                    </>
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