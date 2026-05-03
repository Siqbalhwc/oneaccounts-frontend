"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface Invoice {
  id: number
  invoice_no: string
  date: string
  total: number
  paid: number
  status: string
  party?: { name: string }
}

export default function InvoicesPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!role) return
    if (!canView) {
      setLoading(false)
      return
    }
    supabase
      .from("invoices")
      .select("*, party:customers(name)")
      .eq("type", "sale")
      .order("date", { ascending: false })
      .then(({ data }) => {
        if (data) setInvoices(data)
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
          .inv-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
          .inv-title { font-size: 22px; font-weight: 800; color: #1E293B; }
          .inv-subtitle { font-size: 13px; color: #94A3B8; }
          .inv-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
          .inv-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
          .inv-table { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
          .inv-table-header, .inv-table-row { display: grid; grid-template-columns: 120px 1fr 120px 100px 120px 100px; padding: 10px 14px; border-bottom: 1px solid #F1F5F9; font-size: 12px; align-items: center; }
          .inv-table-header { background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; }
          .inv-table-row:hover { background: #FAFBFF; }
          .inv-badge { padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; }
          @media (max-width: 768px) {
            .inv-table-header, .inv-table-row { grid-template-columns: 100px 1fr 100px 80px; }
            .inv-hide-mobile { display: none; }
          }
        `}</style>

        <div className="inv-header">
          <div>
            <div className="inv-title">🧾 Sales Invoices</div>
            <div className="inv-subtitle">{canEdit ? "Manage your sales invoices" : "View invoices"}</div>
          </div>
          {canEdit && (
            <button className="inv-btn inv-btn-primary" onClick={() => router.push("/dashboard/invoices/new")}>
              <Plus size={16} /> New Invoice
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", padding: 40, textAlign: "center", color: "#94A3B8" }}>
            No invoices yet. {canEdit && 'Click "New Invoice" to create one.'}
          </div>
        ) : (
          <div className="inv-table">
            <div className="inv-table-header">
              <span>Invoice #</span>
              <span>Customer</span>
              <span className="inv-hide-mobile">Date</span>
              <span>Total</span>
              <span>Status</span>
              <span></span>
            </div>
            {invoices.map((inv) => (
              <div key={inv.id} className="inv-table-row">
                <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{inv.invoice_no}</span>
                <span>{inv.party?.name || "—"}</span>
                <span className="inv-hide-mobile" style={{ color: "#64748B" }}>{new Date(inv.date).toLocaleDateString()}</span>
                <span style={{ fontWeight: 600 }}>PKR {inv.total.toLocaleString()}</span>
                <span>
                  <span className="inv-badge" style={{
                    background: inv.status === "Paid" ? "#D1FAE5" : inv.status === "Overdue" ? "#FEE2E2" : "#FEF3C7",
                    color: inv.status === "Paid" ? "#065F46" : inv.status === "Overdue" ? "#991B1B" : "#92400E",
                  }}>
                    {inv.status}
                  </span>
                </span>
                <span>
                  <button style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B" }} onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}>
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