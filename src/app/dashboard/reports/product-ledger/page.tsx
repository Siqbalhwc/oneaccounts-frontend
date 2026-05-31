"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown, Printer } from "lucide-react"
import { useCompany } from "@/contexts/CompanyContext"
import { generateProductLedgerPDF } from "@/lib/pdf/productLedgerPDF"

type SortField = "date" | "type" | "ref" | "qty_in" | "qty_out" | "balance"
type SortDir = "asc" | "desc"

export default function ProductLedgerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const productId = searchParams.get("productId")
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { companyName, companyTagline, logoUrl } = useCompany()

  const [product, setProduct] = useState<any>(null)
  const [ledgerLines, setLedgerLines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`)
  const [endDate, setEndDate] = useState(now.toISOString().split("T")[0])

  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const fetchLedger = async () => {
    if (!productId) return
    setLoading(true)

    const { data: prod } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single()
    setProduct(prod)
    if (!prod) { setLoading(false); return }

    // Fetch ALL stock_moves for this product
    const { data: moves } = await supabase
      .from("stock_moves")
      .select("*")
      .eq("product_id", productId)
      .order("date", { ascending: true })

    const allLines: any[] = []
    if (moves) {
      moves.forEach((move: any) => {
        const qty = move.qty || 0
        allLines.push({
          id: `move-${move.id}`,
          date: move.date,
          type: move.move_type || "Movement",
          ref: move.ref || move.reason || "",
          qty_in: qty > 0 ? qty : 0,
          qty_out: qty < 0 ? -qty : 0,
        })
      })
    }

    allLines.sort((a, b) => a.date.localeCompare(b.date))

    // Opening balance before start date
    const opening = prod.opening_qty || 0
    let runningQty = opening
    for (const line of allLines) {
      if (line.date < startDate) {
        runningQty = runningQty + line.qty_in - line.qty_out
      }
    }
    const openingBalanceQty = runningQty

    const periodLines: any[] = []
    periodLines.push({
      id: "opening",
      date: startDate,
      type: "Opening",
      ref: "",
      qty_in: openingBalanceQty,
      qty_out: 0,
      balance: openingBalanceQty,
      isOpening: true,
    })

    runningQty = openingBalanceQty
    for (const line of allLines) {
      if (line.date >= startDate && line.date <= endDate) {
        runningQty = runningQty + line.qty_in - line.qty_out
        periodLines.push({ ...line, balance: runningQty, isOpening: false })
      }
    }

    setLedgerLines(periodLines)
    setLoading(false)
  }

  useEffect(() => { if (productId) fetchLedger() }, [productId, startDate, endDate])

  // Sorting – opening row always first
  const sortedLines = [...ledgerLines].sort((a, b) => {
    if (a.isOpening && !b.isOpening) return -1
    if (!a.isOpening && b.isOpening) return 1
    let valA: any, valB: any
    if (["qty_in","qty_out","balance"].includes(sortField)) {
      valA = a[sortField] || 0; valB = b[sortField] || 0
    } else {
      valA = (a[sortField] || "").toString().toLowerCase()
      valB = (b[sortField] || "").toString().toLowerCase()
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("asc") }
  }
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const totalInflow = ledgerLines.filter(l => !l.isOpening).reduce((s, l) => s + l.qty_in, 0)
  const totalOutflow = ledgerLines.filter(l => !l.isOpening).reduce((s, l) => s + l.qty_out, 0)
  const closingBalance = ledgerLines.length > 0 ? ledgerLines[ledgerLines.length - 1].balance : 0

  const handlePrintPDF = async () => {
    if (!product || sortedLines.length === 0) return
    const pdfData = {
      companyName, companyAddress: "", companyPhone: "", companyEmail: "",
      companyTagline: companyTagline || "", logoUrl,
      productName: product.name, productCode: product.code,
      startDate, endDate,
      totalInflow, totalOutflow, closingBalance,
      ledgerLines: sortedLines,
    }
    const doc = await generateProductLedgerPDF(pdfData)
    doc.save(`Product_Ledger_${product.code}.pdf`)
  }

  if (!productId) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>No product selected.</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 0; box-shadow: var(--shadow-sm); overflow: hidden; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
        .ledger-header {
          display: grid;
          grid-template-columns: 90px 100px 1fr 80px 80px 100px;
          padding: 14px 24px;
          background: var(--card);
          font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
          border-bottom: 1px solid var(--border);
        }
        .ledger-row {
          display: grid;
          grid-template-columns: 90px 100px 1fr 80px 80px 100px;
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
        @media (max-width: 640px) {
          .ledger-header, .ledger-row { grid-template-columns: 70px 80px 1fr 60px 60px 80px; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn btn-outline" onClick={() => router.push("/dashboard/products")}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>
            📦 Product Ledger: {product ? `${product.code} – ${product.name}` : "Loading..."}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Quantity movement tracking</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" className="date-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>to</span>
          <input type="date" className="date-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <button className="btn btn-outline" onClick={fetchLedger}>Refresh</button>
          <button className="btn btn-outline" onClick={handlePrintPDF}>
            <Printer size={16} /> Print PDF
          </button>
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">Total Inflow</div>
          <div className="summary-value" style={{ color: "#10B981" }}>{totalInflow}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Total Outflow</div>
          <div className="summary-value" style={{ color: "#EF4444" }}>{totalOutflow}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Closing Balance</div>
          <div className="summary-value" style={{ color: closingBalance >= 0 ? "#10B981" : "#EF4444" }}>
            {closingBalance}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading ledger entries…</div>
      ) : sortedLines.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          No transactions found for this period.
        </div>
      ) : (
        <div className="card">
          <div className="ledger-header">
            <button className="sort-btn" onClick={() => handleSort("date")}>Date {getSortIcon("date")}</button>
            <button className="sort-btn" onClick={() => handleSort("type")}>Type {getSortIcon("type")}</button>
            <button className="sort-btn" onClick={() => handleSort("ref")}>Ref # {getSortIcon("ref")}</button>
            <button className="sort-btn" onClick={() => handleSort("qty_in")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Inflow {getSortIcon("qty_in")}</button>
            <button className="sort-btn" onClick={() => handleSort("qty_out")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Outflow {getSortIcon("qty_out")}</button>
            <button className="sort-btn" onClick={() => handleSort("balance")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Balance {getSortIcon("balance")}</button>
          </div>
          {sortedLines.map((line, idx) => (
            <div key={line.id || idx} className={`ledger-row ${line.isOpening ? "opening-row" : ""}`}>
              <span style={{ fontSize: 12 }}>
                {line.isOpening ? "" : new Date(line.date).toLocaleDateString()}
              </span>
              <span>{line.type}</span>
              <span style={{ color: line.ref ? "var(--primary)" : "var(--text-muted)" }}>
                {line.ref || "Opening Balance"}
              </span>
              <span style={{ textAlign: "right", color: line.qty_in > 0 ? "#10B981" : "var(--text-muted)", fontWeight: line.qty_in > 0 ? 600 : 400 }}>
                {line.qty_in > 0 ? line.qty_in.toLocaleString() : "—"}
              </span>
              <span style={{ textAlign: "right", color: line.qty_out > 0 ? "#EF4444" : "var(--text-muted)", fontWeight: line.qty_out > 0 ? 600 : 400 }}>
                {line.qty_out > 0 ? line.qty_out.toLocaleString() : "—"}
              </span>
              <span style={{ textAlign: "right", fontWeight: 600, color: line.balance >= 0 ? "#10B981" : "#EF4444" }}>
                {line.balance.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}