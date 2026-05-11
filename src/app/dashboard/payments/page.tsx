"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import { Search, Eye, Plus } from "lucide-react"

export default function PaymentsListPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role, loading: roleLoading } = useRole()
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 25

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId) return

    const fetchPayments = async () => {
      setLoading(true)
      const start = (page - 1) * pageSize
      const end = start + pageSize - 1

      let query = supabase
        .from("payments")
        .select("id, payment_no, date, amount, notes, party_id", { count: "exact" })
        .eq("company_id", companyId)
        .order("date", { ascending: false })

      if (search.trim()) {
        query = query.or(`payment_no.ilike.%${search}%,notes.ilike.%${search}%`)
      }

      const { data, count } = await query.range(start, end)
      if (!data || data.length === 0) {
        setPayments([])
        setTotal(0)
        setLoading(false)
        return
      }

      // Fetch supplier names
      const supplierIds = [...new Set(data.map((p: any) => p.party_id).filter(Boolean))]
      let supplierMap: Record<number, string> = {}
      if (supplierIds.length > 0) {
        const { data: suppliers } = await supabase
          .from("suppliers")
          .select("id, name")
          .in("id", supplierIds)
          .eq("company_id", companyId)
        if (suppliers) {
          suppliers.forEach((s: any) => { supplierMap[s.id] = s.name })
        }
      }

      const enriched = data.map((p: any) => ({
        ...p,
        supplier_name: supplierMap[p.party_id] || "Unknown",
      }))
      setPayments(enriched)
      setTotal(count || 0)
      setLoading(false)
    }

    fetchPayments()
  }, [companyId, search, page])

  const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0)

  if (roleLoading || !role) return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
  if (!canView) return <div style={{ padding: 40, textAlign: "center" }}><h2>Access Denied</h2><p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p></div>
  if (!companyId) return <div style={{ padding: 40 }}>Loading...</div>

  return (
    <div style={{ padding: 24, fontFamily: "'Plus Jakarta Sans', sans-serif", background: "#EFF4FB", minHeight: "100vh" }}>
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
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>💳 Payments</h1>
          <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>Record outgoing payments to suppliers</p>
        </div>
        <button className="btn btn-primary" onClick={() => router.push("/dashboard/payments/new")}>
          <Plus size={16} /> New Payment
        </button>
      </div>

      <div className="summary-grid">
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Payments</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{total}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Amount</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>PKR {totalAmount.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ maxWidth: 320, marginBottom: 16 }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 12, color: "#94A3B8" }} />
          <input className="input" style={{ paddingLeft: 32, width: "100%" }} placeholder="Search payment number or notes..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Payment No.</th>
              <th>Date</th>
              <th>Supplier</th>
              <th>Amount</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 20 }}>Loading...</td></tr>
            ) : payments.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 20, color: "#94A3B8" }}>
                {search ? "No payments match your search." : "No payments yet. Create your first payment above."}
              </td></tr>
            ) : (
              payments.map((p: any) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600, color: "#1E3A8A" }}>{p.payment_no}</td>
                  <td>{p.date}</td>
                  <td>{p.supplier_name}</td>
                  <td style={{ fontWeight: 600 }}>PKR {p.amount?.toLocaleString()}</td>
                  <td>{p.notes || "—"}</td>
                  <td>
                    <button className="btn btn-outline" style={{ padding: "4px 8px" }} onClick={() => router.push(`/dashboard/payments/${p.id}`)}>
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))
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