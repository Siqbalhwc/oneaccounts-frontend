"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useRole } from "@/contexts/RoleContext"
import type { User } from "@supabase/supabase-js"

export default function InvoicesListPage() {
  const router = useRouter()
  const supabase = createClient()
  const { role, loading: roleLoading } = useRole()
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      const user: User | null = data?.user ?? null
      if (!user) return
      const cid = (user.app_metadata as Record<string, string>)?.company_id
      if (cid) setCompanyId(cid)
    }
    loadUser()
  }, [])

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    supabase
      .from("invoices")
      .select("id, invoice_no, date, due_date, total, status")
      .eq("company_id", companyId)
      .order("date", { ascending: false })
      .then(({ data }) => {
        setInvoices(data || [])
        setLoading(false)
      })
  }, [companyId])

  if (roleLoading) return <div style={{ padding: 40, textAlign: "center" }}>Checking permissions...</div>
  if (!canView) return <div style={{ padding: 40, textAlign: "center" }}><h2>Access Denied</h2><p style={{ color: "#94A3B8", marginTop: 8 }}>You do not have permission to view this page.</p></div>
  if (!companyId) return <div style={{ padding: 40 }}>Loading...</div>

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; }
        .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 8px 6px; border-bottom: 1px solid #E2E8F0; }
        td { padding: 10px 6px; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
        tr:hover td { background: #FAFBFF; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h2>📄 Invoices</h2>
        <button className="btn" style={{ background: "#1D4ED8", color: "white" }} onClick={() => router.push("/dashboard/invoices/new")}>+ New Invoice</button>
      </div>

      <div className="card">
        {loading ? (
          <p>Loading...</p>
        ) : invoices.length === 0 ? (
          <p style={{ color: "#94A3B8", textAlign: "center" }}>No invoices yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Date</th>
                <th>Due Date</th>
                <th>Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 600 }}>{inv.invoice_no}</td>
                  <td>{inv.date}</td>
                  <td>{inv.due_date}</td>
                  <td>PKR {inv.total?.toLocaleString()}</td>
                  <td>{inv.status}</td>
                  <td>
                    <button className="btn" style={{ padding: "4px 8px", background: "#F1F5F9" }} onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}