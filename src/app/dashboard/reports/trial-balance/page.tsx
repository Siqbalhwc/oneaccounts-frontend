"use client"

import { useState, useEffect, useMemo } from "react"
import { ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown, Download } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { generateTrialBalancePDF } from "@/lib/pdf/trialBalancePDF"
import { useCompany } from "@/contexts/CompanyContext"
import { useTheme } from "@/contexts/ThemeContext"

type SortField = "code" | "name" | "type" | "debit" | "credit"
type SortDir = "asc" | "desc"

function getFallbackCategory(code?: string): string {
  if (!code) return "Other"
  const num = parseFloat(code)
  if (isNaN(num)) return "Other"
  if (num >= 1000 && num <= 1099) return "Cash & Bank"
  if (num >= 1100 && num <= 1199) return "Accounts Receivable"
  if (num >= 1200 && num <= 1299) return "Inventory"
  if (num >= 1300 && num <= 1399) return "Other Current Assets"
  if (num >= 1400 && num <= 1499) return "Fixed Assets"
  if (num >= 1500 && num <= 1599) return "Vehicles"
  if (num >= 2000 && num <= 2099) return "Accounts Payable"
  if (num >= 2100 && num <= 2199) return "Other Current Liabilities"
  if (num >= 3000 && num <= 3099) return "Equity"
  if (num >= 4000 && num <= 4099) return "Revenue"
  if (num >= 5000 && num <= 5099) return "Direct Expenses"
  if (num >= 5100 && num <= 5199) return "Operating Expenses"
  return "Other"
}

