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

// ── Consistent 2‑decimal format ────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

  // ── Theme helpers ─────────────────────────────────────────────────
  const isDarkTheme = themeMode === "dark" || themeMode === "system"
  const isOneAccounts = themeMode === "oneaccounts"
  const isLightStyle = themeMode === "light" || isOneAccounts   // OneAccounts uses light visual style

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
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.7 }} />
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

  // ── Theme‑sensitive colours ───────────────────────────────────────
  const headerBg = isOneAccounts ? "#07085B" : (isDarkTheme ? "#000000" : "#07085B")
  // Row backgrounds: light style = white/grey, dark style = slate shades
  const rowLight = isLightStyle ? "#FFFFFF" : "#1E293B"
  const rowDark  = isLightStyle ? "#F8F9FC" : "#111827"
  const totalBg  = headerBg
  const textMuted = isLightStyle ? "#64748B" : "#94A3B8"
  // Override text color on OneAccounts so it's always readable (dark text on light rows)
  const reportTextColor = isOneAccounts ? "#1E293B" : "var(--text)"
  const reportMutedColor = isOneAccounts ? "#64748B" : "var(--text-muted)"

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)", transition: "background 0.3s, color 0.3s" }}>
      <style>{`
        .report-header {
          background: var(--card);
          border-bottom: 1px solid var(--border);
          padding: 20px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }
        .report-header-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .report-logo {
          width: 34px; height: 34px;
          border-radius: 9px;
          object-fit: contain;
        }
        .report-company-name {
          font-size: 16px; font-weight: 700;
        }
        .report-company-tagline {
          font-size: 11px;
        }
        .report-header-right {
          text-align: right;
        }
        .report-title {
          font-size: 24px; font-weight: 800;
        }
        .report-period {
          font-size: 12px;
        }

        .kpi-row {
          display: flex; gap: 16px;
          padding: 24px 32px; flex-wrap: wrap;
        }
        .kpi-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px; padding: 18px 24px;
          min-width: 170px; box-shadow: var(--shadow-sm);
        }
        .kpi-label {
          font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--text-muted); margin-bottom: 6px;
        }
        .kpi-value { font-size: 26px; font-weight: 800; }

        .filter-bar {
          display: flex; align-items: center; gap: 12px;
          padding: 0 32px 20px; flex-wrap: wrap;
        }
        .btn {
          padding: 8px 16px; border-radius: 8px;
          border: 1.5px solid var(--border); font-weight: 600;
          font-size: 13px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px;
          font-family: inherit;
        }
        .btn-outline {
          background: transparent; color: var(--text-muted);
          border-color: var(--border);
        }
        .btn-outline:hover { background: var(--card-hover); }
        .date-input {
          height: 34px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 10px; font-size: 12px;
          background: var(--card); color: var(--text);
          outline: none; font-family: inherit; width: 140px;
        }
        .date-input:focus { border-color: var(--primary); }

        .table-wrap {
          margin: 0 32px 32px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px; overflow: hidden;
          box-shadow: var(--shadow-sm);
        }
        .table-header {
          display: grid;
          grid-template-columns: 90px 1fr 90px 140px 140px;
          padding: 14px 24px;
          font-size: 10px; font-weight: 700;
          text-transform: uppercase; color: white;
        }
        .table-row {
          display: grid;
          grid-template-columns: 90px 1fr 90px 140px 140px;
          padding: 12px 24px;
          font-size: 13px; align-items: center;
          cursor: pointer; transition: background 0.15s;
        }
        .table-row:hover { background: var(--card-hover); }
        .totals-row {
          display: grid;
          grid-template-columns: 90px 1fr 90px 140px 140px;
          padding: 14px 24px;
          color: white; font-weight: 700; font-size: 13px;
        }

        .sort-btn {
          background: none; border: none; cursor: pointer;
          font: inherit; color: white;
          display: inline-flex; align-items: center; gap: 4px;
          padding: 0; font-weight: 700; text-transform: uppercase;
          font-size: 10px;
        }

        @media (max-width: 640px) {
          .table-header, .table-row, .totals-row {
            grid-template-columns: 70px 1fr 80px 100px 100px;
          }
        }
      `}</style>

      {/* ── Report Header ── */}
      <div className="report-header">
        <div className="report-header-left">
          {logoUrl ? (
            <img src={logoUrl} alt={companyName} className="report-logo" width={34} height={34} />
          ) : (
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: "var(--primary)", display: "flex",
              alignItems: "center", justifyContent: "center",
              color: "white", fontWeight: 700,
            }}>
              {(companyName || "O")[0]}
            </div>
          )}
          <div>
            <div className="report-company-name" style={{ color: reportTextColor }}>
              {companyName || "OneAccounts"}
            </div>
            <div className="report-company-tagline" style={{ color: reportMutedColor }}>
              {companyTagline || ""}
            </div>
          </div>
        </div>
        <div className="report-header-right">
          <div className="report-title" style={{ color: reportTextColor }}>Trial Balance</div>
          <div className="report-period" style={{ color: reportMutedColor }}>From {startDate} to {endDate}</div>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Total Debits</div>
          <div className="kpi-value" style={{ color: "#EF4444" }}>
            PKR {fmt(totalDebit)}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Credits</div>
          <div className="kpi-value" style={{ color: "#10B981" }}>
            PKR {fmt(totalCredit)}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Status</div>
          <div className="kpi-value" style={{ color: isBalanced ? "#10B981" : "#EF4444", fontSize: 20 }}>
            {isBalanced ? "✓ Balanced" : "✗ Imbalance"}
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="filter-bar">
        <input type="date" className="date-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>to</span>
        <input type="date" className="date-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
        <button className="btn btn-outline" onClick={fetchTrial}>Refresh</button>
        <button className="btn btn-outline" onClick={handleExportPDF}><Download size={16} /> PDF</button>
      </div>

      {errorMsg && (
        <div style={{ margin: "0 32px 16px", background: "#FEF2F2", color: "#B91C1C", padding: "10px 14px", borderRadius: 8, fontSize: 13 }}>
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading accounts…</div>
      ) : sortedData.length === 0 ? (
        <div style={{
          margin: "0 32px", background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 12, padding: 40, textAlign: "center", color: "var(--text-muted)",
        }}>
          No accounts match the selected filter or date range.
        </div>
      ) : (
        <div className="table-wrap">
          <div className="table-header" style={{ background: headerBg }}>
            <button className="sort-btn" onClick={() => handleSort("code")}>Code {getSortIcon("code")}</button>
            <button className="sort-btn" onClick={() => handleSort("name")}>Name {getSortIcon("name")}</button>
            <button className="sort-btn" onClick={() => handleSort("type")}>Type {getSortIcon("type")}</button>
            <button className="sort-btn" onClick={() => handleSort("debit")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Debit {getSortIcon("debit")}</button>
            <button className="sort-btn" onClick={() => handleSort("credit")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Credit {getSortIcon("credit")}</button>
          </div>
          {sortedData.map((a, i) => (
            <div
              key={a.id}
              className="table-row"
              style={{
                background: i % 2 === 0 ? rowLight : rowDark,
                color: isOneAccounts ? "#1E293B" : "inherit",
              }}
              onClick={() => openLedger(a.id)}
            >
              <span style={{ fontWeight: 600, color: "var(--primary)" }}>{a.code}</span>
              <span>{a.name}</span>
              <span style={{ fontSize: 11, color: textMuted }}>{a.type}</span>
              <span style={{
                textAlign: "right",
                color: a.debit > 0 ? "#EF4444" : textMuted,
                fontWeight: a.debit > 0 ? 600 : 400,
              }}>
                {a.debit > 0 ? `PKR ${fmt(a.debit)}` : "—"}
              </span>
              <span style={{
                textAlign: "right",
                color: a.credit > 0 ? "#10B981" : textMuted,
                fontWeight: a.credit > 0 ? 600 : 400,
              }}>
                {a.credit > 0 ? `PKR ${fmt(a.credit)}` : "—"}
              </span>
            </div>
          ))}
          <div className="totals-row" style={{ background: totalBg }}>
            <span></span>
            <span>Total</span>
            <span></span>
            <span style={{ textAlign: "right", color: "#FFA7A7" }}>PKR {fmt(totalDebit)}</span>
            <span style={{ textAlign: "right", color: "#A7F3D0" }}>PKR {fmt(totalCredit)}</span>
          </div>
        </div>
      )}
    </div>
  )
}