"use client"

import { useState, useEffect, useMemo } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown, Printer, ChevronLeft, ChevronRight } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { useCompany } from "@/contexts/CompanyContext"
import { generateGeneralLedgerPDF } from "@/lib/pdf/generalLedgerPDF"

type SortField = "date" | "description" | "debit" | "credit" | "running_balance"
type SortDir   = "asc" | "desc"

const ROWS_PER_PAGE = 50

export default function GeneralLedgerPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router       = useRouter()
  const searchParams = useSearchParams()
  const { role }     = useRole()
  const { companyName, companyTagline, logoUrl } = useCompany()
  const canView = role === "admin" || role === "accountant"

  const urlAccountId = searchParams.get("accountId")
  const [selectedAccountId, setSelectedAccountId] = useState<string>(urlAccountId || "")
  const [accounts, setAccounts]   = useState<any[]>([])
  const [account,  setAccount]    = useState<any>(null)
  const [companyId, setCompanyId] = useState<string>("")

  const now = new Date()
  const [startDate, setStartDate] = useState(searchParams.get("startDate") || `${now.getFullYear()}-01-01`)
  const [endDate,   setEndDate]   = useState(searchParams.get("endDate")   || now.toISOString().split("T")[0])

  // Tag filter options
  const [projects,   setProjects]   = useState<any[]>([])
  const [donors,     setDonors]     = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [locations,  setLocations]  = useState<any[]>([])

  // Selected tag filter values
  const [projectId,  setProjectId]  = useState("")
  const [donorId,    setDonorId]    = useState("")
  const [activityId, setActivityId] = useState("")
  const [locationId, setLocationId] = useState("")

  const [ledgerLines, setLedgerLines] = useState<any[]>([])
  const [tagLabels,   setTagLabels]   = useState<Record<string, string>>({})
  const [loading,     setLoading]     = useState(true)
  const [errorMsg,    setErrorMsg]    = useState("")

  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDir,   setSortDir]   = useState<SortDir>("asc")

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)

  // ── Fetch company ID, accounts, and tag options ───────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return
      setCompanyId(cid)
      supabase.from("accounts")   .select("id, code, name, type").eq("company_id", cid).order("code")
        .then(({ data }) => data && setAccounts(data))
      supabase.from("projects")   .select("id, name").eq("company_id", cid).is("deleted_at", null).order("name")
        .then(({ data }) => data && setProjects(data))
      supabase.from("donors")     .select("id, name").eq("company_id", cid).is("deleted_at", null).order("name")
        .then(({ data }) => data && setDonors(data))
      supabase.from("activities") .select("id, name").eq("company_id", cid).is("deleted_at", null).order("name")
        .then(({ data }) => data && setActivities(data))
      supabase.from("locations")  .select("id, name").eq("company_id", cid).order("name")
        .then(({ data }) => data && setLocations(data))
    })
  }, [])

  useEffect(() => {
    if (urlAccountId && accounts.length > 0) setSelectedAccountId(urlAccountId)
  }, [urlAccountId, accounts])

  useEffect(() => {
    if (!selectedAccountId || !companyId) { setAccount(null); return }
    supabase.from("accounts")
      .select("id, code, name, type")
      .eq("id", selectedAccountId)
      .eq("company_id", companyId)
      .single()
      .then(({ data }) => data && setAccount(data))
  }, [selectedAccountId, companyId])

  // ── Fetch ledger via secure API ───────────────────────────────────
  const fetchLedger = async () => {
    if (!selectedAccountId || !companyId) return
    setLoading(true)
    setErrorMsg("")
    setCurrentPage(1)  // reset to first page when filters change

    const params = new URLSearchParams({ accountId: selectedAccountId, startDate, endDate })
    if (projectId)  params.append("projectId",  projectId)
    if (donorId)    params.append("donorId",    donorId)
    if (activityId) params.append("activityId", activityId)
    if (locationId) params.append("locationId", locationId)

    try {
      const res  = await fetch(`/api/general-ledger?${params.toString()}`)
      const data = await res.json()
      if (data.error) {
        setErrorMsg(data.error)
        setLedgerLines([])
        setTagLabels({})
      } else {
        setLedgerLines(data.lines   || [])
        setTagLabels(data.tagLabels || {})
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to load ledger")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedAccountId && companyId) fetchLedger()
  }, [selectedAccountId, companyId, startDate, endDate, projectId, donorId, activityId, locationId])

  // ── Sorting ───────────────────────────────────────────────────────
  const sortedLines = useMemo(() => {
    const list = [...ledgerLines]
    list.sort((a, b) => {
      if (a.isOpening && !b.isOpening) return -1
      if (!a.isOpening && b.isOpening) return 1
      let valA: any, valB: any
      if (["debit", "credit", "running_balance"].includes(sortField)) {
        valA = a[sortField] || 0; valB = b[sortField] || 0
      } else {
        valA = (a[sortField] || "").toString().toLowerCase()
        valB = (b[sortField] || "").toString().toLowerCase()
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1
      if (valA > valB) return sortDir === "asc" ?  1 : -1
      return 0
    })
    return list
  }, [ledgerLines, sortField, sortDir])

  // Pagination slicing
  const totalRows = sortedLines.length
  const totalPages = Math.ceil(totalRows / ROWS_PER_PAGE)
  const startIdx = (currentPage - 1) * ROWS_PER_PAGE
  const paginatedLines = sortedLines.slice(startIdx, startIdx + ROWS_PER_PAGE)

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("asc") }
    setCurrentPage(1) // reset to first page after sorting
  }
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const totalDebit    = sortedLines.filter(l => !l.isOpening).reduce((s, l) => s + l.debit,  0)
  const totalCredit   = sortedLines.filter(l => !l.isOpening).reduce((s, l) => s + l.credit, 0)
  const closingBalance = sortedLines.length > 0
    ? sortedLines[sortedLines.length - 1].running_balance
    : 0

  // ── PDF ───────────────────────────────────────────────────────────
  const handlePrintPDF = async () => {
    if (!account || sortedLines.length === 0) return
    const doc = await generateGeneralLedgerPDF({
      companyName:    companyName    || "",
      companyAddress: "",
      companyPhone:   "",
      companyEmail:   "",
      companyTagline: companyTagline || "",
      logoUrl,
      accountName:    account.name,
      accountCode:    account.code,
      startDate,
      endDate,
      totalDebit,
      totalCredit,
      closingBalance,
      ledgerLines:    sortedLines,
      tagLabels,
    })
    doc.save(`General_Ledger_${account.code}.pdf`)
  }

  if (!role)     return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  if (!canView)  return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .ledger-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 0; box-shadow: var(--shadow-sm); overflow: hidden; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
        .ledger-header { display: grid; grid-template-columns: 90px 100px 1fr 110px 110px 130px; padding: 14px 24px; background: var(--card); font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--border); }
        .ledger-row { display: grid; grid-template-columns: 90px 100px 1fr 110px 110px 130px; padding: 12px 24px; border-bottom: 1px solid var(--border); font-size: 13px; align-items: center; transition: background 0.15s; }
        .ledger-row:hover { background: var(--card-hover); }
        .ledger-row:last-child { border-bottom: none; }
        .opening-row { background: var(--bg-soft); font-weight: 600; }
        .sort-btn { background: none; border: none; cursor: pointer; font: inherit; color: var(--text-muted); display: inline-flex; align-items: center; gap: 4px; padding: 0; font-weight: 700; text-transform: uppercase; font-size: 10px; }
        .sort-btn:hover { color: var(--primary); }
        .date-input, .select-input { height: 34px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 10px; font-size: 12px; background: var(--card); color: var(--text); outline: none; font-family: inherit; width: 140px; }
        .date-input:focus, .select-input:focus { border-color: var(--primary); }
        .btn { padding: 8px 16px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-outline { background: transparent; color: var(--text-muted); border-color: var(--border); }
        .btn-outline:hover { background: var(--card-hover); }
        .btn-pagination { padding: 4px 12px; font-size: 12px; }
        .account-select { height: 34px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 10px; font-size: 12px; background: var(--card); color: var(--text); outline: none; font-family: inherit; min-width: 220px; }
        .account-select:focus { border-color: var(--primary); }
        @media (max-width: 640px) { .ledger-header, .ledger-row { grid-template-columns: 70px 80px 1fr 80px 80px 100px; } }
      `}</style>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn btn-outline" onClick={() => router.push("/dashboard/reports")}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📒 General Ledger</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Transaction history for a specific account</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select className="account-select" value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}>
            <option value="">— Select Account —</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
          </select>
          <input type="date" className="date-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>to</span>
          <input type="date" className="date-input" value={endDate}   onChange={e => setEndDate(e.target.value)} />
          <button className="btn btn-outline" onClick={fetchLedger}>Refresh</button>
          <button className="btn btn-outline" onClick={handlePrintPDF}><Printer size={16} /> Print PDF</button>
        </div>
      </div>

      {/* ── Tag filters ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select className="select-input" value={projectId}  onChange={e => setProjectId(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="select-input" value={donorId}    onChange={e => setDonorId(e.target.value)}>
          <option value="">All Donors</option>
          {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="select-input" value={activityId} onChange={e => setActivityId(e.target.value)}>
          <option value="">All Activities</option>
          {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="select-input" value={locationId} onChange={e => setLocationId(e.target.value)}>
          <option value="">All Locations</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {errorMsg && (
        <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>
          {errorMsg}
        </div>
      )}

      {selectedAccountId && account ? (
        <>
          {/* Account badge */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ background: "var(--bg-soft)", borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 14, color: "var(--primary)" }}>{account.code}</div>
            <div>
              <div style={{ fontWeight: 700, color: "var(--text)" }}>{account.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{account.type}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
              {tagLabels.project  && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--bg-soft)", color: "var(--text-muted)" }}>Project: {tagLabels.project}</span>}
              {tagLabels.donor    && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--bg-soft)", color: "var(--text-muted)" }}>Donor: {tagLabels.donor}</span>}
              {tagLabels.activity && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--bg-soft)", color: "var(--text-muted)" }}>Activity: {tagLabels.activity}</span>}
              {tagLabels.location && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--bg-soft)", color: "var(--text-muted)" }}>Location: {tagLabels.location}</span>}
            </div>
          </div>

          {/* Summary cards */}
          <div className="summary-grid">
            <div className="summary-item">
              <div className="summary-label">Total Debits</div>
              <div className="summary-value" style={{ color: "#EF4444" }}>PKR {totalDebit.toLocaleString("en-PK")}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Total Credits</div>
              <div className="summary-value" style={{ color: "#10B981" }}>PKR {totalCredit.toLocaleString("en-PK")}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Closing Balance</div>
              <div className="summary-value" style={{ color: closingBalance >= 0 ? "#10B981" : "#EF4444" }}>
                PKR {Math.abs(closingBalance).toLocaleString("en-PK")}
                <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 4 }}>{closingBalance >= 0 ? "Dr" : "Cr"}</span>
              </div>
            </div>
          </div>

          {/* Ledger table with pagination */}
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading ledger entries…</div>
          ) : sortedLines.length === 0 ? (
            <div className="ledger-card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>No transactions found for this period.</div>
          ) : (
            <>
              <div className="ledger-card">
                <div className="ledger-header">
                  <button className="sort-btn" onClick={() => handleSort("date")}>Date {getSortIcon("date")}</button>
                  <button className="sort-btn" onClick={() => handleSort("description")}>Entry #{getSortIcon("description")}</button>
                  <span>Description</span>
                  <button className="sort-btn" onClick={() => handleSort("debit")}            style={{ textAlign: "right", justifyContent: "flex-end" }}>Debit {getSortIcon("debit")}</button>
                  <button className="sort-btn" onClick={() => handleSort("credit")}           style={{ textAlign: "right", justifyContent: "flex-end" }}>Credit {getSortIcon("credit")}</button>
                  <button className="sort-btn" onClick={() => handleSort("running_balance")}  style={{ textAlign: "right", justifyContent: "flex-end" }}>Balance {getSortIcon("running_balance")}</button>
                </div>
                {paginatedLines.map((line, idx) => (
                  <div key={line.id || idx} className={`ledger-row ${line.isOpening ? "opening-row" : ""}`}>
                    <span style={{ fontSize: 12 }}>{line.isOpening ? "" : line.date}</span>
                    <span style={{ color: "var(--primary)", fontSize: 12 }}>{line.entry_no}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.description}</span>
                    <span style={{ textAlign: "right", color: line.debit  > 0 ? "#EF4444" : "var(--text-muted)", fontWeight: line.debit  > 0 ? 600 : 400 }}>{line.debit  > 0 ? `PKR ${line.debit.toLocaleString("en-PK")}`  : "—"}</span>
                    <span style={{ textAlign: "right", color: line.credit > 0 ? "#10B981" : "var(--text-muted)", fontWeight: line.credit > 0 ? 600 : 400 }}>{line.credit > 0 ? `PKR ${line.credit.toLocaleString("en-PK")}` : "—"}</span>
                    <span style={{ textAlign: "right", fontWeight: 600, color: line.running_balance >= 0 ? "#10B981" : "#EF4444" }}>
                      PKR {Math.abs(line.running_balance).toLocaleString("en-PK")}
                      <span style={{ fontSize: 10, marginLeft: 2 }}>{line.running_balance >= 0 ? "Dr" : "Cr"}</span>
                    </span>
                  </div>
                ))}
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 16 }}>
                  <button
                    className="btn btn-outline btn-pagination"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft size={14} /> Previous
                  </button>
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    className="btn btn-outline btn-pagination"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
          <p style={{ fontSize: 16 }}>Select an account above to view its ledger.</p>
        </div>
      )}
    </div>
  )
}