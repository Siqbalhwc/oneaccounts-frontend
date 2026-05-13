"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer, MessageCircle, CheckCircle, Clock } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

export default function ReceiptDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()

  const [receipt, setReceipt] = useState<any>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [bank, setBank] = useState<any>(null)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // Simulated payment behaviour hint
  const [paymentBehaviour, setPaymentBehaviour] = useState<string>("")

  useEffect(() => {
    if (!role || !id) return
    const fetchData = async () => {
      // Receipt
      const { data: rec } = await supabase
        .from("receipts")
        .select("*")
        .eq("id", id)
        .single()
      if (!rec) { setLoading(false); return }
      setReceipt(rec)

      // Customer
      if (rec.party_id) {
        const { data: cust } = await supabase
          .from("customers")
          .select("id, code, name, phone, balance")
          .eq("id", rec.party_id)
          .single()
        setCustomer(cust)

        // Simulated payment behaviour based on customer ID (for demo)
        if (cust) {
          const num = parseInt(cust.code?.replace(/\D/g, "")) || 0
          setPaymentBehaviour(num % 3 === 0 ? "Pays on time" : num % 3 === 1 ? "Often pays within 7 days" : "Occasional delays")
        }
      }

      // Bank
      if (rec.bank_account_id) {
        const { data: bk } = await supabase
          .from("bank_accounts")
          .select("id, bank_name, account_number, accounts(code)")
          .eq("id", rec.bank_account_id)
          .single()
        setBank(bk)
      }

      // Audit logs
      const { data: logs } = await supabase
        .from("data_change_logs")
        .select("*")
        .eq("table_name", "receipts")
        .eq("record_id", String(id))
        .order("changed_at", { ascending: true })
      setAuditLogs(logs || [])

      setLoading(false)
    }
    fetchData()
  }, [role, id])

  if (loading || !role) {
    return <div style={{ padding: 24, textAlign: "center", color: "#94A3B8" }}>Loading…</div>
  }
  if (!receipt) {
    return <div style={{ padding: 24, textAlign: "center", color: "#94A3B8" }}>Receipt not found.</div>
  }

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
        <style>{`
          .card {
            background: #111827; border: 1px solid #1E293B; border-radius: 16px;
            padding: 24px; margin-bottom: 16px;
          }
          .grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          .label { font-size: 11px; font-weight: 600; color: #64748B; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.04em; }
          .value { font-size: 14px; font-weight: 600; color: #F1F5F9; }
          .amount { font-size: 36px; font-weight: 800; color: #F8FAFC; letter-spacing: -1px; }

          .timeline { position: relative; padding-left: 28px; margin: 0; }
          .timeline::before { content: ''; position: absolute; left: 10px; top: 8px; bottom: 0; width: 2px; background: #1E293B; }
          .timeline-event { position: relative; margin-bottom: 20px; }
          .timeline-event:last-child { margin-bottom: 0; }
          .timeline-dot { position: absolute; left: -20px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: #2563EB; border: 2px solid #111827; box-shadow: 0 0 0 2px #2563EB; }
          .timeline-dot.insert { background: #10B981; box-shadow: 0 0 0 2px #10B981; }
          .action-badge {
            font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: 100px;
          }
          .action-badge.insert { background: #064E3B; color: #6EE7B7; }
          .field-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
          .pill { background: #1E293B; border-radius: 6px; padding: 2px 10px; font-size: 11px; color: #CBD5E1; display: inline-flex; align-items: center; gap: 4px; }
          .pill-key { font-weight: 600; }
          .user-strip { font-size: 11px; color: #64748B; display: flex; align-items: center; gap: 6px; margin-top: 10px; border-top: 1px solid #1E293B; padding-top: 8px; }
          .badge-active { background: #064E3B; color: #6EE7B7; border: 1px solid #065F46; }
          @media (max-width: 640px) {
            .grid-2col { grid-template-columns: 1fr; }
            .amount { font-size: 28px; }
          }
        `}</style>

        {/* Header */}
        <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <button onClick={() => router.push("/dashboard/receipts")} style={{ background: "#1E293B", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", color: "#94A3B8" }}>
                <ArrowLeft size={16} />
              </button>
              <h1 className="amount">PKR {receipt.amount?.toLocaleString()}</h1>
              <span className="badge-active" style={{ padding: "4px 12px", borderRadius: 100, fontSize: 12, fontWeight: 600, marginLeft: 12 }}>
                ● ACTIVE
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: "#F1F5F9", margin: "4px 0" }}>Receipt {receipt.receipt_no}</h2>
            <p style={{ color: "#94A3B8", fontSize: 14 }}>Received from {customer ? `${customer.name}` : "—"}</p>
            {paymentBehaviour && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: paymentBehaviour.includes("on time") ? "#6EE7B7" : "#FCD34D", fontSize: 13 }}>
                <Clock size={14} />
                <span>{paymentBehaviour}</span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 10, padding: "10px 16px", color: "#F1F5F9", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <Printer size={14} /> Print
            </button>
            <button style={{ background: "#065F46", border: "none", borderRadius: 10, padding: "10px 16px", color: "white", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <MessageCircle size={14} /> WhatsApp
            </button>
            {role === "admin" && (
              <button style={{ background: "#2563EB", border: "none", borderRadius: 10, padding: "10px 16px", color: "white", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                ✏️ Edit
              </button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid-2col" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="label">Customer</div>
            <div className="value">{customer ? `${customer.code} – ${customer.name}` : "—"}</div>
          </div>
          <div className="card">
            <div className="label">Date</div>
            <div className="value">{new Date(receipt.date || receipt.payment_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
          </div>
          <div className="card">
            <div className="label">Payment Method</div>
            <div className="value">{receipt.payment_method || "—"}</div>
          </div>
          <div className="card">
            <div className="label">Bank Account</div>
            <div className="value">{bank ? `${bank.bank_name} · ${bank.account_number || "—"}` : "—"}</div>
          </div>
        </div>

        {/* Receipt Details */}
        <div className="card">
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#F1F5F9", marginBottom: 20 }}>Receipt Details</h2>
          <div className="grid-2col">
            <div>
              <div className="label">Receipt No.</div>
              <div className="value">{receipt.receipt_no}</div>
            </div>
            <div>
              <div className="label">Reference</div>
              <div className="value">{receipt.reference || "—"}</div>
            </div>
            <div>
              <div className="label">Notes</div>
              <div className="value" style={{ fontWeight: 400 }}>{receipt.notes || "—"}</div>
            </div>
            <div>
              <div className="label">Status</div>
              <span className="badge-active" style={{ padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>Active</span>
            </div>
          </div>
        </div>

        {/* Change History */}
        <div className="card">
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#F1F5F9", marginBottom: 20 }}>Change History</h2>
          {auditLogs.length === 0 ? (
            <div style={{ textAlign: "center", padding: 20, color: "#64748B" }}>No events recorded.</div>
          ) : (
            <div className="timeline">
              {auditLogs.map((log, idx) => {
                const action = log.action || "UNKNOWN"
                const badgeClass = action.toLowerCase()
                let values: Record<string, any> = {}
                if (log.new_values) {
                  try { values = JSON.parse(log.new_values) } catch { values = log.new_values }
                }
                const pills = Object.entries(values)
                  .filter(([k]) => !["id", "company_id", "created_at", "updated_at", "deleted_at", "changed_at", "changed_by"].includes(k))
                  .map(([key, val]) => ({ key, value: val }))

                return (
                  <div key={log.id} className="timeline-event">
                    <div className={`timeline-dot ${badgeClass === "insert" ? "insert" : ""}`} />
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span className={`action-badge ${badgeClass === "insert" ? "insert" : ""}`}>{action}</span>
                      <span style={{ fontSize: 12, color: "#64748B" }}>
                        {new Date(log.changed_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                      </span>
                      <span style={{ fontSize: 12, color: "#475569" }}>
                        {new Date(log.changed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </div>
                    <div className="field-pills">
                      {pills.slice(0, 8).map((p, i) => (
                        <div key={i} className="pill">
                          <span className="pill-key">{p.key}</span>
                          <span>{p.value === null ? "null" : String(p.value)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="user-strip">
                      <span>👤 {log.changed_by || "System"}</span>
                      <span>·</span>
                      <span>{new Date(log.changed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  )
}s