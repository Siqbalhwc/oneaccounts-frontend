"use client"

import { useState, useEffect, useMemo } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown, Printer } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { useCompany } from "@/contexts/CompanyContext"
import { generateVendorLedgerPDF } from "@/lib/pdf/vendorLedgerPDF"

type SortField = "date" | "description" | "debit" | "credit" | "running_balance"
type SortDir = "asc" | "desc"

export default function VendorLedgerPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const searchParams = useSearchParams()
  const { role } = useRole()
  const { companyName, companyTagline, logoUrl } = useCompany()
  const canView = role === "admin" || role === "accountant"

  const urlSupplierId = searchParams.get("supplierId")
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(urlSupplierId || "")
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplier, setSupplier] = useState<any>(null)
  const [companyId, setCompanyId] = useState<string>("")

  const now = new Date()
  const [startDate, setStartDate] = useState(searchParams.get("startDate") || `${now.getFullYear()}-01-01`)
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || now.toISOString().split("T")[0])

  const [ledgerLines, setLedgerLines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState("")

  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  // Fetch company ID and all suppliers
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase
          .from("suppliers")
          .select("id, code, name")
          .eq("company_id", cid)
          .is("deleted_at", null)
          .order("name")
          .then(({ data }) => data && setSuppliers(data))
      }
    })
  }, [])

  useEffect(() => {
    if (urlSupplierId && suppliers.length > 0) {
      setSelectedSupplierId(urlSupplierId)
    }
  }, [urlSupplierId, suppliers])

  // Fetch selected supplier including balance
  useEffect(() => {
    if (!selectedSupplierId || !companyId) {
      setSupplier(null)
      return
    }
    supabase
      .from("suppliers")
      .select("id, code, name, balance")
      .eq("id", selectedSupplierId)
      .eq("company_id", companyId)
      .single()
      .then(({ data }) => data && setSupplier(data))
  }, [selectedSupplierId, companyId])

  // ── LEDGER FETCH (now includes real opening balance from API) ──
  const fetchLedger = async () => {
    if (!selectedSupplierId || !companyId || !supplier) return
    setLoading(true)
    setErrorMsg("")

    try {
      // 1. All bills for this supplier
      const { data: allBills } = await supabase
        .from("invoices")
        .select("id, total, invoice_no, date")
        .eq("party_id", selectedSupplierId)
        .eq("type", "purchase")
        .is("deleted_at", null)
        .order("date", { ascending: true })

      // 2. All payments for this supplier
      const { data: allPayments } = await supabase
        .from("payments")
        .select("id, amount, payment_no, payment_date")
        .eq("party_id", selectedSupplierId)
        .eq("party_type", "supplier")
        .order("payment_date", { ascending: true })

      // 3. Fetch the real opening balance entry via server API
      let openingLine = null
      try {
        const apiRes = await fetch(`/api/vendor-ledger/opening-balance?supplierId=${selectedSupplierId}`)
        const apiData = await apiRes.json()
        if (apiData.entry) {
          openingLine = {
            ...apiData.entry,
            running_balance: 0,
            isOpening: true,
          }
        }
      } catch (apiErr) {
        // API call failed – fall back to formula
      }

      // 4. Build period lines (bills = credit, payments = debit)
      const periodLines: any[] = []

      for (const bill of allBills || []) {
        if (bill.date < startDate || bill.date > endDate) continue
        periodLines.push({
          id: `bill-${bill.id}`,
          entry_no: `BILL-${bill.invoice_no}`,
          date: bill.date,
          description: `Purchase Bill ${bill.invoice_no}`,
          debit: 0,
          credit: bill.total || 0,
          running_balance: 0,
        })
      }

      for (const payment of allPayments || []) {
        if (payment.payment_date < startDate || payment.payment_date > endDate) continue
        periodLines.push({
          id: `payment-${payment.id}`,
          entry_no: `PAY-${payment.payment_no}`,
          date: payment.payment_date,
          description: `Payment ${payment.payment_no}`,
          debit: payment.amount || 0,
          credit: 0,
          running_balance: 0,
        })
      }

      periodLines.sort((a, b) => a.date.localeCompare(b.date))

      // 5. If no opening line from API, calculate from current balance
      if (!openingLine) {
        const periodDebits = periodLines.reduce((s: number, l: any) => s + l.debit, 0)
        const periodCredits = periodLines.reduce((s: number, l: any) => s + l.credit, 0)
        const currentBalance = Number(supplier.balance || 0)
        // Supplier balance is normally negative (credit), but in DB it's stored as what you owe
        // Opening = Current Balance - Period Debits + Period Credits
        const openingBalance = currentBalance - periodDebits + periodCredits

        openingLine = {
          id: "opening-calc",
          entry_no: "",
          date: startDate,
          description: "Opening Balance",
          debit: openingBalance > 0 ? openingBalance : 0,
          credit: openingBalance < 0 ? -openingBalance : 0,
          running_balance: 0,
          isOpening: true,
        }
      }

      // 6. Combine: opening line first, then period lines
      const allLines: any[] = [openingLine, ...periodLines]

      // 7. Calculate running balance from zero
      let running = 0
      for (const line of allLines) {
        running += (line.debit || 0) - (line.credit || 0)
        line.running_balance = running
      }

      setLedgerLines(allLines)
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to load ledger")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedSupplierId && companyId && supplier) fetchLedger()
  }, [selectedSupplierId, companyId, startDate, endDate, supplier])

  // Sorting (unchanged)
  const sortedLines = useMemo(() => {
    const list = [...ledgerLines]
    list.sort((a, b) => {
      if (a.isOpening && !b.isOpening) return -1
      if (!a.isOpening && b.isOpening) return 1
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
    if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("asc") }
  }
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const totalDebit = sortedLines.filter(l => !l.isOpening).reduce((s, l) => s + l.debit, 0)
  const totalCredit = sortedLines.filter(l => !l.isOpening).reduce((s, l) => s + l.credit, 0)
  const closingBalance = sortedLines.length > 0 ? sortedLines[sortedLines.length - 1].running_balance : 0

  const handlePrintPDF = async () => {
    if (!supplier || sortedLines.length === 0) return

    const pdfData = {
      companyName:    companyName || "",
      companyAddress: "",
      companyPhone:   "",
      companyEmail:   "",
      companyTagline: companyTagline || "",
      logoUrl:        logoUrl,
      supplierName:   supplier.name,
      supplierCode:   supplier.code,
      startDate:      startDate,
      endDate:        endDate,
      totalDebit:     totalDebit,
      totalCredit:    totalCredit,
      closingBalance: closingBalance,
      ledgerLines:    sortedLines,
    }

    const doc = await generateVendorLedgerPDF(pdfData)
    doc.save(`Vendor_Ledger_${supplier.code}.pdf`)
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
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
        .opening-row { background: var(--bg-soft); font-weight: 600; }
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
        .supplier-select {
          height: 34px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 10px; font-size: 12px; background: var(--card); color: var(--text);
          outline: none; font-family: inherit; min-width: 200px;
        }
        .supplier-select:focus { border-color: var(--primary); }
        @media (max-width: 640px) {
          .ledger-header, .ledger-row { grid-template-columns: 70px 80px 1fr 80px 80px 100px; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn btn-outline" onClick={() => router.push("/dashboard/reports")}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>
            🚚 Vendor Ledger
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Transaction history for a specific supplier</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            className="supplier-select"
            value={selectedSupplierId}
            onChange={(e) => setSelectedSupplierId(e.target.value)}
          >
            <option value="">— Select Supplier —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} – {s.name}
              </option>
            ))}
          </select>
          <input type="date" className="date-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>to</span>
          <input type="date" className="date-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <button className="btn btn-outline" onClick={fetchLedger}>Refresh</button>
          <button className="btn btn-outline" onClick={handlePrintPDF}>
            <Printer size={16} /> Print PDF
          </button>
        </div>
      </div>

      {errorMsg && (
        <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>
          {errorMsg}
        </div>
      )}

      {selectedSupplierId && supplier ? (
        <>
          <div style={{
            background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
            padding: "12px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16
          }}>
            <div style={{ background: "var(--bg-soft)", borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 14, color: "var(--primary)" }}>
              {supplier.code}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: "var(--text)" }}>{supplier.name}</div>
            </div>
          </div>

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
                <div key={line.id || idx} className={`ledger-row ${line.isOpening ? "opening-row" : ""}`}>
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
        </>
      ) : (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
          <p style={{ fontSize: 16 }}>Select a supplier above to view their ledger.</p>
        </div>
      )}
    </div>
  )
}