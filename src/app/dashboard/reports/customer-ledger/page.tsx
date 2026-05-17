"use client"

import { useState, useEffect, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useSearchParams, useRouter } from "next/navigation"
import { ArrowLeft, Download, Printer } from "lucide-react"
import * as XLSX from "xlsx"

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

  const handlePrint = () => {
    if (printRef.current) {
      const style = document.createElement('style')
      style.innerHTML = `
        @page { size: ${orientation}; margin: 10mm; }
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
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
    entries.forEach((e, i) => {
      rows.push([i + 1, e.ref, e.date, e.desc, e.debit || "", e.credit || "", e.balance])
      totalDr += e.debit || 0
      totalCr += e.credit || 0
    })
    rows.push([])
    rows.push(["", "", "", "Sub Total:", totalDr, totalCr, ""])
    rows.push(["", "", "", "Balance:", "", "", entries.length ? entries[entries.length - 1].balance : 0])

    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Customer Ledger")
    XLSX.writeFile(wb, `Customer_Ledger_${customerName.replace(/\s/g, "_")}.xlsx`)
  }

  const cust = customers.find(c => c.id === customerId)
  const totalDebit = entries.reduce((s, e) => s + (e.debit || 0), 0)
  const totalCredit = entries.reduce((s, e) => s + (e.credit || 0), 0)
  const finalBalance = entries.length ? entries[entries.length - 1].balance : 0

  return (
    <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
      <style>{`
        .card { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
        .btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; }
        .btn-outline { background: transparent; border: 1.5px solid #334155; color: #CBD5E1; }
        .btn-outline:hover { background: #1E293B; }
        .btn-primary { background: #1E3A8A; color: white; border: none; }
        .btn-primary:hover { background: #1E40AF; }
        .input { width: 100%; height: 38px; border: 1.5px solid #334155; border-radius: 8px; padding: 0 12px; font-size: 13px; background: #1E293B; color: #F1F5F9; outline: none; }
        .select { width: 100%; height: 40px; border: 1.5px solid #334155; border-radius: 8px; padding: 0 12px; font-size: 13px; background: #1E293B; color: #F1F5F9; }
        .header-row { display: grid; grid-template-columns: 40px 100px 90px 1fr 100px 100px 100px; gap: 8px; padding: 10px 14px; background: #1E293B; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94A3B8; border-bottom: 1px solid #1E293B; }
        .data-row { display: grid; grid-template-columns: 40px 100px 90px 1fr 100px 100px 100px; gap: 8px; padding: 8px 14px; border-bottom: 1px solid #1E293B; font-size: 12px; align-items: center; }
        .data-row:last-child { border-bottom: none; }
        .print-header { display: none; }
        @media print {
          .print-header { display: block; margin-bottom: 20px; }
          .print-header .two-col { display: flex; justify-content: space-between; }
          .ledger-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          .ledger-table th, .ledger-table td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
          .ledger-table th { background: #f1f5f9; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn btn-outline" onClick={() => router.push("/dashboard/customers")}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>📒 Customer Ledger</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Full transaction history</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-outline" onClick={exportExcel}><Download size={16} /> Excel</button>
          <button className="btn btn-outline" onClick={handlePrint}><Printer size={16} /> Print</button>
          <select className="select" style={{ width: 120, height: 38 }} value={orientation} onChange={e => setOrientation(e.target.value as any)}>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </select>
        </div>
      </div>

      {/* Filters card */}
      <div className="card">
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
          <button className="btn btn-primary" onClick={loadLedger} disabled={!customerId}>
            Generate
          </button>
        </div>
      </div>

      {/* Customer info & balances */}
      {cust && (
        <div className="card" style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontWeight: 600, color: "#F1F5F9" }}>{cust.name}</span>
            <span style={{ marginLeft: 12, color: "#93C5FD" }}>{cust.code}</span>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <div><span style={{ color: "#94A3B8", fontSize: 11 }}>Total Dr: </span><span style={{ fontWeight: 600, color: "#EF4444" }}>PKR {totalDebit.toLocaleString()}</span></div>
            <div><span style={{ color: "#94A3B8", fontSize: 11 }}>Total Cr: </span><span style={{ fontWeight: 600, color: "#10B981" }}>PKR {totalCredit.toLocaleString()}</span></div>
            <div><span style={{ color: "#94A3B8", fontSize: 11 }}>Balance: </span><span style={{ fontWeight: 700, color: "#F59E0B" }}>PKR {finalBalance.toLocaleString()}</span></div>
          </div>
        </div>
      )}

      {/* Ledger table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading...</div>
      ) : entries.length > 0 ? (
        <div ref={printRef} className="print-area">
          {/* Print-only header */}
          <div className="print-header">
            <div className="two-col">
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

          {/* Data table */}
          <div className="card" style={{ overflowX: "auto" }}>
            <div className="header-row">
              <span>Sr</span>
              <span>Trans #</span>
              <span>Date</span>
              <span>Description</span>
              <span style={{ textAlign: "right" }}>Debit</span>
              <span style={{ textAlign: "right" }}>Credit</span>
              <span style={{ textAlign: "right" }}>Balance</span>
            </div>
            {entries.map((e, i) => (
              <div key={i} className="data-row">
                <span style={{ color: "#94A3B8" }}>{i + 1}</span>
                <span style={{ color: "#93C5FD", fontWeight: 600 }}>{e.ref}</span>
                <span>{e.date}</span>
                <span style={{ color: "#CBD5E1" }}>{e.desc}</span>
                <span style={{ textAlign: "right", color: "#EF4444" }}>{e.debit > 0 ? `PKR ${e.debit.toLocaleString()}` : "-"}</span>
                <span style={{ textAlign: "right", color: "#10B981" }}>{e.credit > 0 ? `PKR ${e.credit.toLocaleString()}` : "-"}</span>
                <span style={{ textAlign: "right", fontWeight: 600 }}>PKR {e.balance.toLocaleString()}</span>
              </div>
            ))}
          </div>

          {/* Sub total summary */}
          <div className="card" style={{ display: "flex", justifyContent: "flex-end", gap: 32, marginTop: 16 }}>
            <div><span style={{ color: "#94A3B8", fontSize: 12 }}>Total Debit: </span><span style={{ color: "#EF4444", fontWeight: 600 }}>PKR {totalDebit.toLocaleString()}</span></div>
            <div><span style={{ color: "#94A3B8", fontSize: 12 }}>Total Credit: </span><span style={{ color: "#10B981", fontWeight: 600 }}>PKR {totalCredit.toLocaleString()}</span></div>
            <div><span style={{ color: "#94A3B8", fontSize: 12 }}>Closing Balance: </span><span style={{ color: "#F59E0B", fontWeight: 700 }}>PKR {finalBalance.toLocaleString()}</span></div>
          </div>
        </div>
      ) : (
        customerId && <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>No transactions found for selected period.</div>
      )}
    </div>
  )
}