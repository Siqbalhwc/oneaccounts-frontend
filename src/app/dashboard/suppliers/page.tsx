"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import { Plus, Search, Edit, Trash2, X } from "lucide-react"

interface Supplier {
  id: number
  code: string
  name: string
  phone: string
  email: string
  address: string
  payment_terms: string
  balance: number
}

export default function SuppliersPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const canEdit = role === "admin" || role === "accountant"
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 25

  // Modal states
  const [showModal, setShowModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    payment_terms: "Net 30",
    opening_balance: 0,
  })
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState("")
  const [formError, setFormError] = useState("")

  // ── 1. Get real company ID ──────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // ── 2. Fetch suppliers ──────────────────────────
  const fetchSuppliers = () => {
    if (!companyId) return
    setLoading(true)
    const start = (page - 1) * pageSize
    const end = start + pageSize - 1

    let query = supabase
      .from("suppliers")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .order("name")

    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%`)
    }

    query.range(start, end).then(({ data, count }) => {
      setSuppliers(data || [])
      setTotal(count || 0)
      setLoading(false)
    })
  }

  useEffect(() => { fetchSuppliers() }, [companyId, search, page])

  // ── Generate unique supplier code per company ────
  const getNextCode = async (): Promise<string> => {
    const { data } = await supabase
      .from("suppliers")
      .select("code")
      .eq("company_id", companyId)
      .order("code", { ascending: false })
      .limit(1)
    let nextNum = 1
    if (data && data.length > 0) {
      const match = data[0].code.match(/SUP-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    return `SUP-${String(nextNum).padStart(3, "0")}`
  }

  const openNew = () => {
    setEditingSupplier(null)
    setForm({ name: "", phone: "", email: "", address: "", payment_terms: "Net 30", opening_balance: 0 })
    setFormError("")
    setShowModal(true)
  }

  const openEdit = (s: Supplier) => {
    setEditingSupplier(s)
    setForm({
      name: s.name,
      phone: s.phone || "",
      email: s.email || "",
      address: s.address || "",
      payment_terms: s.payment_terms || "Net 30",
      opening_balance: (s as any).opening_balance || 0,
    })
    setFormError("")
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !companyId) return
    setSaving(true)
    setFormError("")
    setFlash("")

    const payload = {
      company_id: companyId,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      payment_terms: form.payment_terms,
    }

    let errorMsg = ""

    if (editingSupplier) {
      const { error } = await supabase.from("suppliers").update(payload).eq("id", editingSupplier.id).eq("company_id", companyId)
      if (error) errorMsg = error.message
      else setFlash("✅ Supplier updated!")
    } else {
      const code = await getNextCode()
      const { error } = await supabase.from("suppliers").insert({ ...payload, code, opening_balance: form.opening_balance, balance: form.opening_balance })
      if (error) errorMsg = error.message
      else setFlash("✅ Supplier created!")
    }

    setSaving(false)
    if (errorMsg) {
      setFormError(errorMsg)
      setFlash("Error: " + errorMsg)
    } else {
      setShowModal(false)
      fetchSuppliers()
      setTimeout(() => setFlash(""), 3000)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this supplier?")) return
    await supabase.from("suppliers").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", companyId)
    fetchSuppliers()
  }

  if (!companyId) return <div style={{ padding: 40 }}>Loading company data…</div>
  if (!canView) return <div style={{ padding: 40 }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; }
        .input { width: 100%; height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; }
        .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-primary { background: #1D4ED8; color: white; }
        .btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 8px 6px; border-bottom: 1px solid #E2E8F0; }
        td { padding: 10px 6px; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
        tr:hover td { background: #FAFBFF; }
        .form-error { background: #FEF2F2; border: 1px solid #FECACA; color: #B91C1C; padding: 8px 12px; border-radius: 6px; }
        .pr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .pr-modal { background: white; border-radius: 14px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h2>🚚 Suppliers</h2>
        {canEdit && <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Add Supplier</button>}
      </div>

      {flash && <div style={{ marginBottom: 12, color: flash.startsWith("Error") ? "red" : "green" }}>{flash}</div>}

      <div style={{ marginBottom: 12 }}>
        <input className="input" placeholder="Search..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Terms</th>
              <th style={{ textAlign: "right" }}>Balance</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: "center" }}>Loading...</td></tr>
            ) : suppliers.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "#94A3B8" }}>No suppliers yet.</td></tr>
            ) : (
              suppliers.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.code}</td>
                  <td>{s.name}</td>
                  <td>{s.phone}</td>
                  <td>{s.email || "—"}</td>
                  <td>{s.payment_terms}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {s.balance?.toLocaleString()}</td>
                  <td><button className="btn btn-outline" style={{ padding: 4 }} onClick={() => openEdit(s)}><Edit size={14} /></button></td>
                  <td><button className="btn btn-outline" style={{ padding: 4, color: "#EF4444" }} onClick={() => handleDelete(s.id)}><Trash2 size={14} /></button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && canEdit && (
        <div className="pr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pr-modal" onClick={e => e.stopPropagation()}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between" }}>
              <h3>{editingSupplier ? "Edit Supplier" : "Add Supplier"}</h3>
              <button className="btn-outline" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              {formError && <div className="form-error">{formError}</div>}
              <div><label>Name *</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
              <div><label>Phone</label><input className="input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
              <div><label>Email</label><input className="input" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
              <div><label>Address</label><input className="input" value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
              <div><label>Payment Terms</label><input className="input" value={form.payment_terms} onChange={e => setForm({...form, payment_terms: e.target.value})} /></div>
              <div><label>Opening Balance</label><input className="input" type="number" value={form.opening_balance} onChange={e => setForm({...form, opening_balance: parseFloat(e.target.value) || 0})} /></div>
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #E2E8F0", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>{saving ? "Saving..." : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}