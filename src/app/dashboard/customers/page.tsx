"use client"

import { useState, useEffect, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, Edit, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown, FileText, Download, Upload } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import { getWhatsAppLink } from "@/lib/whatsapp"

type SortField = "code" | "name" | "phone" | "balance"
type SortDir = "asc" | "desc"

function SkeletonRow() {
  return (
    <tr>
      {[60, 70, 80, 50, 80].map((w, i) => (
        <td key={i} style={{ padding: "12px 16px" }}>
          <div style={{
            width: `${w}%`,
            height: 12,
            background: "var(--bg-soft)",
            borderRadius: 4,
            animation: "shimmer 1.5s ease-in-out infinite"
          }} />
        </td>
      ))}
    </tr>
  )
}

export default function CustomersPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role, loading: roleLoading } = useRole()
  const { hasFeature } = usePlan()
  const showImportExport = hasFeature("csv_import_export")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState("")
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState("")

  // ── Fetch company ID from JWT ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // ── Fetch customers – waits for companyId ──
  useEffect(() => {
    if (!role) return
    if (!canView) { setLoading(false); return }
    if (!companyId) return

    setLoading(true)
    supabase
      .from("customers")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order(sortField === "balance" ? "balance" : sortField, { ascending: sortDir === "asc" })
      .then(({ data }) => {
        setCustomers(data || [])
        setLoading(false)
      })
  }, [role, canView, companyId, sortField, sortDir])

  // ── Filter by search ──
  const filtered = customers.filter((c) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return c.code?.toLowerCase().includes(q) ||
           c.name?.toLowerCase().includes(q) ||
           c.phone?.toLowerCase().includes(q) ||
           c.email?.toLowerCase().includes(q)
  })

  // ── Sorting (already pre‑sorted by DB, but we re-sort client‑side for consistency) ──
  const sortedFiltered = [...filtered].sort((a, b) => {
    let valA: any, valB: any
    if (sortField === "balance") {
      valA = Number(a.balance) || 0
      valB = Number(b.balance) || 0
    } else {
      valA = (a[sortField] || "").toLowerCase()
      valB = (b[sortField] || "").toLowerCase()
    }
    return sortDir === "asc" ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1)
  })

  const totalCustomers = sortedFiltered.length
  const totalReceivables = sortedFiltered.reduce((s, c) => s + (c.balance || 0), 0)
  const activeCustomers = sortedFiltered.filter(c => (c.balance || 0) > 0).length

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("asc") }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this customer? This will not remove their transactions.")) return
    await supabase.from("customers").update({ deleted_at: new Date().toISOString() }).eq("id", id)
    setCustomers(prev => prev.filter(c => c.id !== id))
  }

  // WhatsApp for customer – send a friendly message with balance info
  const sendWhatsApp = (cust: any) => {
    if (!cust.phone) { alert("No phone number for this customer."); return }
    const message = [
      `Dear ${cust.name},`,
      ``,
      `Your current balance with us is PKR ${(cust.balance || 0).toLocaleString()}.`,
      `Thank you for your business!`,
      ``,
      `— OneAccounts`
    ].join("\n")
    const link = getWhatsAppLink(cust.phone, message)
    if (link) window.open(link, "_blank")
  }

  // CSV Export
  const handleExport = () => {
    if (sortedFiltered.length === 0) { alert("No data to export"); return }
    const headers = ["code", "name", "phone", "email", "address", "country_code", "payment_terms", "opening_balance", "balance"]
    const csvRows = [headers.join(",")]
    sortedFiltered.forEach(c => {
      csvRows.push(headers.map(h => (c[h] ?? "").toString().replace(/,/g, " ")).join(","))
    })
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "customers.csv"
    a.click()
    window.URL.revokeObjectURL(url)
  }

  // Download Template
  const downloadTemplate = () => {
    const headers = ["code", "name", "phone", "email", "address", "country_code", "payment_terms", "opening_balance", "balance"]
    const sample = ["C001", "John Doe", "+923001234567", "john@example.com", "123 Street", "+92", "Net 30", "0", "0"]
    const csvRows = [headers.join(","), sample.join(",")]
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "customer_template.csv"
    a.click()
    window.URL.revokeObjectURL(url)
  }

  // Handle file import
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportMessage("")

    const formData = new FormData()
    formData.append("file", file)
    formData.append("table", "customers")
    formData.append("company_id", companyId)

    try {
      const res = await fetch("/api/import", { method: "POST", body: formData })
      const result = await res.json()
      if (result.success) {
        setImportMessage(`✅ Imported ${result.count} customers successfully`)
        const { data } = await supabase
          .from("customers")
          .select("*")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("name")
        setCustomers(data || [])
      } else {
        setImportMessage(`❌ Error: ${result.error}`)
      }
    } catch (err: any) {
      setImportMessage(`❌ Network error: ${err.message}`)
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  // Shared th/td styles (identical to invoice page)
  const thStyle: React.CSSProperties = {
    padding: "12px 16px",
    background: "var(--card-hover)",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    userSelect: "none",
  }
  const tdStyle: React.CSSProperties = {
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
    verticalAlign: "middle",
  }

  const SortTh = ({ field, children, style }: { field: SortField; children: React.ReactNode; style?: React.CSSProperties }) => (
    <th style={{ ...thStyle, ...style }}>
      <button
        onClick={() => handleSort(field)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          font: "inherit", fontSize: 12, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)",
          display: "inline-flex", alignItems: "center", gap: 4, padding: 0,
          whiteSpace: "nowrap",
        }}
      >
        {children} {getSortIcon(field)}
      </button>
    </th>
  )

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
        <style>{`
          @keyframes shimmer {
            0%   { opacity: 0.4; }
            50%  { opacity: 0.8; }
            100% { opacity: 0.4; }
          }
          .cust-table { width: 100%; border-collapse: collapse; }
          .cust-table tbody tr:last-child td { border-bottom: none; }
          .cust-table tbody tr:hover td { background: var(--card-hover); }
          .btn {
            padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
            cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
            background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
            color: white; border: none; transition: all 0.2s;
          }
          .btn:hover {
            background: linear-gradient(135deg, #1E55E8 0%, #0F2280 100%);
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(7,19,82,0.45);
          }
          .btn-outline {
            background: transparent; color: var(--text-muted); border: 1.5px solid var(--border);
          }
          .btn-outline:hover {
            background: var(--card-hover);
            transform: translateY(-1px);
            box-shadow: none;
          }
          .btn-icon {
            background: transparent; border: 1.5px solid var(--border);
            color: var(--text-muted); padding: 5px; border-radius: 6px;
            cursor: pointer; display: inline-flex; align-items: center;
            justify-content: center; flex-shrink: 0; line-height: 1;
          }
          .btn-icon:hover { background: var(--card-hover); }
          .input {
            width: 100%; height: 38px; border: 1.5px solid var(--border);
            border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px;
            background: var(--card); color: var(--text); outline: none;
            box-sizing: border-box;
          }
          .input:focus { border-color: var(--primary); }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 12px; margin-bottom: 20px;
          }
          .summary-item {
            background: var(--card); border: 1px solid var(--border);
            border-radius: 12px; padding: 16px;
          }
          .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
          .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
          .card {
            background: var(--card); border: 1px solid var(--border);
            border-radius: 12px; overflow: hidden;
            box-shadow: var(--shadow-sm);
          }
          .table-scroll {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: thin;
            scrollbar-color: var(--border) transparent;
          }
          .table-scroll::-webkit-scrollbar { height: 4px; }
          .table-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
          .cust-table { min-width: 650px; }

          @media (max-width: 480px) {
            .page-wrap { padding: 12px !important; }
            .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
          }
          .message { padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; }
        `}</style>

        {/* ── Page header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>👥 Customers</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Manage your customer accounts</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {showImportExport && (
              <>
                <button className="btn btn-outline" onClick={downloadTemplate} title="Download CSV template">
                  <FileText size={14} /> Template
                </button>
                <label className="btn btn-outline" style={{ cursor: "pointer" }}>
                  <Upload size={14} /> Import
                  <input type="file" accept=".csv" onChange={handleImport} ref={fileInputRef} style={{ display: "none" }} />
                </label>
                <button className="btn btn-outline" onClick={handleExport} title="Export to CSV">
                  <Download size={14} /> Export
                </button>
              </>
            )}
            {canEdit && (
              <button className="btn" onClick={() => router.push("/dashboard/customers/new")}>
                <Plus size={16} /> Add Customer
              </button>
            )}
          </div>
        </div>

        {importMessage && (
          <div className="message" style={{ background: importMessage.startsWith("✅") ? "#065F46" : "#7C2D12", color: "white" }}>
            {importMessage}
          </div>
        )}

        {/* ── Summary cards ── */}
        <div className="summary-grid">
          <div className="summary-item"><div className="summary-label">Total Customers</div><div className="summary-value">{totalCustomers}</div></div>
          <div className="summary-item"><div className="summary-label">Total Receivables</div><div className="summary-value" style={{ color: totalReceivables >= 0 ? "#10B981" : "#EF4444" }}>PKR {totalReceivables.toLocaleString()}</div></div>
          <div className="summary-item"><div className="summary-label">Active</div><div className="summary-value" style={{ color: "#10B981" }}>{activeCustomers}</div></div>
        </div>

        {/* ── Search ── */}
        <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="input" placeholder="Search by code, name, phone, email..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* ── Table ── */}
        <div className="card">
          <div className="table-scroll">
            <table className="cust-table">
              <colgroup>
                <col style={{ width: 110 }} /> {/* Code */}
                <col />                          {/* Name – takes remaining space */}
                <col style={{ width: 120 }} />  {/* Phone */}
                <col style={{ width: 130 }} />  {/* Balance */}
                <col style={{ width: 140 }} />  {/* Actions */}
              </colgroup>
              <thead>
                <tr>
                  <SortTh field="code">Code</SortTh>
                  <SortTh field="name" style={{ textAlign: "left" }}>Name</SortTh>
                  <SortTh field="phone" style={{ textAlign: "left" }}>Phone</SortTh>
                  <SortTh field="balance" style={{ textAlign: "right" }}>Balance</SortTh>
                  <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
                ) : sortedFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                      No customers found. {canEdit && "Add a customer to get started."}
                    </td>
                  </tr>
                ) : (
                  sortedFiltered.map((cust) => {
                    const balance = cust.balance || 0
                    return (
                      <tr key={cust.id}>
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 600, color: "var(--primary)" }}>{cust.code}</span>
                        </td>
                        <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {cust.name}
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{cust.phone || "—"}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: balance >= 0 ? "#10B981" : "#EF4444", whiteSpace: "nowrap" }}>
                          PKR {balance.toLocaleString()}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                            <button className="btn-icon" onClick={() => router.push(`/dashboard/reports/customer-ledger?customerId=${cust.id}`)} title="View Ledger">
                              <Eye size={13} />
                            </button>
                            {canEdit && (
                              <button className="btn-icon" onClick={() => router.push(`/dashboard/customers/new?id=${cust.id}`)} title="Edit">
                                <Edit size={13} />
                              </button>
                            )}
                            {canEdit && (
                              <button className="btn-icon" onClick={() => handleDelete(cust.id)} style={{ color: "#EF4444" }} title="Delete">
                                <Trash2 size={13} />
                              </button>
                            )}
                            {hasFeature("whatsapp_invoice") && cust.phone && (
                              <button className="btn-icon" onClick={() => sendWhatsApp(cust)} title="Send WhatsApp" style={{ color: "#25D366" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        {importing && <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>Importing...</div>}
      </div>
    </RoleGuard>
  )
}