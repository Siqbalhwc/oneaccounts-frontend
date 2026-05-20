"use client"

import { useState, useEffect, useMemo } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

type SortField = "date" | "description" | "debit" | "credit" | "running_balance"
type SortDir = "asc" | "desc"

export default function LedgerPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const searchParams = useSearchParams()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"

  const accountId = searchParams.get("accountId")
  const [account, setAccount] = useState<any>(null)
  const [companyId, setCompanyId] = useState<string>("")

  // Date filters – set from URL or default to current fiscal year
  const now = new Date()
  const [startDate, setStartDate] = useState(searchParams.get("startDate") || `${now.getFullYear()}-01-01`)
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || now.toISOString().split("T")[0])

  const [ledgerLines, setLedgerLines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Sorting
  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [errorMsg, setErrorMsg] = useState("")

  // Fetch company ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // Fetch account details
  useEffect(() => {
    if (!accountId || !companyId) return
    supabase
      .from("accounts")
      .select("id, code, name, type")
      .eq("id", accountId)
      .eq("company_id", companyId)
      .single()
      .then(({ data }) => data && setAccount(data))
  }, [accountId, companyId])

  // Fetch ledger lines with running balance
  const fetchLedger = async () => {
    if (!accountId || !companyId) return
    setLoading(true)
    setErrorMsg("")
    try {
      // Get opening balance (before start date)
      let openingBalance = 0
      const { data: openingLines } = await supabase
        .from("journal_lines")
        .select("debit, credit, journal_entries!inner(date, deleted_at, company_id)")
        .eq("account_id", accountId)
        .eq("company_id", companyId)
        .is("journal_entries.deleted_at", null)
        .eq("journal_entries.company_id", companyId)
        .lt("journal_entries.date", startDate)

      if (openingLines) {
        openingBalance = openingLines.reduce((sum, line) => sum + (line.debit || 0) - (line.credit || 0), 0)
      }

      // Get period lines
      let query = supabase
        .from("journal_lines")
        .select("id, debit, credit, journal_entries!inner(entry_no, date, description, deleted_at, company_id)")
        .eq("account_id", accountId)
        .eq("company_id", companyId)
        .is("journal_entries.deleted_at", null)
        .eq("journal_entries.company_id", companyId)

      if (startDate) query = query.gte("journal_entries.date", startDate)
      if (endDate) query = query.lte("journal_entries.date", endDate)

      const { data: lines } = await query

      // Build running balance
      let running = openingBalance
      const rows = (lines || []).map((l: any) => {
        running = running + (l.debit || 0) - (l.credit || 0)
        return {
          id: l.id,
          entry_no: l.journal_entries?.entry_no || "",
          date: l.journal_entries?.date || "",
          description: l.journal_entries?.description || "",
          debit: l.debit || 0,
          credit: l.credit || 0,
          running_balance: running,
        }
      })

      // Sort by date ascending (default for ledger) then apply user sort
      rows.sort((a, b) => {
        if (a.date < b.date) return -1
        if (a.date > b.date) return 1
        return 0
      })

      setLedgerLines(rows)
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to load ledger")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (accountId && companyId) fetchLedger()
  }, [accountId, companyId, startDate, endDate])

  // Client-side sort
  const sortedLines = useMemo(() => {
    const list = [...ledgerLines]
    list.sort((a, b) => {
      let valA: any, valB: any
      if (sortField === "debit" || sortField === "credit" || sortField === "running_balance") {
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
  }, [ledgerLines, sortField, sortDir])

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

  const totalDebit = sortedLines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = sortedLines.reduce((s, l) => s + l.credit, 0)
  const closingBalance = sortedLines.length > 0 ? sortedLines[sortedLines.length - 1].running_balance : 0

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  if (!canView) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "var(--text-muted)" }}>You do not have permission to view this page.</p>
      </div>
    )
  }
  if (!accountId) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
        No account selected. Please go back and click on an account from Trial Balance.
      </div>
    )
  }

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
        <style>{`
          .ledger-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 0; box-shadow: var(--shadow-sm); overflow: hidden; }
          .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
          .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
          .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
          .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
          .ledger-header {
            display: grid;
            grid-template-columns: 90px 100px 1fr 110px 110px 130px;
            padding: 14px 24px;
            background: var(--card);
            font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
            border-bottom: 1px solid var(--border);
          }
          .ledger-row {
            display: grid;
            grid-template-columns: 90px 100px 1fr 110px 110px 130px;
            padding: 12px 24px;
            border-bottom: 1px solid var(--border);
            font-size: 13px; align-items: center;
            transition: background 0.15s;
          }
          .ledger-row:hover { background: var(--card-hover); }
          .ledger-row:last-child { border-bottom: none; }
          .sort-btn {
            background: none; border: none; cursor: pointer; font: inherit; color: var(--text-muted);
            display: inline-flex; align-items: center; gap: 4px; padding: 0;
            font-weight: 700; text-transform: uppercase; font-size: 10px;
          }
          .sort-btn:hover { color: var(--primary); }
          .date-input {
            height: 34px; border: 1.5px solid var(--border); border-radius: 8px;
            padding: 0 10px; font-size: 12px; background: var(--card); color: var(--text);
            outline: none; font-family: inherit; width: 140px;
          }
          .date-input:focus { border-color: var(--primary); }
          .btn { padding: 8px 16px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
          .btn-outline { background: transparent; color: var(--text-muted); border-color: var(--border); }
          .btn-outline:hover { background: var(--card-hover); }
          @media (max-width: 640px) {
            .ledger-header, .ledger-row { grid-template-columns: 70px 80px 1fr 80px 80px 100px; }
          }
        `}</style>

        {/* Header with date filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <button className="btn btn-outline" onClick={() => router.push("/dashboard/reports/trial-balance")}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>
              📒 Ledger: {account ? `${account.code} – ${account.name}` : "Loading..."}
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
              {account?.type} account
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="date"
              className="date-input"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>to</span>
            <input
              type="date"
              className="date-input"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
            <button className="btn btn-outline" onClick={fetchLedger}>
              Refresh
            </button>
          </div>
        </div>

        {errorMsg && (
          <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>
            {errorMsg}
          </div>
        )}

        {/* Summary Cards */}
        <div className="summary-grid">
          <div className="summary-item">
            <div className="summary-label">Total Debits</div>
            <div className="summary-value" style={{ color: "#EF4444" }}>PKR {totalDebit.toLocaleString()}</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Total Credits</div>
            <div className="summary-value" style={{ color: "#10B981" }}>PKR {totalCredit.toLocaleString()}</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Closing Balance</div>
            <div className="summary-value" style={{ color: closingBalance >= 0 ? "#10B981" : "#EF4444" }}>
              PKR {closingBalance.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading ledger entries…</div>
        ) : sortedLines.length === 0 ? (
          <div className="ledger-card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            No transactions found for this period.
          </div>
        ) : (
          <div className="ledger-card">
            <div className="ledger-header">
              <button className="sort-btn" onClick={() => handleSort("date")}>Date {getSortIcon("date")}</button>
              <button className="sort-btn" onClick={() => handleSort("description")}>Entry #{getSortIcon("description")}</button>
              <span>Description</span>
              <button className="sort-btn" onClick={() => handleSort("debit")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Debit {getSortIcon("debit")}</button>
              <button className="sort-btn" onClick={() => handleSort("credit")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Credit {getSortIcon("credit")}</button>
              <button className="sort-btn" onClick={() => handleSort("running_balance")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Balance {getSortIcon("running_balance")}</button>
            </div>
            {sortedLines.map((line, idx) => (
              <div key={line.id || idx} className="ledger-row">
                <span style={{ fontSize: 12 }}>{line.date}</span>
                <span style={{ color: "var(--primary)", fontSize: 12 }}>{line.entry_no}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.description}</span>
                <span style={{ textAlign: "right", color: line.debit > 0 ? "#EF4444" : "var(--text-muted)", fontWeight: line.debit > 0 ? 600 : 400 }}>
                  {line.debit > 0 ? `PKR ${line.debit.toLocaleString()}` : "—"}
                </span>
                <span style={{ textAlign: "right", color: line.credit > 0 ? "#10B981" : "var(--text-muted)", fontWeight: line.credit > 0 ? 600 : 400 }}>
                  {line.credit > 0 ? `PKR ${line.credit.toLocaleString()}` : "—"}
                </span>
                <span style={{ textAlign: "right", fontWeight: 600, color: line.running_balance >= 0 ? "#10B981" : "#EF4444" }}>
                  PKR {line.running_balance.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  )
}