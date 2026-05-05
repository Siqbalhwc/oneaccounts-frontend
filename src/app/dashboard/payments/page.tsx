"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Search, Eye } from "lucide-react"
import Pagination from "@/components/Pagination"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface Payment {
  id: number
  payment_no: string
  payment_date: string
  amount: number
  payment_method: string
  supplier_name: string
}

export default function PaymentsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [payments, setPayments] = useState<Payment[]>([])
  const [filtered, setFiltered] = useState<Payment[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)

  // ── Bullet‑proof company ID ────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const claim = (user?.app_metadata as any)?.company_id
      if (claim) { setCompanyId(claim); return }
      const match = document.cookie.match(/(?:^| )active_company_id=([^;]+)/)
      if (match) { setCompanyId(match[2]); return }
      setCompanyId('00000000-0000-0000-0000-000000000001')
    })
  }, [])

  useEffect(() => {
    if (!canView || !companyId) { setLoading(false); return }

    const fetchPayments = async () => {
      setLoading(true)

      const { count } = await supabase
        .from("payments")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId)
      setTotal(count || 0)

      const from = (page - 1) * pageSize
      const to = from + pageSize - 1
      const { data } = await supabase
        .from("payments")
        .select("*")
        .eq("company_id", companyId)
        .order("payment_date", { ascending: false })
        .range(from, to)

      if (!data || data.length === 0) {
        setPayments([]); setFiltered([]); setLoading(false); return
      }

      // Resolve supplier names
      const partyIds = [...new Set(data.map((p: any) => p.party_id).filter(Boolean))]
      let supplierMap: Record<number, string> = {}
      if (partyIds.length > 0) {
        const { data: suppliers } = await supabase
          .from("suppliers")
          .select("id, name")
          .in("id", partyIds)
          .eq("company_id", companyId)
        if (suppliers) suppliers.forEach((s: any) => { supplierMap[s.id] = s.name })
      }

      const enriched = data.map((p: any) => ({
        ...p,
        supplier_name: supplierMap[p.party_id] || "—",
      }))

      setPayments(enriched)
      setFiltered(enriched)
      setLoading(false)
    }
    fetchPayments()
  }, [canView, companyId, page, pageSize])

  // ── Search ─────────────────────────────────────────────────
  useEffect(() => {
    if (!search.trim()) { setFiltered(payments); return }
    const s = search.toLowerCase()
    setFiltered(payments.filter(p =>
      p.payment_no.toLowerCase().includes(s) ||
      (p.supplier_name || "").toLowerCase().includes(s)
    ))
  }, [search, payments])

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
          .pay-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
          .pay-title { font-size: clamp(18px, 1.8vw, 24px); font-weight: 800; color: #1E293B; }
          .pay-subtitle { font-size: 13px; color: #94A3B8; margin-top: 2px; }
          .pay-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
          .pay-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; box-shadow: 0 2px 8px rgba(7,19,82,0.25); }
          .pay-search { position: relative; max-width: 320px; margin-bottom: 16px; }
          .pay-search input { width: 100%; height: 40px; border: 1.5px solid #E2E8F0; border-radius: 9px; padding: 0 14px 0 38px; font-size: 13px; font-family: inherit; background: white; outline: none; }
          .pay-search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94A3B8; }
          .pay-table-wrap { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
          .pay-table-header, .pay-table-row { display: grid; grid-template-columns: 130px 1fr 120px 100px 130px 100px; padding: 10px 16px; border-bottom: 1px solid #F1F5F9; font-size: 12px; align-items: center; }
          .pay-table-header { background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94A3B8; }
          .pay-table-row:hover { background: #FAFBFF; }
          .pay-empty { padding: 40px; text-align: center; color: #94A3B8; }
          @media (max-width: 768px) { .pay-table-header, .pay-table-row { grid-template-columns: 100px 1fr 100px 80px; } .pay-hide-mobile { display: none; } }
        `}</style>

        <div className="pay-header">
          <div>
            <div className="pay-title">💳 Payments</div>
            <div className="pay-subtitle">{canEdit ? "Record supplier payments" : "View payments"}</div>
          </div>
          {canEdit && (
            <button className="pay-btn pay-btn-primary" onClick={() => router.push("/dashboard/payments/new")}>
              <Plus size={16} /> New Payment
            </button>
          )}
        </div>

        <div className="pay-search">
          <Search size={16} />
          <input type="text" placeholder="Search by payment number or supplier..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="pay-table-wrap">
          <div className="pay-table-header">
            <span>Payment #</span>
            <span>Supplier</span>
            <span className="pay-hide-mobile">Date</span>
            <span>Amount</span>
            <span>Method</span>
            <span></span>
          </div>
          {loading ? (
            <div className="pay-empty">Loading payments...</div>
          ) : filtered.length === 0 ? (
            <div className="pay-empty">No payments found. {canEdit && 'Click "New Payment" to record one.'}</div>
          ) : (
            filtered.map(pay => (
              <div key={pay.id} className="pay-table-row">
                <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{pay.payment_no}</span>
                <span>{pay.supplier_name || "—"}</span>
                <span className="pay-hide-mobile" style={{ color: "#64748B" }}>{new Date(pay.payment_date).toLocaleDateString()}</span>
                <span style={{ fontWeight: 600 }}>PKR {pay.amount.toLocaleString()}</span>
                <span>{pay.payment_method || "—"}</span>
                <span>
                  <button style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B" }} onClick={() => router.push(`/dashboard/payments/${pay.id}`)}>
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