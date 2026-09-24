"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useCompany } from "@/contexts/CompanyContext"

function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}
function today() {
  return new Date().toISOString().slice(0, 10)
}
function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "—"
  const val = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Math.abs(n))
  return n < 0 ? `(Rs ${val})` : `Rs ${val}`
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

type Option = { id: number; name: string }

export default function PLAnalysisPage() {
  const { companyName, companyTagline, logoUrl } = useCompany()
  const [groupBy, setGroupBy] = useState<"day" | "product" | "customer">("day")
  const [startDate, setStartDate] = useState(firstOfMonth())
  const [endDate, setEndDate] = useState(today())
  const [products, setProducts] = useState<Option[]>([])
  const [customers, setCustomers] = useState<Option[]>([])
  const [selectedProducts, setSelectedProducts] = useState<number[]>([])
  const [selectedCustomers, setSelectedCustomers] = useState<number[]>([])
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const supabase = createClient()
    const loadOptions = async () => {
      const productRes = await supabase.from("products").select("id, name").is("deleted_at", null).order("name")
      setProducts((productRes.data as Option[]) || [])
      const customerRes = await supabase.from("customers").select("id, name, archived_at").is("deleted_at", null).order("name")
      const customerRows = (customerRes.data as (Option & { archived_at: string | null })[]) || []
      setCustomers(customerRows.filter(c => !c.archived_at))
    }
    loadOptions()
  }, [])

  const run = async () => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({ groupBy, startDate, endDate })
      if (selectedProducts.length) params.set("productIds", selectedProducts.join(","))
      if (selectedCustomers.length) params.set("customerIds", selectedCustomers.join(","))
      const res = await fetch(`/api/reports/pl-analysis?${params.toString()}`)
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

  const toggle = (arr: number[], setArr: (v: number[]) => void, id: number) => {
    setArr(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])
  }

  const filterNote =
    selectedProducts.length || selectedCustomers.length
      ? [
          selectedProducts.length ? `${selectedProducts.length} product(s)` : null,
          selectedCustomers.length ? `${selectedCustomers.length} customer(s)` : null,
        ].filter(Boolean).join(" · ")
      : null

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh" }}>
      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, alignItems: "end", marginBottom: 20, flexWrap: "wrap", background: "var(--card)", padding: 16, borderRadius: 8, border: "1px solid var(--border)" }}>
        <div>
          <label style={labelStyle}>Group by</label>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value as any)} style={inputStyle}>
            <option value="day">Day</option>
            <option value="product">Product</option>
            <option value="customer">Customer</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>From</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>To</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
        </div>

        <FilterDropdown label="Products" options={products} selected={selectedProducts}
          onToggle={id => toggle(selectedProducts, setSelectedProducts, id)}
          onClear={() => setSelectedProducts([])} />

        <FilterDropdown label="Customers" options={customers} selected={selectedCustomers}
          onToggle={id => toggle(selectedCustomers, setSelectedCustomers, id)}
          onClear={() => setSelectedCustomers([])} />

        <button onClick={run} disabled={loading} style={{ padding: "9px 20px", borderRadius: 6, background: "var(--primary)", color: "#fff", border: "none", fontWeight: 600 }}>
          {loading ? "Loading…" : "Run Report"}
        </button>
      </div>

      {error && <div style={{ color: "#c0392b", marginBottom: 16 }}>{error}</div>}

      {/* ── Report ─────────────────────────────────────────────────── */}
      {data && (
        <div style={{ background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden" }}>
          {/* Letterhead */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 24px", borderBottom: "2px solid var(--primary)" }}>
            {logoUrl && <img src={logoUrl} alt="" style={{ height: 44, width: 44, objectFit: "contain" }} />}
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--primary)" }}>{companyName || "Company"}</div>
              {companyTagline && <div style={{ fontSize: 12, color: "var(--text)", opacity: 0.7 }}>{companyTagline}</div>}
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Profit &amp; Loss Statement</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{fmtDate(startDate)} — {fmtDate(endDate)}</div>
              {filterNote && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Filtered: {filterNote}</div>}
              {data.filtered && (
                <div style={{ fontSize: 11, color: "#b7791f", marginTop: 2 }}>
                  Admin &amp; Selling Expenses not shown for filtered views (not attributable to a subset)
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: 20, overflowX: "auto" }}>
            {data.groupBy === "day" ? <DayTable data={data} /> : <GroupTable data={data} groupBy={data.groupBy} />}
          </div>
        </div>
      )}
    </div>
  )
}

