"use client"

import { Suspense } from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, CheckCircle, ExternalLink, Home } from "lucide-react"
import EntityPicker from "@/components/entity-picker/EntityPicker"
import { getLabel, type BusinessType } from "@/lib/labels"

function NewBookingPageContent() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [businessType, setBusinessType] = useState("")
  const [loading, setLoading] = useState(true)

  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const [selectedProject, setSelectedProject] = useState<any>(null)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)

  const [bankAccounts, setBankAccounts] = useState<any[]>([])
  const [bankAccountId, setBankAccountId] = useState<number | null>(null)

  const [totalPrice, setTotalPrice] = useState<number>(0)
  const [advanceAmount, setAdvanceAmount] = useState<number>(0)
  const [numberOfInstallments, setNumberOfInstallments] = useState<number>(60)
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split("T")[0])
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

      supabase.from("companies").select("business_type").eq("id", cid).single()
        .then(({ data }) => { if (data) setBusinessType(data.business_type || "") })

      supabase.from("bank_accounts")
        .select("id, bank_name, account_title, account_number")
        .eq("company_id", cid)
        .then(({ data }) => { if (data) setBankAccounts(data) })

      setLoading(false)
    })
  }, [])

  const labels = {
    project: getLabel(businessType as BusinessType, "project"),
  }

  const balanceAmount = Math.max(0, totalPrice - advanceAmount)
  const previewInstallment = numberOfInstallments > 0
    ? Math.round((balanceAmount / numberOfInstallments) * 100) / 100
    : 0

  const canSubmit =
    selectedCustomer &&
    selectedProduct &&
    totalPrice > 0 &&
    advanceAmount >= 0 &&
    advanceAmount <= totalPrice &&
    numberOfInstallments > 0 &&
    (advanceAmount === 0 || bankAccountId)

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError("")

    try {
      const res = await fetch("/api/construction/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: selectedCustomer.id,
          project_id: selectedProject?.id || null,
          product_id: selectedProduct.id,
          total_price: totalPrice,
          advance_amount: advanceAmount,
          number_of_installments: numberOfInstallments,
          booking_date: bookingDate,
          bank_account_id: bankAccountId,
          reference,
          notes,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || "Failed to create booking")
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

  // ── Success screen ──
  if (result) {
    return (
      <div style={{ padding: "40px 24px", background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", display: "flex", justifyContent: "center" }}>
        <div style={{ maxWidth: 480, width: "100%" }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 32, textAlign: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(16,185,129,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <CheckCircle size={28} color="#10B981" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Booking Created</h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
              {selectedProduct?.name} booked for {selectedCustomer?.name}.
            </p>

            <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, textAlign: "left", marginBottom: 20, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: "var(--text-muted)" }}>Total Price</span>
                <span style={{ fontWeight: 600 }}>PKR {totalPrice.toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: "var(--text-muted)" }}>Advance Paid</span>
                <span style={{ fontWeight: 600 }}>PKR {advanceAmount.toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: "var(--text-muted)" }}>Balance</span>
                <span style={{ fontWeight: 600 }}>PKR {result.balance_amount.toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>{result.number_of_installments} Installments of</span>
                <span style={{ fontWeight: 600 }}>PKR {result.installment_amount.toLocaleString()}/mo</span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={() => router.push(`/dashboard/invoices/${result.invoice_id}`)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 11, borderRadius: 9, background: "var(--primary)", color: "var(--primary-text)", border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
              >
                <ExternalLink size={15} /> View Sales Invoice
              </button>
              {result.receipt_id && (
                <button
                  onClick={() => router.push(`/dashboard/receipts/${result.receipt_id}`)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 11, borderRadius: 9, background: "transparent", color: "var(--text)", border: "1.5px solid var(--border)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                >
                  <ExternalLink size={15} /> View Advance Receipt
                </button>
              )}
              <button
                onClick={() => router.push("/dashboard")}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 11, borderRadius: 9, background: "transparent", color: "var(--text-muted)", border: "1.5px solid var(--border)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
              >
                <Home size={15} /> Back to Dashboard
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
        .bk-shell { max-width: 640px; margin: 0 auto; }
        .bk-title { font-size: 18px; font-weight: 700; color: var(--text); }
        .bk-card { background: var(--card); border-radius: 12px; border: 1px solid var(--border); padding: 20px; box-shadow: var(--shadow-sm); margin-bottom: 12px; }
        .bk-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .bk-input, .bk-select { width: 100%; height: 40px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--text); outline: none; box-sizing: border-box; }
        .bk-input:focus, .bk-select:focus { border-color: var(--primary); }
        .bk-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
        .bk-field { margin-bottom: 14px; }
        .bk-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-family: inherit; }
        .bk-btn:hover { background: var(--card-hover); }
        .bk-btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); font-weight: 700; width: 100%; justify-content: center; padding: 12px; }
        .bk-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .bk-preview { background: var(--bg); border: 1px dashed var(--border); border-radius: 10px; padding: 14px; font-size: 13px; }
        .bk-preview-row { display: flex; justify-content: space-between; padding: 4px 0; }
        @media (max-width: 640px) { .bk-row { grid-template-columns: 1fr; } }
      `}</style>

      <div className="bk-shell">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="bk-btn" onClick={() => router.back()}><ArrowLeft size={16} /></button>
          <div style={{ flex: 1 }}>
            <div className="bk-title">🏗️ New Property Booking</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Sell a unit/plot on an installment plan</div>
          </div>
        </div>

        {error && (
          <div style={{ background: "var(--card)", border: "1px solid #EF4444", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div className="bk-card">
          <div className="bk-field">
            <EntityPicker
              entityType="customer"
              value={selectedCustomer}
              onChange={(record) => setSelectedCustomer(record)}
              label="Customer (Buyer)"
              required
            />
          </div>

          <div className="bk-field">
            <EntityPicker
              entityType="project"
              value={selectedProject}
              onChange={(record) => setSelectedProject(record)}
              label={labels.project}
              placeholder={`— Select ${labels.project} —`}
              allowCreate={false}
            />
          </div>

          <div className="bk-field">
            <EntityPicker
              entityType="product"
              value={selectedProduct}
              onChange={(record) => {
                setSelectedProduct(record)
                if (record?.sale_price) setTotalPrice(record.sale_price)
              }}
              label="Unit / Plot"
              placeholder="Search unit or plot…"
              required
              allowCreate={false}
            />
          </div>
        </div>

        <div className="bk-card">
          <div className="bk-row">
            <div>
              <label className="bk-label">Total Price (PKR) *</label>
              <input className="bk-input" type="number" value={totalPrice || ""} onChange={e => setTotalPrice(Number(e.target.value))} placeholder="0" />
            </div>
            <div>
              <label className="bk-label">Advance / Booking Amount (PKR)</label>
              <input className="bk-input" type="number" value={advanceAmount || ""} onChange={e => setAdvanceAmount(Number(e.target.value))} placeholder="0" />
            </div>
          </div>

          <div className="bk-row">
            <div>
              <label className="bk-label">Number of Installments</label>
              <input className="bk-input" type="number" value={numberOfInstallments} onChange={e => setNumberOfInstallments(Number(e.target.value))} />
            </div>
            <div>
              <label className="bk-label">Booking Date</label>
              <input className="bk-input" type="date" value={bookingDate} onChange={e => setBookingDate(e.target.value)} />
            </div>
          </div>

          {advanceAmount > 0 && (
            <div className="bk-field">
              <label className="bk-label">Advance Received Into *</label>
              <select className="bk-select" value={bankAccountId ?? ""} onChange={e => setBankAccountId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Select Bank Account —</option>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>{b.bank_name} — {b.account_title} ({b.account_number})</option>
                ))}
              </select>
            </div>
          )}

          <div className="bk-row">
            <div>
              <label className="bk-label">Reference</label>
              <input className="bk-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Agreement / file #" />
            </div>
            <div>
              <label className="bk-label">Notes</label>
              <input className="bk-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          {totalPrice > 0 && numberOfInstallments > 0 && (
            <div className="bk-preview">
              <div className="bk-preview-row"><span style={{ color: "var(--text-muted)" }}>Balance after advance</span><span style={{ fontWeight: 600 }}>PKR {balanceAmount.toLocaleString()}</span></div>
              <div className="bk-preview-row"><span style={{ color: "var(--text-muted)" }}>Monthly installment (preview)</span><span style={{ fontWeight: 600 }}>PKR {previewInstallment.toLocaleString()}</span></div>
            </div>
          )}
        </div>

        <button className="bk-btn bk-btn-primary" onClick={handleSubmit} disabled={!canSubmit || saving}>
          {saving ? "Creating Booking…" : "Create Booking"}
        </button>
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
      <NewBookingPageContent />
    </Suspense>
  )
}