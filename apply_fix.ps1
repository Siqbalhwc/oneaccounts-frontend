# ============================================================
# OneAccounts - Full, verified overwrite of the two pages
# (single-quoted here-strings used throughout so backticks and
# ${...} in the JSX are never interpreted by PowerShell itself)
# ============================================================

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

# ---------- FILE: dashboard/customers/page.tsx ----------
$file1 = "src\app\dashboard\customers\page.tsx"
$backup1 = "$file1.backup_$timestamp"
Copy-Item -LiteralPath $file1 -Destination $backup1
Write-Host "Backed up $file1 -> $backup1"

$content1 = @'
"use client"

import { useState, useEffect, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, Edit, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown, FileText, Download, Upload } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import { getWhatsAppLink } from "@/lib/whatsapp"
import CustomerVendorLink from "@/components/CustomerVendorLink"

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
  const [showArchived, setShowArchived] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<any>(null)
  const [suppliersForLink, setSuppliersForLink] = useState<any[]>([])

  const refreshLinkData = () => {
    if (!companyId) return
    supabase
      .from("customers")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .then(({ data }) => setCustomers(data || []))
    supabase
      .from("suppliers")
      .select("id, name, phone, balance, linked_customer_id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .then(({ data }) => setSuppliersForLink(data || []))
  }

  // -- Fetch company ID from JWT --
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // -- Fetch customers  waits for companyId --
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

  // -- Fetch suppliers list too, for the vendor-link / net-position feature --
  useEffect(() => {
    if (!companyId) return
    supabase
      .from("suppliers")
      .select("id, name, phone, balance, linked_customer_id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .then(({ data }) => setSuppliersForLink(data || []))
  }, [companyId])

  const visibleCustomers = showArchived ? customers : customers.filter(c => !c.archived_at)

  // -- Filter by search --
  const filtered = visibleCustomers.filter((c) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return c.code?.toLowerCase().includes(q) ||
           c.name?.toLowerCase().includes(q) ||
           c.phone?.toLowerCase().includes(q) ||
           c.email?.toLowerCase().includes(q)
  })

  // -- Sorting (already pre-sorted by DB, but we re-sort client-side for consistency) --
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

  const handleArchiveOrDelete = (cust: any) => {
    setConfirmTarget(cust)
  }

  const confirmArchiveOrDelete = async () => {
    if (!confirmTarget) return
    const cust = confirmTarget
    const hasTransactions = Math.abs(cust.balance || 0) > 0 || Math.abs(cust.opening_balance || 0) > 0

    if (hasTransactions) {
      await supabase.from("customers").update({ archived_at: new Date().toISOString() }).eq("id", cust.id)
      setCustomers(prev => prev.map(c => c.id === cust.id ? { ...c, archived_at: new Date().toISOString() } : c))
    } else {
      await supabase.from("customers").update({ deleted_at: new Date().toISOString() }).eq("id", cust.id)
      setCustomers(prev => prev.filter(c => c.id !== cust.id))
    }
    setConfirmTarget(null)
  }

  const restoreCustomer = async (cust: any) => {
    await supabase.from("customers").update({ archived_at: null }).eq("id", cust.id)
    setCustomers(prev => prev.map(c => c.id === cust.id ? { ...c, archived_at: null } : c))
  }

  // WhatsApp for customer  send a friendly message with balance info
  const sendWhatsApp = (cust: any) => {
    if (!cust.phone) { alert("No phone number for this customer."); return }
    const message = [
      `Dear ${cust.name},`,
      ``,
      `Your current balance with us is PKR ${(cust.balance || 0).toLocaleString()}.`,
      `Thank you for your business!`,
      ``,
      ` OneAccounts`
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
        setImportMessage(`Imported ${result.count} customers successfully`)
        const { data } = await supabase
          .from("customers")
          .select("*")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("name")
        setCustomers(data || [])
      } else {
        setImportMessage(`Error: ${result.error}`)
      }
    } catch (err: any) {
      setImportMessage(`Network error: ${err.message}`)
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

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading</div>
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

          .message { padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; }

          /* -- DESKTOP: original header layout (buttons in one row, search below) -- */
          .header-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            flex-wrap: wrap;
            gap: 12px;
          }
          .header-row .title-area {
            flex: 1;
          }
          .header-row .actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }

          /* search bar sits naturally after summary cards */
          .search-section {
            margin-bottom: 16px;
            max-width: 320px;
            position: relative;
          }

          /* -- MOBILE ONLY -- */
          @media (max-width: 640px) {
            .page-wrap { padding: 12px !important; }
            .summary-grid { grid-template-columns: 1fr 1fr; }
            .summary-card-active { display: none; }

            .header-row {
              flex-direction: column;
              align-items: stretch;
            }
            .header-row .title-area {
              margin-bottom: 8px;
            }
            .header-row .actions {
              width: 100%;
              justify-content: space-between;
            }
            .search-section {
              max-width: 100%;
            }
          }
        `}</style>

        {/* -- HEADER ROW: title left, all buttons right -- */}
        <div className="header-row">
          <div className="title-area">
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Customers</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Manage your customer accounts</p>
          </div>
          <div className="actions">
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
          <div className="message" style={{ background: importMessage.startsWith("?") ? "#065F46" : "#7C2D12", color: "white" }}>
            {importMessage}
          </div>
        )}

        {/* -- Summary cards -- */}
        <div className="summary-grid">
          <div className="summary-item"><div className="summary-label">Total Customers</div><div className="summary-value">{totalCustomers}</div></div>
          <div className="summary-item"><div className="summary-label">Total Receivables</div><div className="summary-value" style={{ color: totalReceivables >= 0 ? "#10B981" : "#EF4444" }}>PKR {totalReceivables.toLocaleString()}</div></div>
          <div className="summary-item summary-card-active"><div className="summary-label">Active</div><div className="summary-value" style={{ color: "#10B981" }}>{activeCustomers}</div></div>
        </div>

        {/* -- Search (below summary) -- */}
        <div className="search-section" style={{ display: "flex", alignItems: "center", gap: 16, maxWidth: "none" }}>
          <div style={{ position: "relative", maxWidth: 320, flex: 1 }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input className="input" placeholder="Search by code, name, phone, email..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", cursor: "pointer", whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show Archived
          </label>
        </div>

        {/* -- Table -- */}
        <div className="card">
          <div className="table-scroll">
            <table className="cust-table">
              <colgroup>
                <col style={{ width: 110 }} /> {/* Code */}
                <col />                          {/* Name  takes remaining space */}
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
                    const isArchived = !!cust.archived_at
                    return (
                      <tr key={cust.id} style={isArchived ? { opacity: 0.5 } : {}}>
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 600, color: "var(--primary)" }}>{cust.code}</span>
                        </td>
                        <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {cust.name}
                          {isArchived && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px" }}>ARCHIVED</span>}
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{cust.phone || "-"}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: balance >= 0 ? "#10B981" : "#EF4444", whiteSpace: "nowrap" }}>
                          PKR {balance.toLocaleString()}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                            <button className="btn-icon" onClick={() => router.push(`/dashboard/reports/customer-ledger?customerId=${cust.id}`)} title="View Ledger">
                              <Eye size={13} />
                            </button>
                            {canEdit && companyId && (
                              <CustomerVendorLink
                                partyType="customer"
                                party={cust}
                                companyId={companyId}
                                counterparts={suppliersForLink}
                                onUpdated={refreshLinkData}
                              />
                            )}
                            {canEdit && (
                              <button className="btn-icon" onClick={() => router.push(`/dashboard/customers/new?id=${cust.id}`)} title="Edit">
                                <Edit size={13} />
                              </button>
                            )}
                            {canEdit && isArchived && (
                              <button className="btn-icon" onClick={() => restoreCustomer(cust)} style={{ color: "#10B981" }} title="Restore">
                                <Trash2 size={13} style={{ transform: "scaleY(-1)" }} />
                              </button>
                            )}
                            {canEdit && !isArchived && (
                              <button className="btn-icon" onClick={() => handleArchiveOrDelete(cust)} style={{ color: "#EF4444" }} title="Archive / Delete">
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

        {confirmTarget && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setConfirmTarget(null)}>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, maxWidth: 380, width: "90%", boxShadow: "0 12px 32px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                {(Math.abs(confirmTarget.balance || 0) > 0 || Math.abs(confirmTarget.opening_balance || 0) > 0) ? "Archive Customer?" : "Delete Customer?"}
              </h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px 0", lineHeight: 1.5 }}>
                {(Math.abs(confirmTarget.balance || 0) > 0 || Math.abs(confirmTarget.opening_balance || 0) > 0)
                  ? ` has existing balance or transactions, so it will be archived (hidden from the list, fully recoverable) instead of deleted.`
                  : ` has no transactions and can be safely deleted. This cannot be undone.`}
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-outline" onClick={() => setConfirmTarget(null)}>Cancel</button>
                <button className="btn" onClick={confirmArchiveOrDelete}>Confirm</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  )
}

'@

[System.IO.File]::WriteAllText((Resolve-Path $file1), $content1, [System.Text.Encoding]::UTF8)
Write-Host "SUCCESS: $file1 fully rewritten"

# ---------- FILE: dashboard/suppliers/page.tsx ----------
$file2 = "src\app\dashboard\suppliers\page.tsx"
$backup2 = "$file2.backup_$timestamp"
Copy-Item -LiteralPath $file2 -Destination $backup2
Write-Host "Backed up $file2 -> $backup2"

$content2 = @'
"use client"

import { useState, useEffect, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import { Plus, Search, Edit, Trash2, Eye, ArrowUpDown, ArrowUp, ArrowDown, FileText, Download, Upload } from "lucide-react"
import CustomerVendorLink from "@/components/CustomerVendorLink"

interface Supplier {
  id: number
  code: string
  name: string
  phone: string
  email: string
  address: string
  opening_balance: number
  balance: number
  payment_terms?: string | null
}

type SortField = "code" | "name" | "phone" | "balance"
type SortDir = "asc" | "desc"

function SkeletonRow() {
  return (
    <tr>
      {[60, 70, 50, 50, 60, 80].map((w, i) => (
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

export default function SuppliersPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role, loading: roleLoading } = useRole()
  const { hasFeature } = usePlan()
  const showImportExport = hasFeature("csv_import_export")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canEdit = role === "admin" || role === "accountant"
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 25

  const [sortField, setSortField] = useState<SortField>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const [importMessage, setImportMessage] = useState("")
  const [importing, setImporting] = useState(false)
  const [customersForLink, setCustomersForLink] = useState<any[]>([])

  const refreshLinkData = () => {
    fetchSuppliers()
    if (!companyId) return
    supabase
      .from("customers")
      .select("id, name, phone, balance, linked_supplier_id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .then(({ data }) => setCustomersForLink(data || []))
  }

  useEffect(() => {
    if (!companyId) return
    supabase
      .from("customers")
      .select("id, name, phone, balance, linked_supplier_id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .then(({ data }) => setCustomersForLink(data || []))
  }, [companyId])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const openNew = () => router.push("/dashboard/suppliers/new")
  const openEdit = (s: Supplier) => router.push(`/dashboard/suppliers/new?id=${s.id}`)

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this supplier?")) return
    await supabase.from("suppliers").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", companyId)
    fetchSuppliers()
  }

  const handleExport = () => {
    if (suppliers.length === 0) { alert("No data to export"); return }
    const headers = ["code", "name", "phone", "email", "address", "opening_balance", "balance", "payment_terms"]
    const csvRows = [headers.join(",")]
    suppliers.forEach((s: any) => {
      csvRows.push(headers.map(h => (s[h] ?? "").toString().replace(/,/g, " ")).join(","))
    })
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "suppliers.csv"
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const downloadTemplate = () => {
    const headers = ["code", "name", "phone", "email", "address", "opening_balance", "balance", "payment_terms"]
    const sample = ["SUP-001", "Acme Corp", "+923001234567", "acme@example.com", "123 Street", "0", "0", "Net 15"]
    const csvRows = [headers.join(","), sample.join(",")]
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "supplier_template.csv"
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportMessage("")

    const formData = new FormData()
    formData.append("file", file)
    formData.append("table", "suppliers")
    formData.append("company_id", companyId)

    try {
      const res = await fetch("/api/import", { method: "POST", body: formData })
      const result = await res.json()
      if (result.success) {
        setImportMessage(`Imported ${result.count} suppliers successfully`)
        fetchSuppliers()
      } else {
        setImportMessage(`Error: ${result.error}`)
      }
    } catch (err: any) {
      setImportMessage(`Network error: ${err.message}`)
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const totalPayables = suppliers.reduce((s, c) => s + (c.balance || 0), 0)

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

  if (roleLoading || !role) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  }
  if (!canView) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text)" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "var(--text-muted)" }}>You do not have permission to view this page.</p>
      </div>
    )
  }
  if (!companyId) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading company data...</div>

  return (
    <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
        .sup-table { width: 100%; border-collapse: collapse; }
        .sup-table tbody tr:last-child td { border-bottom: none; }
        .sup-table tbody tr:hover td { background: var(--card-hover); }
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
        .search-input {
          width: 100%; height: 38px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px;
          background: var(--card); color: var(--text); outline: none;
          box-sizing: border-box;
        }
        .search-input:focus { border-color: var(--primary); }
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
        .sup-table { min-width: 700px; }

        .message { padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; }

        .header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 12px;
        }
        .header-row .title-area { flex: 1; }
        .header-row .actions { display: flex; gap: 8px; flex-wrap: wrap; }

        .search-section {
          margin-bottom: 16px;
          max-width: 320px;
          position: relative;
        }

        @media (max-width: 640px) {
          .page-wrap { padding: 12px !important; }
          .summary-grid { grid-template-columns: 1fr 1fr; }
          .header-row { flex-direction: column; align-items: stretch; }
          .header-row .title-area { margin-bottom: 8px; text-align: left; }
          .header-row .actions { width: 100%; justify-content: space-between; }
          .search-section { max-width: 100%; }
        }
      `}</style>

      <div className="header-row">
        <div className="title-area">
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Suppliers</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Manage your supplier accounts</p>
        </div>
        <div className="actions">
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
            <button className="btn" onClick={openNew}>
              <Plus size={16} /> Add Supplier
            </button>
          )}
        </div>
      </div>

      {importMessage && (
        <div className="message" style={{ background: importMessage.startsWith("OK") ? "#065F46" : "#7C2D12", color: "white" }}>
          {importMessage}
        </div>
      )}

      <div className="summary-grid">
        <div className="summary-item"><div className="summary-label">Total Suppliers</div><div className="summary-value">{total}</div></div>
        <div className="summary-item"><div className="summary-label">Total Payables</div><div className="summary-value" style={{ color: totalPayables >= 0 ? "#10B981" : "#EF4444" }}>PKR {totalPayables.toLocaleString()}</div></div>
      </div>

      <div className="search-section">
        <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="search-input" placeholder="Search by code, name, or phone..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="sup-table">
            <colgroup>
              <col style={{ width: 110 }} />
              <col />
              <col style={{ width: 120 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 140 }} />
            </colgroup>
            <thead>
              <tr>
                <SortTh field="code">Code</SortTh>
                <SortTh field="name" style={{ textAlign: "left" }}>Name</SortTh>
                <SortTh field="phone" style={{ textAlign: "left" }}>Phone</SortTh>
                <th style={{ ...thStyle, textAlign: "right" }}>Opening Bal.</th>
                <SortTh field="balance" style={{ textAlign: "right" }}>Balance</SortTh>
                <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                    {search ? "No matching suppliers found." : "No suppliers yet. Add your first supplier."}
                  </td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr key={s.id}>
                    <td style={tdStyle}><span style={{ fontWeight: 600, color: "var(--primary)" }}>{s.code}</span></td>
                    <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{s.phone || "-"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>PKR {s.opening_balance?.toLocaleString() ?? "0"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: s.balance >= 0 ? "#10B981" : "#EF4444", whiteSpace: "nowrap" }}>PKR {s.balance?.toLocaleString()}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                        <button className="btn-icon" onClick={() => router.push(`/dashboard/reports/vendor-ledger?supplierId=${s.id}`)} title="View Ledger"><Eye size={13} /></button>
                        {canEdit && companyId && (
                          <CustomerVendorLink
                            partyType="supplier"
                            party={s}
                            companyId={companyId}
                            counterparts={customersForLink}
                            onUpdated={refreshLinkData}
                          />
                        )}
                        {canEdit && (
                          <button className="btn-icon" onClick={() => openEdit(s)} title="Edit"><Edit size={13} /></button>
                        )}
                        {canEdit && (
                          <button className="btn-icon" onClick={() => handleDelete(s.id)} style={{ color: "#EF4444" }} title="Delete"><Trash2 size={13} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {importing && <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>Importing...</div>}

      {total > pageSize && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 13, color: "var(--text-muted)" }}>
          <span>Showing {Math.min(pageSize, total - (page-1)*pageSize)} of {total}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn btn-outline" disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
'@

[System.IO.File]::WriteAllText((Resolve-Path $file2), $content2, [System.Text.Encoding]::UTF8)
Write-Host "SUCCESS: $file2 fully rewritten"

Write-Host ""
Write-Host "Done. Next steps:"
Write-Host "1. rmdir /s /q .next"
Write-Host "2. git add -A"
Write-Host "3. git commit -m fix-customer-vendor-link-rebuild"
Write-Host "4. git push"
Write-Host "5. Paste back the full Vercel build log"