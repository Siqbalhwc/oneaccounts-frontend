"use client"

import { useState, useEffect, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import { Plus, Search, Edit, Trash2, Eye, ArrowUpDown, ArrowUp, ArrowDown, FileText, Download, Upload } from "lucide-react"

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
        setImportMessage(`✅ Imported ${result.count} suppliers successfully`)
        fetchSuppliers()
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
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>🚚 Suppliers</h1>
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
        <div className="message" style={{ background: importMessage.startsWith("✅") ? "#065F46" : "#7C2D12", color: "white" }}>
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