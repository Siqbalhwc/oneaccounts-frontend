"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import { Plus, Search, Edit, Trash2, X } from "lucide-react"

interface Customer {
  id: number
  code: string
  name: string
  phone: string
  email: string
  address: string
  payment_terms: string
  opening_balance: number
  balance: number
}

export default function CustomersPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const canEdit = role === "admin" || role === "accountant"
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 25

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
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

  // ── 1. Get REAL company ID from user metadata ────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // ── 2. Fetch customers when companyId is known ────────
  const fetchCustomers = () => {
    if (!companyId) return
    setLoading(true)

    const start = (page - 1) * pageSize
    const end = start + pageSize - 1

    let query = supabase
      .from("customers")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .order("name")

    if (search.trim()) {
      query = query.or(
        `name.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
      )
    }

    query.range(start, end).then(({ data, count }) => {
      setCustomers(data || [])
      setTotal(count || 0)
      setLoading(false)
    })
  }

  useEffect(() => {
    fetchCustomers()
  }, [companyId, search, page])

  // ── Open modal for new customer ──────────────────────
  const openNew = () => {
    setEditingCustomer(null)
    setForm({
      name: "",
      phone: "",
      email: "",
      address: "",
      payment_terms: "Net 30",
      opening_balance: 0,
    })
    setShowModal(true)
  }

  // ── Open modal for editing ───────────────────────────
  const openEdit = (cust: Customer) => {
    setEditingCustomer(cust)
    setForm({
      name: cust.name,
      phone: cust.phone || "",
      email: cust.email || "",
      address: cust.address || "",
      payment_terms: cust.payment_terms || "Net 30",
      opening_balance: cust.opening_balance || 0,
    })
    setShowModal(true)
  }

  // ── Generate unique code per company ──────────────────
  const getNextCode = async (): Promise<string> => {
    const { data } = await supabase
      .from("customers")
      .select("code")
      .eq("company_id", companyId)
      .order("code", { ascending: false })
      .limit(1)

    let nextNum = 1
    if (data && data.length > 0) {
      const lastCode = data[0].code
      const match = lastCode.match(/CUST-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    return `CUST-${String(nextNum).padStart(3, "0")}`
  }

  // ── Save (insert or update) ─────────────────────────
  const handleSave = async () => {
    if (!form.name.trim() || !companyId) return
    setSaving(true)

    const payload = {
      company_id: companyId,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      payment_terms: form.payment_terms,
      opening_balance: form.opening_balance,
      balance: form.opening_balance, // set initial balance = opening
    }

    if (editingCustomer) {
      const { error } = await supabase
        .from("customers")
        .update(payload)
        .eq("id", editingCustomer.id)
        .eq("company_id", companyId)
      if (error) {
        setFlash("Error: " + error.message)
        setSaving(false)
        return
      }
      setFlash("✅ Customer updated!")
    } else {
      const code = await getNextCode()
      const { error } = await supabase
        .from("customers")
        .insert({ ...payload, code })
      if (error) {
        setFlash("Error: " + error.message)
        setSaving(false)
        return
      }
      setFlash("✅ Customer created!")
    }

    setSaving(false)
    setShowModal(false)
    fetchCustomers()
    setTimeout(() => setFlash(""), 3000)
  }

  // ── Soft delete ─────────────────────────────────────
  const handleDelete = async (id: number) => {
    if (!companyId || !canEdit) return
    if (!window.confirm("Delete this customer?")) return

    const { error } = await supabase
      .from("customers")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)

    if (error) {
      alert("Delete failed: " + error.message)
    } else {
      fetchCustomers()
    }
  }

  // ── Guard clauses ──────────────────────────────────
  if (!companyId) {
    return <div style={{ padding: 40, textAlign: "center", fontFamily: "Arial" }}>Loading your company data…</div>
  }
  if (!canView) {
    return <div style={{ padding: 40, textAlign: "center" }}><h2>Access Denied</h2></div>
  }

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .input { width: 100%; height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; }
        .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-primary { background: #1D4ED8; color: white; }
        .btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .btn-danger { background: #EF4444; color: white; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 8px 6px; border-bottom: 1px solid #E2E8F0; }
        td { padding: 10px 6px; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
        tr:hover td { background: #FAFBFF; }
        .pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; font-size: 13px; }
        .pr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .pr-modal { background: white; border-radius: 14px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; }
        .pr-modal-header { padding: 20px 24px; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; }
        .pr-modal-title { font-size: 18px; font-weight: 700; color: #1E293B; }
        .pr-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
        .pr-field-label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; }
        .pr-modal-footer { padding: 16px 24px; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 8px; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>👥 Customers</h2>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>Manage customer accounts, view balances, and transactions</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={16} /> Add Customer
          </button>
        )}
      </div>

      {flash && (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {flash}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Customers</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{total}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Receivables</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            PKR {customers.reduce((s, c) => s + (c.balance || 0), 0).toLocaleString()}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 12, position: "relative" }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: 12, color: "#94A3B8" }} />
        <input
          className="input"
          style={{ paddingLeft: 32 }}
          placeholder="Search by code, name, phone or email..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
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
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 20 }}>Loading...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 20, color: "#94A3B8" }}>
                {search ? "No matching customers found." : "No customers yet. Add your first customer above."}
              </td></tr>
            ) : (
              customers.map((cust) => (
                <tr key={cust.id}>
                  <td style={{ fontWeight: 600 }}>{cust.code}</td>
                  <td>{cust.name}</td>
                  <td>{cust.phone}</td>
                  <td>{cust.email || "—"}</td>
                  <td>{cust.payment_terms}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {cust.balance?.toLocaleString()}</td>
                  <td>
                    {canEdit && (
                      <button className="btn btn-outline" style={{ padding: "4px 8px" }} onClick={() => openEdit(cust)}>
                        <Edit size={14} />
                      </button>
                    )}
                  </td>
                  <td>
                    {canEdit && (
                      <button className="btn btn-outline" style={{ padding: "4px 8px", color: "#EF4444", borderColor: "#FECACA" }} onClick={() => handleDelete(cust.id)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > pageSize && (
        <div className="pagination">
          <span>Showing {Math.min(pageSize, total - (page-1)*pageSize)} of {total}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn btn-outline" disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {showModal && canEdit && (
        <div className="pr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pr-modal" onClick={e => e.stopPropagation()}>
            <div className="pr-modal-header">
              <div className="pr-modal-title">{editingCustomer ? "✏️ Edit Customer" : "➕ Add Customer"}</div>
              <button className="btn btn-outline" style={{ padding: 4, border: "none" }} onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="pr-modal-body">
              <div>
                <label className="pr-field-label">Name *</label>
                <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Customer name" />
              </div>
              <div>
                <label className="pr-field-label">Phone</label>
                <input className="input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
              </div>
              <div>
                <label className="pr-field-label">Email</label>
                <input className="input" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
              </div>
              <div>
                <label className="pr-field-label">Address</label>
                <input className="input" value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
              </div>
              <div>
                <label className="pr-field-label">Payment Terms</label>
                <input className="input" value={form.payment_terms} onChange={e => setForm({...form, payment_terms: e.target.value})} />
              </div>
              <div>
                <label className="pr-field-label">Opening Balance</label>
                <input className="input" type="number" value={form.opening_balance} onChange={e => setForm({...form, opening_balance: parseFloat(e.target.value) || 0})} />
              </div>
            </div>
            <div className="pr-modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? "Saving..." : "💾 Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}