"use client"

import { Suspense } from "react"
import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, CheckCircle, AlertTriangle, Clock } from "lucide-react"
import EntityPicker from "@/components/entity-picker/EntityPicker"

interface Installment {
  id: number
  installment_no: number
  due_date: string
  amount: number
  amount_paid: number
  status: string
}

function computeDisplayStatus(inst: Installment): { label: string; color: string } {
  const outstanding = inst.amount - inst.amount_paid
  if (outstanding <= 0) return { label: "Paid", color: "#10B981" }
  const today = new Date().toISOString().split("T")[0]
  if (inst.due_date < today) return { label: "Overdue", color: "#EF4444" }
  if (inst.amount_paid > 0) return { label: "Partially Paid", color: "#F59E0B" }
  return { label: "Pending", color: "var(--text-muted)" }
}

function RecordPaymentPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialCustomerId = searchParams.get("customer")
  const initialBookingId = searchParams.get("booking")

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [loading, setLoading] = useState(true)

  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const [bookings, setBookings] = useState<any[]>([])
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null)
  const [installments, setInstallments] = useState<Installment[]>([])
  const [loadingInstallments, setLoadingInstallments] = useState(false)

  const [banks, setBanks] = useState<any[]>([])
  const [bankAccountId, setBankAccountId] = useState<number | null>(null)

  const [amount, setAmount] = useState<number>(0)
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)

      // Same query shape as the real Receipt page.
      supabase.from("bank_accounts").select("id, bank_name, accounts(code)")
        .eq("company_id", cid).order("bank_name")
        .then(r => {
          if (r.error) console.error("Failed to load banks:", r.error)
          if (r.data) setBanks(r.data.map((b: any) => ({ id: b.id, name: b.bank_name, glCode: b.accounts?.code })))
        })

      // Deep-link support: pre-select customer if arriving from the
      // Bookings list page's "Record Payment" row action.
      if (initialCustomerId) {
        supabase.from("customers").select("id, code, name")
          .eq("id", initialCustomerId).eq("company_id", cid).maybeSingle()
          .then(({ data }) => { if (data) setSelectedCustomer(data) })
      }

      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!selectedCustomer || !companyId) { setBookings([]); return }
    supabase.from("property_bookings")
      .select("id, total_price, balance_amount, status, products(name, code), projects(name)")
      .eq("company_id", companyId)
      .eq("customer_id", selectedCustomer.id)
      .eq("status", "active")
      .then(({ data }) => {
        setBookings(data || [])
        // Deep-link: auto-select the specific booking if one was passed in,
        // otherwise leave unselected as usual.
        if (initialBookingId && data?.some(b => String(b.id) === initialBookingId)) {
          setSelectedBookingId(Number(initialBookingId))
        } else {
          setSelectedBookingId(null)
        }
        setInstallments([])
      })
  }, [selectedCustomer, companyId])

  useEffect(() => {
    if (!selectedBookingId) { setInstallments([]); return }
    setLoadingInstallments(true)
    supabase.from("installment_schedule")
      .select("id, installment_no, due_date, amount, amount_paid, status")
      .eq("booking_id", selectedBookingId)
      .order("installment_no", { ascending: true })
      .then(({ data }) => {
        setInstallments(data || [])
        setLoadingInstallments(false)
      })
  }, [selectedBookingId])

  const selectedBooking = bookings.find(b => b.id === selectedBookingId)
  const totalOutstanding = installments.reduce((s, i) => s + (i.amount - i.amount_paid), 0)

  const previewCoverage = (() => {
    let remaining = amount
    const covered: { no: number; applied: number; full: boolean }[] = []
    for (const inst of installments) {
      if (remaining <= 0) break
      const outstanding = inst.amount - inst.amount_paid
      if (outstanding <= 0) continue
      const applied = Math.min(remaining, outstanding)
      covered.push({ no: inst.installment_no, applied, full: applied >= outstanding })
      remaining -= applied
    }
    return { covered, leftover: Math.max(0, remaining) }
  })()

  const canSubmit = selectedBookingId && amount > 0 && bankAccountId

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/construction/bookings/record-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: selectedBookingId,
          amount,
          payment_date: paymentDate,
          bank_account_id: bankAccountId,
          reference,
          notes,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || "Failed to record payment")
        setSaving(false)
        return
      }
      setResult(data)
    } catch (err: any) {
      setError(err.message || "Network error")
    }
    setSaving(false)
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>Loading…</div>
  }

  if (result) {
    return (
      <div style={{ padding: "16px", background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", display: "flex", justifyContent: "center" }}>
        <div style={{ maxWidth: 460, width: "100%", marginTop: 40 }}>
          <div className="inv-card" style={{ padding: 32, textAlign: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(16,185,129,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <CheckCircle size={28} color="#10B981" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Payment Recorded</h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
              Applied across {result.installments_updated} installment{result.installments_updated !== 1 ? "s" : ""}.
              {result.booking_completed && " This booking is now fully paid off."}
            </p>
            {result.unapplied_amount > 0 && (
              <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 12, color: "#F59E0B", textAlign: "left" }}>
                <AlertTriangle size={13} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
                PKR {result.unapplied_amount.toLocaleString()} of this payment exceeded the remaining balance and was not applied.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                className="inv-btn"
                style={{ justifyContent: "center", padding: 11, background: "var(--primary)", color: "var(--primary-text)", borderColor: "var(--primary)", fontWeight: 700 }}
                onClick={() => { setResult(null); setSelectedCustomer(null); setSelectedBookingId(null); setAmount(0) }}
              >
                Record Another Payment
              </button>
              <button className="inv-btn" style={{ justifyContent: "center", padding: 11 }} onClick={() => router.push("/dashboard")}>
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: "16px", background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .inv-shell { width: 100%; margin: 0; }
        .inv-title { font-size: 18px; font-weight: 700; color: var(--text); }
        .inv-card {
          background: var(--card); border-radius: 12px; border: 1px solid var(--border);
          padding: 16px 20px; box-shadow: var(--shadow-sm); margin-bottom: 12px;
        }
        .inv-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .inv-input, .inv-select {
          width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; font-family: inherit;
          background: var(--bg); color: var(--text); outline: none; box-sizing: border-box;
        }
        .inv-input:focus, .inv-select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .inv-btn {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border);
          background: transparent; color: var(--text-muted); font-family: inherit;
          transition: all 0.15s; white-space: nowrap; text-decoration: none; width: 100%;
        }
        .inv-btn:hover { background: var(--card-hover); }
        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }
        @media (max-width: 900px) { .header-grid { grid-template-columns: 1fr; } }
        @media (max-width: 640px) { .inv-row { grid-template-columns: 1fr; } }

        .booking-option { border: 1.5px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; font-size: 13px; }
        .booking-option.selected { border-color: var(--primary); background: rgba(37,99,235,0.06); }

        /* Themed scrollbar for the schedule list — matches the pattern
           already used elsewhere (e.g. invoice item table), fixing the
           unstyled white native scrollbar. Single scroll container only —
           no nested scroll region, so only one scrollbar ever appears. */
        .sched-scroll {
          max-height: 260px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--border) var(--bg);
        }
        .sched-scroll::-webkit-scrollbar { width: 8px; }
        .sched-scroll::-webkit-scrollbar-track { background: var(--bg); border-radius: 4px; }
        .sched-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
        .sched-scroll::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--border); }
        td { padding: 8px 6px; border-bottom: 1px solid var(--border); vertical-align: middle; }
        .status-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
      `}</style>

      <div className="inv-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="inv-btn" style={{ width: "auto" }} onClick={() => router.back()}><ArrowLeft size={16} /></button>
          <div style={{ flex: 1 }}>
            <div className="inv-title">💵 Record Installment Payment</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Applies FIFO across the oldest unpaid installments first</div>
          </div>
        </div>

        {error && (
          <div style={{ background: "var(--card)", border: "1px solid #EF4444", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div className="header-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="inv-card">
              <div style={{ marginBottom: selectedCustomer ? 14 : 0 }}>
                <EntityPicker
                  entityType="customer"
                  value={selectedCustomer}
                  onChange={(record) => setSelectedCustomer(record)}
                  label="Customer"
                  required
                />
              </div>

              {selectedCustomer && (
                <div>
                  <label className="inv-label">Active Bookings</label>
                  {bookings.length === 0 ? (
                    <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No active bookings found for this customer.</p>
                  ) : (
                    bookings.map(b => (
                      <div
                        key={b.id}
                        className={`booking-option ${selectedBookingId === b.id ? "selected" : ""}`}
                        onClick={() => setSelectedBookingId(b.id)}
                      >
                        <strong>{b.products?.name || `Booking #${b.id}`}</strong>
                        {b.projects?.name && <span style={{ color: "var(--text-muted)" }}> — {b.projects.name}</span>}
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          Total: PKR {b.total_price.toLocaleString()} · Balance: PKR {b.balance_amount.toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {selectedBookingId && (
              <div className="inv-card">
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>Installment Schedule</h3>
                {loadingInstallments ? (
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading…</p>
                ) : (
                  <div className="sched-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Due Date</th>
                          <th style={{ textAlign: "right" }}>Amount</th>
                          <th style={{ textAlign: "right" }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {installments.map(inst => {
                          const { label, color } = computeDisplayStatus(inst)
                          return (
                            <tr key={inst.id}>
                              <td>{inst.installment_no}</td>
                              <td>{inst.due_date}</td>
                              <td style={{ textAlign: "right" }}>
                                PKR {inst.amount.toLocaleString()}
                                {inst.amount_paid > 0 && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>paid {inst.amount_paid.toLocaleString()}</div>}
                              </td>
                              <td style={{ textAlign: "right" }}>
                                <span className="status-badge" style={{ background: `${color}22`, color }}>
                                  {label === "Overdue" && <Clock size={10} style={{ display: "inline", marginRight: 3, verticalAlign: -1 }} />}
                                  {label}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, textAlign: "right" }}>
                  Total Outstanding: PKR {totalOutstanding.toLocaleString()}
                </div>
              </div>
            )}

            {selectedBookingId && (
              <div className="inv-card">
                <div className="inv-row">
                  <div>
                    <label className="inv-label">Payment Amount (PKR) *</label>
                    <input className="inv-input" type="number" value={amount || ""} onChange={e => setAmount(Number(e.target.value))} placeholder="0" />
                  </div>
                  <div>
                    <label className="inv-label">Payment Date</label>
                    <input className="inv-input" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <label className="inv-label">Received Into *</label>
                  <select className="inv-select" value={bankAccountId ?? ""} onChange={e => setBankAccountId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">— Select Bank —</option>
                    {banks.map((b: any) => <option key={b.id} value={b.id}>{b.name}{b.glCode ? ` (${b.glCode})` : ""}</option>)}
                  </select>
                </div>

                <div className="inv-row" style={{ marginTop: 10 }}>
                  <div>
                    <label className="inv-label">Reference</label>
                    <input className="inv-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional" />
                  </div>
                  <div>
                    <label className="inv-label">Notes</label>
                    <input className="inv-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
                  </div>
                </div>

                {amount > 0 && previewCoverage.covered.length > 0 && (
                  <div style={{ background: "var(--bg)", border: "1px dashed var(--border)", borderRadius: 8, padding: 10, fontSize: 12, marginTop: 10 }}>
                    This will cover: {previewCoverage.covered.map(c => `#${c.no}${c.full ? "" : " (partial)"}`).join(", ")}
                    {previewCoverage.leftover > 0 && (
                      <div style={{ color: "#F59E0B", marginTop: 4 }}>
                        ⚠️ PKR {previewCoverage.leftover.toLocaleString()} exceeds the remaining balance and won't be applied.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="inv-card">
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>Summary</h3>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
                <span>Outstanding</span><span>PKR {totalOutstanding.toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4, color: "var(--text-muted)" }}>
                <span>This Payment</span><span>PKR {amount.toLocaleString()}</span>
              </div>
            </div>
            <div className="inv-card">
              <button className="inv-btn" style={{ justifyContent: "center", padding: 11, background: "var(--primary)", color: "var(--primary-text)", borderColor: "var(--primary)", fontWeight: 700 }} onClick={handleSubmit} disabled={!canSubmit || saving}>
                {saving ? "Recording…" : "💾 Record Payment"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
      <RecordPaymentPageContent />
    </Suspense>
  )
}