"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, CheckCircle } from "lucide-react"

// Country codes for WhatsApp
const COUNTRY_CODES = [
  { code: "+92", label: "🇵🇰 +92 (Pakistan)" },
  { code: "+1",  label: "🇺🇸 +1 (USA)" },
  { code: "+44", label: "🇬🇧 +44 (UK)" },
  { code: "+971",label: "🇦🇪 +971 (UAE)" },
  { code: "+966",label: "🇸🇦 +966 (KSA)" },
  { code: "+91", label: "🇮🇳 +91 (India)" },
  { code: "+86", label: "🇨🇳 +86 (China)" },
  { code: "+81", label: "🇯🇵 +81 (Japan)" },
  { code: "+49", label: "🇩🇪 +49 (Germany)" },
  { code: "+33", label: "🇫🇷 +33 (France)" },
  { code: "+61", label: "🇦🇺 +61 (Australia)" },
  { code: "+27", label: "🇿🇦 +27 (South Africa)" },
]

const PAYMENT_TERMS = [
  "Due on Receipt",
  "Net 7",
  "Net 15",
  "Net 30",
  "Net 60",
]

export default function NewCustomerPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerCode, setCustomerCode] = useState("")      // system generated, display only
  const [countryCode, setCountryCode] = useState("+92")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [openingBalance, setOpeningBalance] = useState("0")
  const [paymentTerms, setPaymentTerms] = useState("Net 15")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  // Generate next customer code per company
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase
          .from("customers")
          .select("code")
          .eq("company_id", cid)
          .ilike("code", "CUST-%")
          .order("code", { ascending: false })
          .limit(1)
          .then(({ data }) => {
            let nextNum = 1
            if (data && data.length > 0) {
              const match = data[0].code?.match(/CUST-(\d+)/)
              if (match) {
                nextNum = parseInt(match[1], 10) + 1
              }
            }
            const code = `CUST-${String(nextNum).padStart(3, "0")}`
            setCustomerCode(code)
          })
      }
    })
  }, [])

  const handleSubmit = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    if (!customerName.trim()) { setError("Customer name is required"); return }

    setLoading(true)
    setError("")

    const balance = parseFloat(openingBalance || "0")
    // Combine country code and phone number for WhatsApp compatibility
    const fullPhone = countryCode + (phoneNumber.trim().replace(/\D/g, "")) // e.g. "+923001234567"

    const { data, error: insertErr } = await supabase
      .from("customers")
      .insert({
        company_id: companyId,
        code: customerCode,           // system generated, never duplicated per company
        name: customerName.trim(),
        phone: fullPhone || null,
        email: email.trim() || null,
        address: address.trim() || null,
        balance: isNaN(balance) ? 0 : balance,
        payment_terms: paymentTerms,
      })
      .select("id, code, name")
      .single()

    if (insertErr) {
      if (insertErr.message?.includes("duplicate key")) {
        setError("This code already exists. Please refresh to regenerate.")
      } else {
        setError(insertErr.message)
      }
      setLoading(false)
      return
    }

    setFlash(`✅ Customer ${data.code} – ${data.name} created!`)
    setCustomerName("")
    setPhoneNumber("")
    setEmail("")
    setAddress("")
    setOpeningBalance("0")
    setPaymentTerms("Net 15")
    setLoading(false)
    setTimeout(() => router.push("/dashboard/customers"), 1500)
  }

  if (!companyId) return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading company data…</div>

  return (
    <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .form-card {
          background: #111827; border: 1px solid #1E293B; border-radius: 12px;
          padding: 24px; margin-bottom: 16px; max-width: 560px;
          margin-left: auto; margin-right: auto;
        }
        .label { font-size: 11px; font-weight: 600; color: #94A3B8; text-transform: uppercase; margin-bottom: 4px; display: block; }
        .input, .select {
          width: 100%; height: 40px; border: 1.5px solid #334155; border-radius: 8px;
          padding: 0 12px; font-size: 13px; box-sizing: border-box;
          font-family: inherit; background: #1E293B; color: #F1F5F9;
        }
        .input:focus, .select:focus { border-color: #64748B; outline: none; }
        .input:disabled { opacity: 0.7; cursor: not-allowed; }
        .btn {
          padding: 10px 20px; border-radius: 8px; border: 1.5px solid #334155; font-weight: 600;
          font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
        }
        .btn-outline { background: transparent; color: white; border-color: #334155; }
        .btn-outline:hover { background: #1E293B; }
        .btn-back { background: transparent; border: 1.5px solid #334155; color: #CBD5E1; }
        .phone-row { display: grid; grid-template-columns: 130px 1fr; gap: 8px; }
        .inline-group { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      `}</style>

      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="btn btn-back" onClick={() => router.push("/dashboard/customers")}><ArrowLeft size={16} /></button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>➕ New Customer</h1>
            <p style={{ color: "#94A3B8", fontSize: 13 }}>Add a customer to your system</p>
          </div>
        </div>

        {error && <div style={{ background: "#1E293B", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
        {flash && <div style={{ background: "#064E3B", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

        <div className="form-card">
          {/* Customer Code – system generated, read‑only */}
          <div style={{ marginBottom: 16 }}>
            <label className="label">Customer Code</label>
            <input className="input" value={customerCode} disabled />
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>System‑generated, unique per company</div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="label">Customer Name *</label>
            <input className="input" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. ABC Corporation" />
          </div>

          {/* Phone with country code */}
          <div style={{ marginBottom: 16 }}>
            <label className="label">Phone</label>
            <div className="phone-row">
              <select className="select" value={countryCode} onChange={e => setCountryCode(e.target.value)}>
                {COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <input className="input" type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="300 1234567" />
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>Combined for WhatsApp messaging</div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="abc@example.com" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="label">Address</label>
            <input className="input" value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, City" />
          </div>

          <div className="inline-group" style={{ marginBottom: 16 }}>
            <div>
              <label className="label">Opening Balance</label>
              <input className="input" type="number" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label">Payment Terms</label>
              <select className="select" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}>
                {PAYMENT_TERMS.map(term => <option key={term} value={term}>{term}</option>)}
              </select>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>Used for invoice reminders</div>
            </div>
          </div>

          {/* Create button – outline style, aligned with theme */}
          <button className="btn btn-outline" style={{ width: "100%", justifyContent: "center" }} onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving..." : <> <Plus size={16} /> Create Customer </>}
          </button>
        </div>
      </div>
    </div>
  )
}