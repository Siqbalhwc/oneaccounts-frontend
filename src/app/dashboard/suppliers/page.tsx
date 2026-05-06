"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Search, Edit, Trash2, X, Check } from "lucide-react"
import { CsvExport } from "@/components/CsvExport"
import { CsvImport } from "@/components/CsvImport"
import { usePlan } from "@/contexts/PlanContext"
import Pagination from "@/components/Pagination"

interface Supplier {
  id: number
  code: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  balance: number
  default_project_id?: number | null
  default_location_id?: number | null
  default_activity_id?: number | null
}

const COUNTRIES = [
  { code: "+92",  pattern: /^92\d{10}$/,  label: "🇵🇰 Pakistan (+92)" },
  { code: "+44",  pattern: /^44\d{10}$/,  label: "🇬🇧 UK (+44)" },
  { code: "+971", pattern: /^971\d{9}$/,  label: "🇦🇪 UAE (+971)" },
  { code: "+91",  pattern: /^91\d{10}$/,  label: "🇮🇳 India (+91)" },
  { code: "+1",   pattern: /^1\d{10}$/,   label: "🇺🇸 USA (+1)" },
]

export default function SuppliersPage() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { hasFeature } = usePlan()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [filtered, setFiltered] = useState<Supplier[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [flash, setFlash] = useState<{type: string, msg: string} | null>(null)

  // Form fields
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [countryCode, setCountryCode] = useState("+92")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [openingBalance, setOpeningBalance] = useState(0)
  const [defaultProjectId, setDefaultProjectId] = useState<number | null>(null)
  const [defaultLocationId, setDefaultLocationId] = useState<number | null>(null)
  const [defaultActivityId, setDefaultActivityId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // Lookup lists
  const [projects, setProjects] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])

  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)
  const [companyId, setCompanyId] = useState<string>("")

  // ── Get company ID and lookup lists ───────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
        || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

      // Fetch the three lookup lists (company‑scoped)
      supabase.from("projects").select("id, name").eq("company_id", cid).order("name").then(r => r.data && setProjects(r.data))
      supabase.from("locations").select("id, name").eq("company_id", cid).order("name").then(r => r.data && setLocations(r.data))
      supabase.from("activities").select("id, name").eq("company_id", cid).order("name").then(r => r.data && setActivities(r.data))
    })
  }, [])

  const fetchSuppliers = async () => {
    if (!companyId) return
    setLoading(true)
    const { count } = await supabase.from("suppliers").select("*", { count: "exact", head: true }).eq("company_id", companyId)
    setTotal(count || 0)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const { data } = await supabase.from("suppliers").select("*").eq("company_id", companyId).order("code").range(from, to)
    if (data) { setSuppliers(data); setFiltered(data) }
    setLoading(false)
  }

  useEffect(() => { fetchSuppliers() }, [companyId, page, pageSize])

  useEffect(() => {
    if (!search.trim()) { setFiltered(suppliers); return }
    const s = search.toLowerCase()
    setFiltered(suppliers.filter(c => c.code.toLowerCase().includes(s) || c.name.toLowerCase().includes(s) || (c.phone && c.phone.includes(s))))
  }, [search, suppliers])

  const generateCode = () => {
    const max = suppliers.reduce((m, c) => { const n = parseInt(c.code?.split("-")[1]) || 0; return n > m ? n : m }, 0)
    return `VEND-${String(max + 1).padStart(3, "0")}`
  }

  const formatPhoneForWhatsApp = (raw: string): { valid: boolean; formatted: string; error?: string } => {
    const digits = raw.replace(/\D/g, "")
    if (digits.length === 0) return { valid: true, formatted: "" }
    if (digits.startsWith("92") && digits.length === 12) return { valid: true, formatted: digits }
    if (digits.startsWith("0") && digits.length === 11) return { valid: true, formatted: "92" + digits.slice(1) }
    return { valid: false, formatted: "", error: "Invalid WhatsApp number. Must be 03xx-xxxxxxx or 92xxxxxxxxxx." }
  }

  const openNew = () => {
    setEditing(null)
    setCode(generateCode()); setName(""); setCountryCode("+92"); setPhone(""); setEmail(""); setAddress("")
    setOpeningBalance(0); setDefaultProjectId(null); setDefaultLocationId(null); setDefaultActivityId(null)
    setShowModal(true)
  }

  const openEdit = (c: Supplier) => {
    setEditing(c); setCode(c.code); setName(c.name)
    const savedPhone = c.phone || ""
    const found = COUNTRIES.find(cntry => savedPhone.startsWith(cntry.code.replace("+", "")))
    if (found) { setCountryCode(found.code); setPhone(savedPhone.slice(found.code.replace("+", "").length)) }
    else { setCountryCode("+92"); setPhone(savedPhone) }
    setEmail(c.email || ""); setAddress(c.address || "")
    setOpeningBalance(c.balance)
    setDefaultProjectId(c.default_project_id || null)
    setDefaultLocationId(c.default_location_id || null)
    setDefaultActivityId(c.default_activity_id || null)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!code.trim() || !name.trim() || !companyId) return
    const phoneCheck = formatPhoneForWhatsApp(phone)
    if (!phoneCheck.valid) { setFlash({ type: "error", msg: phoneCheck.error || "Invalid phone number" }); return }
    setSaving(true)
    const payload = {
      company_id: companyId,
      code: code.trim(),
      name: name.trim(),
      phone: phoneCheck.formatted || null,
      email: email.trim() || null,
      address: address.trim() || null,
      balance: openingBalance,
      opening_balance: openingBalance,
      default_project_id: defaultProjectId,
      default_location_id: defaultLocationId,
      default_activity_id: defaultActivityId,
    }
    if (editing) {
      await supabase.from("suppliers").update(payload).eq("id", editing.id).eq("company_id", companyId)
      setFlash({ type: "success", msg: `Supplier '${name}' updated!` })
    } else {
      const { data: newSupp, error: insertErr } = await supabase.from("suppliers").insert(payload).select("id").single()
      if (insertErr || !newSupp) { setFlash({ type: "error", msg: insertErr?.message || "Insert failed" }); setSaving(false); return }
      setFlash({ type: "success", msg: `Supplier '${name}' added!` })
      if (openingBalance > 0) {
        await fetch("/api/suppliers/opening-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ supplierId: newSupp.id, supplierName: name.trim(), amount: openingBalance }),
        }).catch(console.error)
      }
    }
    setSaving(false); setShowModal(false); fetchSuppliers()
    setTimeout(() => setFlash(null), 3000)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from("suppliers").delete().eq("id", deleteId).eq("company_id", companyId)
    setDeleteId(null); setFlash({ type: "success", msg: "Supplier deleted." }); fetchSuppliers()
    setTimeout(() => setFlash(null), 3000)
  }

  const handleImport = async (rows: any[]) => {
    for (const row of rows) {
      const phoneCheck = formatPhoneForWhatsApp(row.phone || "")
      await supabase.from("suppliers").insert({
        company_id: companyId,
        code: row.code || `VEND-${Date.now()}`, name: row.name || "Unnamed",
        phone: phoneCheck.formatted || null, email: row.email || null,
        address: row.address || null, balance: parseFloat(row.balance) || 0, opening_balance: parseFloat(row.opening_balance) || 0
      })
    }
    fetchSuppliers()
    setFlash({ type: "success", msg: "Import completed!" })
    setTimeout(() => setFlash(null), 3000)
  }

  const totalPayables = filtered.reduce((s, c) => s + (c.balance || 0), 0)

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .sp-shell { max-width: 1200px; margin: 0 auto; }
        .sp-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
        .sp-title { font-size: clamp(18px, 1.8vw, 24px); font-weight: 800; color: #1E293B; }
        .sp-subtitle { font-size: 13px; color: #94A3B8; margin-top: 2px; }
        .sp-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .sp-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .sp-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; box-shadow: 0 2px 8px rgba(7,19,82,0.25); }
        .sp-btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .sp-search { position: relative; max-width: 320px; margin-bottom: 16px; }
        .sp-search input { width: 100%; height: 40px; border: 1.5px solid #E2E8F0; border-radius: 9px; padding: 0 14px 0 38px; font-size: 13px; font-family: inherit; background: white; outline: none; }
        .sp-search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94A3B8; }
        .sp-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 20px; }
        .sp-stat-card { background: white; border-radius: 10px; border: 1px solid #E2E8F0; padding: 14px 16px; }
        .sp-stat-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94A3B8; margin-bottom: 4px; }
        .sp-stat-value { font-size: 22px; font-weight: 800; color: #EF4444; }
        .sp-table-wrap { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
        .sp-table-header { display: grid; grid-template-columns: 100px 1fr 130px 100px 100px 60px 60px; padding: 10px 16px; border-bottom: 2px solid #E2E8F0; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94A3B8; align-items: center; }
        .sp-table-row { display: grid; grid-template-columns: 100px 1fr 130px 100px 100px 60px 60px; padding: 10px 16px; border-bottom: 1px solid #F1F5F9; align-items: center; font-size: 13px; }
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
        .sp-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .sp-modal-footer { padding: 16px 24px; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 8px; }
        @media (max-width: 768px) { .sp-table-header, .sp-table-row { grid-template-columns: 80px 1fr 100px 60px 60px; } .sp-hide-mobile { display: none; } }
        @media (max-width: 480px) { .sp-table-header, .sp-table-row { grid-template-columns: 1fr 80px 50px 50px; } }
      `}</style>

      <div className="sp-shell">
        {flash && <div style={{ background: flash.type === "success" ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${flash.type === "success" ? "#BBF7D0" : "#FECACA"}`, color: flash.type === "success" ? "#15803D" : "#B91C1C", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>{flash.type === "success" ? <Check size={16} /> : <X size={16} />} {flash.msg}</div>}
        <div className="sp-header">
          <div><div className="sp-title">🚚 Suppliers</div><div className="sp-subtitle">Manage supplier accounts and payables</div></div>
          <div className="sp-actions">
            <button className="sp-btn sp-btn-primary" onClick={openNew}><Plus size={16} /> Add Supplier</button>
            {hasFeature('csv_import_export') && <><CsvExport data={suppliers} filename="suppliers" /><CsvImport onImport={handleImport} /></>}
          </div>
        </div>
        <div className="sp-stats">
          <div className="sp-stat-card"><div className="sp-stat-label">Total Suppliers</div><div className="sp-stat-value" style={{color:"#1E3A8A"}}>{filtered.length}</div></div>
          <div className="sp-stat-card"><div className="sp-stat-label">Total Payables</div><div className="sp-stat-value">PKR {totalPayables.toLocaleString()}</div></div>
        </div>
        <div className="sp-search">
          <Search size={16} />
          <input type="text" placeholder="Search by code, name or phone..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="sp-table-wrap">
          <div className="sp-table-header">
            <span>Code</span>
            <span>Name</span>
            <span>Phone</span>
            <span style={{ textAlign: "right" }}>Terms</span>
            <span style={{ textAlign: "right" }}>Balance</span>
            <span></span>
            <span></span>
          </div>
          {loading ? <div className="sp-empty">Loading...</div> : filtered.length === 0 ? <div className="sp-empty">No suppliers found.</div> :
            filtered.map(c => (
              <div key={c.id} className="sp-table-row">
                <span className="sp-code">{c.code}</span>
                <span className="sp-name">{c.name}</span>
                <span style={{ fontSize: 12, color: "#64748B" }}>{c.phone || "—"}</span>
                <span style={{ textAlign: "right", fontSize: 12, color: "#64748B" }}>Net 30</span>
                <span className="sp-balance">PKR {(c.balance || 0).toLocaleString()}</span>
                <button className="sp-icon-btn" onClick={() => openEdit(c)}><Edit size={14} /></button>
                <button className="sp-icon-btn danger" onClick={() => setDeleteId(c.id)}><Trash2 size={14} /></button>
              </div>
            ))
          }
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="sp-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="sp-modal" onClick={e => e.stopPropagation()}>
            <div className="sp-modal-header"><div className="sp-modal-title">{editing ? "✏️ Edit Supplier" : "➕ Add Supplier"}</div><button className="sp-icon-btn" onClick={() => setShowModal(false)}><X size={18} /></button></div>
            <div className="sp-modal-body">
              <div className="sp-field-row">
                <div>
                  <label className="sp-field-label">Code</label>
                  <input className="sp-field-input" value={code} readOnly style={{ background: "#f1f5f9", color: "#64748b" }} />
                </div>
                <div>
                  <label className="sp-field-label">Name *</label>
                  <input className="sp-field-input" value={name} onChange={e => setName(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="sp-field-label">Phone (WhatsApp)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <select className="sp-field-input" style={{ width: 160, background: "#FAFBFF" }} value={countryCode} onChange={e => setCountryCode(e.target.value)}>
                    {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                  <input className="sp-field-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Enter local number" style={{ flex: 1 }} />
                </div>
                <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>Select country code and enter the local number</div>
              </div>
              <div className="sp-field-row">
                <div><label className="sp-field-label">Email</label><input className="sp-field-input" value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div><label className="sp-field-label">Address</label><input className="sp-field-input" value={address} onChange={e => setAddress(e.target.value)} /></div>
              </div>

              {/* ── NEW: Default Project / Location / Activity ─── */}
              <div className="sp-field-label" style={{ marginTop: 8 }}>Default Budget Tags</div>
              <div className="sp-field-row">
                <div>
                  <label className="sp-field-label">Project</label>
                  <select className="sp-field-input" value={defaultProjectId ?? ""} onChange={e => setDefaultProjectId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">— None —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="sp-field-label">Location</label>
                  <select className="sp-field-input" value={defaultLocationId ?? ""} onChange={e => setDefaultLocationId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">— None —</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="sp-field-row">
                <div>
                  <label className="sp-field-label">Activity</label>
                  <select className="sp-field-input" value={defaultActivityId ?? ""} onChange={e => setDefaultActivityId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">— None —</option>
                    {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              {/* ── End of new fields ── */}

              <div><label className="sp-field-label">Opening Balance (PKR)</label><input className="sp-field-input" type="number" value={openingBalance} onChange={e => setOpeningBalance(Number(e.target.value))} /></div>
            </div>
            <div className="sp-modal-footer">
              <button className="sp-btn sp-btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="sp-btn sp-btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "💾 Save"}</button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="sp-modal-overlay">
          <div className="sp-modal" style={{ maxWidth: 400 }}>
            <div className="sp-modal-header"><div className="sp-modal-title">⚠️ Delete?</div></div>
            <div className="sp-modal-body" style={{ textAlign: "center" }}><p style={{ color: "#EF4444" }}>Cannot be undone.</p></div>
            <div className="sp-modal-footer" style={{ justifyContent: "center" }}>
              <button className="sp-btn sp-btn-outline" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="sp-btn sp-btn-primary" style={{ background: "#EF4444" }} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}