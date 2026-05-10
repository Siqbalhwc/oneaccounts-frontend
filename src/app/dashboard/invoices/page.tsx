"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useRole } from "@/contexts/RoleContext"
import type { User } from "@supabase/supabase-js"
import { Search, Eye, Plus, Send } from "lucide-react"

export default function InvoicesListPage() {
  const router = useRouter()
  const supabase = createClient()
  const { role, loading: roleLoading } = useRole()
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 25

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

    const fetchInvoices = async () => {
      setLoading(true)
      const start = (page - 1) * pageSize
      const end = start + pageSize - 1

      let query = supabase
        .from("invoices")
        .select("id, invoice_no, date, due_date, total, status, party_id", { count: "exact" })
        .eq("company_id", companyId)
        .eq("type", "sale")
        .order("date", { ascending: false })

      if (search.trim()) {
        query = query.or(`invoice_no.ilike.%${search}%,status.ilike.%${search}%`)
      }

      const { data, count } = await query.range(start, end)
      if (!data || data.length === 0) {
        setInvoices([])
        setTotal(0)
        setLoading(false)
        return
      }

      // Fetch customer phone details for each invoice
      const customerIds = [...new Set(data.map(inv => inv.party_id).filter(Boolean))]
      let customerMap: Record<number, any> = {}
      if (customerIds.length > 0) {
        const { data: customers } = await supabase
          .from("customers")
          .select("id, country_code, phone")
          .in("id", customerIds)
          .eq("company_id", companyId)
        if (customers) {
          customers.forEach((c: any) => { customerMap[c.id] = c })
        }
      }

      const enriched = data.map(inv => ({
        ...inv,
        customer_phone: customerMap[inv.party_id]?.phone || null,
        customer_country_code: customerMap[inv.party_id]?.country_code || null,
      }))
      setInvoices(enriched)
      setTotal(count || 0)
      setLoading(false)
    }

    fetchInvoices()
  }, [companyId, search, page])

  // Build WhatsApp link per invoice
  const getWhatsAppLink = (inv: any) => {
    if (!inv.customer_phone) return ""
    const code = (inv.customer_country_code || "+92").replace(/\D/g, "")
    const phone = inv.customer_phone.replace(/\D/g, "")
    if (!phone) return ""
    const msg = `Dear Customer,\n\nYour invoice ${inv.invoice_no} for PKR ${(inv.total || 0).toLocaleString()} is ready.\nDate: ${inv.date}\nDue: ${inv.due_date}\nStatus: ${inv.status}\n\nThank you.\n— OneAccounts`
    return `https://wa.me/${code}${phone}?text=${encodeURIComponent(msg)}`
  }

  const totalAmount = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0)
  const unpaidCount = invoices.filter(inv => inv.status === "Unpaid").length
  const overdueCount = invoices.filter(inv => inv.status === "Overdue").length

  if (roleLoading || !role) return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
  if (!canView) return <div style={{ padding: 40, textAlign: "center" }}><h2>Access Denied</h2><p style={{ color: "#94A3B8", marginTop: 8 }}>You do not have permission to view this page.</p></div>
  if (!companyId) return <div style={{ padding: 40 }}>Loading...</div>

  return (
    <div style={{ padding: 24, fontFamily: "'Plus Jakarta Sans', sans-serif", background: "#EFF4FB", minHeight: "100vh" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .input { height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; }
        .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-primary { background: #1D4ED8; color: white; }
        .btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .btn-success { background: #25D366; color: white; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 8px 6px; border-bottom: 1px solid #E2E8F0; }
        td { padding: 10px 6px; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
        tr:hover td { background: #FAFBFF; }
        .badge { padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; display: inline-block; }
        .badge-paid { background: #D1FAE5; color: #065F46; }
        .badge-unpaid { background: #FEF3C7; color: #92400E; }
        .badge-overdue { background: #FEE2E2; color: #991B1B; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
        @media (max-width: 600px) {
          th:nth-child(3), td:nth-child(3) { display: none; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📄 Invoices</h1>
          <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>Manage all sales invoices</p>
        </div>
        <button className="btn btn-primary" onClick={() => router.push("/dashboard/invoices/new")}>
          <Plus size={16} /> New Invoice
        </button>
      </div>

      <div className="summary-grid">
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Invoices</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{total}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Amount</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>PKR {totalAmount.toLocaleString()}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Unpaid</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#B45309" }}>{unpaidCount}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Overdue</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#DC2626" }}>{overdueCount}</div>
        </div>
      </div>

      <div style={{ maxWidth: 320, marginBottom: 16 }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 12, color: "#94A3B8" }} />
          <input className="input" style={{ paddingLeft: 32, width: "100%" }} placeholder="Search invoice no or status..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Invoice No.</th>
              <th>Date</th>
              <th>Due Date</th>
              <th>Total</th>
              <th>Status</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: 20 }}>Loading...</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: 20, color: "#94A3B8" }}>
                {search ? "No invoices match your search." : "No invoices yet. Create your first invoice above."}
              </td></tr>
            ) : (
              invoices.map(inv => {
                const waLink = getWhatsAppLink(inv)
                return (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 600, color: "#1E3A8A" }}>{inv.invoice_no}</td>
                    <td>{inv.date}</td>
                    <td>{inv.due_date}</td>
                    <td style={{ fontWeight: 600 }}>PKR {inv.total?.toLocaleString()}</td>
                    <td>
                      <span className={`badge ${
                        inv.status === "Paid" ? "badge-paid" :
                        inv.status === "Overdue" ? "badge-overdue" : "badge-unpaid"
                      }`}>{inv.status}</span>
                    </td>
                    <td>
                      {waLink && (
                        <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-success" style={{ padding: "4px 8px" }}>
                          <Send size={14} />
                        </a>
                      )}
                    </td>
                    <td>
                      <button className="btn btn-outline" style={{ padding: "4px 8px" }} onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}>
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {total > pageSize && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 13, color: "#64748B" }}>
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