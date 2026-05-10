"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import { Plus, Search, Edit, Trash2, X, Send } from "lucide-react"

interface Customer {
  id: number
  code: string
  name: string
  country_code: string
  phone: string
  email: string
  address: string
  payment_terms: string
  opening_balance: number
  balance: number
}

const COUNTRY_CODES = [
  "+1", "+7", "+20", "+27", "+30", "+31", "+32", "+33", "+34", "+36",
  "+39", "+40", "+41", "+43", "+44", "+45", "+46", "+47", "+48", "+49",
  "+51", "+52", "+54", "+55", "+56", "+57", "+58", "+60", "+61", "+62",
  "+63", "+64", "+65", "+66", "+81", "+82", "+84", "+86", "+90", "+91",
  "+92", "+93", "+94", "+95", "+98", "+212", "+213", "+216", "+218",
  "+220", "+221", "+222", "+223", "+224", "+225", "+226", "+227", "+228",
  "+229", "+230", "+231", "+232", "+233", "+234", "+235", "+236", "+237",
  "+238", "+239", "+240", "+241", "+242", "+243", "+244", "+245", "+246",
  "+247", "+248", "+249", "+250", "+251", "+252", "+253", "+254", "+255",
  "+256", "+257", "+258", "+260", "+261", "+262", "+263", "+264", "+265",
  "+266", "+267", "+268", "+269", "+290", "+291", "+297", "+298", "+299",
  "+350", "+351", "+352", "+353", "+354", "+355", "+356", "+357", "+358",
  "+359", "+370", "+371", "+372", "+373", "+374", "+375", "+376", "+377",
  "+378", "+379", "+380", "+381", "+382", "+383", "+385", "+386", "+387",
  "+389", "+420", "+421", "+423", "+500", "+501", "+502", "+503", "+504",
  "+505", "+506", "+507", "+508", "+509", "+590", "+591", "+592", "+593",
  "+594", "+595", "+596", "+597", "+598", "+599", "+670", "+672", "+673",
  "+674", "+675", "+676", "+677", "+678", "+679", "+680", "+681", "+682",
  "+683", "+685", "+686", "+687", "+688", "+689", "+690", "+691", "+692",
  "+850", "+852", "+853", "+855", "+856", "+880", "+886", "+960", "+961",
  "+962", "+963", "+964", "+965", "+966", "+967", "+968", "+970", "+971",
  "+972", "+973", "+974", "+975", "+976", "+977", "+992", "+993", "+994",
  "+995", "+996", "+998"
]

