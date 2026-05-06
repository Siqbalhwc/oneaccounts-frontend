"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Search, Eye } from "lucide-react"
import Pagination from "@/components/Pagination"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface Invoice {
  id: number
  invoice_no: string
  date: string
  total: number
  paid: number
  status: string
  customer_name: string
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
  const [filtered, setFiltered] = useState<Invoice[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)

  // ── Get company ID (same safe approach) ─────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const claim = (user?.app_metadata as any)?.company_id
      if (claim) { setCompanyId(claim); return }
      const match = document.cookie.match(/(?:^| )active_company_id=([^;]+)/)
      if (match) { setCompanyId(match[2]); return }
      if (user) {
        supabase.from('user_roles')
          .select('company_id').eq('user_id', user.id).limit(1).maybeSingle()
          .then(({ data }) => { if (data) setCompanyId(data.company_id) })
      }
    })
  }, [])

  // ── Fetch invoices and then resolve customer names ─────────
  useEffect(() => {
    if (!canView || !companyId) { setLoading(false); return }

    const fetchInvoices = async () => {
      setLoading(true)

      // Total count
      const { count } = await supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("type", "sale")
      setTotal(count || 0)

      // Fetch page
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1
      const { data } = await supabase
        .from("invoices")
        .select("*")
        .eq("company_id", companyId)
        .eq("type", "sale")
        .order("date", { ascending: false })
        .range(from, to)

      if (!data || data.length === 0) {
        setInvoices([])
        setFiltered([])
        setLoading(false)
        return
      }

      // Resolve customer names in one batch
      const partyIds = [...new Set(data.map((inv: any) => inv.party_id).filter(Boolean))]
      let customerMap: Record<number, string> = {}
      if (partyIds.length > 0) {
        const { data: customers } = await supabase
          .from("customers")
          .select("id, name")
          .in("id", partyIds)
          .eq("company_id", companyId)
        if (customers) {
          customers.forEach((c: any) => { customerMap[c.id] = c.name })
        }
      }

      const enriched = data.map((inv: any) => ({
        ...inv,
        customer_name: customerMap[inv.party_id] || "—",
      }))

      setInvoices(enriched)
      setFiltered(enriched)
      setLoading(false)
    }
    fetchInvoices()
  }, [canView, companyId, page, pageSize])

  // ── Search filter ─────────────────────────────────────────
  useEffect(() => {
    if (!search.trim()) { setFiltered(invoices); return }
    const s = search.toLowerCase()
    setFiltered(
      invoices.filter(inv =>
        inv.invoice_no.toLowerCase().includes(s) ||
        (inv.customer_name || "").toLowerCase().includes(s)
      )
    )
  }, [search, invoices])

  // ── Summary stats ─────────────────────────────────────────
  const totalReceivables = filtered.reduce((sum, inv) => sum + (inv.total - (inv.paid || 0)), 0)

  if (!role) return <div style={{ padding: 24, textAlign: "center" }}>Loading...</div>
  if (!canView) return (
    <div style={{ padding: 24, textAlign: "center" }}>
      <h2>Access Denied</h2>
      <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
    </div>
  )

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
        <style>{`
          .inv-shell { max-width: 1200px; margin: 0 auto; }
          .inv-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
          .inv-title { font-size: clamp(18px, 1.8vw, 24px); font-weight: 800; color: #1E293B; }
          .inv-subtitle { font-size: 13px; color: #94A3B8; margin-top: 2px; }
          .inv-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
          .inv-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; box-shadow: 0 2px 8px rgba(7,19,82,0.25); }
          .inv-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 16px; }
          .inv-stat-card { background: white; border-radius: 10px; border: 1px solid #E5EAF2; padding: 14px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
          .inv-stat-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94A3B8; margin-bottom: 4px; }
          .inv-stat-value { font-size: 22px; font-weight: 800; color: #1E3A8A; }
          .inv-search { position: relative; max-width: 320px; margin-bottom: 16px; }
          .inv-search input { width: 100%; height: 40px; border: 1.5px solid #E5EAF2; border-radius: 9px; padding: 0 14px 0 38px; font-size: 13px; font-family: inherit; background: white; outline: none; }
          .inv-search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94A3B8; }
          .inv-table-wrap { background: white; border-radius: 12px; border: 1px solid #E5EAF2; box-shadow: 0 1px 3px rgba(0,0,0,0.04); overflow: hidden; }
          .inv-table-header, .inv-table-row { display: grid; grid-template-columns: 130px 1fr 120px 100px 130px 100px; padding: 10px 16px; border-bottom: 1px solid #F1F5F9; font-size: 13px; align-items: center; }
          .inv-table-header { background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94A3B8; border-bottom: 2px solid #E5EAF2; }
          .inv-table-row:hover { background: #FAFBFF; cursor: pointer; }
          .inv-badge { padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; }
          .inv-empty { padding: 40px; text-align: center; color: #94A3B8; }
          @media (max-width: 768px) { .inv-table-header, .inv-table-row { grid-template-columns: 100px 1fr 100px 80px; } .inv-hide-mobile { display: none; } }
        `}</style>

        <div className="inv-shell">
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

          {/* Summary stats */}
          <div className="inv-stats">
            <div className="inv-stat-card">
              <div className="inv-stat-label">Total Invoices</div>
              <div className="inv-stat-value">{filtered.length}</div>
            </div>
            <div className="inv-stat-card">
              <div className="inv-stat-label">Total Receivables</div>
              <div className="inv-stat-value" style={{ color: "#F59E0B" }}>PKR {totalReceivables.toLocaleString()}</div>
            </div>
          </div>

          <div className="inv-search">
            <Search size={16} />
            <input type="text" placeholder="Search by invoice number or customer..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div className="inv-table-wrap">
            <div className="inv-table-header">
              <span>Invoice #</span>
              <span>Customer</span>
              <span className="inv-hide-mobile">Date</span>
              <span>Total</span>
              <span>Status</span>
              <span></span>
            </div>
            {loading ? (
              <div className="inv-empty">Loading invoices...</div>
            ) : filtered.length === 0 ? (
              <div className="inv-empty">No sales invoices found. {canEdit && 'Click "New Invoice" to create one.'}</div>
            ) : (
              filtered.map(inv => (
                <div key={inv.id} className="inv-table-row" onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}>
                  <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{inv.invoice_no}</span>
                  <span>{inv.customer_name || "—"}</span>
                  <span className="inv-hide-mobile" style={{ color: "#64748B" }}>{new Date(inv.date).toLocaleDateString()}</span>
                  <span style={{ fontWeight: 600 }}>PKR {inv.total.toLocaleString()}</span>
                  <span>
                    <span className="inv-badge" style={{
                      background: inv.status === "Paid" ? "#D1FAE5" : inv.status === "Overdue" ? "#FEE2E2" : "#FEF3C7",
                      color: inv.status === "Paid" ? "#065F46" : inv.status === "Overdue" ? "#991B1B" : "#92400E",
                    }}>{inv.status}</span>
                  </span>
                  <span>
                    <button style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B" }} onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/invoices/${inv.id}`); }}>
                      <Eye size={14} />
                    </button>
                  </span>
                </div>
              ))
            )}
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
          </div>
        </div>
      </div>
    </RoleGuard>
  )
}