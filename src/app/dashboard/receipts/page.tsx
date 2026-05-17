"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, Search } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

export default function ReceiptsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [receipts, setReceipts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  // Customer map for names & phone lookup
  const [customerMap, setCustomerMap] = useState<Record<number, { name: string; phone: string }>>({})

  // 1. Fetch customers for mapping
  useEffect(() => {
    if (!role) return
    supabase
      .from("customers")
      .select("id, name, phone")
      .is("deleted_at", null)
      .then(({ data }) => {
        if (data) {
          const map: Record<number, { name: string; phone: string }> = {}
          data.forEach((c: any) => {
            map[c.id] = { name: c.name || "", phone: c.phone || "" }
          })
          setCustomerMap(map)
        }
      })
  }, [role])

  // 2. Fetch receipts (same working query, no broken joins)
  useEffect(() => {
    if (!role) return
    if (!canView) {
      setLoading(false)
      return
    }

    supabase
      .from("receipts")
      .select("*")
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .then(({ data }) => {
        setReceipts(data || [])
        setLoading(false)
      })
  }, [role, canView])

  // Filter by search
  const filtered = search.trim()
    ? receipts.filter((rec) => {
        const cust = customerMap[rec.party_id]
        const custName = cust?.name || ""
        return (
          rec.receipt_no?.toLowerCase().includes(search.toLowerCase()) ||
          custName.toLowerCase().includes(search.toLowerCase())
        )
      })
    : receipts

  // Summary calculations
  const totalReceipts = filtered.length
  const totalAmount = filtered.reduce((s, r) => s + (r.amount || 0), 0)

  // WhatsApp helper – uses customer phone if available
  const sendWhatsApp = (rec: any) => {
    const cust = customerMap[rec.party_id]
    if (!cust?.phone) {
      alert("No phone number for this customer.")
      return
    }
    const message = `Dear ${cust.name}, your receipt ${rec.receipt_no} for PKR ${rec.amount?.toLocaleString()} has been recorded.`
    const url = `https://wa.me/${cust.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`
    window.open(url, "_blank")
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "#94A3B8" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "#E2E8F0" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .card { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.2); overflow: hidden; }
        .header-row { display: grid; grid-template-columns: 130px 90px 1fr 100px 80px 80px 80px; padding: 12px 20px; background: #1E293B; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94A3B8; border-bottom: 1px solid #1E293B; }
        .data-row { display: grid; grid-template-columns: 130px 90px 1fr 100px 80px 80px 80px; padding: 10px 20px; border-bottom: 1px solid #1E293B; font-size: 13px; align-items: center; transition: background 0.15s; }
        .data-row:hover { background: #1E293B; }
        .data-row:last-child { border-bottom: none; }
        .btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; border: 1.5px solid #334155; background: transparent; color: #CBD5E1; }
        .btn:hover { background: #1E293B; }
        .btn-icon { background: transparent; border: 1.5px solid #334155; color: #CBD5E1; padding: 6px; border-radius: 8px; cursor: pointer; }
        .input { width: 100%; height: 38px; border: 1.5px solid #334155; border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px; background: #1E293B; color: #F1F5F9; outline: none; box-sizing: border-box; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-item { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 16px; }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94A3B8; margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: #F1F5F9; }
        @media (max-width: 640px) {
          .header-row, .data-row { grid-template-columns: 90px 70px 1fr 70px 60px 50px 50px; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>💰 Receipts</h1>
          <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>{canEdit ? "Record customer payments" : "View receipts"}</p>
        </div>
        {canEdit && (
          <button className="btn btn-outline" onClick={() => router.push("/dashboard/receipts/new")}>
            <Plus size={16} /> New Receipt
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">Total Receipts</div>
          <div className="summary-value">{totalReceipts}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Total Amount</div>
          <div className="summary-value" style={{ color: "#10B981" }}>PKR {totalAmount.toLocaleString()}</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
        <input
          className="input"
          placeholder="Search by receipt # or customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading receipts…</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>
          No receipts found.
        </div>
      ) : (
        <div className="card">
          <div className="header-row">
            <span>Receipt #</span>
            <span>Date</span>
            <span>Customer</span>
            <span>Amount</span>
            <span>Method</span>
            <span></span>
            <span></span>
          </div>
          {filtered.map((rec) => {
            const cust = customerMap[rec.party_id]
            const custName = cust?.name || "—"
            return (
              <div key={rec.id} className="data-row">
                <span style={{ fontWeight: 600, color: "#93C5FD" }}>{rec.receipt_no}</span>
                <span>{rec.date}</span>
                <span>{custName}</span>
                <span style={{ fontWeight: 600, color: "#10B981" }}>PKR {rec.amount?.toLocaleString()}</span>
                <span>{rec.payment_method || "—"}</span>
                {/* View button */}
                <button className="btn-icon" onClick={() => router.push(`/dashboard/receipts/${rec.id}`)} title="View receipt">
                  <Eye size={14} />
                </button>
                {/* WhatsApp button */}
                <button className="btn-icon" onClick={() => sendWhatsApp(rec)} title="Send via WhatsApp"
                  style={{ color: "#25D366" }}>
                  {/* WhatsApp icon */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}