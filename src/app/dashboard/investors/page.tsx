"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Search, Edit, Trash2, X } from "lucide-react"
import PremiumGuard from "@/components/PremiumGuard"

interface Investor {
  id: number
  code: string
  name: string
  phone: string | null
  email: string | null
  investment_amount: number
  notes: string | null
}

function InvestorsContent() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [investors, setInvestors] = useState<Investor[]>([])
  const [filtered, setFiltered] = useState<Investor[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Investor | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [flash, setFlash] = useState("")
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [investmentAmount, setInvestmentAmount] = useState(0)
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const fetchInvestors = async () => {
    setLoading(true)
    const { data } = await supabase.from("investors").select("*").order("code")
    if (data) { setInvestors(data); setFiltered(data) }
    setLoading(false)
  }

  useEffect(() => { fetchInvestors() }, [])

  useEffect(() => {
    if (!search.trim()) { setFiltered(investors); return }
    const s = search.toLowerCase()
    setFiltered(investors.filter(i => i.code.toLowerCase().includes(s) || i.name.toLowerCase().includes(s)))
  }, [search, investors])

  const generateCode = () => {
    const max = investors.reduce((m, i) => { const n = parseInt(i.code?.split("-")[1]) || 0; return n > m ? n : m }, 0)
    return `INV-${String(max + 1).padStart(3, "0")}`
  }

  const openNew = () => {
    setEditing(null)
    setCode(generateCode()); setName(""); setPhone(""); setEmail(""); setInvestmentAmount(0); setNotes("")
    setShowModal(true)
  }

  const openEdit = (inv: Investor) => {
    setEditing(inv)
    setCode(inv.code); setName(inv.name); setPhone(inv.phone || ""); setEmail(inv.email || "")
    setInvestmentAmount(inv.investment_amount); setNotes(inv.notes || "")
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!code.trim() || !name.trim()) return
    setSaving(true)
    const payload = {
      code: code.trim(), name: name.trim(), phone: phone.trim() || null,
      email: email.trim() || null, investment_amount: investmentAmount,
      notes: notes.trim() || null
    }
    if (editing) {
      await supabase.from("investors").update(payload).eq("id", editing.id)
      setFlash(`Investor '${name}' updated!`)
    } else {
      await supabase.from("investors").insert(payload)
      setFlash(`Investor '${name}' added!`)
    }
    setSaving(false); setShowModal(false); fetchInvestors()
    setTimeout(() => setFlash(""), 3000)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from("investors").delete().eq("id", deleteId)
    setDeleteId(null); setFlash("Investor deleted."); fetchInvestors()
    setTimeout(() => setFlash(""), 3000)
  }

  const totalInvestment = filtered.reduce((s, i) => s + (i.investment_amount || 0), 0)

  return (
    <div style={{ padding: "clamp(16px,2.5vw,24px)", background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .inv-shell { max-width: 1200px; }
        .inv-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
        .inv-title { font-size: 22px; font-weight: 800; color: #1E293B; }
        .inv-subtitle { font-size: 13px; color: #94A3B8; }
        .inv-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
        .inv-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
        .inv-btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .inv-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 20px; }
        .inv-stat { background: white; border-radius: 10px; border: 1px solid #E2E8F0; padding: 14px; }
        .inv-stat-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94A3B8; margin-bottom: 4px; }
        .inv-stat-value { font-size: 20px; font-weight: 800; }
        .inv-table { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
        .inv-table-header { display: grid; grid-template-columns: 80px 1fr 100px 100px 100px 60px 60px; padding: 10px 14px; background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; }
        .inv-table-row { display: grid; grid-template-columns: 80px 1fr 100px 100px 100px 60px 60px; padding: 10px 14px; border-bottom: 1px solid #F1F5F9; font-size: 12px; align-items: center; }
        .inv-table-row:hover { background: #FAFBFF; }
        .inv-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .inv-modal { background: white; border-radius: 14px; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; }
        .inv-modal-header { padding: 20px 24px; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; }
        .inv-modal-title { font-size: 18px; font-weight: 700; color: #1E293B; }
        .inv-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
        .inv-label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; }
        .inv-input { width: 100%; height: 40px; border: 1.5px solid #E5EAF2; border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; }
        .inv-input:focus { border-color: #1740C8; background: white; }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .inv-modal-footer { padding: 16px 24px; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 8px; }
        .inv-icon-btn { background: none; border: none; cursor: pointer; padding: 4px; border-radius: 6px; color: #94A3B8; }
        .inv-icon-btn:hover { background: #F1F5F9; color: #475569; }
        @media (max-width: 700px) {
          .inv-table-header, .inv-table-row { grid-template-columns: 80px 1fr 80px 50px 50px; }
          .inv-hide-mobile { display: none; }
          .inv-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="inv-shell">
        {flash && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{flash}</div>}

        <div className="inv-header">
          <div>
            <div className="inv-title">💼 Investors</div>
            <div className="inv-subtitle">Manage investor capital and details</div>
          </div>
          <button className="inv-btn inv-btn-primary" onClick={openNew}><Plus size={16} /> Add Investor</button>
        </div>

        <div className="inv-stats">
          <div className="inv-stat"><div className="inv-stat-label">Total Investors</div><div className="inv-stat-value" style={{ color: "#1E3A8A" }}>{filtered.length}</div></div>
          <div className="inv-stat"><div className="inv-stat-label">Total Investment</div><div className="inv-stat-value" style={{ color: "#8B5CF6" }}>PKR {totalInvestment.toLocaleString()}</div></div>
        </div>

        <div style={{ position: "relative", marginBottom: 16 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: 13, color: "#94A3B8" }} />
          <input placeholder="Search by code or name..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", maxWidth: 320, height: 40, border: "1.5px solid #E2E8F0", borderRadius: 9, padding: "0 14px 0 36px", fontSize: 13, outline: "none" }} />
        </div>

        {loading ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div> :
          filtered.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8", background: "white", borderRadius: 10 }}>No investors found. Add your first investor above.</div> :
          <div className="inv-table">
            <div className="inv-table-header">
              <span>Code</span><span>Name</span><span className="inv-hide-mobile">Phone</span><span className="inv-hide-mobile">Email</span><span>Investment</span><span></span><span></span>
            </div>
            {filtered.map(inv => (
              <div key={inv.id} className="inv-table-row">
                <span style={{ fontWeight: 700, color: "#1E3A8A", fontSize: 11 }}>{inv.code}</span>
                <span style={{ fontWeight: 600 }}>{inv.name}</span>
                <span className="inv-hide-mobile" style={{ color: "#64748B" }}>{inv.phone || "-"}</span>
                <span className="inv-hide-mobile" style={{ color: "#64748B" }}>{inv.email || "-"}</span>
                <span style={{ fontWeight: 600, color: "#8B5CF6" }}>PKR {(inv.investment_amount || 0).toLocaleString()}</span>
                <button className="inv-icon-btn" onClick={() => openEdit(inv)}><Edit size={13} /></button>
                <button className="inv-icon-btn" onClick={() => setDeleteId(inv.id)} style={{ color: "#EF4444" }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        }
      </div>

      {showModal && (
        <div className="inv-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="inv-modal" onClick={e => e.stopPropagation()}>
            <div className="inv-modal-header">
              <div className="inv-modal-title">{editing ? "✏️ Edit Investor" : "➕ Add Investor"}</div>
              <button className="inv-icon-btn" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="inv-modal-body">
              <div className="inv-row">
                <div><label className="inv-label">Code *</label><input className="inv-input" value={code} onChange={e => setCode(e.target.value)} /></div>
                <div><label className="inv-label">Name *</label><input className="inv-input" value={name} onChange={e => setName(e.target.value)} /></div>
              </div>
              <div className="inv-row">
                <div><label className="inv-label">Phone</label><input className="inv-input" value={phone} onChange={e => setPhone(e.target.value)} /></div>
                <div><label className="inv-label">Email</label><input className="inv-input" value={email} onChange={e => setEmail(e.target.value)} /></div>
              </div>
              <div><label className="inv-label">Investment Amount (PKR)</label><input className="inv-input" type="number" value={investmentAmount} onChange={e => setInvestmentAmount(Number(e.target.value))} /></div>
              <div><label className="inv-label">Notes</label><input className="inv-input" value={notes} onChange={e => setNotes(e.target.value)} /></div>
            </div>
            <div className="inv-modal-footer">
              <button className="inv-btn inv-btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="inv-btn inv-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "💾 Save Investor"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="inv-modal-overlay">
          <div className="inv-modal" style={{ maxWidth: 400 }}>
            <div className="inv-modal-header"><div className="inv-modal-title">⚠️ Delete Investor?</div></div>
            <div className="inv-modal-body" style={{ textAlign: "center" }}><p style={{ color: "#EF4444" }}>Cannot be undone.</p></div>
            <div className="inv-modal-footer" style={{ justifyContent: "center" }}>
              <button className="inv-btn inv-btn-outline" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="inv-btn inv-btn-primary" style={{ background: "#EF4444" }} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function InvestorsPage() {
  return (
    <PremiumGuard
      featureCode="investors"
      featureName="Investors"
      featureDesc="Track investor capital and details."
    >
      <InvestorsContent />
    </PremiumGuard>
  )
}