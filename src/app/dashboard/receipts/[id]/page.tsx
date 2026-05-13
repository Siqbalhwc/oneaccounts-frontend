"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer, MessageCircle, ExternalLink } from "lucide-react"
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
    return <div style={{ padding: 24, textAlign: "center" }}>Loading…</div>
  }
  if (!receipt) {
    return <div style={{ padding: 24, textAlign: "center" }}>Receipt not found.</div>
  }

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <style>{`
          .card {
            background: white; border-radius: 12px; border: 1px solid #E2E8F0;
            padding: 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          }
          .grid-2col {
            display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
          }
          .label { font-size: 11px; font-weight: 600; color: #94A3B8; text-transform: uppercase; margin-bottom: 4px; }
          .value { font-size: 14px; font-weight: 600; color: #1E293B; }
          .amount { font-size: 20px; font-weight: 800; color: #1D4ED8; }

          /* Timeline */
          .timeline { position: relative; padding-left: 28px; margin: 0; }
          .timeline::before {
            content: ''; position: absolute; left: 10px; top: 8px; bottom: 0;
            width: 2px; background: #E2E8F0;
          }
          .timeline-event { position: relative; margin-bottom: 20px; }
          .timeline-event:last-child { margin-bottom: 0; }
          .timeline-dot {
            position: absolute; left: -20px; top: 4px;
            width: 10px; height: 10px; border-radius: 50%;
            background: #1D4ED8; border: 2px solid white;
            box-shadow: 0 0 0 2px #1D4ED8;
          }
          .timeline-dot.insert { background: #10B981; box-shadow: 0 0 0 2px #10B981; }
          .timeline-dot.update { background: #F59E0B; box-shadow: 0 0 0 2px #F59E0B; }
          .timeline-dot.delete { background: #EF4444; box-shadow: 0 0 0 2px #EF4444; }

          .timeline-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
          .action-badge {
            font-size: 10px; font-weight: 700; text-transform: uppercase;
            padding: 2px 8px; border-radius: 100px; letter-spacing: 0.04em;
          }
          .action-badge.insert { background: #D1FAE5; color: #065F46; }
          .action-badge.update { background: #FEF3C7; color: #92400E; }
          .action-badge.delete { background: #FEE2E2; color: #991B1B; }

          .field-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
          .pill {
            background: #F1F5F9; border-radius: 6px; padding: 2px 10px;
            font-size: 11px; color: #475569; display: inline-flex; align-items: center; gap: 4px;
          }
          .pill-key { font-weight: 600; }
          .pill-value { color: #1E293B; }
          .pill-null { color: #94A3B8; font-style: italic; }

          .user-strip {
            font-size: 11px; color: #94A3B8; display: flex; align-items: center; gap: 6px;
            margin-top: 10px; border-top: 1px solid #F1F5F9; padding-top: 8px;
          }
        `}</style>

        {/* Back & Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => router.push("/dashboard/receipts")} style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>Receipt {receipt.receipt_no}</h1>
              <p style={{ color: "#94A3B8", fontSize: 13 }}>Received</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              <Printer size={14} /> Print PDF
            </button>
            <button style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              <MessageCircle size={14} /> WhatsApp
            </button>
          </div>
        </div>

        {/* Receipt Details Card */}
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1E293B", marginBottom: 16 }}>Receipt details</h2>
          <div className="grid-2col">
            <div>
              <div className="label">Receipt no.</div>
              <div className="value">{receipt.receipt_no}</div>
            </div>
            <div>
              <div className="label">Date</div>
              <div className="value">{new Date(receipt.date || receipt.payment_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
            </div>
            <div>
              <div className="label">Customer</div>
              <div className="value" style={{ color: "#1D4ED8" }}>
                {customer ? `${customer.code} – ${customer.name}` : "—"}
              </div>
            </div>
            <div>
              <div className="label">Payment method</div>
              <div className="value">{receipt.payment_method || "—"}</div>
            </div>
            <div>
              <div className="label">Amount</div>
              <div className="amount">PKR {receipt.amount?.toLocaleString()}</div>
            </div>
            <div>
              <div className="label">Bank account</div>
              <div className="value">
                {bank ? `${bank.bank_name} ${bank.account_number ? "· " + bank.account_number : ""}` : "—"}
              </div>
            </div>
            <div>
              <div className="label">Notes</div>
              <div className="value" style={{ fontWeight: 400 }}>{receipt.notes || "—"}</div>
            </div>
            <div>
              <div className="label">Reference</div>
              <div className="value" style={{ fontWeight: 400 }}>{receipt.reference || "—"}</div>
            </div>
          </div>
        </div>

        {/* Change History – New Professional Timeline */}
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1E293B", marginBottom: 16 }}>Change history</h2>
          {auditLogs.length === 0 ? (
            <div style={{ textAlign: "center", padding: 20, color: "#94A3B8" }}>No events recorded.</div>
          ) : (
            <div className="timeline">
              {auditLogs.map((log, idx) => {
                const action = log.action || "UNKNOWN"
                const badgeClass = action.toLowerCase() === "insert" ? "insert" : action.toLowerCase() === "update" ? "update" : "delete"
                const dotClass = action.toLowerCase() === "insert" ? "insert" : action.toLowerCase() === "update" ? "update" : "delete"

                // Extract new/old values as an object
                let values: Record<string, any> = {}
                if (log.new_values) {
                  try { values = JSON.parse(log.new_values) } catch { values = log.new_values }
                }

                // Build pills from new_values (ignore empty and technical fields)
                const pills = Object.entries(values)
                  .filter(([k]) => !["id", "company_id", "created_at", "updated_at", "deleted_at", "changed_at", "changed_by"].includes(k))
                  .map(([key, val]) => ({ key, value: val }))

                return (
                  <div key={log.id} className="timeline-event">
                    <div className={`timeline-dot ${dotClass}`} />
                    <div className="timeline-header">
                      <span className={`action-badge ${badgeClass}`}>{action}</span>
                      <span style={{ fontSize: 12, color: "#64748B" }}>
                        {new Date(log.changed_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                      </span>
                      <span style={{ fontSize: 12, color: "#94A3B8" }}>
                        {new Date(log.changed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </div>
                    <div className="field-pills">
                      {pills.slice(0, 8).map((p, i) => (
                        <div key={i} className="pill">
                          <span className="pill-key">{p.key}</span>
                          <span className={`pill-value ${p.value === null || p.value === "" ? "pill-null" : ""}`}>
                            {p.value === null ? "null" : String(p.value)}
                          </span>
                        </div>
                      ))}
                      {pills.length > 8 && <div className="pill">+{pills.length - 8} more</div>}
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
          {/* Summary strip */}
          {auditLogs.length > 0 && (
            <div style={{ marginTop: 16, borderTop: "1px solid #E2E8F0", paddingTop: 12 }}>
              <div style={{ fontSize: 13, color: "#64748B" }}>
                Created {new Date(receipt.created_at || receipt.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                {" · "}
                <span style={{ fontWeight: 600, color: "#1E293B" }}>{receipt.receipt_no}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  )
}