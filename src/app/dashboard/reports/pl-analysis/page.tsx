"use client"

import { useEffect, useState } from "react"

function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}
function today() {
  return new Date().toISOString().slice(0, 10)
}
function fmt(n: number) {
  return new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(n)
}

export default function PLAnalysisPage() {
  const [groupBy, setGroupBy] = useState<"day" | "product" | "customer">("day")
  const [startDate, setStartDate] = useState(firstOfMonth())
  const [endDate, setEndDate] = useState(today())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const run = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(
        `/api/reports/pl-analysis?groupBy=${groupBy}&startDate=${startDate}&endDate=${endDate}`
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load report")
      setData(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { run() }, [])

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh" }}>
      <h1 style={{ color: "var(--primary)", marginBottom: 16 }}>Profit &amp; Loss Analysis</h1>

      <div style={{ display: "flex", gap: 12, alignItems: "end", marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "var(--text)" }}>Group by</label>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value as any)}
            style={{ padding: 8, borderRadius: 6, border: "1px solid var(--border)" }}>
            <option value="day">Day</option>
            <option value="product">Product</option>
            <option value="customer">Customer</option>
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "var(--text)" }}>From</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: "1px solid var(--border)" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "var(--text)" }}>To</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: "1px solid var(--border)" }} />
        </div>
        <button onClick={run} disabled={loading}
          style={{ padding: "8px 16px", borderRadius: 6, background: "var(--primary)", color: "#fff", border: "none" }}>
          {loading ? "Loading…" : "Run"}
        </button>
      </div>

      {error && <div style={{ color: "#c0392b", marginBottom: 16 }}>{error}</div>}

      {data && data.groupBy === "day" && (
        <div style={{ overflowX: "auto", background: "var(--card)", borderRadius: 8, padding: 16 }}>
          <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
            <thead>
              <tr>
                <th style={cellHead}>—</th>
                {data.columns.map((c: number, i: number) => (
                  <th key={i} style={cellHead}>{c}</th>
                ))}
                <th style={cellHead}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.label} style={r.label === "Net Profit" || r.label === "Gross Profit" ? { fontWeight: 700 } : {}}>
                  <td style={cellLabel}>{r.label}</td>
                  {r.values.map((v: number, i: number) => (
                    <td key={i} style={cellVal}>{fmt(v)}</td>
                  ))}
                  <td style={cellVal}>{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && (data.groupBy === "product" || data.groupBy === "customer") && (
        <div style={{ background: "var(--card)", borderRadius: 8, padding: 16 }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={cellHead}>{data.groupBy === "product" ? "Product" : "Customer"}</th>
                <th style={cellHead}>Income</th>
                <th style={cellHead}>less: COGS</th>
                <th style={cellHead}>Gross Profit</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id ?? r.name}>
                  <td style={cellLabel}>{r.name}</td>
                  <td style={cellVal}>{fmt(r.income)}</td>
                  <td style={cellVal}>{fmt(r.cogs)}</td>
                  <td style={cellVal}>{fmt(r.grossProfit)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: "2px solid var(--border)" }}>
                <td style={cellLabel}>Total</td>
                <td style={cellVal}>{fmt(data.totals.income)}</td>
                <td style={cellVal}>{fmt(data.totals.cogs)}</td>
                <td style={cellVal}>{fmt(data.totals.grossProfit)}</td>
              </tr>
              <tr>
                <td style={cellLabel}>less: Admin / Operating Expenses (Unallocated)</td>
                <td style={cellVal}></td>
                <td style={cellVal}></td>
                <td style={cellVal}>{fmt(data.unallocatedExpenses)}</td>
              </tr>
              <tr style={{ fontWeight: 700 }}>
                <td style={cellLabel}>Net Profit</td>
                <td style={cellVal}></td>
                <td style={cellVal}></td>
                <td style={cellVal}>{fmt(data.totals.netProfit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const cellHead: React.CSSProperties = { textAlign: "right", padding: "8px 10px", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text)" }
const cellLabel: React.CSSProperties = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)", fontSize: 13 }
const cellVal: React.CSSProperties = { textAlign: "right", padding: "8px 10px", borderBottom: "1px solid var(--border)", fontSize: 13 }