"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download, Search, X, Check, ChevronRight, AlertTriangle } from "lucide-react"
import { useRouter } from "next/navigation"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { useCompany } from "@/contexts/CompanyContext"

interface InvoiceRow {
  invoiceNo: string
  invoiceDate: string
  dueDate: string
  current: number
  days1to30: number
  days31to60: number
  days61to90: number
  over90: number
  total: number
}

interface CustomerGroup {
  customerId: number
  customerName: string
  current: number
  days1to30: number
  days31to60: number
  days61to90: number
  over90: number
  total: number
  invoices: InvoiceRow[]
}

interface ARInvoice {
  invoice_id: number
  invoice_no: string
  date: string
  due_date: string
  total: number
  paid: number
  party_id: number
  customer_name: string
  customer_id: number
}

const fmt = (n: number) => (n ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "–")

// ── Components ──
function SummaryCard({
  label,
  value,
  warn,
  danger,
  emphasize,
}: {
  label: string
  value: string
  warn?: boolean
  danger?: boolean
  emphasize?: boolean
}) {
  return (
    <div
      style={{
        borderRadius: 10,
        padding: "12px 16px",
        background: danger
          ? "#FEF2F2"
          : warn
          ? "#FFFBEB"
          : emphasize
          ? "var(--card)"
          : "var(--card-hover)",
        border: emphasize ? "1px solid var(--border)" : "1px solid transparent",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          color: danger ? "#B91C1C" : warn ? "#92400E" : "var(--text-muted)",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{value}</div>
    </div>
  )
}

function Cell({ value, muted, danger }: { value: number; muted?: boolean; danger?: boolean }) {
  const color = !value
    ? "var(--text-muted)"
    : danger
    ? "#B91C1C"
    : muted
    ? "var(--text-soft)"
    : "var(--text)"
  return (
    <div style={{ textAlign: "right", color, fontWeight: danger ? 600 : undefined }}>
      {fmt(value)}
    </div>
  )
}

// ── Main Page ──
export default function ARAgingPage() {
  const router = useRouter()
  const { companyId } = useCompany()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const [groups, setGroups] = useState<CustomerGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const today = new Date().toISOString().split("T")[0]
  const [asOfDate, setAsOfDate] = useState(today)
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([])
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const customerDropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Fetch customers list (unchanged)
  useEffect(() => {
    if (!companyId) return
    supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => data && setCustomers(data))
  }, [companyId])

  // ── Fetch & group data using get_ar_aging (mirror of AP) ──
  useEffect(() => {
    if (!companyId) {
      setLoading(false)
      return
    }
    setLoading(true)

    supabase
      .rpc("get_ar_aging", {
        p_company_id: companyId,
        p_as_of_date: asOfDate,
      })
      .then(({ data: invoices, error }) => {
        if (error) {
          console.error("AR Aging RPC error:", error)
          setGroups([])
          setLoading(false)
          return
        }

        if (!invoices || invoices.length === 0) {
          setGroups([])
          setLoading(false)
          return
        }

        let filteredInvoices: ARInvoice[] = invoices
        if (selectedCustomerIds.length > 0) {
          filteredInvoices = invoices.filter((inv: ARInvoice) =>
            selectedCustomerIds.includes(inv.customer_id)
          )
        }

        const refDate = new Date(asOfDate)
        const byCustomer = new Map<number, CustomerGroup>()

        filteredInvoices.forEach((inv: ARInvoice) => {
          const bal = (inv.total || 0) - (inv.paid || 0)
          if (bal <= 0) return

          const due = new Date(inv.due_date)
          const days = Math.floor((refDate.getTime() - due.getTime()) / 86400000)

          let current = 0, d1to30 = 0, d31to60 = 0, d61to90 = 0, over90 = 0
          if (days <= 0) current = bal
          else if (days <= 30) d1to30 = bal
          else if (days <= 60) d31to60 = bal
          else if (days <= 90) d61to90 = bal
          else over90 = bal

          const custId = inv.customer_id
          const custName = inv.customer_name || "Unknown"

          if (!byCustomer.has(custId)) {
            byCustomer.set(custId, {
              customerId: custId,
              customerName: custName,
              current: 0,
              days1to30: 0,
              days31to60: 0,
              days61to90: 0,
              over90: 0,
              total: 0,
              invoices: [],
            })
          }

          const group = byCustomer.get(custId)!
          group.current += current
          group.days1to30 += d1to30
          group.days31to60 += d31to60
          group.days61to90 += d61to90
          group.over90 += over90
          group.total += bal
          group.invoices.push({
            invoiceNo: inv.invoice_no,
            invoiceDate: inv.date,
            dueDate: inv.due_date,
            current,
            days1to30: d1to30,
            days31to60: d31to60,
            days61to90: d61to90,
            over90,
            total: bal,
          })
        })

        const groupList = Array.from(byCustomer.values())
        groupList.sort((a, b) => a.customerId - b.customerId)

        setGroups(groupList)
        setLoading(false)
      })
  }, [companyId, asOfDate, selectedCustomerIds])

  // Totals
  const totals = useMemo(() => {
    return groups.reduce(
      (acc, g) => {
        acc.current += g.current
        acc.days1to30 += g.days1to30
        acc.days31to60 += g.days31to60
        acc.days61to90 += g.days61to90
        acc.over90 += g.over90
        acc.total += g.total
        return acc
      },
      { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 }
    )
  }, [groups])

  // Expand / collapse
  function toggleExpand(customerId: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(customerId)) next.delete(customerId)
      else next.add(customerId)
      return next
    })
  }
  function expandAll() { setExpanded(new Set(groups.map((g) => g.customerId))) }
  function collapseAll() { setExpanded(new Set()) }
  const allExpanded = groups.length > 0 && expanded.size === groups.length

  // Customer filter
  function toggleCustomerSelection(id: number) {
    setSelectedCustomerIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }
  function clearCustomerFilter() { setSelectedCustomerIds([]) }
  const filteredCustomerOptions = customers.filter((c) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  )

  // PDF export (unchanged)
  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text("AR Aging Report", 14, 16)
    doc.setFontSize(10)
    doc.text(`As of ${asOfDate}`, 14, 22)

    const body: any[] = []
    groups.forEach((g) => {
      body.push([
        { content: g.customerName, styles: { fontStyle: "bold" } },
        fmt(g.current),
        fmt(g.days1to30),
        fmt(g.days31to60),
        fmt(g.days61to90),
        fmt(g.over90),
        { content: fmt(g.total), styles: { fontStyle: "bold" } },
      ])
      g.invoices.forEach((inv) => {
        body.push([
          `  ${inv.invoiceNo} (${inv.invoiceDate})`,
          fmt(inv.current),
          fmt(inv.days1to30),
          fmt(inv.days31to60),
          fmt(inv.days61to90),
          fmt(inv.over90),
          fmt(inv.total),
        ])
      })
      body.push([
        { content: `  Total ${g.customerName}`, styles: { fontStyle: "bold" } },
        { content: fmt(g.current), styles: { fontStyle: "bold" } },
        { content: fmt(g.days1to30), styles: { fontStyle: "bold" } },
        { content: fmt(g.days31to60), styles: { fontStyle: "bold" } },
        { content: fmt(g.days61to90), styles: { fontStyle: "bold" } },
        { content: fmt(g.over90), styles: { fontStyle: "bold" } },
        { content: fmt(g.total), styles: { fontStyle: "bold" } },
      ])
    })

    autoTable(doc, {
      startY: 28,
      head: [["Customer / Invoice", "Current", "1-30", "31-60", "61-90", "90+", "Total"]],
      body,
      foot: [["Grand total", fmt(totals.current), fmt(totals.days1to30), fmt(totals.days31to60), fmt(totals.days61to90), fmt(totals.over90), fmt(totals.total)]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
    })

    doc.save(`ar-aging-${asOfDate}.pdf`)
  }

  // ── Render (CSS variables only) ──
  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .ar-btn {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px;
          border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;
          border: 1.5px solid var(--border); background: transparent; color: var(--text-muted);
          font-family: inherit; transition: background 0.15s;
        }
        .ar-btn:hover { background: var(--card-hover); }
        .ar-input, .ar-select {
          height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px;
          font-size: 13px; background: var(--card); color: var(--text); font-family: inherit; outline: none;
        }
        .ar-card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
          box-shadow: var(--shadow-sm);
        }
        .ar-header-row {
          display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr 1fr;
          align-items: center; padding: 10px 16px; background: var(--card-hover);
          border-bottom: 2px solid var(--border); font-size: 10px; font-weight: 700;
          text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;
        }
        .ar-group-row {
          display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr 1fr;
          align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--border);
          cursor: pointer; transition: background 0.15s; font-size: 13px; color: var(--text);
        }
        .ar-group-row:hover { background: var(--card-hover); }
        .ar-invoice-row {
          display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr 1fr;
          align-items: center; padding: 8px 16px 8px 40px; border-bottom: 1px solid var(--border);
          font-size: 12px; color: var(--text-soft); background: var(--bg-soft);
        }
        .ar-subtotal-row {
          display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr 1fr;
          align-items: center; padding: 10px 16px; border-top: 2px solid var(--border);
          font-weight: 700; font-size: 13px; background: var(--card-hover);
        }
        .ar-grand-row {
          display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr 1fr;
          align-items: center; padding: 12px 16px; background: var(--primary);
          color: var(--primary-text); font-weight: 800; border-top: 2px solid var(--border);
          font-size: 14px;
        }
        .summary-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px; margin-bottom: 20px;
        }
        .summary-card {
          background: var(--card); border: 1px solid var(--border); border-radius: 10px;
          padding: 12px 14px; text-align: center; box-shadow: var(--shadow-sm);
        }
        .summary-label {
          font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
          margin-bottom: 2px;
        }
        .summary-value { font-size: 18px; font-weight: 800; color: var(--text); }

        @media (max-width: 768px) {
          .ar-header-row, .ar-group-row, .ar-invoice-row, .ar-subtotal-row, .ar-grand-row {
            grid-template-columns: 1.5fr 1fr 1fr 1fr 1fr 1fr 1fr;
            font-size: 10px;
          }
          .ar-invoice-row { padding-left: 24px; }
          .summary-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="ar-btn" onClick={() => router.back()}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📅 AR Aging Report</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Accounts Receivable aging analysis as of {asOfDate}</p>
        </div>
        <button className="ar-btn" onClick={exportPDF}><Download size={14} /> PDF</button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 13, color: "var(--text-muted)" }}>As of:</label>
        <input type="date" className="ar-input" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} />

        <div style={{ position: "relative" }} ref={customerDropdownRef}>
          <button
  className="ar-btn"
  onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
  style={{ minWidth: 280 }}
