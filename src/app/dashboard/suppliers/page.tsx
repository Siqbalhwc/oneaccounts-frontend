"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Search, Edit, Trash2, X, Check } from "lucide-react"

interface Supplier {
  id: number
  code: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  balance: number
}

const styles = `
  .sp-shell { padding: clamp(16px, 2.5vw, 24px); background: #EFF4FB; min-height: 100%; font-family: 'Plus Jakarta Sans', sans-serif; }
  .sp-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
  .sp-title { font-size: clamp(18px, 1.8vw, 24px); font-weight: 800; color: #1E293B; }
  .sp-subtitle { font-size: 13px; color: #94A3B8; margin-top: 2px; }
  .sp-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
  .sp-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; box-shadow: 0 2px 8px rgba(7,19,82,0.25); }
  .sp-btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
  .sp-search { position: relative; max-width: 320px; }
  .sp-search input { width: 100%; height: 40px; border: 1.5px solid #E2E8F0; border-radius: 9px; padding: 0 14px 0 38px; font-size: 13px; font-family: inherit; background: white; outline: none; }
  .sp-search input:focus { border-color: #1740C8; }
  .sp-search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94A3B8; }
  .sp-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 20px; }
  .sp-stat-card { background: white; border-radius: 10px; border: 1px solid #E2E8F0; padding: 14px 16px; }
  .sp-stat-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94A3B8; margin-bottom: 4px; }
  .sp-stat-value { font-size: 22px; font-weight: 800; color: #EF4444; }
  .sp-table-wrap { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
  .sp-table-header { display: grid; grid-template-columns: 100px 1fr 130px 1fr 100px 60px 60px; padding: 10px 16px; background: #F8FAFC; border-bottom: 2px solid #E2E8F0; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94A3B8; align-items: center; }
  .sp-table-row { display: grid; grid-template-columns: 100px 1fr 130px 1fr 100px 60px 60px; padding: 10px 16px; border-bottom: 1px solid #F1F5F9; align-items: center; font-size: 13px; }
  .sp-table-row:hover { background: #FAFBFF; }
  .sp-code { font-weight: 700; color: #1E3A8A; font-size: 12px; }
  .sp-name { font-weight: 600; color: #1E293B; }
  .sp-balance { font-weight: 700; color: #EF4444; text-align: right; }
  .sp-icon-btn { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 6px; color: #94A3B8; transition: all 0.15s; display: inline-flex; }
  .sp-icon-btn:hover { background: #F1F5F9; color: #475569; }
  .sp-icon-btn.danger:hover { background: #FEE2E2; color: #EF4444; }
  .sp-empty { padding: 40px; text-align: center; color: #94A3B8; }
  .sp-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .sp-modal { background: white; border-radius: 14px; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; }
  .sp-modal-header { padding: 20px 24px; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; }
  .sp-modal-title { font-size: 18px; font-weight: 700; color: #1E293B; }
  .sp-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
  .sp-field-label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; }
  .sp-field-input { width: 100%; height: 40px; border: 1.5px solid #E5EAF2; border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; }
  .sp-field-input:focus { border-color: #1740C8; background: white; }
  .sp-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .sp-modal-footer { padding: 16px 24px; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 8px; }
  @media (max-width: 768px) {
    .sp-table-header, .sp-table-row { grid-template-columns: 80px 1fr 100px 60px 60px; }
    .sp-hide-mobile { display: none; }
    .sp-field-row { grid-template-columns: 1fr; }
  }
`

