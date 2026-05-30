"use client"

import { useState, useEffect, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, Edit, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown, FileText, Download, Upload } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

type SortField = "code" | "name" | "phone" | "balance"
type SortDir = "asc" | "desc"

export default function CustomersPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature } = usePlan()
  const showImportExport = hasFeature("csv_import_export")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [companyId, setCompanyId] = useState("")
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!role) return
    if (!canView) {
      setLoading(false)
      return
    }
    supabase
      .from("customers")
      .select("*")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .then(({ data }) => {
        setCustomers(data || [])
        setLoading(false)
      })
  }, [role, canView])

  // Sorting & filtering
  const filteredCustomers = (() => {
    let list = customers

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (c) =>
          c.code?.toLowerCase().includes(q) ||
          c.name?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
      )
    }

    return [...list].sort((a, b) => {
      let valA = (a[sortField] || "").toString().toLowerCase()
      let valB = (b[sortField] || "").toString().toLowerCase()
      if (sortField === "balance") {
        valA = parseFloat(a.balance || 0)
        valB = parseFloat(b.balance || 0)
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1
      if (valA > valB) return sortDir === "asc" ? 1 : -1
      return 0
    })
  })()

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

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this customer? This will not remove their transactions.")) return
    await supabase.from("customers").update({ deleted_at: new Date().toISOString() }).eq("id", id)
    setCustomers(prev => prev.filter(c => c.id !== id))
  }

  // Summary calculations
  const totalCustomers = filteredCustomers.length
  const totalBalance = filteredCustomers.reduce((s, c) => s + (c.balance || 0), 0)
  const activeCustomers = filteredCustomers.filter(c => (c.balance || 0) > 0).length

  // CSV Export
  const handleExport = () => {
    if (filteredCustomers.length === 0) { alert("No data to export"); return }
    const headers = ["code", "name", "phone", "email", "address", "country_code", "payment_terms", "opening_balance", "balance"]
    const csvRows = [headers.join(",")]
    filteredCustomers.forEach(c => {
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
        // Refresh list
        const { data } = await supabase.from("customers").select("*").is("deleted_at", null).order("name")
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

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
        <style>{`
          .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 0; box-shadow: var(--shadow-sm); overflow: hidden; width: 100%; }
          /* Flexible table that fills available width on large screens, scrolls on small */
          .cust-table { width: 100%; }
          .header-row {
            display: grid;
            grid-template-columns: minmax(80px, 1fr) minmax(150px, 2fr) minmax(100px, 1fr) minmax(100px, 1fr) minmax(140px, 1.5fr) 55px 55px 55px;
            padding: 14px 24px;
            background: var(--card-hover);
            font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
            border-bottom: 1px solid var(--border);
          }
          .data-row {
            display: grid;
            grid-template-columns: minmax(80px, 1fr) minmax(150px, 2fr) minmax(100px, 1fr) minmax(100px, 1fr) minmax(140px, 1.5fr) 55px 55px 55px;
            padding: 12px 24px;
            border-bottom: 1px solid var(--border);
            font-size: 13px; align-items: center;
            transition: background 0.15s;
          }
          .data-row:hover { background: var(--card-hover); }
          .data-row:last-child { border-bottom: none; }
          .sort-btn {
            background: none; border: none; cursor: pointer; font: inherit; color: var(--text-muted);
            display: inline-flex; align-items: center; gap: 4px; padding: 0;
            font-weight: 700; text-transform: uppercase; font-size: 10px;
          }
          .sort-btn:hover { color: var(--primary); }
          .search-input {
            height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
            padding: 0 12px 0 36px; font-size: 13px; width: 260px;
            box-sizing: border-box; outline: none; font-family: inherit;
            background: var(--card); color: var(--text);
          }
          .search-input:focus { border-color: var(--primary); }
          .btn {
            padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px;
            cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
            background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
            color: white;
            transition: all 0.2s;
          }
          .btn:hover {
            background: linear-gradient(135deg, #1E55E8 0%, #0F2280 100%);
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(7,19,82,0.45);
          }
          .btn-outline {
            background: transparent; color: var(--text-muted); border: 1.5px solid var(--border);
          }
          .btn-outline:hover { background: var(--card-hover); }
          .btn-icon {
            background: transparent; border: 1.5px solid var(--border); color: var(--text-muted);
            padding: 6px; border-radius: 8px; cursor: pointer;
            display: inline-flex; align-items: center; justify-content: center;
          }
          .btn-icon:hover { background: var(--card-hover); }
          .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
          .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
          .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
          .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
          .creator-editor-cell {
            display: flex;
            flex-direction: column;
            font-size: 11px;
            color: var(--text-muted);
            line-height: 1.3;
            word-wrap: break-word;
          }
          .message { padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; }

          /* Responsive: on small screens, allow horizontal scroll */
          @media (max-width: 900px) {
            .header-row, .data-row {
              grid-template-columns: minmax(80px, 1fr) minmax(150px, 2fr) minmax(100px, 1fr) minmax(100px, 1fr) minmax(140px, 1.5fr) 55px 55px 55px;
              padding: 10px 16px;
            }
            .cust-table { overflow-x: auto; }
          }
          @media (max-width: 640px) {
            .header-row, .data-row {
              grid-template-columns: 80px 150px 100px 100px 140px 55px 55px 55px;
              column-gap: 4px;
              padding: 10px 12px;
              font-size: 11px;
            }
            .search-input { width: 100%; }
          }
        `}</style>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>👥 Customers</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Manage your customer accounts</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {showImportExport && (
              <>
                <button className="btn" onClick={downloadTemplate} title="Download CSV template">
                  <FileText size={14} /> Template
                </button>
                <label className="btn" style={{ cursor: "pointer" }}>
                  <Upload size={14} /> Import
                  <input type="file" accept=".csv" onChange={handleImport} ref={fileInputRef} style={{ display: "none" }} />
                </label>
                <button className="btn" onClick={handleExport} title="Export to CSV">
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

        {/* Import/export message */}
        {importMessage && (
          <div className="message" style={{ background: importMessage.startsWith("✅") ? "#065F46" : "#7C2D12", color: "white" }}>
            {importMessage}
          </div>
        )}

        {/* Summary Cards */}
        <div className="summary-grid">
          <div className="summary-item">
            <div className="summary-label">Total Customers</div>
            <div className="summary-value">{totalCustomers}</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Total Balance</div>
            <div className="summary-value" style={{ color: totalBalance >= 0 ? "#10B981" : "#EF4444" }}>
              PKR {totalBalance.toLocaleString()}
            </div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Active</div>
            <div className="summary-value" style={{ color: "#10B981" }}>{activeCustomers}</div>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            className="search-input"
            placeholder="Search by code, name, phone, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Customers Table */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading customers…</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            No customers found. {canEdit && "Add a customer to get started."}
          </div>
        ) : (
          <div className="card cust-table">
            <div className="header-row">
              <button className="sort-btn" onClick={() => handleSort("code")}>Code {getSortIcon("code")}</button>
              <button className="sort-btn" onClick={() => handleSort("name")}>Name {getSortIcon("name")}</button>
              <button className="sort-btn" onClick={() => handleSort("phone")}>Phone {getSortIcon("phone")}</button>
              <button className="sort-btn" onClick={() => handleSort("balance")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Balance {getSortIcon("balance")}</button>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                Created / Edited By
              </span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            {filteredCustomers.map((cust) => (
              <div key={cust.id} className="data-row">
                <span style={{ fontWeight: 600, color: "var(--primary)" }}>{cust.code}</span>
                <span style={{ color: "var(--text)" }}>{cust.name}</span>
                <span style={{ color: "var(--text-muted)" }}>{cust.phone || "—"}</span>
                <span style={{ textAlign: "right", fontWeight: 600, color: cust.balance >= 0 ? "#10B981" : "#EF4444" }}>
                  PKR {(cust.balance || 0).toLocaleString()}
                </span>
                <div className="creator-editor-cell">
                  <span>Created: {cust.created_by || "—"}</span>
                  <span>Edited: {cust.updated_by || "—"}</span>
                </div>
                <button className="btn-icon" onClick={() => router.push(`/dashboard/reports/customer-ledger?customerId=${cust.id}`)} title="View Ledger">
                  <Eye size={14} />
                </button>
                <button className="btn-icon" onClick={() => router.push(`/dashboard/customers/new?id=${cust.id}`)} title="Edit">
                  <Edit size={14} />
                </button>
                <button className="btn-icon" onClick={() => handleDelete(cust.id)} style={{ color: "#EF4444" }} title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {importing && <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>Importing...</div>}
      </div>
    </RoleGuard>
  )
}