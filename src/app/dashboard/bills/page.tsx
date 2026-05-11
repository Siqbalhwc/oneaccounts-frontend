"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Search, Eye } from "lucide-react"
import Pagination from "@/components/Pagination"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface Bill {
  id: number
  invoice_no: string
  date: string
  total: number
  paid: number
  status: string
  supplier_name: string
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
  const [filtered, setFiltered] = useState<Bill[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)

  // ── Company ID ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const claim = (user?.app_metadata as any)?.company_id
      if (claim) { setCompanyId(claim); return }
      const match = document.cookie.match(/(?:^| )active_company_id=([^;]+)/)
      if (match) { setCompanyId(match[2]); return }
      setCompanyId('00000000-0000-0000-0000-000000000001')
    })
  }, [])

  // ── Fetch bills ──
  useEffect(() => {
    if (!canView || !companyId) { setLoading(false); return }

    const fetchBills = async () => {
      setLoading(true)

      let query = supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("type", "purchase")

      const { count } = await query
      setTotal(count || 0)

      const from = (page - 1) * pageSize
      const to = from + pageSize - 1
      const { data } = await supabase
        .from("invoices")
        .select("*")
        .eq("company_id", companyId)
        .eq("type", "purchase")
        .order("date", { ascending: false })
        .range(from, to)

      if (!data || data.length === 0) {
        setBills([]); setFiltered([]); setLoading(false); return
      }

      const partyIds = [...new Set(data.map((b: any) => b.party_id).filter(Boolean))]
      let supplierMap: Record<number, string> = {}
      if (partyIds.length > 0) {
        const { data: suppliers } = await supabase
          .from("suppliers")
          .select("id, name")
          .in("id", partyIds)
          .eq("company_id", companyId)
        if (suppliers) suppliers.forEach((s: any) => { supplierMap[s.id] = s.name })
      }

      const enriched = data.map((b: any) => ({
        ...b,
        supplier_name: supplierMap[b.party_id] || "—",
      }))

      setBills(enriched)
      setFiltered(enriched)
      setLoading(false)
    }
    fetchBills()
  }, [canView, companyId, page, pageSize])

  // ── Search ──
  useEffect(() => {
    if (!search.trim()) { setFiltered(bills); return }
    const s = search.toLowerCase()
    setFiltered(bills.filter(b =>
      b.invoice_no.toLowerCase().includes(s) ||
      (b.supplier_name || "").toLowerCase().includes(s) ||
      (b.status || "").toLowerCase().includes(s)
    ))
  }, [search, bills])

  // ── Aggregated stats ──
  const totalAmount = bills.reduce((sum, b) => sum + (b.total || 0), 0)
  const unpaidCount = bills.filter(b => b.status === "Unpaid").length
  const overdueCount = bills.filter(b => b.status === "Overdue").length

  if (!role) return <div style={{ padding: 24, textAlign: "center" }}>Loading...</div>
  if (!canView) return (
    <div style={{ padding: 24, textAlign: "center" }}>
      <h2>Access Denied</h2>
      <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
    </div>
  )

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <style>{`
          .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
          .input { height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; }
          .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
          .btn-primary { background: #1D4ED8; color: white; }
          .btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
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
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📦 Purchase Bills</h1>
            <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>{canEdit ? "Manage your purchase bills" : "View bills"}</p>
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => router.push("/dashboard/bills/new")}>
              <Plus size={16} /> New Bill
            </button>
          )}
        </div>

        <div className="summary-grid">
          <div className="card">
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Bills</div>
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
            <input className="input" style={{ paddingLeft: 32, width: "100%" }} placeholder="Search bill no, supplier, or status..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Date</th>
                <th>Supplier</th>
                <th>Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 20 }}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 20, color: "#94A3B8" }}>
                  {search ? "No bills match your search." : "No purchase bills found."}
                </td></tr>
              ) : (
                filtered.map(bill => (
                  <tr key={bill.id}>
                    <td style={{ fontWeight: 600, color: "#1E3A8A" }}>{bill.invoice_no}</td>
                    <td>{new Date(bill.date).toLocaleDateString()}</td>
                    <td>{bill.supplier_name || "—"}</td>
                    <td style={{ fontWeight: 600 }}>PKR {bill.total?.toLocaleString()}</td>
                    <td>
                      <span className={`badge ${
                        bill.status === "Paid" ? "badge-paid" :
                        bill.status === "Overdue" ? "badge-overdue" : "badge-unpaid"
                      }`}>{bill.status}</span>
                    </td>
                    <td>
                      <button className="btn btn-outline" style={{ padding: "4px 8px" }} onClick={() => router.push(`/dashboard/bills/${bill.id}`)}>
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
        </div>
      </div>
    </RoleGuard>
  )
}