"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Search, Edit, Trash2, Phone, Mail, MapPin, CreditCard, X, Check } from "lucide-react"

interface Customer {
  id: number
  code: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  balance: number
  payment_terms: string
}

const styles = `
  .cp-shell { padding: clamp(16px, 2.5vw, 24px); background: #EFF4FB; min-height: 100%; font-family: 'Plus Jakarta Sans', sans-serif; }
  .cp-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
  .cp-title { font-size: clamp(18px, 1.8vw, 24px); font-weight: 800; color: #1E293B; }
  .cp-subtitle { font-size: 13px; color: #94A3B8; margin-top: 2px; }
  .cp-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .cp-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
  .cp-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; box-shadow: 0 2px 8px rgba(7,19,82,0.25); }
  .cp-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(7,19,82,0.35); }
  .cp-btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
  .cp-btn-outline:hover { border-color: #1740C8; color: #1740C8; }
  .cp-search { position: relative; max-width: 320px; }
  .cp-search input { width: 100%; height: 40px; border: 1.5px solid #E2E8F0; border-radius: 9px; padding: 0 14px 0 38px; font-size: 13px; font-family: inherit; background: white; outline: none; transition: border-color 0.15s; }
  .cp-search input:focus { border-color: #1740C8; }
  .cp-search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94A3B8; }
  .cp-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 20px; }
  .cp-stat-card { background: white; border-radius: 10px; border: 1px solid #E2E8F0; padding: 14px 16px; }
  .cp-stat-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94A3B8; margin-bottom: 4px; }
  .cp-stat-value { font-size: 22px; font-weight: 800; color: #1E3A8A; }
  .cp-table-wrap { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
  .cp-table-header { display: grid; grid-template-columns: 100px 1fr 130px 1fr 100px 100px 60px 60px; padding: 10px 16px; background: #F8FAFC; border-bottom: 2px solid #E2E8F0; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94A3B8; align-items: center; }
  .cp-table-row { display: grid; grid-template-columns: 100px 1fr 130px 1fr 100px 100px 60px 60px; padding: 10px 16px; border-bottom: 1px solid #F1F5F9; align-items: center; font-size: 13px; transition: background 0.1s; }
  .cp-table-row:hover { background: #FAFBFF; }
  .cp-code { font-weight: 700; color: #1E3A8A; font-size: 12px; }
  .cp-name { font-weight: 600; color: #1E293B; }
  .cp-balance { font-weight: 700; color: #F59E0B; text-align: right; }
  .cp-icon-btn { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 6px; color: #94A3B8; transition: all 0.15s; display: inline-flex; }
  .cp-icon-btn:hover { background: #F1F5F9; color: #475569; }
  .cp-icon-btn.danger:hover { background: #FEE2E2; color: #EF4444; }
  .cp-empty { padding: 40px; text-align: center; color: #94A3B8; }
  .cp-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .cp-modal { background: white; border-radius: 14px; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
  .cp-modal-header { padding: 20px 24px; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; }
  .cp-modal-title { font-size: 18px; font-weight: 700; color: #1E293B; }
  .cp-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
  .cp-field-label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; }
  .cp-field-input { width: 100%; height: 40px; border: 1.5px solid #E5EAF2; border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; transition: border-color 0.15s; }
  .cp-field-input:focus { border-color: #1740C8; background: white; }
  .cp-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .cp-modal-footer { padding: 16px 24px; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 8px; }

  @media (max-width: 768px) {
    .cp-table-header, .cp-table-row { grid-template-columns: 80px 1fr 100px 60px 60px; }
    .cp-hide-mobile { display: none; }
    .cp-field-row { grid-template-columns: 1fr; }
  }
  @media (max-width: 480px) {
    .cp-table-header, .cp-table-row { grid-template-columns: 1fr 80px 50px 50px; }
  }
`

