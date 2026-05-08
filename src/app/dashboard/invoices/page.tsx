"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"

export default function InvoicesListPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    setLoading(true)

    let query = supabase
      .from("invoices")
      .select("id, invoice_no, party_id, date, due_date, total, status")
      .eq("company_id", companyId)
      .order("date", { ascending: false })

    if (search.trim()) {
      query = query.or(`invoice_no.ilike.%${search}%`)
    }

    query.then(({ data }) => {
      setInvoices(data || [])
      setLoading(false)
    })
  }, [companyId, search])

  if (!companyId) return <div style={{ padding: 40 }}>Loading…</div>
  if (!canView) return <div style={{ padding: 40 }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <h2>📄 Invoices</h2>
      <button onClick={() => router.push("/dashboard/invoices/new")} style={{ marginBottom: 12 }}>+ New Invoice</button>
      <input
        style={{ width: "100%", padding: 8, marginBottom: 12, borderRadius: 6, border: "1px solid #ccc" }}
        placeholder="Search by invoice number..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {loading ? <p>Loading...</p> : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: "white" }}>
          <thead>
            <tr style={{ background: "#F1F5F9" }}>
              <th style={{ padding: 8 }}>Invoice No.</th>
              <th style={{ padding: 8 }}>Date</th>
              <th style={{ padding: 8 }}>Due Date</th>
              <th style={{ padding: 8 }}>Total</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>View</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 20 }}>No invoices yet.</td></tr>
            ) : (
              invoices.map(inv => (
                <tr key={inv.id}>
                  <td>{inv.invoice_no}</td>
                  <td>{inv.date}</td>
                  <td>{inv.due_date}</td>
                  <td>PKR {inv.total?.toLocaleString()}</td>
                  <td>{inv.status}</td>
                  <td>
                    <button onClick={() => router.push(`/dashboard/invoices/${inv.id}`)} style={{ padding: "4px 8px", cursor: "pointer" }}>
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}