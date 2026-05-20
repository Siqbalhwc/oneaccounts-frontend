"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Search, Edit, Trash2, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
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

type SortField = "code" | "name" | "investment_amount"
type SortDir = "asc" | "desc"

function InvestorsContent() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const router = useRouter()
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

  // Sorting
  const [sortField, setSortField] = useState<SortField>("code")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const fetchInvestors = async () => {
    setLoading(true)
    const { data } = await supabase.from("investors").select("*").order("code")
    if (data) { setInvestors(data); setFiltered(data) }
    setLoading(false)
  }

  useEffect(() => { fetchInvestors() }, [])

  useEffect(() => {
    if (!search.trim()) {
      let sorted = [...investors]
      sorted.sort((a, b) => {
        let valA: any, valB: any
        if (sortField === "investment_amount") {
          valA = a.investment_amount || 0
          valB = b.investment_amount || 0
        } else {
          valA = (a[sortField] || "").toString().toLowerCase()
          valB = (b[sortField] || "").toString().toLowerCase()
        }
        if (valA < valB) return sortDir === "asc" ? -1 : 1
        if (valA > valB) return sortDir === "asc" ? 1 : -1
        return 0
      })
      setFiltered(sorted)
      return
    }
    const s = search.toLowerCase()
    let result = investors.filter(i => i.code.toLowerCase().includes(s) || i.name.toLowerCase().includes(s))
    result.sort((a, b) => {
      let valA: any, valB: any
      if (sortField === "investment_amount") {
        valA = a.investment_amount || 0
        valB = b.investment_amount || 0
      } else {
        valA = (a[sortField] || "").toString().toLowerCase()
        valB = (b[sortField] || "").toString().toLowerCase()
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1
      if (valA > valB) return sortDir === "asc" ? 1 : -1
      return 0
    })
    setFiltered(result)
  }, [search, investors, sortField, sortDir])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
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
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 0; box-shadow: var(--shadow-sm); overflow: hidden; }
        .header-row {
          display: grid;
          grid-template-columns: 90px 1fr 120px 120px 120px 55px 55px;
          padding: 14px 24px;
          font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
          border-bottom: 1px solid var(--border);
          background: var(--card);
        }
        .data-row {
          display: grid;
          grid-template-columns: 90px 1fr 120px 120px 120px 55px 55px;
          padding: 12px 24px;
          border-bottom: 1px solid var(--border);
          font-size: 13px; align-items: center;
          transition: background 0.15s;
        }
        .data-row:hover { background: var(--card-hover); }
        .data-row:last-child { border-bottom: none; }
        .sort-btn {
          background: none; border: none; cursor: pointer; font: inherit; color: var(--text-muted);
          display: inline-flex; align-items: center; gap: 4px; padding: 0;
          font-weight: 700; text-transform: uppercase; font-size: 10px;
        }
        .sort-btn:hover { color: var(--primary); }
        .btn {
          padding: 8px 16px; border-radius: 8px; border: 1.5px solid var(--border);
          font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: transparent; color: var(--text-muted);
        }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn:hover { background: var(--card-hover); }
        .btn-icon {
          background: transparent; border: 1.5px solid var(--border); color: var(--text-muted);
          padding: 6px; border-radius: 8px; cursor: pointer;
        }
        .btn-icon:hover { background: var(--card-hover); }
        .search-input {
          height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 12px 0 36px; font-size: 13px; width: 260px; box-sizing: border-box;
          outline: none; font-family: inherit; background: var(--card); color: var(--text);
        }
        .search-input:focus { border-color: var(--primary); }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
        /* modal */
        .inv-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .inv-modal { background: var(--card); border: 1px solid var(--border); border-radius: 14px; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; color: var(--text); }
        .inv-modal-header { padding: 20px 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .inv-modal-title { font-size: 18px; font-weight: 700; color: var(--text); }
        .inv-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
        .inv-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .inv-input { width: 100%; height: 40px; border: 1.5px solid var(--border); border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--text); outline: none; }
        .inv-input:focus { border-color: var(--primary); }
        .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .inv-modal-footer { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }
        @media (max-width: 700px) {
          .header-row, .data-row { grid-template-columns: 70px 1fr 80px 60px 60px; }
          .header-row > :nth-child(3), .data-row > :nth-child(3) { display: none; }
        }
      `}</style>

      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{flash}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>💼 Investors</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Manage investor capital and details</p>
        </div>
        <button className="btn btn-primary" onClick={() => router.push("/dashboard/investors/new")}><Plus size={16} /> Add Investor</button>
      </div>

      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">Total Investors</div>
          <div className="summary-value">{filtered.length}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Total Investment</div>
          <div className="summary-value" style={{ color: "#8B5CF6" }}>PKR {totalInvestment.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="search-input" placeholder="Search by code or name..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading...</div> :
        filtered.length === 0 ? <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>No investors found. Add your first investor above.</div> :
        <div className="card">
          <div className="header-row">
            <button className="sort-btn" onClick={() => handleSort("code")}>Code {getSortIcon("code")}</button>
            <button className="sort-btn" onClick={() => handleSort("name")}>Name {getSortIcon("name")}</button>
            <span>Phone</span>
            <span>Email</span>
            <button className="sort-btn" onClick={() => handleSort("investment_amount")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Investment {getSortIcon("investment_amount")}</button>
            <span></span>
            <span></span>
          </div>
          {filtered.map(inv => (
            <div key={inv.id} className="data-row">
              <span style={{ fontWeight: 700, color: "var(--primary)", fontSize: 11 }}>{inv.code}</span>
              <span style={{ fontWeight: 600 }}>{inv.name}</span>
              <span style={{ color: "var(--text-muted)" }}>{inv.phone || "-"}</span>
              <span style={{ color: "var(--text-muted)" }}>{inv.email || "-"}</span>
              <span style={{ textAlign: "right", fontWeight: 600, color: "#8B5CF6" }}>PKR {(inv.investment_amount || 0).toLocaleString()}</span>
              <button className="btn-icon" onClick={() => openEdit(inv)}><Edit size={13} /></button>
              <button className="btn-icon" onClick={() => setDeleteId(inv.id)} style={{ color: "#EF4444" }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      }

      {/* Edit Modal */}
      {showModal && (
        <div className="inv-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="inv-modal" onClick={e => e.stopPropagation()}>
            <div className="inv-modal-header">
              <div className="inv-modal-title">✏️ Edit Investor</div>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
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
              <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "💾 Save Investor"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="inv-modal-overlay">
          <div className="inv-modal" style={{ maxWidth: 400 }}>
            <div className="inv-modal-header"><div className="inv-modal-title">⚠️ Delete Investor?</div></div>
            <div className="inv-modal-body" style={{ textAlign: "center" }}><p style={{ color: "#EF4444" }}>Cannot be undone.</p></div>
            <div className="inv-modal-footer" style={{ justifyContent: "center" }}>
              <button className="btn" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: "#EF4444", borderColor: "#EF4444" }} onClick={handleDelete}>Delete</button>
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