export default function CustomersPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  
  const [customers, setCustomers] = useState<Customer[]>([])
  const [filtered, setFiltered] = useState<Customer[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [flash, setFlash] = useState<{type: string, msg: string} | null>(null)

  // Form state
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [paymentTerms, setPaymentTerms] = useState("Net 30")
  const [openingBalance, setOpeningBalance] = useState(0)
  const [saving, setSaving] = useState(false)

  const fetchCustomers = async () => {
    setLoading(true)
    const { data } = await supabase.from("customers").select("*").order("code")
    if (data) {
      setCustomers(data)
      setFiltered(data)
    }
    setLoading(false)
  }

  useEffect(() => { fetchCustomers() }, [])

  useEffect(() => {
    if (!search.trim()) { setFiltered(customers); return }
    const s = search.toLowerCase()
    setFiltered(customers.filter(c => c.code.toLowerCase().includes(s) || c.name.toLowerCase().includes(s) || (c.phone && c.phone.includes(s)) || (c.email && c.email.toLowerCase().includes(s))))
  }, [search, customers])

  const generateCode = () => {
    const max = customers.reduce((m, c) => {
      const n = parseInt(c.code?.split("-")[1]) || 0
      return n > m ? n : m
    }, 0)
    return `CUST-${String(max + 1).padStart(3, "0")}`
  }

  const openNew = () => {
    setEditing(null)
    setCode(generateCode())
    setName(""); setPhone(""); setEmail(""); setAddress(""); setPaymentTerms("Net 30"); setOpeningBalance(0)
    setShowModal(true)
  }

  const openEdit = (c: Customer) => {
    setEditing(c)
    setCode(c.code); setName(c.name); setPhone(c.phone || ""); setEmail(c.email || ""); setAddress(c.address || ""); setPaymentTerms(c.payment_terms || "Net 30"); setOpeningBalance(c.balance)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!code.trim() || !name.trim()) return
    setSaving(true)
    const payload = { code: code.trim(), name: name.trim(), phone: phone.trim() || null, email: email.trim() || null, address: address.trim() || null, payment_terms: paymentTerms, balance: openingBalance, opening_balance: openingBalance }

    if (editing) {
      await supabase.from("customers").update(payload).eq("id", editing.id)
      setFlash({ type: "success", msg: `Customer '${name}' updated!` })
    } else {
      await supabase.from("customers").insert(payload)
      setFlash({ type: "success", msg: `Customer '${name}' added!` })
    }
    setSaving(false); setShowModal(false); fetchCustomers()
    setTimeout(() => setFlash(null), 3000)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from("customers").delete().eq("id", deleteId)
    setDeleteId(null); setFlash({ type: "success", msg: "Customer deleted." }); fetchCustomers()
    setTimeout(() => setFlash(null), 3000)
  }

  const totalReceivables = filtered.reduce((s, c) => s + (c.balance || 0), 0)

  return (
    <>
      <style>{styles}</style>
      <div className="cp-shell">
        {/* Flash */}
        {flash && (
          <div style={{ background: flash.type === "success" ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${flash.type === "success" ? "#BBF7D0" : "#FECACA"}`, color: flash.type === "success" ? "#15803D" : "#B91C1C", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            {flash.type === "success" ? <Check size={16} /> : <X size={16} />} {flash.msg}
          </div>
        )}

        {/* Header */}
        <div className="cp-header">
          <div>
            <div className="cp-title">👥 Customers</div>
            <div className="cp-subtitle">Manage customer accounts, view balances, and transactions</div>
          </div>
          <div className="cp-actions">
            <button className="cp-btn cp-btn-primary" onClick={openNew}><Plus size={16} /> Add Customer</button>
          </div>
        </div>

        {/* Stats */}
        <div className="cp-stats">
          <div className="cp-stat-card">
            <div className="cp-stat-label">Total Customers</div>
            <div className="cp-stat-value">{filtered.length}</div>
          </div>
          <div className="cp-stat-card">
            <div className="cp-stat-label">Total Receivables</div>
            <div className="cp-stat-value" style={{ color: "#F59E0B" }}>PKR {totalReceivables.toLocaleString()}</div>
          </div>
        </div>

        {/* Search */}
        <div className="cp-search" style={{ marginBottom: 16 }}>
          <Search size={16} />
          <input type="text" placeholder="Search by code, name, phone or email..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Table */}
        <div className="cp-table-wrap">
          <div className="cp-table-header">
            <span>Code</span>
            <span>Name</span>
            <span className="cp-hide-mobile">Phone</span>
            <span className="cp-hide-mobile">Email</span>
            <span>Terms</span>
            <span style={{ textAlign: "right" }}>Balance</span>
            <span></span>
            <span></span>
          </div>
          {loading ? (
            <div className="cp-empty">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="cp-empty">No customers found. Add your first customer above.</div>
          ) : (
            filtered.map(c => (
              <div key={c.id} className="cp-table-row">
                <span className="cp-code">{c.code}</span>
                <span className="cp-name">{c.name}</span>
                <span className="cp-hide-mobile" style={{ fontSize: 12, color: "#64748B" }}>{c.phone || "-"}</span>
                <span className="cp-hide-mobile" style={{ fontSize: 12, color: "#64748B" }}>{c.email || "-"}</span>
                <span style={{ fontSize: 12, color: "#64748B" }}>{c.payment_terms || "Net 30"}</span>
                <span className="cp-balance">PKR {(c.balance || 0).toLocaleString()}</span>
                <button className="cp-icon-btn" onClick={() => openEdit(c)}><Edit size={14} /></button>
                <button className="cp-icon-btn danger" onClick={() => setDeleteId(c.id)}><Trash2 size={14} /></button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="cp-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="cp-modal" onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header">
              <div className="cp-modal-title">{editing ? "✏️ Edit Customer" : "➕ Add New Customer"}</div>
              <button className="cp-icon-btn" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="cp-modal-body">
              <div className="cp-field-row">
                <div>
                  <label className="cp-field-label">Customer Code *</label>
                  <input className="cp-field-input" value={code} onChange={e => setCode(e.target.value)} placeholder="CUST-001" />
                </div>
                <div>
                  <label className="cp-field-label">Customer Name *</label>
                  <input className="cp-field-input" value={name} onChange={e => setName(e.target.value)} placeholder="Customer name" />
                </div>
              </div>
              <div className="cp-field-row">
                <div>
                  <label className="cp-field-label">Phone</label>
                  <input className="cp-field-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0300-1234567" />
                </div>
                <div>
                  <label className="cp-field-label">Email</label>
                  <input className="cp-field-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="customer@email.com" />
                </div>
              </div>
              <div>
                <label className="cp-field-label">Address</label>
                <input className="cp-field-input" value={address} onChange={e => setAddress(e.target.value)} placeholder="Address" />
              </div>
              <div className="cp-field-row">
                <div>
                  <label className="cp-field-label">Payment Terms</label>
                  <input className="cp-field-input" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="Net 30" />
                </div>
                <div>
                  <label className="cp-field-label">Opening Balance (PKR)</label>
                  <input className="cp-field-input" type="number" value={openingBalance} onChange={e => setOpeningBalance(Number(e.target.value))} />
                </div>
              </div>
            </div>
            <div className="cp-modal-footer">
              <button className="cp-btn cp-btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="cp-btn cp-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "💾 Save Customer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="cp-modal-overlay">
          <div className="cp-modal" style={{ maxWidth: 400 }}>
            <div className="cp-modal-header">
              <div className="cp-modal-title">⚠️ Delete Customer?</div>
            </div>
            <div className="cp-modal-body" style={{ textAlign: "center" }}>
              <p style={{ color: "#EF4444", marginBottom: 8 }}>This action cannot be undone.</p>
            </div>
            <div className="cp-modal-footer" style={{ justifyContent: "center" }}>
              <button className="cp-btn cp-btn-outline" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="cp-btn cp-btn-primary" style={{ background: "#EF4444" }} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}