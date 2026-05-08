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

  const [companyId, setCompanyId] = useState<string>("")   // ✅ NEW
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  // ── 1. Get real company ID ──────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // ── 2. Fetch invoices only when companyId is known ───
  useEffect(() => {
    if (!companyId) return
    setLoading(true)

    const start = (page - 1) * pageSize
    const end = start + pageSize - 1

    let query = supabase
      .from("invoices")
      .select("*, customers(name, code)", { count: "exact" })
      .eq("company_id", companyId)            // ✅ KEY FIX
      .order("date", { ascending: false })
      .range(start, end)

    if (search.trim()) {
      query = query.or(
        `invoice_no.ilike.%${search}%,customers.name.ilike.%${search}%`
      )
    }

    query.then(({ data, count }) => {
      setInvoices(data || [])
      setTotal(count || 0)
      setLoading(false)
    })
  }, [companyId, search, page])

  if (!companyId) {
    return <div style={{ padding: 40, textAlign: "center", fontFamily: "Arial" }}>Loading company data…</div>
  }
  if (!canView) {
    return <div style={{ padding: 40, textAlign: "center" }}><h2>Access Denied</h2></div>
  }

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <style>{`
        table { width: 100%; border-collapse: collapse; background: white; border-radius: 10px; overflow: hidden; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 10px 12px; border-bottom: 1px solid #E2E8F0; }
        td { padding: 10px 12px; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
        tr:hover td { background: #FAFBFF; }
        .btn { padding: 6px 12px; border-radius: 6px; border: none; font-weight: 600; font-size: 12px; cursor: pointer; }
        .btn-primary { background: #1D4ED8; color: white; }
        .input { width: 100%; height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; }
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
          placeholder="Search by invoice number or customer name..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>Loading invoices...</div>
      ) : invoices.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>
          {search ? "No matching invoices found." : "No invoices yet. Create your first invoice above."}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Invoice No.</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Due Date</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.id}>
                <td style={{ fontWeight: 600 }}>{inv.invoice_no}</td>
                <td>{inv.customers?.name}</td>
                <td>{inv.date}</td>
                <td>{inv.due_date}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {inv.total?.toLocaleString()}</td>
                <td>{inv.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}