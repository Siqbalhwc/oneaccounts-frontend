"use client"

import { useState, useEffect, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useSearchParams, useRouter } from "next/navigation"
import { ArrowLeft, Download, Printer, ArrowUpDown, ArrowUp, ArrowDown, FileText } from "lucide-react"
import * as XLSX from "xlsx"

type SortField = "sr" | "ref" | "date" | "desc" | "debit" | "credit" | "balance"
type SortDir = "asc" | "desc"

export default function CustomerLedgerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialCustomerId = searchParams.get("customerId")

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [company, setCompany] = useState<any>(null)
  const [customers, setCustomers] = useState<any[]>([])
  const [customerId, setCustomerId] = useState<number | null>(
    initialCustomerId ? Number(initialCustomerId) : null
  )
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape")
  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  // ── Orientation: inject @page rule dynamically so it actually works ──
  useEffect(() => {
    const style = document.createElement("style")
    style.id = "print-orientation-style"
    style.innerHTML = `@page { size: A4 ${orientation}; margin: 15mm; }`
    const existing = document.getElementById("print-orientation-style")
    if (existing) existing.remove()
    document.head.appendChild(style)
    return () => { document.getElementById("print-orientation-style")?.remove() }
  }, [orientation])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        supabase.from("company_settings").select("*").eq("company_id", cid).single().then(r => {
          if (r.data) setCompany(r.data)
          else {
            supabase.from("companies").select("name, logo_url, tagline, address").eq("id", cid).single().then(r2 => {
              if (r2.data) setCompany(r2.data)
            })
          }
        })
      }
    })
  }, [])

  useEffect(() => {
    supabase.from("customers").select("id,code,name,balance").order("name").then(r => {
      if (r.data) setCustomers(r.data)
    })
  }, [])

  useEffect(() => {
    if (initialCustomerId && customers.length > 0) setCustomerId(Number(initialCustomerId))
  }, [initialCustomerId, customers])

  useEffect(() => {
    if (customerId && customers.length > 0) loadLedger()
  }, [customerId, customers, dateFrom, dateTo])

  const loadLedger = async () => {
    if (!customerId) return
    setLoading(true)
    const cust = customers.find(c => c.id === customerId)
    if (!cust) { setLoading(false); return }

    const { data: custData } = await supabase.from("customers").select("opening_balance").eq("id", customerId).single()
    let opening = custData?.opening_balance || 0

    const { data: { user } } = await supabase.auth.getUser()
    const companyId = (user?.app_metadata as any)?.company_id

    let invQuery = supabase.from("invoices")
      .select("*").eq("type", "sale").eq("party_id", customerId)
    if (dateFrom) invQuery = invQuery.gte("date", dateFrom)
    if (dateTo) invQuery = invQuery.lte("date", dateTo)
    const { data: invoices } = await invQuery.order("date")

    let recQuery = supabase.from("journal_entries")
      .select("*, journal_lines(debit,credit)")
      .eq("company_id", companyId)
      .ilike("description", `%${cust.name}%`)
    if (dateFrom) recQuery = recQuery.gte("date", dateFrom)
    if (dateTo) recQuery = recQuery.lte("date", dateTo)
    const { data: receipts } = await recQuery.order("date")

    const txns: any[] = []
    let balance = opening

    if (opening !== 0) {
      txns.push({ date: dateFrom || "Start", type: "Opening", ref: "", desc: "Opening Balance", debit: opening > 0 ? opening : 0, credit: opening < 0 ? -opening : 0, balance })
    }

    if (invoices) {
      invoices.forEach((inv: any) => {
        const debit = inv.total || 0
        balance += debit
        txns.push({ date: inv.date, type: "Invoice", ref: inv.invoice_no, desc: "Sales Invoice", debit, credit: 0, balance })
      })
    }

    if (receipts) {
      receipts.forEach((rec: any) => {
        const credit = rec.journal_lines?.reduce((s: number, l: any) => s + (l.credit || 0), 0) || 0
        if (credit > 0) {
          balance -= credit
          txns.push({ date: rec.date, type: "Receipt", ref: rec.entry_no, desc: rec.description, debit: 0, credit, balance })
        }
      })
    }

    txns.sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    let running = opening
    txns.forEach(t => {
      if (t.type === "Opening") running = opening
      else running += (t.debit || 0) - (t.credit || 0)
      t.balance = running
    })

    setEntries(txns)
    setLoading(false)
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("asc") }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={11} style={{ opacity: 0.45 }} />
    return sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />
  }

  const sortedEntries = [...entries].sort((a, b) => {
    let valA: any, valB: any
    if (sortField === "sr") { valA = entries.indexOf(a); valB = entries.indexOf(b) }
    else {
      valA = a[sortField] ?? ""; valB = b[sortField] ?? ""
      if (["debit", "credit", "balance"].includes(sortField)) { valA = Number(valA) || 0; valB = Number(valB) || 0 }
      else { valA = String(valA).toLowerCase(); valB = String(valB).toLowerCase() }
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  // ── Print: hides everything except the report pane ──
  const handlePrint = () => window.print()

  const exportExcel = () => {
    const cust = customers.find(c => c.id === customerId)
    const companyName = company?.name || company?.company_name || "Company"
    const customerName = cust ? `${cust.code} - ${cust.name}` : ""
    const rows: any[] = [
      [companyName], [company?.tagline || ""], [company?.address || ""],
      [`Customer Ledger: ${customerName}`],
      [`Period: ${dateFrom || "All"} to ${dateTo || "All"}`],
      [`Printed: ${new Date().toLocaleDateString()}`], [],
      ["Sr", "Date", "Reference", "Description", "Debit (PKR)", "Credit (PKR)", "Balance (PKR)"]
    ]
    let totalDr = 0, totalCr = 0
    sortedEntries.forEach((e, i) => {
      rows.push([i + 1, e.date, e.ref, e.desc, e.debit || "", e.credit || "", e.balance])
      totalDr += e.debit || 0; totalCr += e.credit || 0
    })
    rows.push([], ["", "", "", "Sub Total:", totalDr, totalCr, ""])
    rows.push(["", "", "", "Balance:", "", "", sortedEntries.length ? sortedEntries[sortedEntries.length - 1].balance : 0])
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Customer Ledger")
    XLSX.writeFile(wb, `Customer_Ledger_${customerName.replace(/\s/g, "_")}.xlsx`)
  }

  const cust = customers.find(c => c.id === customerId)
  const totalDebit = sortedEntries.reduce((s, e) => s + (e.debit || 0), 0)
  const totalCredit = sortedEntries.reduce((s, e) => s + (e.credit || 0), 0)
  const finalBalance = sortedEntries.length ? sortedEntries[sortedEntries.length - 1].balance : 0
  const companyName = company?.name || company?.company_name || ""

  const fmt = (n: number) => n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <>
      {/* ── Global print styles ──
          Critical: hides layout shell (sidebar, nav, topbar) so only .print-root renders.
          Your layout likely wraps this page in a div with class like "layout", "sidebar-layout", etc.
          Adjust selectors to match your actual layout wrapper class names.
      */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');

        /* ═══ SCREEN STYLES ═══ */
        .cl-wrap { padding: 20px 24px; background: #0B1120; min-height: 100vh; font-family: 'DM Sans', sans-serif; color: #E2E8F0; }
        .cl-card { background: #111827; border: 1px solid #1E293B; border-radius: 12px; overflow: hidden; }
        .cl-btn { padding: 7px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; border: 1.5px solid #334155; background: transparent; color: #CBD5E1; transition: 0.15s; font-family: inherit; }
        .cl-btn:hover { background: #1E293B; color: #F1F5F9; }
        .cl-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .cl-input { width: 100%; height: 36px; border: 1.5px solid #334155; border-radius: 8px; padding: 0 11px; font-size: 13px; background: #1E293B; color: #F1F5F9; outline: none; font-family: inherit; box-sizing: border-box; }
        .cl-select { width: 100%; height: 36px; border: 1.5px solid #334155; border-radius: 8px; padding: 0 11px; font-size: 13px; background: #1E293B; color: #F1F5F9; font-family: inherit; }
        .cl-th-row { display: grid; grid-template-columns: 44px 100px 110px 1fr 120px 120px 120px; gap: 8px; padding: 11px 18px; background: #0F172A; border-bottom: 1px solid #1E293B; }
        .cl-sort-btn { background: none; border: none; color: #94A3B8; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; font: 600 10px/1 'DM Sans', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; padding: 0; }
        .cl-sort-btn:hover { color: #93C5FD; }
        .cl-dr { display: grid; grid-template-columns: 44px 100px 110px 1fr 120px 120px 120px; gap: 8px; padding: 9px 18px; border-bottom: 1px solid #1E293B; font-size: 13px; align-items: center; transition: background 0.12s; }
        .cl-dr:hover { background: rgba(30,41,59,0.6); }
        .cl-dr:last-child { border-bottom: none; }
        .r { text-align: right; }
        .mono { font-family: 'DM Mono', monospace; }

        /* ═══ PRINT STYLES ═══
           This is the critical section. It:
           1. Hides ALL screen UI elements
           2. Shows only the .print-root div
           3. Forces white background on html/body
           4. Removes sidebar / nav that your layout injects
        */
        @media print {
          /* Force browser to print backgrounds/colors */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

          /* Hide the entire page body content except our print root */
          body > * { display: none !important; }

          /* Show next.js app root and our print root */
          body > #__next,
          body > div#__next > * { display: none !important; }

          /* Our dedicated print portal will be appended to body */
          #cl-print-portal { display: block !important; }

          /* White clean background */
          html, body { background: #fff !important; margin: 0; padding: 0; }

          .pr-page {
            background: white;
            color: #111;
            font-family: 'DM Sans', Georgia, serif;
            padding: 0;
          }

          /* Header band — white background, dark text */
          .pr-header-band {
            background: #ffffff;
            color: #0F172A;
            padding: 18px 24px 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0;
            border-bottom: 2.5px solid #1E3A5F;
          }

          .pr-company-name { font-size: 18pt; font-weight: 800; margin: 0 0 2px; letter-spacing: -0.01em; color: #0F172A; }
          .pr-company-sub { font-size: 8.5pt; color: #64748B; margin: 0; }

          .pr-report-badge { text-align: right; }
          .pr-report-title { font-size: 14pt; font-weight: 700; margin: 0 0 4px; color: #1E3A5F; }
          .pr-report-meta { font-size: 8pt; color: #64748B; line-height: 1.6; }

          /* Sub-header: customer info bar */
          .pr-info-bar {
            background: #F8FAFC;
            border-bottom: 1px solid #E2E8F0;
            padding: 8px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 8.5pt;
          }
          .pr-info-label { color: #64748B; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; font-size: 7pt; }
          .pr-info-value { color: #0F172A; font-weight: 700; font-size: 9pt; margin-top: 1px; }

          /* Table */
          .pr-table-wrap { padding: 0 0; }
          .pr-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }

          .pr-table thead tr { background: #1E3A5F; color: white; }
          .pr-table th {
            padding: 8px 10px;
            font-size: 7.5pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.07em;
            border: none;
            white-space: nowrap;
          }
          .pr-table th.r, .pr-table td.r { text-align: right; }
          .pr-table th.c, .pr-table td.c { text-align: center; }

          .pr-table tbody tr:nth-child(even) { background: #F8FAFC; }
          .pr-table tbody tr:nth-child(odd) { background: #fff; }

          .pr-table td {
            padding: 7px 10px;
            border-bottom: 1px solid #E2E8F0;
            color: #1E293B;
            vertical-align: middle;
          }

          .pr-table td.td-ref { color: #1E3A5F; font-weight: 600; }
          .pr-table td.td-dr { color: #B91C1C; font-weight: 500; }
          .pr-table td.td-cr { color: #047857; font-weight: 500; }
          .pr-table td.td-bal { color: #1E3A5F; font-weight: 700; }
          .pr-table td.td-open { color: #7C3AED; font-style: italic; }

          /* Footer totals */
          .pr-totals-row { background: #1E3A5F !important; }
          .pr-totals-row td {
            color: white !important;
            font-weight: 700 !important;
            font-size: 8.5pt;
            padding: 9px 10px;
            border: none !important;
          }

          /* Page footer */
          .pr-footer {
            margin-top: 20px;
            padding: 8px 24px;
            border-top: 1px solid #CBD5E1;
            display: flex;
            justify-content: space-between;
            font-size: 7.5pt;
            color: #64748B;
          }

          .pr-stripe { display: none; }
        }

        /* Hide print portal on screen */
        #cl-print-portal { display: none; }
      `}</style>

      {/* ── SCREEN UI ── */}
      <div className="cl-wrap">

        {/* Topbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <button className="cl-btn" onClick={() => router.push("/dashboard/customers")}>
            <ArrowLeft size={15} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <FileText size={20} style={{ color: "#60A5FA" }} />
              Customer Ledger
            </h1>
            <p style={{ color: "#64748B", fontSize: 12, margin: 0 }}>Full transaction history per customer</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="cl-btn" onClick={exportExcel} disabled={!sortedEntries.length}>
              <Download size={14} /> Excel
            </button>
            <select
              className="cl-select"
              style={{ width: 130 }}
              value={orientation}
              onChange={e => setOrientation(e.target.value as any)}
            >
              <option value="landscape">🖨 Landscape</option>
              <option value="portrait">🖨 Portrait</option>
            </select>
            <button className="cl-btn" onClick={handlePrint} disabled={!sortedEntries.length}
              style={{ borderColor: "#3B82F6", color: "#93C5FD" }}>
              <Printer size={14} /> Print / PDF
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="cl-card" style={{ padding: 14, marginBottom: 14, display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 2, minWidth: 0 }}>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#64748B", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Customer</label>
            <select className="cl-select" value={customerId || ""} onChange={e => setCustomerId(Number(e.target.value) || null)}>
              <option value="">Select customer…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 110 }}>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#64748B", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>From</label>
            <input className="cl-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 110 }}>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#64748B", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>To</label>
            <input className="cl-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <button className="cl-btn" onClick={loadLedger} disabled={!customerId}
            style={{ height: 36, borderColor: "#3B82F6", color: "#93C5FD" }}>
            Generate
          </button>
        </div>

        {/* Summary strip */}
        {cust && (
          <div className="cl-card" style={{ padding: "10px 18px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontWeight: 700, color: "#F1F5F9" }}>{cust.name}</span>
              <span style={{ marginLeft: 10, color: "#60A5FA", fontSize: 12, background: "#1E3A5F", padding: "2px 8px", borderRadius: 4 }}>{cust.code}</span>
            </div>
            <div style={{ display: "flex", gap: 28, fontSize: 13 }}>
              <div><span style={{ color: "#64748B", fontSize: 11 }}>Total Dr </span><span style={{ fontWeight: 700, color: "#F87171", fontFamily: "'DM Mono', monospace" }}>PKR {fmt(totalDebit)}</span></div>
              <div><span style={{ color: "#64748B", fontSize: 11 }}>Total Cr </span><span style={{ fontWeight: 700, color: "#34D399", fontFamily: "'DM Mono', monospace" }}>PKR {fmt(totalCredit)}</span></div>
              <div><span style={{ color: "#64748B", fontSize: 11 }}>Balance </span><span style={{ fontWeight: 800, color: "#A78BFA", fontFamily: "'DM Mono', monospace" }}>PKR {fmt(finalBalance)}</span></div>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 48, color: "#64748B" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>Loading ledger…
          </div>
        ) : sortedEntries.length > 0 ? (
          <div className="cl-card">
            {/* Column headers */}
            <div className="cl-th-row">
              <button className="cl-sort-btn" onClick={() => handleSort("sr")}># {getSortIcon("sr")}</button>
              <button className="cl-sort-btn" onClick={() => handleSort("date")}>Date {getSortIcon("date")}</button>
              <button className="cl-sort-btn" onClick={() => handleSort("ref")}>Ref {getSortIcon("ref")}</button>
              <button className="cl-sort-btn" onClick={() => handleSort("desc")}>Description {getSortIcon("desc")}</button>
              <button className="cl-sort-btn r" style={{ justifyContent: "flex-end" }} onClick={() => handleSort("debit")}>Debit {getSortIcon("debit")}</button>
              <button className="cl-sort-btn r" style={{ justifyContent: "flex-end" }} onClick={() => handleSort("credit")}>Credit {getSortIcon("credit")}</button>
              <button className="cl-sort-btn r" style={{ justifyContent: "flex-end" }} onClick={() => handleSort("balance")}>Balance {getSortIcon("balance")}</button>
            </div>
            {sortedEntries.map((e, i) => (
              <div key={i} className="cl-dr">
                <span style={{ color: "#475569", fontSize: 12 }}>{i + 1}</span>
                <span style={{ fontSize: 12.5 }}>{e.date}</span>
                <span style={{ color: "#60A5FA", fontWeight: 600, fontSize: 12 }}>{e.ref}</span>
                <span style={{ color: "#CBD5E1", fontSize: 12.5 }}>{e.desc}</span>
                <span className="r mono" style={{ color: e.debit > 0 ? "#F87171" : "#475569", fontSize: 12.5 }}>{e.debit > 0 ? fmt(e.debit) : "–"}</span>
                <span className="r mono" style={{ color: e.credit > 0 ? "#34D399" : "#475569", fontSize: 12.5 }}>{e.credit > 0 ? fmt(e.credit) : "–"}</span>
                <span className="r mono" style={{ color: "#A78BFA", fontWeight: 700, fontSize: 12.5 }}>{fmt(e.balance)}</span>
              </div>
            ))}
            {/* Totals footer */}
            <div style={{ display: "grid", gridTemplateColumns: "44px 100px 110px 1fr 120px 120px 120px", gap: 8, padding: "10px 18px", background: "#0F172A", borderTop: "2px solid #334155" }}>
              <span />
              <span />
              <span />
              <span style={{ fontWeight: 700, color: "#94A3B8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>Totals</span>
              <span className="r mono" style={{ color: "#F87171", fontWeight: 700, fontSize: 12.5 }}>{fmt(totalDebit)}</span>
              <span className="r mono" style={{ color: "#34D399", fontWeight: 700, fontSize: 12.5 }}>{fmt(totalCredit)}</span>
              <span className="r mono" style={{ color: "#A78BFA", fontWeight: 800, fontSize: 13 }}>{fmt(finalBalance)}</span>
            </div>
          </div>
        ) : (
          customerId && !loading && (
            <div style={{ textAlign: "center", padding: 48, color: "#475569" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
              No transactions found for the selected period.
            </div>
          )
        )}
      </div>

      {/* ── PRINT PORTAL ──
          This div is appended to <body> via a Portal (see PrintPortal component below).
          It lives OUTSIDE the Next.js layout, so sidebar/topbar never print.
      */}
      <PrintPortal>
        <div id="cl-print-portal">
          <div className="pr-page">
            {/* Accent stripe */}
            <div className="pr-stripe" />

            {/* Header band */}
            <div className="pr-header-band">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {company?.logo_url && (
                  <img
                    src={company.logo_url}
                    alt="logo"
                    style={{ maxHeight: 48, maxWidth: 100, objectFit: "contain", borderRadius: 4 }}
                  />
                )}
                <div>
                  <p className="pr-company-name">{companyName || "Company Name"}</p>
                  {(company?.tagline || company?.address) && (
                    <p className="pr-company-sub">
                      {company?.tagline}{company?.tagline && company?.address ? " · " : ""}{company?.address}
                    </p>
                  )}
                </div>
              </div>
              <div className="pr-report-badge">
                <p className="pr-report-title">Customer Ledger</p>
                <p className="pr-report-meta">
                  Period: {dateFrom || "All dates"} – {dateTo || "present"}<br />
                  Printed: {new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" })}
                </p>
              </div>
            </div>

            {/* Customer info bar */}
            <div className="pr-info-bar">
              <div>
                <div className="pr-info-label">Customer</div>
                <div className="pr-info-value">{cust ? `${cust.code} – ${cust.name}` : "–"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="pr-info-label">Closing Balance</div>
                <div className="pr-info-value" style={{ color: "#1E3A5F", fontSize: "11pt" }}>
                  PKR {fmt(finalBalance)}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="pr-table-wrap">
              <table className="pr-table">
                <thead>
                  <tr>
                    <th className="c" style={{ width: "4%" }}>#</th>
                    <th style={{ width: "9%" }}>Date</th>
                    <th style={{ width: "11%" }}>Reference</th>
                    <th style={{ width: "36%" }}>Description</th>
                    <th className="r" style={{ width: "13%" }}>Debit (PKR)</th>
                    <th className="r" style={{ width: "13%" }}>Credit (PKR)</th>
                    <th className="r" style={{ width: "14%" }}>Balance (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEntries.map((e, i) => (
                    <tr key={i}>
                      <td className="c" style={{ color: "#94A3B8" }}>{i + 1}</td>
                      <td>{e.date}</td>
                      <td className="td-ref">{e.ref}</td>
                      <td className={e.type === "Opening" ? "td-open" : ""}>{e.desc}</td>
                      <td className={`r td-dr`}>{e.debit > 0 ? fmt(e.debit) : "–"}</td>
                      <td className={`r td-cr`}>{e.credit > 0 ? fmt(e.credit) : "–"}</td>
                      <td className="r td-bal">{fmt(e.balance)}</td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="pr-totals-row">
                    <td colSpan={4} style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>Grand Total</td>
                    <td className="r">{fmt(totalDebit)}</td>
                    <td className="r">{fmt(totalCredit)}</td>
                    <td className="r">{fmt(finalBalance)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="pr-footer">
              <span>{companyName} — Confidential</span>
              <span>Customer Ledger · {cust?.name}</span>
              <span>Generated by OneAccounts</span>
            </div>
          </div>
        </div>
      </PrintPortal>
    </>
  )
}

/* ── PrintPortal: renders children into document.body, outside the Next.js layout ── */
import { createPortal } from "react-dom"

function PrintPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null
  return createPortal(children, document.body)
}
