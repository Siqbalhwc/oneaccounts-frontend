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

  // ── Bullet‑proof company ID retrieval ──────────────────────
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

  useEffect(() => {
    if (!canView || !companyId) { setLoading(false); return }

    const fetchBills = async () => {
      setLoading(true)

      const { count } = await supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("type", "purchase")
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

      // Resolve supplier names separately
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

  useEffect(() => {
    if (!search.trim()) { setFiltered(bills); return }
    const s = search.toLowerCase()
    setFiltered(bills.filter(b =>
      b.invoice_no.toLowerCase().includes(s) ||
      (b.supplier_name || "").toLowerCase().includes(s)
    ))
  }, [search, bills])

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
          .bill-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
          .bill-title { font-size: clamp(18px, 1.8vw, 24px); font-weight: 800; color: #1E293B; }
          .bill-subtitle { font-size: 13px; color: #94A3B8; margin-top: 2px; }
          .bill-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
          .bill-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; box-shadow: 0 2px 8px rgba(7,19,82,0.25); }
          .bill-search { position: relative; max-width: 320px; margin-bottom: 16px; }
          .bill-search input { width: 100%; height: 40px; border: 1.5px solid #E2E8F0; border-radius: 9px; padding: 0 14px 0 38px; font-size: 13px; font-family: inherit; background: white; outline: none; }
          .bill-search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94A3B8; }
          .bill-table-wrap { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
          .bill-table-header, .bill-table-row { display: grid; grid-template-columns: 130px 1fr 120px 100px 130px 100px; padding: 10px 16px; border-bottom: 1px solid #F1F5F9; font-size: 12px; align-items: center; }
          .bill-table-header { background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94A3B8; }
          .bill-table-row:hover { background: #FAFBFF; }
          .bill-badge { padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; }
          .bill-empty { padding: 40px; text-align: center; color: #94A3B8; }
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

        <div className="bill-search">
          <Search size={16} />
          <input type="text" placeholder="Search by bill number or supplier..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="bill-table-wrap">
          <div className="bill-table-header">
            <span>Bill #</span>
            <span>Supplier</span>
            <span className="bill-hide-mobile">Date</span>
            <span>Total</span>
            <span>Status</span>
            <span></span>
          </div>
          {loading ? (
            <div className="bill-empty">Loading bills...</div>
          ) : filtered.length === 0 ? (
            <div className="bill-empty">No purchase bills found. {canEdit && 'Click "New Bill" to create one.'}</div>
          ) : (
            filtered.map(bill => (
              <div key={bill.id} className="bill-table-row">
                <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{bill.invoice_no}</span>
                <span>{bill.supplier_name || "—"}</span>
                <span className="bill-hide-mobile" style={{ color: "#64748B" }}>{new Date(bill.date).toLocaleDateString()}</span>
                <span style={{ fontWeight: 600 }}>PKR {bill.total.toLocaleString()}</span>
                <span>
                  <span className="bill-badge" style={{
                    background: bill.status === "Paid" ? "#D1FAE5" : bill.status === "Overdue" ? "#FEE2E2" : "#FEF3C7",
                    color: bill.status === "Paid" ? "#065F46" : bill.status === "Overdue" ? "#991B1B" : "#92400E",
                  }}>{bill.status}</span>
                </span>
                <span>
                  <button style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B" }} onClick={() => router.push(`/dashboard/bills/${bill.id}`)}>
                    <Eye size={14} />
                  </button>
                </span>
              </div>
            ))
          )}
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
        </div>
      </div>
    </RoleGuard>
  )
}