"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface Receipt {
  id: number
  receipt_no: string
  date: string
  amount: number
  customer?: { name: string }
  payment_method: string
  reference: string
}

export default function ReceiptsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!role) return
    if (!canView) {
      setLoading(false)
      return
    }
    supabase
      .from("receipts")
      .select("*, customer:customers(name)")
      .order("date", { ascending: false })
      .then(({ data }) => {
        if (data) setReceipts(data)
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
          .rec-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
          .rec-title { font-size: 22px; font-weight: 800; color: #1E293B; }
          .rec-subtitle { font-size: 13px; color: #94A3B8; }
          .rec-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
          .rec-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
          .rec-table { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
          .rec-table-header, .rec-table-row { display: grid; grid-template-columns: 120px 1fr 120px 100px 120px 100px; padding: 10px 14px; border-bottom: 1px solid #F1F5F9; font-size: 12px; align-items: center; }
          .rec-table-header { background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; }
          .rec-table-row:hover { background: #FAFBFF; }
          @media (max-width: 768px) {
            .rec-table-header, .rec-table-row { grid-template-columns: 100px 1fr 100px 80px; }
            .rec-hide-mobile { display: none; }
          }
        `}</style>

        <div className="rec-header">
          <div>
            <div className="rec-title">💰 Receipts</div>
            <div className="rec-subtitle">{canEdit ? "Record customer payments" : "View receipts"}</div>
          </div>
          {canEdit && (
            <button className="rec-btn rec-btn-primary" onClick={() => router.push("/dashboard/receipts/new")}>
              <Plus size={16} /> New Receipt
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading receipts...</div>
        ) : receipts.length === 0 ? (
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 40, textAlign: "center", color: "#94A3B8" }}>
            No receipts yet. {canEdit && 'Click "New Receipt" to record one.'}
          </div>
        ) : (
          <div className="rec-table">
            <div className="rec-table-header">
              <span>Receipt #</span>
              <span>Customer</span>
              <span className="rec-hide-mobile">Date</span>
              <span>Amount</span>
              <span>Method</span>
              <span></span>
            </div>
            {receipts.map((rec) => (
              <div key={rec.id} className="rec-table-row">
                <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{rec.receipt_no}</span>
                <span>{rec.customer?.name || "—"}</span>
                <span className="rec-hide-mobile" style={{ color: "#64748B" }}>{new Date(rec.date).toLocaleDateString()}</span>
                <span style={{ fontWeight: 600 }}>PKR {rec.amount.toLocaleString()}</span>
                <span>{rec.payment_method || "—"}</span>
                <span>
                  <button style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B" }} onClick={() => router.push(`/dashboard/receipts/${rec.id}`)}>
                    <Eye size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  )
}