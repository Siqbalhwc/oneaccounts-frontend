"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Edit, Trash2, X } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

interface Entity {
  id: number
  name: string
  is_active: boolean
  description?: string
  code?: string
  project_name?: string
  location_name?: string
}

export default function ProjectsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const canEdit = role === "admin" || role === "accountant"
  const canView = role === "admin" || role === "accountant"

  const [activeTab, setActiveTab] = useState<"projects" | "locations" | "activities" | "donors">("projects")
  const [items, setItems] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<Entity | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [flash, setFlash] = useState("")
  const [formName, setFormName] = useState("")
  const [formDesc, setFormDesc] = useState("")
  const [formCode, setFormCode] = useState("")   // for donors
  const [formActive, setFormActive] = useState(true)
  const [formProjectId, setFormProjectId] = useState<number | null>(null)   // for activities
  const [formLocationId, setFormLocationId] = useState<number | null>(null) // for activities
  const [saving, setSaving] = useState(false)
  const [companyId, setCompanyId] = useState<string>("")

  const [projects, setProjects] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

      // Load projects and locations for dropdowns
      supabase.from("projects").select("id,name").eq("company_id", cid).order("name")
        .then(r => r.data && setProjects(r.data))
      supabase.from("locations").select("id,name").eq("company_id", cid).order("name")
        .then(r => r.data && setLocations(r.data))
    })
  }, [])

  const fetchData = async () => {
    if (!companyId) return
    setLoading(true)
    let query: any
    if (activeTab === "projects") {
      query = supabase.from("projects").select("*").eq("company_id", companyId).order("name")
    } else if (activeTab === "locations") {
      query = supabase.from("locations").select("*").eq("company_id", companyId).order("name")
    } else if (activeTab === "donors") {
      query = supabase.from("donors").select("*").eq("company_id", companyId).order("name")
    } else { // activities
      query = supabase.from("activities")
        .select("*, projects(name), locations(name)")
        .eq("company_id", companyId)
        .order("name")
    }
    const { data } = await query
    if (activeTab === "activities" && data) {
      // Flatten the joined data
      setItems(data.map((a: any) => ({
        ...a,
        project_name: a.projects?.name,
        location_name: a.locations?.name,
      })))
    } else {
      setItems(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [companyId, activeTab])

  if (!companyId) return <div style={{ padding: 24, textAlign: "center" }}>Loading...</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center" }}><h2>Access Denied</h2></div>

  const openNew = () => {
    setEditingItem(null)
    setFormName("")
    setFormDesc("")
    setFormCode("")
    setFormActive(true)
    setFormProjectId(null)
    setFormLocationId(null)
    setShowModal(true)
  }

  const openEdit = (item: Entity) => {
    setEditingItem(item)
    setFormName(item.name)
    setFormDesc((item as any).description || "")
    setFormCode((item as any).code || "")
    setFormActive(item.is_active)
    setFormProjectId((item as any).project_id || null)
    setFormLocationId((item as any).location_id || null)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formName.trim() || !companyId) return
    if (activeTab === "activities" && (!formProjectId || !formLocationId)) {
      setFlash("⚠️ Project and Location are required for activities.")
      return
    }
    setSaving(true)

    const payload: any = {
      company_id: companyId,
      name: formName.trim(),
      is_active: formActive,
    }

    if (activeTab === "projects") payload.description = formDesc.trim()
    else if (activeTab === "donors") payload.code = formCode.trim() || null
    else if (activeTab === "activities") {
      payload.project_id = formProjectId
      payload.location_id = formLocationId
    }

    const table = activeTab === "projects" ? "projects" : activeTab === "locations" ? "locations" : activeTab === "activities" ? "activities" : "donors"

    if (editingItem) {
      await supabase.from(table).update(payload).eq("id", editingItem.id).eq("company_id", companyId)
      setFlash("✅ Updated!")
    } else {
      const { error } = await supabase.from(table).insert(payload)
      if (error) { setFlash("Error: " + error.message); setSaving(false); return }
      setFlash("✅ Created!")
    }

    setSaving(false)
    setShowModal(false)
    fetchData()
    setTimeout(() => setFlash(""), 3000)
  }

  const handleDelete = async () => {
    if (!deleteId || !companyId) return
    const table = activeTab === "projects" ? "projects" : activeTab === "locations" ? "locations" : activeTab === "activities" ? "activities" : "donors"
    await supabase.from(table).delete().eq("id", deleteId).eq("company_id", companyId)
    setDeleteId(null)
    setFlash("✅ Deleted.")
    fetchData()
    setTimeout(() => setFlash(""), 3000)
  }

  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: "projects", label: "Projects" },
    { key: "locations", label: "Locations" },
    { key: "activities", label: "Activities" },
    { key: "donors", label: "Donors" },
  ]

  const getEntityLabel = () => activeTab.charAt(0).toUpperCase() + activeTab.slice(1)

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <style>{`
        .pr-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
        .pr-title { font-size: 22px; font-weight: 800; color: #1E293B; }
        .pr-subtitle { font-size: 13px; color: #94A3B8; margin-top: 2px; }
        .pr-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
        .pr-btn-primary { background: linear-gradient(135deg, #1740C8, #071352); color: white; }
        .pr-btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .pr-tabs { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
        .pr-tab { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #E2E8F0; background: white; color: #475569; }
        .pr-tab.active { background: #1E3A8A; color: white; border-color: #1E3A8A; }
        .pr-table { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
        .pr-table-header { display: grid; grid-template-columns: ${activeTab === "activities" ? "1fr 100px 100px 60px 60px 60px" : activeTab === "donors" ? "1fr 80px 60px 60px 60px" : "1fr 100px 60px 60px"}; padding: 10px 16px; border-bottom: 2px solid #E2E8F0; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94A3B8; align-items: center; }
        .pr-table-row { display: grid; grid-template-columns: ${activeTab === "activities" ? "1fr 100px 100px 60px 60px 60px" : activeTab === "donors" ? "1fr 80px 60px 60px 60px" : "1fr 100px 60px 60px"}; padding: 10px 16px; border-bottom: 1px solid #F1F5F9; align-items: center; font-size: 13px; }
        .pr-table-row:hover { background: #FAFBFF; }
        .pr-icon-btn { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 6px; color: #94A3B8; display: inline-flex; }
        .pr-icon-btn:hover { background: #F1F5F9; color: #475569; }
        .pr-icon-btn.danger:hover { background: #FEE2E2; color: #EF4444; }
        .pr-empty { padding: 40px; textAlign: center; color: #94A3B8; }
        .pr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .pr-modal { background: white; border-radius: 14px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; }
        .pr-modal-header { padding: 20px 24px; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; }
        .pr-modal-title { font-size: 18px; font-weight: 700; color: #1E293B; }
        .pr-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
        .pr-field-label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; }
        .pr-field-input { width: 100%; height: 40px; border: 1.5px solid #E5EAF2; border-radius: 9px; padding: 0 14px; font-size: 13px; font-family: inherit; background: #FAFBFF; outline: none; }
        .pr-modal-footer { padding: 16px 24px; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 8px; }
      `}</style>

      <div className="pr-header">
        <div>
          <div className="pr-title">📁 Projects & Activities</div>
          <div className="pr-subtitle">Manage projects, locations, activities, and donors for budgeting and tracking</div>
        </div>
      </div>

      <div className="pr-tabs">
        {tabs.map(t => (
          <button key={t.key} className={`pr-tab ${activeTab === t.key ? "active" : ""}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {flash && (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {flash}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        {canEdit && (
          <button className="pr-btn pr-btn-primary" onClick={openNew}>
            <Plus size={16} /> Add {getEntityLabel().slice(0, -1)}
          </button>
        )}
      </div>

      <div className="pr-table">
        <div className="pr-table-header">
          <span>Name</span>
          {activeTab === "activities" && <><span>Project</span><span>Location</span></>}
          {activeTab === "donors" && <span>Code</span>}
          <span>Active</span>
          <span></span>
          <span></span>
        </div>
        {loading ? (
          <div className="pr-empty">Loading...</div>
        ) : items.length === 0 ? (
          <div className="pr-empty">No {getEntityLabel().toLowerCase()} found. Create one above.</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="pr-table-row">
              <span style={{ fontWeight: 600 }}>{item.name}{item.description ? <span style={{ fontSize: 11, color: "#64748B", marginLeft: 8 }}>({item.description})</span> : ""}</span>
              {activeTab === "activities" && <><span>{item.project_name}</span><span>{item.location_name}</span></>}
              {activeTab === "donors" && <span style={{ fontFamily: "monospace", fontSize: 12 }}>{(item as any).code || "—"}</span>}
              <span>{item.is_active ? "✅" : "❌"}</span>
              <button className="pr-icon-btn" onClick={() => openEdit(item)}><Edit size={14} /></button>
              <button className="pr-icon-btn danger" onClick={() => setDeleteId(item.id)}><Trash2 size={14} /></button>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && canEdit && (
        <div className="pr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pr-modal" onClick={e => e.stopPropagation()}>
            <div className="pr-modal-header">
              <div className="pr-modal-title">{editingItem ? "✏️ Edit" : "➕ Add"} {getEntityLabel().slice(0, -1)}</div>
              <button className="pr-icon-btn" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="pr-modal-body">
              <div>
                <label className="pr-field-label">Name *</label>
                <input className="pr-field-input" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Enter name" />
              </div>
              {activeTab === "projects" && (
                <div>
                  <label className="pr-field-label">Description (optional)</label>
                  <input className="pr-field-input" value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Brief description" />
                </div>
              )}
              {activeTab === "donors" && (
                <div>
                  <label className="pr-field-label">Code (optional)</label>
                  <input className="pr-field-input" value={formCode} onChange={e => setFormCode(e.target.value)} placeholder="e.g., UNICEF, GIZ" />
                </div>
              )}
              {activeTab === "activities" && (
                <>
                  <div>
                    <label className="pr-field-label">Project *</label>
                    <select className="pr-field-input" value={formProjectId ?? ""} onChange={e => setFormProjectId(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">— Select Project —</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="pr-field-label">Location *</label>
                    <select className="pr-field-input" value={formLocationId ?? ""} onChange={e => setFormLocationId(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">— Select Location —</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={formActive} onChange={e => setFormActive(e.target.checked)} />
                <span style={{ fontSize: 13 }}>Active</span>
              </div>
            </div>
            <div className="pr-modal-footer">
              <button className="pr-btn pr-btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="pr-btn pr-btn-primary" onClick={handleSave} disabled={saving || !formName.trim() || (activeTab === "activities" && (!formProjectId || !formLocationId))}>
                {saving ? "Saving..." : "💾 Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && canEdit && (
        <div className="pr-modal-overlay">
          <div className="pr-modal" style={{ maxWidth: 400 }}>
            <div className="pr-modal-header"><div className="pr-modal-title">⚠️ Delete?</div></div>
            <div className="pr-modal-body" style={{ textAlign: "center" }}><p style={{ color: "#EF4444" }}>This cannot be undone.</p></div>
            <div className="pr-modal-footer" style={{ justifyContent: "center" }}>
              <button className="pr-btn pr-btn-outline" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="pr-btn pr-btn-primary" style={{ background: "#EF4444" }} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}