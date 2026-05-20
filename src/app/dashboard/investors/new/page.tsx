"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Plus, CheckCircle } from "lucide-react"

export default function NewInvestorPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyId, setCompanyId] = useState("")
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [investmentAmount, setInvestmentAmount] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<string | null>(null)

  // Summary state
  const [totalInvestors, setTotalInvestors] = useState(0)
  const [totalInvestment, setTotalInvestment] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        // Fetch summary
        supabase
          .from("investors")
          .select("id, investment_amount")
          .then(({ data }) => {
            if (data) {
              setTotalInvestors(data.length)
              setTotalInvestment(data.reduce((sum, i) => sum + (i.investment_amount || 0), 0))
            }
          })
        // Generate next code
        supabase
          .from("investors")
          .select("code")
          .order("code", { ascending: false })
          .limit(1)
          .then(({ data }) => {
            let nextNum = 1
            if (data && data.length > 0) {
              const match = data[0].code?.match(/INV-(\d+)/)
              if (match) nextNum = parseInt(match[1], 10) + 1
            }
            setCode(`INV-${String(nextNum).padStart(3, "0")}`)
          })
      }
    })
  }, [])

  const handleSubmit = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    if (!name.trim()) { setError("Investor name is required"); return }

    setLoading(true)
    setError("")

    const payload = {
      company_id: companyId,
      code: code.trim(),
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      investment_amount: parseFloat(investmentAmount) || 0,
      notes: notes.trim() || null,
    }

    const { data, error: insertErr } = await supabase
      .from("investors")
      .insert(payload)
      .select("id, code, name")
      .single()

    if (insertErr) {
      if (insertErr.message?.includes("duplicate key")) {
        setError("Code already exists. Please refresh to regenerate.")
      } else {
        setError(insertErr.message)
      }
      setLoading(false)
      return
    }

    setFlash(`✅ Investor ${data.code} – ${data.name} created!`)
    setName(""); setPhone(""); setEmail(""); setInvestmentAmount(""); setNotes("")
    setTotalInvestors(prev => prev + 1)
    setTotalInvestment(prev => prev + (payload.investment_amount || 0))
    setLoading(false)
    setTimeout(() => router.push("/dashboard/investors"), 1500)
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
        .btn-outline { background: transparent; color: var(--text-muted); border-color: var(--border); }
        .btn-outline:hover { background: var(--card-hover); }
        .btn-primary {
          background: var(--primary); color: var(--primary-text); border-color: var(--primary);
          box-shadow: 0 4px 12px rgba(37,99,235,0.3);
        }
        .btn-primary:hover { background: var(--primary-hover); }
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
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button className="btn btn-outline" onClick={() => router.push("/dashboard/investors")}><ArrowLeft size={16} /></button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>➕ New Investor</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Add an investor to your system</p>
          </div>
        </div>

        {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
        {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

        <div className="layout">
          <div className="form-side">
            <div className="form-card">
              <div style={{ marginBottom: 16 }}>
                <label className="label">Investor Code</label>
                <input className="input" value={code} disabled />
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Auto‑generated, unique per company</div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="label">Investor Name *</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. John Doe" />
              </div>

              <div className="inline-group" style={{ marginBottom: 16 }}>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+92 300 1234567" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="investor@example.com" />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="label">Investment Amount (PKR)</label>
                <input className="input" type="number" value={investmentAmount} onChange={e => setInvestmentAmount(e.target.value)} placeholder="0" />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="label">Notes</label>
                <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes" />
              </div>
            </div>
          </div>

          {/* Right side summary */}
          <div className="summary-side">
            <div className="summary-card">
              <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>📊 Investors Summary</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: "var(--bg-soft)", borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>Total Investors</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text)" }}>{totalInvestors}</div>
                </div>
                <div style={{ background: "var(--bg-soft)", borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>Total Investment</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#8B5CF6" }}>
                    PKR {totalInvestment.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Saving..." : <> <Plus size={16} /> Create Investor </>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}