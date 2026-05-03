"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface Bill {
  id: number
  invoice_no: string
  date: string
  total: number
  paid: number
  status: string
  party?: { name: string }
}

export default function BillsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!role) return
    if (!canView) {
      setLoading(false)
      return
    }
    supabase
      .from("invoices")           // your bills are stored in the same invoices table with type 'purchase'
      .select("*, party:suppliers(name)")
      .eq("type", "purchase")
      .order("date", { ascending: false })
      .then(({ data }) => {
        if (data) setBills(data)
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
          .bill-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
          .bill-title { font-size: 22px; font-weight: 800; color: #1E293B; }
          .bill-subtitle { font-size: 13px; color: #94A3B8; }
          .bill-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
          .bill-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
          .bill-table { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
          .bill-table-header, .bill-table-row { display: grid; grid-template-columns: 120px 1fr 120px 100px 120px 100px; padding: 10px 14px; border-bottom: 1px solid #F1F5F9; font-size: 12px; align-items: center; }
          .bill-table-header { background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; }
          .bill-table-row:hover { background: #FAFBFF; }
          .bill-badge { padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; }
          @media (max-width: 768px) {
            .bill-table-header, .bill-table-row { grid-template-columns: 100px 1fr 100px 80px; }
            .bill-hide-mobile { display: none; }
          }
        `}</style>

        <div className="bill-header">
          <div>
            <div className="bill-title">📦 Purchase Bills</div>
            <div className="bill-subtitle">{canEdit ? "Manage your purchase bills" : "View bills"}</div>
          </div>
          {canEdit && (
            <button className="bill-btn bill-btn-primary" onClick={() => router.push("/dashboard/bills/new")}>
              <Plus size={16} /> New Bill
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading bills...</div>
        ) : bills.length === 0 ? (
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 40, textAlign: "center", color: "#94A3B8" }}>
            No bills yet. {canEdit && 'Click "New Bill" to create one.'}
          </div>
        ) : (
          <div className="bill-table">
            <div className="bill-table-header">
              <span>Bill #</span>
              <span>Supplier</span>
              <span className="bill-hide-mobile">Date</span>
              <span>Total</span>
              <span>Status</span>
              <span></span>
            </div>
            {bills.map((bill) => (
              <div key={bill.id} className="bill-table-row">
                <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{bill.invoice_no}</span>
                <span>{bill.party?.name || "—"}</span>
                <span className="bill-hide-mobile" style={{ color: "#64748B" }}>{new Date(bill.date).toLocaleDateString()}</span>
                <span style={{ fontWeight: 600 }}>PKR {bill.total.toLocaleString()}</span>
                <span>
                  <span className="bill-badge" style={{
                    background: bill.status === "Paid" ? "#D1FAE5" : bill.status === "Overdue" ? "#FEE2E2" : "#FEF3C7",
                    color: bill.status === "Paid" ? "#065F46" : bill.status === "Overdue" ? "#991B1B" : "#92400E",
                  }}>
                    {bill.status}
                  </span>
                </span>
                <span>
                  <button style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B" }} onClick={() => router.push(`/dashboard/bills/${bill.id}`)}>
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