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
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape")
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Fetch company info
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

  // Auto-generate ledger if initialCustomerId is provided
  useEffect(() => {
    if (initialCustomerId && customers.length > 0) {
      setCustomerId(Number(initialCustomerId))
    }
  }, [initialCustomerId, customers])

  useEffect(() => {
    if (customerId && customers.length > 0) {
      loadLedger()
    }
  }, [customerId, customers])

  const loadLedger = async () => {
    if (!customerId) return
    setLoading(true)
    const cust = customers.find(c => c.id === customerId)
    if (!cust) { setLoading(false); return }

    // Opening balance from the customer's opening_balance field or from invoices/receipts before today?
    // We'll use opening_balance if exists, else start at 0
    const { data: custData } = await supabase.from("customers").select("opening_balance").eq("id", customerId).single()
    let opening = custData?.opening_balance || 0

    // Sales invoices
    const { data: invoices } = await supabase.from("invoices")
      .select("*").eq("type", "sale").eq("party_id", customerId).order("date")

    // Receipts (from journal entries with a reference to this customer name or via invoices)
    // Simpler: get all journal entries where description contains the customer name and source_type 'receipt'
    const { data: receipts } = await supabase.from("journal_entries")
      .select("*, journal_lines(debit,credit)")
      .eq("company_id", (await supabase.auth.getUser()).data.user?.app_metadata?.company_id)
      .ilike("description", `%${cust.name}%`)
      .order("date")

    const txns: any[] = []
    let balance = opening

    // Add opening balance as first row if non-zero
    if (opening !== 0) {
      txns.push({
        date: "",
        type: "Opening",
        ref: "",
        desc: "Opening Balance",
        debit: opening > 0 ? opening : 0,
        credit: opening < 0 ? -opening : 0,
        balance
      })
    }

    // Process invoices (Debits)
    if (invoices) {
      invoices.forEach((inv: any) => {
        const debit = inv.total || 0
        balance += debit
        txns.push({ date: inv.date, type: "Invoice", ref: inv.invoice_no, desc: `Sales Invoice`, debit, credit: 0, balance })
      })
    }

    // Process receipts (Credits)
    if (receipts) {
      receipts.forEach((rec: any) => {
        const credit = rec.journal_lines?.reduce((s: number, l: any) => s + (l.credit || 0), 0) || 0
        if (credit > 0) {
          balance -= credit
          txns.push({ date: rec.date, type: "Receipt", ref: rec.entry_no, desc: rec.description, debit: 0, credit, balance })
        }
      })
    }

    txns.sort((a, b) => {
      if (!a.date) return -1
      if (!b.date) return 1
      return a.date.localeCompare(b.date)
    })
    // Recalculate running balance after sorting
    let running = opening
    txns.forEach((t: any) => {
      if (t.type === "Opening") {
        running = opening
      } else {
        running += (t.debit || 0) - (t.credit || 0)
      }
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
        body { font-family: Arial, sans-serif; }
        .print-area { width: 100%; }
        .print-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .print-header img { max-height: 60px; }
        .print-header .company-info { text-align: right; }
        .ledger-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .ledger-table th, .ledger-table td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
        .ledger-table th { background: #f1f5f9; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
      `
      document.head.appendChild(style)
      window.print()
      document.head.removeChild(style)
    }
  }

  const exportExcel = () => {
    const cust = customers.find(c => c.id === customerId)
    const rows: any[] = []
    // Header section
    const companyName = company?.name || company?.company_name || "Company"
    const tagline = company?.tagline || ""
    const address = company?.address || ""
    const customerName = cust ? `${cust.code} - ${cust.name}` : ""
    const headerData = [
      [companyName],
      [tagline],
      [address],
      [`Customer Ledger: ${customerName}`],
      [`Date Range: All`],
      []
    ]
    headerData.forEach(row => rows.push(row))
    // Table header
    rows.push(["Date", "Type", "Reference", "Description", "Debit (PKR)", "Credit (PKR)", "Balance (PKR)"])
    // Entries
    entries.forEach(e => {
      rows.push([
        e.date,
        e.type,
        e.ref,
        e.desc,
        e.debit ? e.debit : "",
        e.credit ? e.credit : "",
        e.balance
      ])
    })
    // Final balance
    rows.push([])
    const finalBalance = entries.length > 0 ? entries[entries.length - 1].balance : 0
    rows.push(["", "", "", "", "", "Balance:", finalBalance])

    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Customer Ledger")
    XLSX.writeFile(wb, `customer_ledger_${customerName.replace(/\s/g, "_")}.xlsx`)
  }

  const cust = customers.find(c => c.id === customerId)

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/dashboard/customers")}
          style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📒 Customer Ledger</h1>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Full transaction history</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={exportExcel} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "white", border: "1px solid #E2E8F0", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
            <Download size={16} /> Excel
          </button>
          <button onClick={handlePrint} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "white", border: "1px solid #E2E8F0", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
            <Printer size={16} /> Print
          </button>
          <select value={orientation} onChange={e => setOrientation(e.target.value as any)}
            style={{ padding: "6px 10px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13, background: "white" }}>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </select>
        </div>
      </div>

      {/* Customer selector (for manual use) */}
      <div style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #E2E8F0", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Customer</label>
            <select value={customerId || ""} onChange={e => { setCustomerId(Number(e.target.value) || null); }}
              style={{ width: "100%", height: 40, border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "0 12px", fontSize: 13 }}>
              <option value="">Select customer...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
            </select>
          </div>
          <button onClick={loadLedger}
            style={{ padding: "10px 20px", background: "#1D4ED8", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Generate Ledger
          </button>
        </div>
      </div>

      {cust && (
        <div style={{ background: "#F0F7FF", borderRadius: 10, border: "1px solid #BFDBFE", padding: 14, marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
          <span><strong>{cust.name}</strong> ({cust.code})</span>
          <span style={{ fontWeight: 700, color: "#F59E0B" }}>Balance: PKR {(cust.balance || 0).toLocaleString()}</span>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>Loading...</div>
      ) : entries.length > 0 && (
        <div ref={printRef} className="print-area">
          {/* Print / Excel header (visible only on print or export, but we include it anyway) */}
          <div className="print-header" style={{ display: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {company?.logo_url && <img src={company.logo_url} alt="logo" style={{ maxHeight: 60 }} />}
              <div>
                <h2>{company?.name || company?.company_name || ""}</h2>
                {company?.tagline && <p>{company.tagline}</p>}
                {company?.address && <p>{company.address}</p>}
              </div>
            </div>
            <div>
              <strong>Customer Ledger: {cust?.code} - {cust?.name}</strong><br />
              Date: {new Date().toLocaleDateString()}
            </div>
          </div>

          <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "90px 80px 100px 1fr 90px 90px 90px", padding: "10px 14px", background: "#F8FAFC", fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>
              <span>Date</span><span>Type</span><span>Reference</span><span>Description</span><span>Debit</span><span>Credit</span><span>Balance</span>
            </div>
            {entries.map((e, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 80px 100px 1fr 90px 90px 90px", padding: "8px 14px", borderBottom: "1px solid #F1F5F9", fontSize: 12, alignItems: "center" }}>
                <span>{e.date}</span>
                <span>{e.type}</span>
                <span style={{ color: "#1E3A8A" }}>{e.ref}</span>
                <span style={{ color: "#64748B" }}>{e.desc}</span>
                <span style={{ color: "#EF4444" }}>{e.debit > 0 ? `PKR ${e.debit.toLocaleString()}` : "-"}</span>
                <span style={{ color: "#10B981" }}>{e.credit > 0 ? `PKR ${e.credit.toLocaleString()}` : "-"}</span>
                <span style={{ fontWeight: 600 }}>PKR {e.balance.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}