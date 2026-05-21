"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, CheckCircle } from "lucide-react"

// Country codes for WhatsApp
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

// ── Digits required per country code ──
const PHONE_LENGTHS: Record<string, number> = {
  "+92": 10,   // Pakistan
  "+1":  10,   // USA
  "+44": 10,   // UK
  "+971": 9,   // UAE
  "+966": 9,   // Saudi
  "+91": 10,   // India
  "+86": 11,   // China
  "+81": 10,   // Japan
  "+49": 10,   // Germany
  "+33": 9,    // France
  "+61": 9,    // Australia
  "+27": 9,    // South Africa
}

const PAYMENT_TERMS = [
  "Due on Receipt",
  "Net 7",
  "Net 15",
  "Net 30",
  "Net 60",
]

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

  // Summary state
  const [totalCustomers, setTotalCustomers] = useState(0)
  const [totalReceivables, setTotalReceivables] = useState(0)

  // Load company, generate code, fetch summary, and if editing → load existing data
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)

      // Summary
      supabase
        .from("customers")
        .select("id, balance")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .then(({ data }) => {
          if (data) {
            setTotalCustomers(data.length)
            setTotalReceivables(data.reduce((sum, c) => sum + (c.balance || 0), 0))
          }
        })

      if (editId) {
        // Editing existing customer
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
        // New customer → generate next code
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
              if (match) nextNum = parseInt(match[1], 10) + 1
            }
            setCustomerCode(`CUST-${String(nextNum).padStart(3, "0")}`)
          })
      }
    }

    init()
  }, [editId])

  const handleSubmit = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    if (!customerName.trim()) { setError("Customer name is required"); return }

    // ── Validate phone number length for the selected country ──
    if (phoneNumber.trim()) {
      const digitsOnly = phoneNumber.trim().replace(/\D/g, "")
      const expectedLength = PHONE_LENGTHS[countryCode]
      if (expectedLength && digitsOnly.length !== expectedLength) {
        setError(`Phone number must be ${expectedLength} digits for ${countryCode}. Current: ${digitsOnly.length} digits.`)
        setLoading(false)
        return
      }
    }

    setLoading(true)
    setError("")

    // Get current user email for audit
    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = user?.email || "system"

    const balance = parseFloat(openingBalance || "0")
    const fullPhone = countryCode + (phoneNumber.trim().replace(/\D/g, ""))

    if (editId) {
      // ── UPDATE existing customer ──
      const { error: updateErr } = await supabase
        .from("customers")
        .update({
          name: customerName.trim(),
          phone: fullPhone || null,
          email: email.trim() || null,
          address: address.trim() || null,
          opening_balance: isNaN(balance) ? 0 : balance,
          payment_terms: paymentTerms,
          updated_by: userEmail,
        })
        .eq("id", editId)
        .eq("company_id", companyId)

      if (updateErr) {
        setError(updateErr.message)
        setLoading(false)
        return
      }
      setFlash(`✅ Customer ${customerCode} updated!`)
      setLoading(false)
      setTimeout(() => router.push("/dashboard/customers"), 1500)
      return
    }

    // ── INSERT new customer ──
    const { data, error: insertErr } = await supabase
      .from("customers")
      .insert({
        company_id: companyId,
        code: customerCode,
        name: customerName.trim(),
        phone: fullPhone || null,
        email: email.trim() || null,
        address: address.trim() || null,
        balance: isNaN(balance) ? 0 : balance,
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

    // ── Post opening balance journal entry (if amount > 0) ──
    if (balance > 0 && data) {
      try {
        await fetch("/api/customers/opening-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: data.id,
            amount: balance,
            date: new Date().toISOString().split("T")[0],
          }),
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
        .form-card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 24px; margin-bottom: 16px;
        }
        .summary-card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 20px;
        }
        .label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; display: block; }
        .input, .select {
          width: 100%; height: 40px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px; font-size: 13px; box-sizing: border-box;
          font-family: inherit; background: var(--bg); color: var(--text);
        }
        .input:focus, .select:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .input:disabled { opacity: 0.7; cursor: not-allowed; }
        .btn {
          padding: 10px 20px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600;
          font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
        }
        .btn-outline { background: transparent; color: var(--text); border-color: var(--border); }
        .btn-outline:hover { background: var(--card-hover); }
        .btn-back { background: transparent; border: 1.5px solid var(--border); color: var(--text-muted); }
        .btn-back:hover { background: var(--card-hover); }
        .phone-row { display: grid; grid-template-columns: 130px 1fr; gap: 8px; }
        .inline-group { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        .layout {
          display: flex;
          gap: 24px;
          align-items: flex-start;
        }
        .form-side { flex: 1; min-width: 0; }
        .summary-side { width: 260px; flex-shrink: 0; }

        @media (max-width: 860px) {
          .layout { flex-direction: column; }
          .summary-side { width: 100%; }
          .phone-row { grid-template-columns: 110px 1fr; }
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="btn btn-back" onClick={() => router.push("/dashboard/customers")}><ArrowLeft size={16} /></button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>
              {editId ? "✏️ Edit Customer" : "➕ New Customer"}
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              {editId ? "Modify customer details" : "Add a customer to your system"}
            </p>
          </div>
        </div>

        {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
        {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

        <div className="layout">
          <div className="form-side">
            <div className="form-card">
              {/* Customer Code – system generated, read‑only */}
              <div style={{ marginBottom: 16 }}>
                <label className="label">Customer Code</label>
                <input className="input" value={customerCode} disabled />
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>System‑generated, unique per company</div>
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
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Combined for WhatsApp messaging</div>
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
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Used for invoice reminders</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right side summary */}
          <div className="summary-side">
            <div className="summary-card">
              <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>📊 Customers Summary</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: "var(--bg-soft)", borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>Total Customers</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text)" }}>{totalCustomers}</div>
                </div>
                <div style={{ background: "var(--bg-soft)", borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>Total Receivables</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: totalReceivables >= 0 ? "#10B981" : "#EF4444" }}>
                    PKR {totalReceivables.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <button
              className="btn btn-outline"
              style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Saving..." : editId ? "💾 Update Customer" : <><Plus size={16} /> Create Customer</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}