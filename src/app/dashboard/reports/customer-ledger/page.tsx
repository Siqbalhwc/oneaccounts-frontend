"use client"

import { useState, useEffect, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useSearchParams, useRouter } from "next/navigation"
import { ArrowLeft, Download, Printer, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
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
  const printRef = useRef<HTMLDivElement>(null)

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
    if (initialCustomerId && customers.length > 0) {
      setCustomerId(Number(initialCustomerId))
    }
  }, [initialCustomerId, customers])

  useEffect(() => {
    if (customerId && customers.length > 0) {
      loadLedger()
    }
  }, [customerId, customers, dateFrom, dateTo])

  const loadLedger = async () => {
    if (!customerId) return
    setLoading(true)
    const cust = customers.find(c => c.id === customerId)
    if (!cust) { setLoading(false); return }

    const { data: custData } = await supabase.from("customers").select("opening_balance").eq("id", customerId).single()
    let opening = custData?.opening_balance || 0

    let invQuery = supabase.from("invoices")
      .select("*").eq("type", "sale").eq("party_id", customerId)
    if (dateFrom) invQuery = invQuery.gte("date", dateFrom)
    if (dateTo) invQuery = invQuery.lte("date", dateTo)
    const { data: invoices } = await invQuery.order("date")

    let recQuery = supabase.from("journal_entries")
      .select("*, journal_lines(debit,credit)")
      .eq("company_id", (await supabase.auth.getUser()).data.user?.app_metadata?.company_id)
      .ilike("description", `%${cust.name}%`)
    if (dateFrom) recQuery = recQuery.gte("date", dateFrom)
    if (dateTo) recQuery = recQuery.lte("date", dateTo)
    const { data: receipts } = await recQuery.order("date")

    const txns: any[] = []
    let balance = opening

    if (opening !== 0) {
      txns.push({
        date: dateFrom || "Start",
        type: "Opening",
        ref: "",
        desc: "Opening Balance",
        debit: opening > 0 ? opening : 0,
        credit: opening < 0 ? -opening : 0,
        balance
      })
    }

    if (invoices) {
      invoices.forEach((inv: any) => {
        const debit = inv.total || 0
        balance += debit
        txns.push({ date: inv.date, type: "Invoice", ref: inv.invoice_no, desc: `Sales Invoice`, debit, credit: 0, balance })
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

  const sortedEntries = [...entries].sort((a, b) => {
    let valA, valB
    if (sortField === "sr") {
      valA = entries.indexOf(a) + 1
      valB = entries.indexOf(b) + 1
    } else {
      valA = a[sortField] ?? ""
      valB = b[sortField] ?? ""
      if (sortField === "debit" || sortField === "credit" || sortField === "balance") {
        valA = Number(valA) || 0
        valB = Number(valB) || 0
      } else {
        valA = String(valA).toLowerCase()
        valB = String(valB).toLowerCase()
      }
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const handlePrint = () => {
    if (printRef.current) {
      const style = document.createElement('style')
      style.innerHTML = `
        @page { size: ${orientation}; margin: 10mm; }
        @media print {
          body { background: white !important; }
          body * { color: #000 !important; background: white !important; border-color: #ddd !important; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .card { border: 1px solid #ddd !important; box-shadow: none !important; }
          .header-row { background: #f1f5f9 !important; color: #000 !important; font-weight: 700 !important; }
          .data-row { border-bottom: 1px solid #ddd !important; }
          .print-header { display: block !important; margin-bottom: 20px; }
        }
      `
      document.head.appendChild(style)
      window.print()
      document.head.removeChild(style)
    }
  }

  const exportExcel = () => {
    const cust = customers.find(c => c.id === customerId)
    const companyName = company?.name || company?.company_name || "Company"
    const tagline = company?.tagline || ""
    const address = company?.address || ""
    const customerName = cust ? `${cust.code} - ${cust.name}` : ""
    const rows: any[] = [
      [companyName],
      [tagline],
      [address],
      [`Customer Ledger: ${customerName}`],
      [`Period: ${dateFrom || "All"} to ${dateTo || "All"}`],
      [`Printed: ${new Date().toLocaleDateString()}`],
      [],
      ["Sr", "Transaction #", "Date", "Description", "Debit (PKR)", "Credit (PKR)", "Balance (PKR)"]
    ]
    let totalDr = 0, totalCr = 0
    sortedEntries.forEach((e, i) => {
      rows.push([i + 1, e.ref, e.date, e.desc, e.debit || "", e.credit || "", e.balance])
      totalDr += e.debit || 0
      totalCr += e.credit || 0
    })
    rows.push([])
    rows.push(["", "", "", "Sub Total:", totalDr, totalCr, ""])
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

  return (
    <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .card { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.2); overflow: hidden; }
        .btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; border: 1.5px solid #334155; background: transparent; color: #CBD5E1; }
        .btn:hover { background: #1E293B; }
        .input { width: 100%; height: 38px; border: 1.5px solid #334155; border-radius: 8px; padding: 0 12px; font-size: 13px; background: #1E293B; color: #F1F5F9; outline: none; }
        .select { width: 100%; height: 40px; border: 1.5px solid #334155; border-radius: 8px; padding: 0 12px; font-size: 13px; background: #1E293B; color: #F1F5F9; }
        .header-row { display: grid; grid-template-columns: 40px 100px 90px 1fr 100px 100px 100px; gap: 8px; padding: 12px 20px; background: #1E293B; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94A3B8; border-bottom: 1px solid #1E293B; }
        .data-row { display: grid; grid-template-columns: 40px 100px 90px 1fr 100px 100px 100px; gap: 8px; padding: 10px 20px; border-bottom: 1px solid #1E293B; font-size: 13px; align-items: center; transition: background 0.15s; }
        .data-row:hover { background: #1E293B; }
        .data-row:last-child { border-bottom: none; }
        .sort-btn { background: none; border: none; color: inherit; font: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; padding: 0; font-weight: 700; text-transform: uppercase; font-size: 10px; }
        .sort-btn:hover { color: #93C5FD; }
        .summary-item { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 16px; }
        @media print {
          body { background: white !important; }
          body * { color: #000 !important; background: white !important; border-color: #ddd !important; }
          .card { border: 1px solid #ddd !important; box-shadow: none !important; }
          .header-row { background: #f1f5f9 !important; color: #000 !important; }
          .data-row { border-bottom: 1px solid #ddd !important; }
          .print-header { display: block !important; margin-bottom: 20px; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn" onClick={() => router.push("/dashboard/customers")}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>📒 Customer Ledger</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Full transaction history</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn" onClick={exportExcel}><Download size={16} /> Excel</button>
          <button className="btn" onClick={handlePrint}><Printer size={16} /> Print</button>
          <select className="select" style={{ width: 120, height: 38 }} value={orientation} onChange={e => setOrientation(e.target.value as any)}>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </select>
        </div>
      </div>

      {/* Filters card */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 120px", gap: 12, alignItems: "end" }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#94A3B8", marginBottom: 4 }}>Customer</label>
            <select className="select" value={customerId || ""} onChange={e => { setCustomerId(Number(e.target.value) || null); }}>
              <option value="">Select customer...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#94A3B8", marginBottom: 4 }}>Date From</label>
            <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#94A3B8", marginBottom: 4 }}>Date To</label>
            <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <button className="btn" onClick={loadLedger} disabled={!customerId}>
            Generate
          </button>
        </div>
      </div>

      {/* Customer info & balances */}
      {cust && (
        <div className="card" style={{ padding: 16, marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontWeight: 600, color: "#F1F5F9" }}>{cust.name}</span>
            <span style={{ marginLeft: 12, color: "#93C5FD" }}>{cust.code}</span>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <div><span style={{ color: "#94A3B8", fontSize: 11 }}>Total Dr: </span><span style={{ fontWeight: 600, color: "#F87171" }}>PKR {totalDebit.toLocaleString()}</span></div>
            <div><span style={{ color: "#94A3B8", fontSize: 11 }}>Total Cr: </span><span style={{ fontWeight: 600, color: "#2DD4BF" }}>PKR {totalCredit.toLocaleString()}</span></div>
            <div><span style={{ color: "#94A3B8", fontSize: 11 }}>Balance: </span><span style={{ fontWeight: 700, color: "#A78BFA" }}>PKR {finalBalance.toLocaleString()}</span></div>
          </div>
        </div>
      )}

      {/* Ledger table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div>
      ) : sortedEntries.length > 0 ? (
        <div ref={printRef} className="print-area">
          {/* Print-only company header */}
          <div className="print-header" style={{ display: "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {company?.logo_url && <img src={company.logo_url} alt="logo" style={{ maxHeight: 60 }} />}
                <div>
                  <h2 style={{ margin: 0 }}>{company?.name || company?.company_name || ""}</h2>
                  {company?.tagline && <p style={{ margin: 0 }}>{company.tagline}</p>}
                  {company?.address && <p style={{ margin: 0 }}>{company.address}</p>}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <strong>Customer Ledger</strong><br />
                Customer: {cust?.code} - {cust?.name}<br />
                Period: {dateFrom || "All"} to {dateTo || "All"}<br />
                Printed: {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="header-row">
              <button className="sort-btn" onClick={() => handleSort("sr")}>Sr {getSortIcon("sr")}</button>
              <button className="sort-btn" onClick={() => handleSort("ref")}>Trans # {getSortIcon("ref")}</button>
              <button className="sort-btn" onClick={() => handleSort("date")}>Date {getSortIcon("date")}</button>
              <button className="sort-btn" onClick={() => handleSort("desc")}>Description {getSortIcon("desc")}</button>
              <button className="sort-btn" style={{ justifyContent: "flex-end" }} onClick={() => handleSort("debit")}>Debit {getSortIcon("debit")}</button>
              <button className="sort-btn" style={{ justifyContent: "flex-end" }} onClick={() => handleSort("credit")}>Credit {getSortIcon("credit")}</button>
              <button className="sort-btn" style={{ justifyContent: "flex-end" }} onClick={() => handleSort("balance")}>Balance {getSortIcon("balance")}</button>
            </div>
            {sortedEntries.map((e, i) => (
              <div key={i} className="data-row">
                <span style={{ color: "#94A3B8" }}>{i + 1}</span>
                <span style={{ color: "#93C5FD", fontWeight: 600 }}>{e.ref}</span>
                <span>{e.date}</span>
                <span style={{ color: "#CBD5E1" }}>{e.desc}</span>
                <span style={{ textAlign: "right", color: "#F87171" }}>{e.debit > 0 ? `PKR ${e.debit.toLocaleString()}` : "-"}</span>
                <span style={{ textAlign: "right", color: "#2DD4BF" }}>{e.credit > 0 ? `PKR ${e.credit.toLocaleString()}` : "-"}</span>
                <span style={{ textAlign: "right", fontWeight: 600, color: "#A78BFA" }}>PKR {e.balance.toLocaleString()}</span>
              </div>
            ))}
          </div>

          {/* Sub total summary */}
          <div className="card" style={{ padding: 16, marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 32 }}>
            <div><span style={{ color: "#94A3B8", fontSize: 12 }}>Total Debit: </span><span style={{ color: "#F87171", fontWeight: 600 }}>PKR {totalDebit.toLocaleString()}</span></div>
            <div><span style={{ color: "#94A3B8", fontSize: 12 }}>Total Credit: </span><span style={{ color: "#2DD4BF", fontWeight: 600 }}>PKR {totalCredit.toLocaleString()}</span></div>
            <div><span style={{ color: "#94A3B8", fontSize: 12 }}>Closing Balance: </span><span style={{ color: "#A78BFA", fontWeight: 700 }}>PKR {finalBalance.toLocaleString()}</span></div>
          </div>
        </div>
      ) : (
        customerId && <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>No transactions found for selected period.</div>
      )}
    </div>
  )
}