export default function SuppliersPage() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [filtered, setFiltered] = useState<Supplier[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [flash, setFlash] = useState<{type: string, msg: string} | null>(null)
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [openingBalance, setOpeningBalance] = useState(0)
  const [saving, setSaving] = useState(false)

  const fetchSuppliers = async () => {
    setLoading(true)
    const { data } = await supabase.from("suppliers").select("*").order("code")
    if (data) { setSuppliers(data); setFiltered(data) }
    setLoading(false)
  }

  useEffect(() => { fetchSuppliers() }, [])

  useEffect(() => {
    if (!search.trim()) { setFiltered(suppliers); return }
    const s = search.toLowerCase()
    setFiltered(suppliers.filter(c => c.code.toLowerCase().includes(s) || c.name.toLowerCase().includes(s) || (c.phone && c.phone.includes(s))))
  }, [search, suppliers])

  const generateCode = () => {
    const max = suppliers.reduce((m, c) => { const n = parseInt(c.code?.split("-")[1]) || 0; return n > m ? n : m }, 0)
    return `VEND-${String(max + 1).padStart(3, "0")}`
  }

  const openNew = () => {
    setEditing(null); setCode(generateCode()); setName(""); setPhone(""); setEmail(""); setAddress(""); setOpeningBalance(0); setShowModal(true)
  }

  const openEdit = (c: Supplier) => {
    setEditing(c); setCode(c.code); setName(c.name); setPhone(c.phone || ""); setEmail(c.email || ""); setAddress(c.address || ""); setOpeningBalance(c.balance); setShowModal(true)
  }

  const handleSave = async () => {
    if (!code.trim() || !name.trim()) return
    setSaving(true)
    const payload = { code: code.trim(), name: name.trim(), phone: phone.trim() || null, email: email.trim() || null, address: address.trim() || null, balance: openingBalance, opening_balance: openingBalance }
    if (editing) {
      await supabase.from("suppliers").update(payload).eq("id", editing.id)
    } else {
      await supabase.from("suppliers").insert(payload)
    }
    setSaving(false); setShowModal(false); fetchSuppliers()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from("suppliers").delete().eq("id", deleteId)
    setDeleteId(null); fetchSuppliers()
  }

  const totalPayables = filtered.reduce((s, c) => s + (c.balance || 0), 0)

  return (
    <>
      <style>{styles}</style>
      <div className="sp-shell">
        {flash && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>✅ {flash.msg}</div>}
        <div className="sp-header">
          <div>
            <div className="sp-title">🚚 Suppliers</div>
            <div className="sp-subtitle">Manage supplier accounts and payables</div>
          </div>
          <button className="sp-btn sp-btn-primary" onClick={openNew}><Plus size={16} /> Add Supplier</button>
        </div>
        <div className="sp-stats">
          <div className="sp-stat-card"><div className="sp-stat-label">Total Suppliers</div><div className="sp-stat-value" style={{color:"#1E3A8A"}}>{filtered.length}</div></div>
          <div className="sp-stat-card"><div className="sp-stat-label">Total Payables</div><div className="sp-stat-value">PKR {totalPayables.toLocaleString()}</div></div>
        </div>
        <div className="sp-search" style={{marginBottom:16}}><Search size={16} /><input placeholder="Search suppliers..." value={search} onChange={e=>setSearch(e.target.value)} /></div>
        <div className="sp-table-wrap">
          <div className="sp-table-header"><span>Code</span><span>Name</span><span className="sp-hide-mobile">Phone</span><span className="sp-hide-mobile">Email</span><span style={{textAlign:"right"}}>Balance</span><span></span><span></span></div>
          {loading ? <div className="sp-empty">Loading...</div> : filtered.length === 0 ? <div className="sp-empty">No suppliers found.</div> :
            filtered.map(c => (
              <div key={c.id} className="sp-table-row">
                <span className="sp-code">{c.code}</span><span className="sp-name">{c.name}</span>
                <span className="sp-hide-mobile" style={{fontSize:12,color:"#64748B"}}>{c.phone||"-"}</span>
                <span className="sp-hide-mobile" style={{fontSize:12,color:"#64748B"}}>{c.email||"-"}</span>
                <span className="sp-balance">PKR {(c.balance||0).toLocaleString()}</span>
                <button className="sp-icon-btn" onClick={()=>openEdit(c)}><Edit size={14}/></button>
                <button className="sp-icon-btn danger" onClick={()=>setDeleteId(c.id)}><Trash2 size={14}/></button>
              </div>
            ))
          }
        </div>
      </div>

      {showModal && (
        <div className="sp-modal-overlay" onClick={()=>setShowModal(false)}>
          <div className="sp-modal" onClick={e=>e.stopPropagation()}>
            <div className="sp-modal-header"><div className="sp-modal-title">{editing?"✏️ Edit Supplier":"➕ Add Supplier"}</div><button className="sp-icon-btn" onClick={()=>setShowModal(false)}><X size={18}/></button></div>
            <div className="sp-modal-body">
              <div className="sp-field-row"><div><label className="sp-field-label">Code *</label><input className="sp-field-input" value={code} onChange={e=>setCode(e.target.value)}/></div><div><label className="sp-field-label">Name *</label><input className="sp-field-input" value={name} onChange={e=>setName(e.target.value)}/></div></div>
              <div className="sp-field-row"><div><label className="sp-field-label">Phone</label><input className="sp-field-input" value={phone} onChange={e=>setPhone(e.target.value)}/></div><div><label className="sp-field-label">Email</label><input className="sp-field-input" value={email} onChange={e=>setEmail(e.target.value)}/></div></div>
              <div><label className="sp-field-label">Address</label><input className="sp-field-input" value={address} onChange={e=>setAddress(e.target.value)}/></div>
              <div><label className="sp-field-label">Opening Balance (PKR)</label><input className="sp-field-input" type="number" value={openingBalance} onChange={e=>setOpeningBalance(Number(e.target.value))}/></div>
            </div>
            <div className="sp-modal-footer"><button className="sp-btn sp-btn-outline" onClick={()=>setShowModal(false)}>Cancel</button><button className="sp-btn sp-btn-primary" onClick={handleSave} disabled={saving}>{saving?"Saving...":"💾 Save"}</button></div>
          </div>
        </div>
      )}
      {deleteId && (
        <div className="sp-modal-overlay"><div className="sp-modal" style={{maxWidth:400}}><div className="sp-modal-header"><div className="sp-modal-title">⚠️ Delete?</div></div><div className="sp-modal-body" style={{textAlign:"center"}}><p style={{color:"#EF4444"}}>Cannot be undone.</p></div><div className="sp-modal-footer" style={{justifyContent:"center"}}><button className="sp-btn sp-btn-outline" onClick={()=>setDeleteId(null)}>Cancel</button><button className="sp-btn sp-btn-primary" style={{background:"#EF4444"}} onClick={handleDelete}>Delete</button></div></div></div>
      )}
    </>
  )
}