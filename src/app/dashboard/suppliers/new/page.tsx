"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
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

const PAYMENT_TERMS = [
  "Due on Receipt",
  "Net 7",
  "Net 15",
  "Net 30",
  "Net 60",
]

export default function NewSupplierPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [supplierCode, setSupplierCode] = useState("")
  const [supplierName, setSupplierName] = useState("")
  const [countryCode, setCountryCode] = useState("+92")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [openingBalance, setOpeningBalance] = useState("0")
  const [paymentTerms, setPaymentTerms] = useState("Net 15")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  const [totalSuppliers, setTotalSuppliers] = useState(0)
  const [totalPayables, setTotalPayables] = useState(0)

  const [projects, setProjects] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [defaultProjectId, setDefaultProjectId] = useState<number | null>(null)
  const [defaultLocationId, setDefaultLocationId] = useState<number | null>(null)
  const [defaultActivityId, setDefaultActivityId] = useState<number | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)

      supabase
        .from("suppliers")
        .select("code")
        .eq("company_id", cid)
        .ilike("code", "SUP-%")
        .order("code", { ascending: false })
        .limit(1)
        .then(({ data }) => {
          let nextNum = 1
          if (data && data.length > 0) {
            const match = data[0].code?.match(/SUP-(\d+)/)
            if (match) nextNum = parseInt(match[1], 10) + 1
          }
          setSupplierCode(`SUP-${String(nextNum).padStart(3, "0")}`)
        })

      supabase
        .from("suppliers")
        .select("id, balance")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .then(({ data }) => {
          if (data) {
            setTotalSuppliers(data.length)
            setTotalPayables(data.reduce((sum, s) => sum + (s.balance || 0), 0))
          }
        })

      supabase.from("projects").select("id, name").eq("company_id", cid).is("deleted_at", null).order("name")
        .then(r => r.data && setProjects(r.data))
      supabase.from("locations").select("id, name").eq("company_id", cid).is("deleted_at", null).order("name")
        .then(r => r.data && setLocations(r.data))
      supabase.from("activities").select("id, name").eq("company_id", cid).is("deleted_at", null).order("name")
        .then(r => r.data && setActivities(r.data))
    }
    init()
  }, [])

  const handleSubmit = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    if (!supplierName.trim()) { setError("Supplier name is required"); return }

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

    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = user?.email || "system"

    const balance = parseFloat(openingBalance || "0")
    const fullPhone = countryCode + (phoneNumber.trim().replace(/\D/g, ""))

    const payload = {
      company_id: companyId,
      code: supplierCode,
      name: supplierName.trim(),
      phone: fullPhone || null,
      email: email.trim() || null,
      address: address.trim() || null,
      opening_balance: isNaN(balance) ? 0 : balance,
      balance: isNaN(balance) ? 0 : balance,
      payment_terms: paymentTerms,
      default_project_id: defaultProjectId,
      default_location_id: defaultLocationId,
      default_activity_id: defaultActivityId,
      created_by: userEmail,
      updated_by: userEmail,
    }

    const { data, error: insertErr } = await supabase
      .from("suppliers")
      .insert(payload)
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

    setFlash(`✅ Supplier ${data.code} – ${data.name} created!`)
    setSupplierName("")
    setPhoneNumber("")
    setEmail("")
    setAddress("")
    setOpeningBalance("0")
    setPaymentTerms("Net 15")
    setDefaultProjectId(null)
    setDefaultLocationId(null)
    setDefaultActivityId(null)
    setLoading(false)
    setTotalSuppliers(prev => prev + 1)
    setTotalPayables(prev => prev + balance)
    setTimeout(() => router.push("/dashboard/suppliers"), 1500)
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
        <button className="btn btn-back" onClick={() => router.push("/dashboard/suppliers")}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>➕ New Supplier</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Add a supplier to your system</p>
        </div>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <div className="header-grid">
          {/* Left: Form fields */}
          <div className="card">
            <div style={{ marginBottom: 16 }}>
              <label className="label">Supplier Code</label>
              <input className="input" value={supplierCode} disabled />
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>System‑generated, unique per company</div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Supplier Name *</label>
              <input className="input" value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="e.g. Tech Distributors" />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Phone</label>
              <div className="phone-row">
                <select className="select" value={countryCode} onChange={e => setCountryCode(e.target.value)}>
                  {COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
                <input className="input" type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="3001234567" />
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Combined for WhatsApp messaging</div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="supplier@example.com" />
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

            <div className="inline-group" style={{ marginBottom: 16 }}>
              <div>
                <label className="label">Default Project</label>
                <select className="select" value={defaultProjectId ?? ""} onChange={e => setDefaultProjectId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— None —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Default Location</label>
                <select className="select" value={defaultLocationId ?? ""} onChange={e => setDefaultLocationId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— None —</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="label">Default Activity</label>
              <select className="select" value={defaultActivityId ?? ""} onChange={e => setDefaultActivityId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— None —</option>
                {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            {/* Submit button at bottom of form, identical style to customer/product pages */}
            <button className="btn btn-submit" type="submit" disabled={loading} style={{ marginTop: 16 }}>
              {loading ? "Saving..." : <><Plus size={16} /> Create Supplier</>}
            </button>
          </div>

          {/* Right: Summary – jumps above on mobile */}
          <div className="summary-side" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="card">
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>Summary</h3>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                <span>Total Suppliers</span>
                <span>{totalSuppliers}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
                <span>Total Payables</span>
                <span style={{ color: totalPayables >= 0 ? "#10B981" : "#EF4444" }}>PKR {totalPayables.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}