"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Search, Eye } from "lucide-react"
import Pagination from "@/components/Pagination"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

interface Receipt {
  id: number
  receipt_no: string
  date: string
  amount: number
  customer?: { name: string }
  payment_method: string
  reference: string
}

export default function ReceiptsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [filtered, setFiltered] = useState<Receipt[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const getCompany = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)
    }
    getCompany()
  }, [])

  useEffect(() => {
    if (!canView || !companyId) {
      setLoading(false)
      return
    }

    const fetchReceipts = async () => {
      setLoading(true)
      const { count } = await supabase
        .from("receipts")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId)

      setTotal(count || 0)

      const from = (page - 1) * pageSize
      const to = from + pageSize - 1
      const { data } = await supabase
        .from("receipts")
        .select("*, customer:customers(name)")
        .eq("company_id", companyId)
        .order("date", { ascending: false })
        .range(from, to)

      if (data) {
        setReceipts(data)
        setFiltered(data)
      }
      setLoading(false)
    }
    fetchReceipts()
  }, [canView, companyId, page, pageSize])

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(receipts)
      return
    }
    const s = search.toLowerCase()
    setFiltered(receipts.filter(r =>
      r.receipt_no.toLowerCase().includes(s) ||
      (r.customer?.name || "").toLowerCase().includes(s)
    ))
  }, [search, receipts])

  if (!role) return <div style={{ padding: 24, textAlign: "center" }}>Loading...</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center" }}><h2>Access Denied</h2><p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p></div>

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
        <style>{`
          .rec-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
          .rec-title { font-size: clamp(18px, 1.8vw, 24px); font-weight: 800; color: #1E293B; }
          .rec-subtitle { font-size: 13px; color: #94A3B8; margin-top: 2px; }
          .rec-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
          .rec-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; box-shadow: 0 2px 8px rgba(7,19,82,0.25); }
          .rec-search { position: relative; max-width: 320px; margin-bottom: 16px; }
          .rec-search input { width: 100%; height: 40px; border: 1.5px solid #E2E8F0; border-radius: 9px; padding: 0 14px 0 38px; font-size: 13px; font-family: inherit; background: white; outline: none; }
          .rec-search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94A3B8; }
          .rec-table-wrap { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
          .rec-table-header { display: grid; grid-template-columns: 130px 1fr 120px 100px 130px 100px; padding: 10px 16px; background: #F8FAFC; border-bottom: 2px solid #E2E8F0; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94A3B8; align-items: center; }
          .rec-table-row { display: grid; grid-template-columns: 130px 1fr 120px 100px 130px 100px; padding: 10px 16px; border-bottom: 1px solid #F1F5F9; align-items: center; font-size: 13px; }
          .rec-table-row:hover { background: #FAFBFF; }
          .rec-empty { padding: 40px; text-align: center; color: #94A3B8; }
          @media (max-width: 768px) { .rec-table-header, .rec-table-row { grid-template-columns: 100px 1fr 100px 80px; } .rec-hide-mobile { display: none; } }
        `}</style>

        <div className="rec-header">
          <div>
            <div className="rec-title">💰 Receipts</div>
            <div className="rec-subtitle">{canEdit ? "Record customer payments" : "View receipts"}</div>
          </div>
          {canEdit && (
            <button className="rec-btn rec-btn-primary" onClick={() => router.push("/dashboard/receipts/new")}>
              <Plus size={16} /> New Receipt
            </button>
          )}
        </div>

        <div className="rec-search">
          <Search size={16} />
          <input type="text" placeholder="Search by receipt number or customer..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="rec-table-wrap">
          <div className="rec-table-header">
            <span>Receipt #</span>
            <span>Customer</span>
            <span className="rec-hide-mobile">Date</span>
            <span>Amount</span>
            <span>Method</span>
            <span></span>
          </div>
          {loading ? <div className="rec-empty">Loading receipts...</div> : filtered.length === 0 ? (
            <div className="rec-empty">No receipts found. {canEdit && 'Click "New Receipt" to record one.'}</div>
          ) : (
            filtered.map(rec => (
              <div key={rec.id} className="rec-table-row">
                <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{rec.receipt_no}</span>
                <span>{rec.customer?.name || "—"}</span>
                <span className="rec-hide-mobile" style={{ color: "#64748B" }}>{new Date(rec.date).toLocaleDateString()}</span>
                <span style={{ fontWeight: 600 }}>PKR {rec.amount.toLocaleString()}</span>
                <span>{rec.payment_method || "—"}</span>
                <span>
                  <button style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B" }} onClick={() => router.push(`/dashboard/receipts/${rec.id}`)}>
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