function DayTable({ data }: { data: any }) {
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={{ ...thStyle, textAlign: "left", minWidth: 220 }}>Particulars</th>
          {data.columns.map((c: number, i: number) => (
            <th key={i} style={thStyle}>{c}</th>
          ))}
          <th style={{ ...thStyle, background: "var(--primary)" }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((r: any, idx: number) => (
          <tr key={r.label}
            style={{
              background: r.bold ? "rgba(15,157,88,0.06)" : idx % 2 ? "rgba(0,0,0,0.015)" : "transparent",
              fontWeight: r.bold ? 700 : 400,
              borderTop: r.label.startsWith("Net Profit") ? "2px solid var(--primary)" : undefined,
            }}>
            <td style={tdLabel}>{r.label}</td>
            {r.values.map((v: number, i: number) => (
              <td key={i} style={tdVal}>{v === 0 ? "—" : fmt(v)}</td>
            ))}
            <td style={{ ...tdVal, fontWeight: 700 }}>{fmt(r.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function GroupTable({ data, groupBy }: { data: any; groupBy: string }) {
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={{ ...thStyle, textAlign: "left" }}>{groupBy === "product" ? "Product" : "Customer"}</th>
          <th style={thStyle}>Sales</th>
          <th style={thStyle}>Cost of Sales</th>
          <th style={thStyle}>Gross Profit</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((r: any, idx: number) => (
          <tr key={r.id ?? r.name} style={{ background: idx % 2 ? "rgba(0,0,0,0.015)" : "transparent" }}>
            <td style={tdLabel}>{r.name}</td>
            <td style={tdVal}>{fmt(r.income)}</td>
            <td style={tdVal}>{fmt(r.cogs)}</td>
            <td style={tdVal}>{fmt(r.grossProfit)}</td>
          </tr>
        ))}
        <tr style={{ borderTop: "1px solid var(--border)", fontWeight: 700 }}>
          <td style={tdLabel}>Gross Total</td>
          <td style={tdVal}>{fmt(data.totals.income)}</td>
          <td style={tdVal}>{fmt(data.totals.cogs)}</td>
          <td style={tdVal}>{fmt(data.totals.grossProfit)}</td>
        </tr>
        {!data.filtered && (
          <>
            <tr>
              <td style={tdLabel}>Less: Administrative &amp; Selling Expenses (Unallocated)</td>
              <td style={tdVal}></td><td style={tdVal}></td>
              <td style={tdVal}>{fmt(data.unallocatedExpenses)}</td>
            </tr>
            <tr style={{ borderTop: "2px solid var(--primary)", fontWeight: 700, background: "rgba(15,157,88,0.06)" }}>
              <td style={tdLabel}>Net Profit</td>
              <td style={tdVal}></td><td style={tdVal}></td>
              <td style={tdVal}>{fmt(data.totals.netProfit)}</td>
            </tr>
          </>
        )}
      </tbody>
    </table>
  )
}

function FilterDropdown({ label, options, selected, onToggle, onClear }:
  { label: string; options: Option[]; selected: number[]; onToggle: (id: number) => void; onClear: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: "relative" }}>
      <label style={labelStyle}>{label}</label>
      <button onClick={() => setOpen(o => !o)} style={{ ...inputStyle, textAlign: "left", minWidth: 150, cursor: "pointer" }}>
        {selected.length ? `${selected.length} selected` : "All"}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 10, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, marginTop: 4, width: 240, maxHeight: 260, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.12)" }}>
          <div style={{ padding: 8, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{options.length} available</span>
            <button onClick={onClear} style={{ fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer" }}>Clear</button>
          </div>
          {options.map(o => (
            <label key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={selected.includes(o.id)} onChange={() => onToggle(o.id)} />
              {o.name}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--text)", marginBottom: 4, opacity: 0.75 }
const inputStyle: React.CSSProperties = { padding: "9px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)" }
const tableStyle: React.CSSProperties = { borderCollapse: "collapse", width: "100%", fontSize: 13 }
const thStyle: React.CSSProperties = { textAlign: "right", padding: "10px 12px", background: "var(--primary)", color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }
const tdLabel: React.CSSProperties = { textAlign: "left", padding: "9px 12px", borderBottom: "1px solid var(--border)" }
const tdVal: React.CSSProperties = { textAlign: "right", padding: "9px 12px", borderBottom: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" }