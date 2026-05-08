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
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

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
      .select("id, invoice_no, party_id, date, due_date, total, status", { count: "exact" })
      .eq("company_id", companyId)
      .order("date", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (search.trim()) {
      query = query.or(`invoice_no.ilike.%${search}%`)
    }

    query.then(({ data, count }) => {
      setInvoices(data || [])
      setTotal(count || 0)
      setLoading(false)
    })
  }, [companyId, search, page])

  if (!companyId) return <div style={{ padding: 40, textAlign: "center" }}>Loading company data…</div>
  if (!canView) return <div style={{ padding: 40, textAlign: "center" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .input { width: 100%; height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; }
        .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-primary { background: #1D4ED8; color: white; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 10px 6px; border-bottom: 1px solid #E2E8F0; }
        td { padding: 10px 6px; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
        tr:hover td { background: #FAFBFF; }
        .pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; font-size: 13px; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📄 Invoices</h2>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>All sales invoices for your company</p>
        </div>
        <button className="btn btn-primary" onClick={() => router.push("/dashboard/invoices/new")}>
          + New Invoice
        </button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <input
          className="input"
          placeholder="Search by invoice number..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
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
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 20 }}>Loading...</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 20, color: "#94A3B8" }}>
                {search ? "No matching invoices found." : "No invoices yet. Create your first invoice above."}
              </td></tr>
            ) : (
              invoices.map(inv => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 600 }}>{inv.invoice_no}</td>
                  <td>{inv.date}</td>
                  <td>{inv.due_date}</td>
                  <td style={{ fontWeight: 600 }}>PKR {inv.total?.toLocaleString()}</td>
                  <td>{inv.status}</td>
                  <td>
                    <button className="btn" style={{ padding: "4px 8px", background: "#F1F5F9" }} onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}>
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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