function fmt(n: number) {
  return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function SkeletonRow() {
  return (
    <tr>
      {[60, 70, 50, 80, 80, 80].map((w, i) => (
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

export default function TrialBalancePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const now = new Date()
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`)
  const [endDate, setEndDate] = useState(now.toISOString().split("T")[0])

  const [trialData, setTrialData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>("code")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [errorMsg, setErrorMsg] = useState("")

  const filterType = searchParams.get("type") || ""
  const filterCategory = searchParams.get("category") || ""

  const { companyName, companyTagline, logoUrl } = useCompany()
  const { theme: themeMode } = useTheme()

  const isDarkTheme = themeMode === "dark" || themeMode === "system"
  const isOneAccounts = themeMode === "oneaccounts"
  const isLightStyle = themeMode === "light" || isOneAccounts

  const fetchTrial = async () => {
    setLoading(true)
    setErrorMsg("")
    try {
      const res = await fetch(`/api/trial-balance?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`)
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      const rows = (json || []).map((row: any) => ({
        id: row.account_id,
        code: row.code,
        name: row.name,
        type: row.type,
        category: row.category || getFallbackCategory(row.code),
        debit: Number(row.debit),
        credit: Number(row.credit),
      }))

      let filtered = rows
      if (filterType) {
        filtered = filtered.filter((r: any) => r.type.toLowerCase() === filterType.toLowerCase())
      }
      if (filterCategory) {
        filtered = filtered.filter((r: any) => r.category === filterCategory)
      }

      setTrialData(filtered)
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to load trial balance")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTrial()
  }, [startDate, endDate, filterType, filterCategory])

  const sortedData = useMemo(() => {
    const list = [...trialData]
    list.sort((a, b) => {
      let valA: any, valB: any
      if (sortField === "code") {
        valA = parseFloat(a.code)
        valB = parseFloat(b.code)
        if (isNaN(valA)) valA = a.code
        if (isNaN(valB)) valB = b.code
      } else if (sortField === "debit" || sortField === "credit") {
        valA = a[sortField] || 0
        valB = b[sortField] || 0
      } else {
        valA = (a[sortField] || "").toString().toLowerCase()
        valB = (b[sortField] || "").toString().toLowerCase()
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1
      if (valA > valB) return sortDir === "asc" ? 1 : -1
      return 0
    })
    return list
  }, [trialData, sortField, sortDir])

  const totalDebit = sortedData.reduce((s, r) => s + r.debit, 0)
  const totalCredit = sortedData.reduce((s, r) => s + r.credit, 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

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

  const openLedger = (accountId: number) => {
    router.push(
      `/dashboard/reports/ledger?accountId=${accountId}&startDate=${startDate}&endDate=${endDate}`
    )
  }

  const handleExportPDF = async () => {
    const pdfData = {
      companyName: companyName || "OneAccounts",
      companyTagline: companyTagline || "",
      logoUrl: logoUrl || null,
      startDate,
      endDate,
      rows: sortedData.map(r => ({
        code: r.code,
        name: r.name,
        type: r.type,
        category: r.category,
        debit: r.debit,
        credit: r.credit,
      })),
      totalDebit,
      totalCredit,
      isBalanced,
    }
    const doc = await generateTrialBalancePDF(pdfData)
    doc.save(`Trial_Balance_${startDate}_to_${endDate}.pdf`)
  }

  // Shared th/td styles
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

  const headerBg = isOneAccounts ? "#07085B" : (isDarkTheme ? "#000000" : "#07085B")
  const rowLight = isLightStyle ? "#FFFFFF" : "#1E293B"
  const rowDark  = isLightStyle ? "#F8F9FC" : "#111827"
  const totalBg  = headerBg
  const textMuted = isLightStyle ? "#64748B" : "#94A3B8"
  const reportTextColor = isOneAccounts ? "#1E293B" : "var(--text)"
  const reportMutedColor = isOneAccounts ? "#64748B" : "var(--text-muted)"

  return (
    <div className="page-wrap" style={{ background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)", transition: "background 0.3s, color 0.3s", padding: 24 }}>
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
        .trial-table { width: 100%; border-collapse: collapse; }
        .trial-table tbody tr:last-child td { border-bottom: none; }
        .trial-table tbody tr:hover td { background: var(--card-hover); }
        .btn {
          padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          color: white; border: none; transition: all 0.2s;
        }
        .btn-outline {
          background: transparent; color: var(--text-muted); border: 1.5px solid var(--border);
        }
        .btn-outline:hover {
          background: var(--card-hover);
          transform: translateY(-1px);
          box-shadow: none;
        }
        .date-input {
          height: 38px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 12px; font-size: 13px;
          background: var(--card); color: var(--text); outline: none;
        }
        .date-input:focus { border-color: var(--primary); }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
        .trial-table { min-width: 800px; }

        @media (max-width: 480px) {
          .page-wrap { padding: 12px !important; }
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        .filter-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
          margin-bottom: 20px;
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-outline" onClick={() => router.push("/dashboard/reports")}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Trial Balance</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>From {startDate} to {endDate}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline" onClick={handleExportPDF}>
            <Download size={16} /> PDF
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-item"><div className="summary-label">Total Debits</div><div className="summary-value" style={{ color: "#EF4444" }}>PKR {fmt(totalDebit)}</div></div>
        <div className="summary-item"><div className="summary-label">Total Credits</div><div className="summary-value" style={{ color: "#10B981" }}>PKR {fmt(totalCredit)}</div></div>
        <div className="summary-item"><div className="summary-label">Status</div><div className="summary-value" style={{ color: isBalanced ? "#10B981" : "#EF4444", fontSize: 20 }}>{isBalanced ? "✓ Balanced" : "✗ Imbalance"}</div></div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input type="date" className="date-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>to</span>
        <input type="date" className="date-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
        <button className="btn btn-outline" onClick={fetchTrial}>Refresh</button>
      </div>

      {errorMsg && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {errorMsg}
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="table-scroll">
          <table className="trial-table">
            <colgroup>
              <col style={{ width: 100 }} />  {/* Code */}
              <col />                          {/* Name */}
              <col style={{ width: 100 }} />  {/* Type */}
              <col style={{ width: 120 }} />  {/* Category */}
              <col style={{ width: 120 }} />  {/* Debit */}
              <col style={{ width: 120 }} />  {/* Credit */}
            </colgroup>
            <thead>
              <tr>
                <SortTh field="code">Code</SortTh>
                <SortTh field="name" style={{ textAlign: "left" }}>Name</SortTh>
                <SortTh field="type" style={{ textAlign: "center" }}>Type</SortTh>
                <th style={{ ...thStyle, textAlign: "center" }}>Category</th>
                <SortTh field="debit" style={{ textAlign: "right" }}>Debit</SortTh>
                <SortTh field="credit" style={{ textAlign: "right" }}>Credit</SortTh>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : sortedData.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                    No accounts match the selected filter or date range.
                  </td>
                </tr>
              ) : (
                sortedData.map((a, i) => (
                  <tr key={a.id} onClick={() => openLedger(a.id)} style={{ cursor: "pointer" }}>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}><span style={{ fontWeight: 600, color: "var(--primary)" }}>{a.code}</span></td>
                    <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</td>
                    <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap" }}>{a.type}</td>
                    <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap", color: "var(--text-muted)" }}>{a.category || "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: a.debit > 0 ? "#EF4444" : "var(--text-muted)", fontWeight: a.debit > 0 ? 600 : 400 }}>
                      {a.debit > 0 ? `PKR ${fmt(a.debit)}` : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: a.credit > 0 ? "#10B981" : "var(--text-muted)", fontWeight: a.credit > 0 ? 600 : 400 }}>
                      {a.credit > 0 ? `PKR ${fmt(a.credit)}` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--card-hover)", fontWeight: 700 }}>
                <td colSpan={4} style={{ ...tdStyle, textAlign: "right" }}>Total</td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#EF4444" }}>PKR {fmt(totalDebit)}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#10B981" }}>PKR {fmt(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}