>
            <span>{selectedCustomerIds.length === 0 ? "All Customers" : `${selectedCustomerIds.length} selected`}</span>
            <X size={14} color="var(--text-muted)" onClick={(e) => { e.stopPropagation(); clearCustomerFilter(); }} />
          </button>
          {showCustomerDropdown && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
              background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
              maxHeight: 220, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}>
              <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                <Search size={14} color="var(--text-muted)" />
                <input
                  style={{ flex: 1, height: 30, border: "1px solid var(--border)", borderRadius: 6, padding: "0 8px", fontSize: 13, background: "var(--bg)", color: "var(--text)" }}
                  placeholder="Search customers…"
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <button
                onClick={clearCustomerFilter}
                style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", cursor: "pointer", border: "none", background: "transparent", color: selectedCustomerIds.length === 0 ? "var(--text)" : "var(--text-muted)", fontSize: 13 }}
              >
                <span style={{ fontWeight: selectedCustomerIds.length === 0 ? 600 : 400 }}>All customers</span>
                {selectedCustomerIds.length === 0 && <Check size={14} color="var(--primary)" />}
              </button>
              {filteredCustomerOptions.map(c => (
                <button
                  key={c.id}
                  onClick={() => toggleCustomerSelection(c.id)}
                  style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", cursor: "pointer", border: "none", background: "transparent", color: "var(--text)", fontSize: 13 }}
                >
                  <span>{c.name}</span>
                  {selectedCustomerIds.includes(c.id) && <Check size={14} color="var(--primary)" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-label">Current</div>
          <div className="summary-value" style={{ color: "#10B981" }}>{fmt(totals.current)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">1-30 days</div>
          <div className="summary-value" style={{ color: "#F59E0B" }}>{fmt(totals.days1to30)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">31-60 days</div>
          <div className="summary-value" style={{ color: "#F97316" }}>{fmt(totals.days31to60)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">61-90 days</div>
          <div className="summary-value" style={{ color: "#EF4444" }}>{fmt(totals.days61to90)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">&gt;90 days</div>
          <div className="summary-value" style={{ color: "#B91C1C" }}>{fmt(totals.over90)}</div>
        </div>
        <div className="summary-card" style={{ border: "2px solid var(--border-strong)", background: "var(--card)" }}>
          <div className="summary-label">Grand Total</div>
          <div className="summary-value" style={{ color: "#1E3A8A" }}>{fmt(totals.total)}</div>
        </div>
      </div>

      {/* Table */}
      <div className="ar-card">
        <div className="ar-header-row">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Customer</span>
            <button
              onClick={allExpanded ? collapseAll : expandAll}
              disabled={groups.length === 0}
              style={{
                padding: "2px 8px", borderRadius: 4, border: "1px solid var(--border)",
                background: "var(--card)", color: "var(--text-muted)", cursor: "pointer",
                fontSize: 11, fontWeight: 600,
              }}
            >
              {allExpanded ? "Collapse all" : "Expand all"}
            </button>
          </div>
          <div style={{ textAlign: "right" }}>Current</div>
          <div style={{ textAlign: "right" }}>1-30</div>
          <div style={{ textAlign: "right" }}>31-60</div>
          <div style={{ textAlign: "right" }}>61-90</div>
          <div style={{ textAlign: "right" }}>90+</div>
          <div style={{ textAlign: "right" }}>Total due</div>
        </div>

        {loading && <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}
        {!loading && groups.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>No outstanding invoices found.</div>}

        {!loading && groups.map(g => {
          const isOpen = expanded.has(g.customerId)
          const isRisky = g.over90 > 0 || g.days61to90 > 0
          return (
            <div key={g.customerId}>
              <div className="ar-group-row" onClick={() => toggleExpand(g.customerId)}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--primary)" }}>
                  <ChevronRight size={16} style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                  {g.customerName}
                  {isRisky && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 8px", borderRadius: 20, background: "#FEF2F2", color: "#B91C1C", fontSize: 11, fontWeight: 600 }}>
                      <AlertTriangle size={12} /> At risk
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>
                    ({g.invoices.length} {g.invoices.length === 1 ? "invoice" : "invoices"})
                  </span>
                </div>
                <Cell value={isOpen ? 0 : g.current} />
                <Cell value={isOpen ? 0 : g.days1to30} />
                <Cell value={isOpen ? 0 : g.days31to60} />
                <Cell value={isOpen ? 0 : g.days61to90} danger />
                <Cell value={isOpen ? 0 : g.over90} danger />
                <div style={{ textAlign: "right", fontWeight: 700, color: "var(--text)" }}>{isOpen ? "–" : fmt(g.total)}</div>
              </div>

              {isOpen && (
                <div>
                  {g.invoices.map(inv => (
                    <div key={inv.invoiceNo} className="ar-invoice-row">
                      <div>{inv.invoiceNo} <span style={{ color: "var(--text-muted)", fontSize: 11 }}>· {inv.invoiceDate}</span></div>
                      <Cell value={inv.current} muted />
                      <Cell value={inv.days1to30} muted />
                      <Cell value={inv.days31to60} muted />
                      <Cell value={inv.days61to90} muted danger />
                      <Cell value={inv.over90} muted danger />
                      <div style={{ textAlign: "right" }}>{fmt(inv.total)}</div>
                    </div>
                  ))}
                  <div className="ar-subtotal-row">
                    <div>Total {g.customerName}</div>
                    <Cell value={g.current} />
                    <Cell value={g.days1to30} />
                    <Cell value={g.days31to60} />
                    <Cell value={g.days61to90} danger />
                    <Cell value={g.over90} danger />
                    <div style={{ textAlign: "right" }}>{fmt(g.total)}</div>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {!loading && groups.length > 0 && (
          <div className="ar-grand-row">
            <div>Grand Total</div>
            <div style={{ textAlign: "right" }}>{fmt(totals.current)}</div>
            <div style={{ textAlign: "right" }}>{fmt(totals.days1to30)}</div>
            <div style={{ textAlign: "right" }}>{fmt(totals.days31to60)}</div>
            <div style={{ textAlign: "right" }}>{fmt(totals.days61to90)}</div>
            <div style={{ textAlign: "right" }}>{fmt(totals.over90)}</div>
            <div style={{ textAlign: "right" }}>{fmt(totals.total)}</div>
          </div>
        )}
      </div>
    </div>
  )
}