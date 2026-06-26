"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, CheckCircle } from "lucide-react"

const COUNTRY_CODES = [
  { code: "+92", label: "🇵🇰 +92" },
  { code: "+1",  label: "🇺🇸 +1" },
  { code: "+44", label: "🇬🇧 +44" },
  { code: "+971",label: "🇦🇪 +971" },
  { code: "+966",label: "🇸🇦 +966" },
  { code: "+91", label: "🇮🇳 +91" },
  { code: "+86", label: "🇨🇳 +86" },
  { code: "+81", label: "🇯🇵 +81" },
  { code: "+49", label: "🇩🇪 +49" },
  { code: "+33", label: "🇫🇷 +33" },
  { code: "+61", label: "🇦🇺 +61" },
  { code: "+27", label: "🇿🇦 +27" },
]

const PHONE_LENGTHS: Record<string, number> = {
  "+92": 10, "+1": 10, "+44": 10, "+971": 9,
  "+966": 9, "+91": 10, "+86": 11, "+81": 10,
  "+49": 10, "+33": 9, "+61": 9, "+27": 9,
}

const PAYMENT_TERMS = ["Due on Receipt", "Net 7", "Net 15", "Net 30", "Net 60"]

export default function NewCustomerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("id")

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerCode, setCustomerCode] = useState("")
  const [countryCode, setCountryCode] = useState("+92")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [openingBalance, setOpeningBalance] = useState("0")
  const [paymentTerms, setPaymentTerms] = useState("Net 15")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  const [totalCustomers, setTotalCustomers] = useState(0)
  const [totalReceivables, setTotalReceivables] = useState(0)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)

      const { data: summary } = await supabase
        .from("customers")
        .select("balance")
        .eq("company_id", cid)
        .is("deleted_at", null)

      if (summary) {
        setTotalCustomers(summary.length)
        setTotalReceivables(summary.reduce((s, c) => s + (c.balance || 0), 0))
      }

      if (editId) {
        const { data: customer } = await supabase
          .from("customers")
          .select("*")
          .eq("id", editId)
          .eq("company_id", cid)
          .single()

        if (customer) {
          setCustomerCode(customer.code)
          setCustomerName(customer.name)
          const fullPhone = customer.phone || ""
          const match = fullPhone.match(/^(\+\d{1,3})(.*)$/)
          if (match) {
            setCountryCode(match[1])
            setPhoneNumber(match[2].trim())
          } else {
            setPhoneNumber(fullPhone)
          }
          setEmail(customer.email || "")
          setAddress(customer.address || "")
          setOpeningBalance(String(customer.opening_balance || 0))
          setPaymentTerms(customer.payment_terms || "Net 15")
        }
      } else {
        const { data: codes } = await supabase
          .from("customers")
          .select("code")
          .eq("company_id", cid)
          .ilike("code", "CUST-%")
          .order("code", { ascending: false })
          .limit(1)

        let nextNum = 1
        if (codes && codes.length > 0) {
          const match = codes[0].code?.match(/CUST-(\d+)/)
          if (match) nextNum = parseInt(match[1], 10) + 1
        }
        setCustomerCode(`CUST-${String(nextNum).padStart(3, "0")}`)
      }
    }

    init()
  }, [editId])

  const handleSubmit = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    if (!customerName.trim()) { setError("Customer name is required"); return }

    if (phoneNumber.trim()) {
      const digitsOnly = phoneNumber.trim().replace(/\D/g, "")
      const expectedLength = PHONE_LENGTHS[countryCode]
      if (expectedLength && digitsOnly.length !== expectedLength) {
        setError(`Phone number must be ${expectedLength} digits for ${countryCode}. Current: ${digitsOnly.length} digits.`)
        return
      }
    }

    setLoading(true)
    setError("")

    const fullPhone = countryCode + (phoneNumber.trim().replace(/\D/g, ""))
    const balance = parseFloat(openingBalance || "0")

    // ---- EDIT MODE: use our PUT API ----
    if (editId) {
      try {
        const response = await fetch("/api/customers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editId,
            code: customerCode,
            name: customerName.trim(),
            phone: fullPhone || null,
            email: email.trim() || null,
            address: address.trim() || null,
            country_code: countryCode,
            payment_terms: paymentTerms,
            opening_balance: balance,
          }),
        })

        const data = await response.json()
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Update failed")
        }

        setFlash(`✅ Customer ${customerCode} updated!`)
        setTimeout(() => router.push("/dashboard/customers"), 1500)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
      return
    }

    // ---- NEW CUSTOMER MODE: direct insert + opening-entry API ----
    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = user?.email || "system"

    const { data, error: insertErr } = await supabase
      .from("customers")
      .insert({
        company_id: companyId,
        code: customerCode,
        name: customerName.trim(),
        phone: fullPhone || null,
        email: email.trim() || null,
        address: address.trim() || null,
        balance: balance,
        opening_balance: balance,
        payment_terms: paymentTerms,
        created_by: userEmail,
        updated_by: userEmail,
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

    if (balance > 0 && data) {
      try {
        await fetch("/api/customers/opening-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId: data.id, amount: balance, date: new Date().toISOString().split("T")[0] }),
        })
      } catch (err) {
        console.error("Opening entry failed:", err)
      }
    }

    setFlash(`✅ Customer ${data.code} – ${data.name} created!`)
    setCustomerName("")
    setPhoneNumber("")
    setEmail("")
    setAddress("")
    setOpeningBalance("0")
    setPaymentTerms("Net 15")
    setLoading(false)
    setTotalCustomers(prev => prev + 1)
    setTotalReceivables(prev => prev + balance)
    setTimeout(() => router.push("/dashboard/customers"), 1500)
  }

  if (!companyId) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading company data…</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm);
        }
        .label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block; }
        .input, .select {
          width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; box-sizing: border-box;
          font-family: inherit; background: var(--bg); color: var(--text); outline: none;
        }
        .input:focus, .select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .input:disabled { opacity: 0.7; cursor: not-allowed; }
        .btn {
          padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600;
          font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: transparent; color: var(--text-muted); transition: 0.2s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-back { padding: 6px 12px; }
        .btn-submit { width: 100%; justify-content: center; }
        .inline-group { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .phone-row { display: grid; grid-template-columns: 130px 1fr; gap: 8px; }

        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }

        /* Mobile: summary above form */
        @media (max-width: 900px) {
          .header-grid { grid-template-columns: 1fr; }
          .summary-side { order: -1; }
        }
        @media (max-width: 600px) {
          .inline-group { grid-template-columns: 1fr; }
          .phone-row { grid-template-columns: 110px 1fr; }
          .page-wrap { padding: 12px !important; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn btn-back" onClick={() => router.push("/dashboard/customers")}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>
            {editId ? "✏️ Edit Customer" : "➕ New Customer"}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {editId ? "Modify customer details" : "Add a customer to your system"}
          </p>
        </div>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <div className="header-grid">
          {/* Left: Form fields (no button) */}
          <div className="card">
            <div style={{ marginBottom: 16 }}>
              <label className="label">Customer Code</label>
              <input className="input" value={customerCode} disabled />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Customer Name *</label>
              <input className="input" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. ABC Corporation" />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Phone</label>
              <div className="phone-row">
                <select className="select" value={countryCode} onChange={e => setCountryCode(e.target.value)}>
                  {COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
                <input className="input" type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="300 1234567" />
              </div>
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
              </div>
            </div>
          </div>

          {/* Right: Summary card and Save button card stacked */}
          <div className="summary-side" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="card">
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>Summary</h3>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                <span>Total Customers</span>
                <span>{totalCustomers}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
                <span>Total Receivables</span>
                <span style={{ color: totalReceivables >= 0 ? "#10B981" : "#EF4444" }}>PKR {totalReceivables.toLocaleString()}</span>
              </div>
            </div>
            <div className="card" style={{ padding: "16px" }}>
              <button className="btn btn-submit" type="submit" disabled={loading}>
                {loading ? "Saving..." : editId ? "💾 Update Customer" : <><Plus size={16} /> Create Customer</>}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}