export default function CustomersPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role, loading: roleLoading } = useRole()
  const { hasFeature } = usePlan()
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
    country_code: "+92",
    phone: "",
    email: "",
    address: "",
    payment_terms: "Net 30",
    opening_balance: 0,
    post_as_invoice: true,
  })
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState("")
  const [formError, setFormError] = useState("")

  // get company ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // fetch customers
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

  const getWhatsAppLink = (cust: Customer) => {
    if (!hasFeature("whatsapp_invoice")) return ""
    const phone = (cust.country_code || "").replace(/\D/g, "") + (cust.phone || "").replace(/\D/g, "")
    if (!phone) return ""
    const msg = `Dear ${cust.name},\n\nThank you for your business. Please find your invoice details attached or contact us for any queries.\n\n— OneAccounts`
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
  }

  const openNew = () => {
    setEditingCustomer(null)
    setForm({
      name: "",
      country_code: "+92",
      phone: "",
      email: "",
      address: "",
      payment_terms: "Net 30",
      opening_balance: 0,
      post_as_invoice: true,
    })
    setFormError("")
    setShowModal(true)
  }

  const openEdit = (cust: Customer) => {
    setEditingCustomer(cust)
    setForm({
      name: cust.name,
      country_code: cust.country_code || "+92",
      phone: cust.phone || "",
      email: cust.email || "",
      address: cust.address || "",
      payment_terms: cust.payment_terms || "Net 30",
      opening_balance: cust.opening_balance || 0,
      post_as_invoice: false,
    })
    setFormError("")
    setShowModal(true)
  }

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

  const handleSave = async () => {
    if (!form.name.trim() || !companyId) return
    setSaving(true)
    setFormError("")
    setFlash("")

    const payload = {
      company_id: companyId,
      name: form.name.trim(),
      country_code: form.country_code,
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      payment_terms: form.payment_terms,
      opening_balance: form.opening_balance,
      balance: form.opening_balance,
    }

    let errorMsg = ""
    let createdCustomerId: number | null = null

    if (editingCustomer) {
      const { error } = await supabase
        .from("customers")
        .update(payload)
        .eq("id", editingCustomer.id)
        .eq("company_id", companyId)
      if (error) errorMsg = error.message
      else {
        setFlash("✅ Customer updated!")
        createdCustomerId = editingCustomer.id
      }
    } else {
      const code = await getNextCode()
      const { data: newCust, error } = await supabase
        .from("customers")
        .insert({ ...payload, code })
        .select("id")
        .single()
      if (error) errorMsg = error.message
      else {
        setFlash("✅ Customer created!")
        createdCustomerId = newCust.id
      }
    }

    // Opening invoice logic remains the same (intact from your original)
    if (!errorMsg && createdCustomerId && form.opening_balance > 0 && form.post_as_invoice) {
      try {
        const { data: custData } = await supabase
          .from("customers")
          .select("code")
          .eq("id", createdCustomerId)
          .single()

        const custCode = custData?.code || "CUST"
        const invNo = `OPEN-${custCode}-01`

        const { data: inv, error: invErr } = await supabase
          .from("invoices")
          .insert({
            company_id: companyId,
            invoice_no: invNo,
            type: "sale",
            party_id: createdCustomerId,
            date: new Date().toISOString().split("T")[0],
            due_date: new Date().toISOString().split("T")[0],
            total: form.opening_balance,
            paid: 0,
            status: "Unpaid",
            reference: "Opening Balance",
          })
          .select("id")
          .single()

        if (invErr) throw new Error(invErr.message)

        const arAcc = await supabase.from("accounts").select("id").eq("code", "1100").eq("company_id", companyId).single()
        const equityAcc = await supabase.from("accounts").select("id").eq("code", "3100").eq("company_id", companyId).single()
        if (arAcc.data && equityAcc.data) {
          const { data: entry } = await supabase.from("journal_entries").insert({
            company_id: companyId,
            entry_no: `JE-OPEN-${createdCustomerId}`,
            date: new Date().toISOString().split("T")[0],
            description: `Opening Balance - Customer ${custCode}`,
          }).select("id").single()

          if (entry) {
            await supabase.from("journal_lines").insert([
              { company_id: companyId, entry_id: entry.id, account_id: arAcc.data.id, debit: form.opening_balance, credit: 0 },
              { company_id: companyId, entry_id: entry.id, account_id: equityAcc.data.id, debit: 0, credit: form.opening_balance },
            ])
          }
        }

        setFlash("✅ Customer created & opening invoice posted!")
      } catch (e: any) {
        setFlash("✅ Customer created, but opening invoice failed: " + e.message)
      }
    }

    setSaving(false)

    if (errorMsg) {
      setFormError(errorMsg)
      setFlash("Error: " + errorMsg)
    } else {
      setShowModal(false)
      fetchCustomers()
      setTimeout(() => setFlash(""), 4000)
    }
  }

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

  // Combined guard – wait for company and role
  if (!companyId || roleLoading || !role) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading…</div>
  }
  if (!canView) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
      </div>
    )
  }

  // ... rest of the component (exactly the same JSX you already have, after the guards)
  // The full JSX from your original customers page (the table, modal, etc.) should be here.
  // For brevity, I'm including the return block from your original code immediately after the guard.
  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .input { width: 100%; height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; }
        .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-primary { background: #1D4ED8; color: white; }
        .btn-outline { background: white; border: 1.5px solid #E2E8F0; color: #475569; }
        .btn-danger { background: #EF4444; color: white; }
        .btn-success { background: #25D366; color: white; }
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
        .form-error { background: #FEF2F2; border: 1px solid #FECACA; color: #B91C1C; padding: 8px 12px; border-radius: 6px; font-size: 13px; }
        .chk-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #1E293B; }
        .chk-label input { width: 18px; height: 18px; accent-color: #1D4ED8; }
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
        <div style={{ background: flash.startsWith("Error") ? "#FEF2F2" : "#F0FDF4", border: flash.startsWith("Error") ? "1px solid #FECACA" : "1px solid #BBF7D0", color: flash.startsWith("Error") ? "#B91C1C" : "#15803D", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 20 }}>Loading...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 20, color: "#94A3B8" }}>
                {search ? "No matching customers found." : "No customers yet. Add your first customer above."}
              </td></tr>
            ) : (
              customers.map((cust) => {
                const waLink = getWhatsAppLink(cust)
                return (
                  <tr key={cust.id}>
                    <td style={{ fontWeight: 600 }}>{cust.code}</td>
                    <td>{cust.name}</td>
                    <td>{cust.country_code} {cust.phone}</td>
                    <td>{cust.email || "—"}</td>
                    <td>{cust.payment_terms}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {cust.balance?.toLocaleString()}</td>
                    <td>
                      {waLink && (
                        <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-success" style={{ padding: "4px 8px" }}>
                          <Send size={14} />
                        </a>
                      )}
                    </td>
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
                )
              })
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

      {/* Add/Edit Modal */}
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
              {formError && <div className="form-error">{formError}</div>}
              <div>
                <label className="pr-field-label">Name *</label>
                <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Customer name" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
                <div>
                  <label className="pr-field-label">Country Code</label>
                  <select className="input" value={form.country_code} onChange={e => setForm({...form, country_code: e.target.value})}>
                    {COUNTRY_CODES.map(code => <option key={code} value={code}>{code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="pr-field-label">Phone (for WhatsApp)</label>
                  <input className="input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="3001234567" />
                </div>
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
              {form.opening_balance > 0 && !editingCustomer && (
                <div className="chk-label">
                  <input
                    type="checkbox"
                    checked={form.post_as_invoice}
                    onChange={e => setForm({...form, post_as_invoice: e.target.checked})}
                  />
                  <span>Post as Opening Invoice</span>
                </div>
              )}
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