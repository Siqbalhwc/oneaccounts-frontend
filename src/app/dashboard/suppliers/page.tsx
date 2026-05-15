"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { useRole } from "@/contexts/RoleContext"
import { Plus, Search, Edit, Trash2, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import RecordHistory from "@/components/RecordHistory"

// Country codes (for the edit modal, kept consistent)
const COUNTRY_CODES = [
  { code: "+92", label: "🇵🇰 +92" },
  { code: "+1",  label: "🇺🇸 +1" },
  { code: "+44", label: "🇬🇧 +44" },
  { code: "+971",label: "🇦🇪 +971" },
  { code: "+966",label: "🇸🇦 +966" },
  { code: "+91", label: "🇮🇳 +91" },
]

const PAYMENT_TERMS = [
  "Due on Receipt",
  "Net 7",
  "Net 15",
  "Net 30",
  "Net 60",
]

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
  payment_terms?: string | null
}

type SortField = "code" | "name" | "balance"
type SortDir = "asc" | "desc"

export default function SuppliersPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
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

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [form, setForm] = useState({
    name: "",
    countryCode: "+92",
    phone: "",
    email: "",
    address: "",
    opening_balance: 0,
    payment_terms: "Net 15",
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
      .is("deleted_at", null)
      .order(sortField, { ascending: sortDir === "asc" })

    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%`)
    }

    query.range(start, end).then(({ data, count }) => {
      setSuppliers(data || [])
      setTotal(count || 0)
      setLoading(false)
    })
  }

  useEffect(() => { fetchSuppliers() }, [companyId, search, page, sortField, sortDir])

  // Sorting handler
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
    // Navigate to the standalone New Supplier page
    router.push("/dashboard/suppliers/new")
  }

  const openEdit = (s: Supplier) => {
    setEditingSupplier(s)
    // Extract country code if present
    let cc = "+92"
    let ph = s.phone || ""
    if (ph && ph.startsWith("+")) {
      const match = ph.match(/^(\+\d{1,3})(.*)/)
      if (match) {
        cc = match[1]
        ph = match[2].trim()
      }
    }
    setForm({
      name: s.name,
      countryCode: cc,
      phone: ph,
      email: s.email || "",
      address: s.address || "",
      opening_balance: s.opening_balance || 0,
      payment_terms: s.payment_terms || "Net 15",
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

    const fullPhone = form.countryCode + (form.phone.trim().replace(/\D/g, ""))

    const payload = {
      company_id: companyId,
      name: form.name.trim(),
      phone: fullPhone,
      email: form.email.trim(),
      address: form.address.trim(),
      opening_balance: form.opening_balance,
      payment_terms: form.payment_terms,
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
      // This branch is no longer used for new creation (we redirect), but keep for safety
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

  // Summary
  const totalPayables = suppliers.reduce((s, c) => s + (c.balance || 0), 0)

  if (roleLoading || !role) {
    return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading...</div>
  }
  if (!canView) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#E2E8F0" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
      </div>
    )
  }
  if (!companyId) return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading company data...</div>

  return (
    <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .card { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.2); overflow: hidden; }
        .header-row { display: grid; grid-template-columns: 80px 1fr 120px 100px 40px 40px; padding: 12px 20px; background: #1E293B; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94A3B8; border-bottom: 1px solid #1E293B; }
        .data-row { display: grid; grid-template-columns: 80px 1fr 120px 100px 40px 40px; padding: 10px 20px; border-bottom: 1px solid #1E293B; font-size: 13px; align-items: center; transition: background 0.15s; }
        .data-row:hover { background: #1E293B; }
        .data-row:last-child { border-bottom: none; }
        .sort-btn { background: none; border: none; cursor: pointer; font: inherit; color: inherit; display: inline-flex; align-items: center; gap: 4px; padding: 0; font-weight: 700; text-transform: uppercase; font-size: 10px; }
        .sort-btn:hover { color: #93C5FD; }
        .search-input { height: 38px; border: 1.5px solid #334155; border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px; width: 260px; box-sizing: border-box; outline: none; font-family: inherit; background: #1E293B; color: #F1F5F9; }
        .search-input:focus { border-color: #64748B; }
        .btn { padding: 8px 16px; border-radius: 8px; border: 1.5px solid #334155; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-outline { background: transparent; color: white; border-color: #334155; }
        .btn-outline:hover { background: #1E293B; }
        .btn-icon { background: transparent; border: 1.5px solid #334155; color: #CBD5E1; padding: 6px; border-radius: 8px; cursor: pointer; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-item { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 16px; }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: "#94A3B8"; margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: #F1F5F9; }
        /* Modal styles */
        .pr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .pr-modal { background: #111827; border: 1px solid #1E293B; border-radius: 14px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; color: #E2E8F0; }
        .form-error { background: #1E293B; border: 1px solid #EF4444; color: #FCA5A5; padding: 8px 12px; border-radius: 6px; }
        .input { width: 100%; height: 38px; border: 1.5px solid #334155; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; background: #1E293B; color: #F1F5F9; }
        .input:focus { border-color: #64748B; outline: none; }
        label { font-size: 11px; font-weight: 600; color: #94A3B8; text-transform: uppercase; margin-bottom: 4px; display: block; }
        @media (max-width: 640px) {
          .header-row, .data-row { grid-template-columns: 60px 1fr 80px 60px 30px 30px; }
          .header-row span:nth-child(3), .data-row span:nth-child(3) { display: none; }
          .search-input { width: 100%; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>🚚 Suppliers</h1>
          <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>Manage your supplier accounts</p>
        </div>
        {canEdit && (
          <button className="btn btn-outline" onClick={openNew}>
            <Plus size={16} /> Add Supplier
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label" style={{ color: "#94A3B8" }}>Total Suppliers</div>
          <div className="summary-value">{total}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label" style={{ color: "#94A3B8" }}>Total Payables</div>
          <div className="summary-value" style={{ color: totalPayables >= 0 ? "#10B981" : "#EF4444" }}>
            PKR {totalPayables.toLocaleString()}
          </div>
        </div>
      </div>

      {flash && (
        <div style={{ background: flash.startsWith("Error") ? "#1E293B" : "#064E3B", border: flash.startsWith("Error") ? "1px solid #EF4444" : "1px solid #065F46", color: flash.startsWith("Error") ? "#FCA5A5" : "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {flash}
        </div>
      )}

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
        <input
          className="search-input"
          placeholder="Search by code, name, or phone..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      {/* Suppliers Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading suppliers…</div>
      ) : suppliers.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>
          {search ? "No matching suppliers found." : "No suppliers yet. Add your first supplier."}
        </div>
      ) : (
        <div className="card">
          <div className="header-row">
            <button className="sort-btn" onClick={() => handleSort("code")}>Code {getSortIcon("code")}</button>
            <button className="sort-btn" onClick={() => handleSort("name")}>Name {getSortIcon("name")}</button>
            <span>Phone</span>
            <button className="sort-btn" onClick={() => handleSort("balance")} style={{ textAlign: "right", justifyContent: "flex-end", paddingRight: "0" }}>Balance {getSortIcon("balance")}</button>
            <span></span>
            <span></span>
          </div>
          {suppliers.map(s => (
            <div key={s.id} className="data-row">
              <span style={{ fontWeight: 600, color: "#93C5FD" }}>{s.code}</span>
              <span style={{ color: "#E2E8F0" }}>{s.name}</span>
              <span style={{ color: "#94A3B8" }}>{s.phone || "—"}</span>
              <span style={{ textAlign: "right", fontWeight: 600, color: s.balance >= 0 ? "#10B981" : "#EF4444" }}>PKR {s.balance?.toLocaleString()}</span>
              <button className="btn-icon" onClick={() => openEdit(s)}><Edit size={14} /></button>
              <button className="btn-icon" onClick={() => handleDelete(s.id)} style={{ color: "#EF4444" }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 13, color: "#94A3B8" }}>
          <span>Showing {Math.min(pageSize, total - (page-1)*pageSize)} of {total}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn btn-outline" disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {/* Edit Modal (Dark Themed) */}
      {showModal && canEdit && (
        <div className="pr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pr-modal" onClick={e => e.stopPropagation()}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, color: "#F1F5F9" }}>{editingSupplier ? "Edit Supplier" : "Add Supplier"}</h3>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              {formError && <div className="form-error">{formError}</div>}
              <div><label>Name *</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
              <div><label>Phone</label>
                <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8 }}>
                  <select className="input" value={form.countryCode} onChange={e => setForm({...form, countryCode: e.target.value})}>
                    {COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                  <input className="input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="3001234567" />
                </div>
              </div>
              <div><label>Email</label><input className="input" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
              <div><label>Address</label><input className="input" value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><label>Opening Balance</label><input className="input" type="number" value={form.opening_balance} onChange={e => setForm({...form, opening_balance: parseFloat(e.target.value) || 0})} /></div>
                <div>
                  <label>Payment Terms</label>
                  <select className="input" value={form.payment_terms} onChange={e => setForm({...form, payment_terms: e.target.value})}>
                    {PAYMENT_TERMS.map(term => <option key={term} value={term}>{term}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label>Default Project</label>
                  <select className="input" value={form.default_project_id ?? ""} onChange={e => setForm({...form, default_project_id: e.target.value ? Number(e.target.value) : null})}>
                    <option value="">— None —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label>Default Location</label>
                  <select className="input" value={form.default_location_id ?? ""} onChange={e => setForm({...form, default_location_id: e.target.value ? Number(e.target.value) : null})}>
                    <option value="">— None —</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label>Default Activity</label>
                <select className="input" value={form.default_activity_id ?? ""} onChange={e => setForm({...form, default_activity_id: e.target.value ? Number(e.target.value) : null})}>
                  <option value="">— None —</option>
                  {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              {/* History */}
              {editingSupplier && (
                <div style={{ borderTop: "1px solid #1E293B", paddingTop: 14, marginTop: 4 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 8 }}>📝 Change History</h4>
                  <RecordHistory tableName="suppliers" recordId={String(editingSupplier.id)} />
                </div>
              )}
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #1E293B", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-outline" style={{ background: "#1E3A8A", color: "white", borderColor: "#1E3A8A" }} onClick={handleSave} disabled={saving || !form.name.trim()}>{saving ? "Saving..." : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}