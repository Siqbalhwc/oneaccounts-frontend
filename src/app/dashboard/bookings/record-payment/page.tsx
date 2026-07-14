"use client"

import { Suspense } from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
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

  const [bankAccounts, setBankAccounts] = useState<any[]>([])
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

      supabase.from("bank_accounts")
        .select("id, bank_name, account_title, account_number")
        .eq("company_id", cid)
        .then(({ data }) => { if (data) setBankAccounts(data) })

      setLoading(false)
    })
  }, [])

  // Fetch this customer's active bookings when selected
  useEffect(() => {
    if (!selectedCustomer || !companyId) { setBookings([]); return }
    supabase.from("property_bookings")
      .select("id, total_price, balance_amount, status, products(name, code), projects(name)")
      .eq("company_id", companyId)
      .eq("customer_id", selectedCustomer.id)
      .eq("status", "active")
      .then(({ data }) => {
        setBookings(data || [])
        setSelectedBookingId(null)
        setInstallments([])
      })
  }, [selectedCustomer, companyId])

  // Fetch installment schedule when a booking is selected
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

  // Preview: which installments this payment amount would cover (FIFO)
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
      <div style={{ padding: "40px 24px", background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", display: "flex", justifyContent: "center" }}>
        <div style={{ maxWidth: 460, width: "100%" }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 32, textAlign: "center" }}>
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
                PKR {result.unapplied_amount.toLocaleString()} of this payment exceeded the remaining balance and was not applied to any installment.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={() => { setResult(null); setSelectedCustomer(null); setSelectedBookingId(null); setAmount(0) }}
                style={{ padding: 11, borderRadius: 9, background: "var(--primary)", color: "var(--primary-text)", border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
              >
                Record Another Payment
              </button>
              <button
                onClick={() => router.push("/dashboard")}
                style={{ padding: 11, borderRadius: 9, background: "transparent", color: "var(--text-muted)", border: "1.5px solid var(--border)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: "12px 16px", background: "var(--bg)", minHeight: "100%", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .rp-shell { max-width: 640px; margin: 0 auto; }
        .rp-title { font-size: 18px; font-weight: 700; color: var(--text); }
        .rp-card { background: var(--card); border-radius: 12px; border: 1px solid var(--border); padding: 20px; box-shadow: var(--shadow-sm); margin-bottom: 12px; }
        .rp-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .rp-input, .rp-select { width: 100%; height: 40px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--text); outline: none; box-sizing: border-box; }
        .rp-input:focus, .rp-select:focus { border-color: var(--primary); }
        .rp-field { margin-bottom: 14px; }
        .rp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
        .rp-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-family: inherit; }
        .rp-btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); font-weight: 700; width: 100%; justify-content: center; padding: 12px; }
        .rp-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .booking-option { border: 1.5px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; font-size: 13px; }
        .booking-option.selected { border-color: var(--primary); background: rgba(37,99,235,0.06); }
        .sched-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
        .sched-row:last-child { border-bottom: none; }
        .status-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
        @media (max-width: 640px) { .rp-row { grid-template-columns: 1fr; } }
      `}</style>

      <div className="rp-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="rp-btn" onClick={() => router.back()}><ArrowLeft size={16} /></button>
          <div style={{ flex: 1 }}>
            <div className="rp-title">💵 Record Installment Payment</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Applies FIFO across the oldest unpaid installments first</div>
          </div>
        </div>

        {error && (
          <div style={{ background: "var(--card)", border: "1px solid #EF4444", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div className="rp-card">
          <div className="rp-field">
            <EntityPicker
              entityType="customer"
              value={selectedCustomer}
              onChange={(record) => setSelectedCustomer(record)}
              label="Customer"
              required
            />
          </div>

          {selectedCustomer && (
            <div className="rp-field">
              <label className="rp-label">Active Bookings</label>
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
          <div className="rp-card">
            <label className="rp-label">Installment Schedule</label>
            {loadingInstallments ? (
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading…</p>
            ) : (
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {installments.map(inst => {
                  const { label, color } = computeDisplayStatus(inst)
                  return (
                    <div key={inst.id} className="sched-row">
                      <span>#{inst.installment_no} — {inst.due_date}</span>
                      <span>PKR {inst.amount.toLocaleString()}{inst.amount_paid > 0 ? ` (paid ${inst.amount_paid.toLocaleString()})` : ""}</span>
                      <span className="status-badge" style={{ background: `${color}22`, color }}>
                        {label === "Overdue" && <Clock size={10} style={{ display: "inline", marginRight: 3, verticalAlign: -1 }} />}
                        {label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, textAlign: "right" }}>
              Total Outstanding: PKR {totalOutstanding.toLocaleString()}
            </div>
          </div>
        )}

        {selectedBookingId && (
          <div className="rp-card">
            <div className="rp-row">
              <div>
                <label className="rp-label">Payment Amount (PKR) *</label>
                <input className="rp-input" type="number" value={amount || ""} onChange={e => setAmount(Number(e.target.value))} placeholder="0" />
              </div>
              <div>
                <label className="rp-label">Payment Date</label>
                <input className="rp-input" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
              </div>
            </div>

            <div className="rp-field">
              <label className="rp-label">Received Into *</label>
              <select className="rp-select" value={bankAccountId ?? ""} onChange={e => setBankAccountId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Select Bank Account —</option>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>{b.bank_name} — {b.account_title} ({b.account_number})</option>
                ))}
              </select>
            </div>

            <div className="rp-row">
              <div>
                <label className="rp-label">Reference</label>
                <input className="rp-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <label className="rp-label">Notes</label>
                <input className="rp-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            {amount > 0 && previewCoverage.covered.length > 0 && (
              <div style={{ background: "var(--bg)", border: "1px dashed var(--border)", borderRadius: 8, padding: 10, fontSize: 12, marginBottom: 4 }}>
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

        {selectedBookingId && (
          <button className="rp-btn rp-btn-primary" onClick={handleSubmit} disabled={!canSubmit || saving}>
            {saving ? "Recording…" : "Record Payment"}
          </button>
        )}
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