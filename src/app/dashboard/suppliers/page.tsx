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
  opening_balance: number
  balance: number
  default_project_id: number | null
  default_location_id: number | null
  default_activity_id: number | null
}

export default function SuppliersPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role, loading: roleLoading } = useRole()
  const canEdit = role === "admin" || role === "accountant"
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 25

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    opening_balance: 0,
    default_project_id: null as number | null,
    default_location_id: null as number | null,
    default_activity_id: null as number | null,
  })
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState("")
  const [formError, setFormError] = useState("")

  const [projects, setProjects] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    supabase.from("projects").select("id, name").eq("company_id", companyId).is("deleted_at", null).order("name")
      .then(r => r.data && setProjects(r.data))
    supabase.from("locations").select("id, name").eq("company_id", companyId).is("deleted_at", null).order("name")
      .then(r => r.data && setLocations(r.data))
    supabase.from("activities").select("id, name").eq("company_id", companyId).is("deleted_at", null).order("name")
      .then(r => r.data && setActivities(r.data))
  }, [companyId])

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

  const getNextCode = async (): Promise<string> => {
    const { data } = await supabase
      .from("suppliers")
      .select("code")
      .eq("company_id", companyId)
      .order("code", { ascending: false })
      .limit(50)
    let maxNum = 0
    if (data) {
      data.forEach(row => {
        const match = row.code?.match(/SUP-(\d+)/)
        if (match) {
          const n = parseInt(match[1], 10)
          if (!isNaN(n) && n > maxNum) maxNum = n
        }
      })
    }
    return `SUP-${String(maxNum + 1).padStart(3, "0")}`
  }

  const openNew = () => {
    setEditingSupplier(null)
    setForm({
      name: "",
      phone: "",
      email: "",
      address: "",
      opening_balance: 0,
      default_project_id: null,
      default_location_id: null,
      default_activity_id: null,
    })
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
      opening_balance: s.opening_balance || 0,
      default_project_id: s.default_project_id || null,
      default_location_id: s.default_location_id || null,
      default_activity_id: s.default_activity_id || null,
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
      opening_balance: form.opening_balance,
      default_project_id: form.default_project_id,
      default_location_id: form.default_location_id,
      default_activity_id: form.default_activity_id,
    }

    let errorMsg = ""

    if (editingSupplier) {
      const { error } = await supabase.from("suppliers").update(payload).eq("id", editingSupplier.id).eq("company_id", companyId)
      if (error) errorMsg = error.message
      else setFlash("Supplier updated!")
    } else {
      const code = await getNextCode()
      const { error } = await supabase.from("suppliers").insert({ ...payload, code, balance: form.opening_balance })
      if (error) errorMsg = error.message
      else setFlash("Supplier created!")
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

  if (roleLoading || !role) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
  }
  if (!canView) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
      </div>
    )
  }
  if (!companyId) return <div style={{ padding: 40, textAlign: "center" }}>Loading company data...</div>

  return (
    <div style={{ padding: 24, fontFamily: "'Plus Jakarta Sans', sans-serif", background: "#EFF4FB", minHeight: "100vh" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
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
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>🚚 Suppliers</h1>
          <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>Manage your supplier accounts</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={16} /> Add Supplier
          </button>
        )}
      </div>

      <div className="summary-grid">
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Suppliers</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{total}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Payables</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            PKR {suppliers.reduce((s, c) => s + (c.balance || 0), 0).toLocaleString()}
          </div>
        </div>
      </div>

      {flash && (
        <div style={{ background: flash.startsWith("Error") ? "#FEF2F2" : "#F0FDF4", border: flash.startsWith("Error") ? "1px solid #FECACA" : "1px solid #BBF7D0", color: flash.startsWith("Error") ? "#B91C1C" : "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {flash}
        </div>
      )}

      <div style={{ marginBottom: 12, maxWidth: 320 }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 12, color: "#94A3B8" }} />
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder="Search by code, name, or phone..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th style={{ textAlign: "right" }}>Balance</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: 20 }}>Loading...</td></tr>
            ) : suppliers.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: 20, color: "#94A3B8" }}>
                {search ? "No matching suppliers found." : "No suppliers yet. Add your first supplier above."}
              </td></tr>
            ) : (
              suppliers.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.code}</td>
                  <td>{s.name}</td>
                  <td>{s.phone || "—"}</td>
                  <td>{s.email || "—"}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {s.balance?.toLocaleString()}</td>
                  <td>
                    {canEdit && (
                      <button className="btn btn-outline" style={{ padding: "4px 8px" }} onClick={() => openEdit(s)}>
                        <Edit size={14} />
                      </button>
                    )}
                  </td>
                  <td>
                    {canEdit && (
                      <button className="btn btn-outline" style={{ padding: "4px 8px", color: "#EF4444", borderColor: "#FECACA" }} onClick={() => handleDelete(s.id)}>
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
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 13, color: "#64748B" }}>
          <span>Showing {Math.min(pageSize, total - (page-1)*pageSize)} of {total}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn btn-outline" disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && canEdit && (
        <div className="pr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pr-modal" onClick={e => e.stopPropagation()}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>{editingSupplier ? "Edit Supplier" : "Add Supplier"}</h3>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              {formError && <div className="form-error">{formError}</div>}
              <div><label className="inv-label">Name *</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
              <div><label className="inv-label">Phone</label><input className="input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
              <div><label className="inv-label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
              <div><label className="inv-label">Address</label><input className="input" value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
              <div><label className="inv-label">Opening Balance</label><input className="input" type="number" value={form.opening_balance} onChange={e => setForm({...form, opening_balance: parseFloat(e.target.value) || 0})} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="inv-label">Default Project</label>
                  <select className="input" value={form.default_project_id ?? ""} onChange={e => setForm({...form, default_project_id: e.target.value ? Number(e.target.value) : null})}>
                    <option value="">— None —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="inv-label">Default Location</label>
                  <select className="input" value={form.default_location_id ?? ""} onChange={e => setForm({...form, default_location_id: e.target.value ? Number(e.target.value) : null})}>
                    <option value="">— None —</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="inv-label">Default Activity</label>
                <select className="input" value={form.default_activity_id ?? ""} onChange={e => setForm({...form, default_activity_id: e.target.value ? Number(e.target.value) : null})}>
                  <option value="">— None —</option>
                  {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
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