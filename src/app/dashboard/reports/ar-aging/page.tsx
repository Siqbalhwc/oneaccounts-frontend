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

const fmt = (n: number) => (n ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "–")

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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

  useEffect(() => {
    if (!companyId) {
      setLoading(false)
      return
    }
    setLoading(true)

    let query = supabase
      .from("invoices")
      .select("id, invoice_no, date, due_date, total, paid, party_id, customers!inner(name)")
      .eq("company_id", companyId)
      .eq("type", "sale")
      .neq("status", "Paid")
      .order("due_date")

    if (selectedCustomerIds.length > 0) {
      query = query.in("party_id", selectedCustomerIds)
    }

    query.then(({ data: invoices, error }) => {
      if (error) {
        console.error("AR Aging query error:", error)
        setGroups([])
        setLoading(false)
        return
      }

      if (!invoices || invoices.length === 0) {
        setGroups([])
        setLoading(false)
        return
      }

      const refDate = new Date(asOfDate)
      const byCustomer = new Map<number, CustomerGroup>()

      invoices.forEach((inv: any) => {
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

        const custId = inv.party_id
        const custName = inv.customers?.name || "Unknown"

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

      // Report order follows customer number (customerId) ascending, not aging risk.
      const groupList = Array.from(byCustomer.values())
      groupList.sort((a, b) => a.customerId - b.customerId)

      setGroups(groupList)
      setLoading(false)
    })
  }, [companyId, asOfDate, selectedCustomerIds])

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

  function toggleExpand(customerId: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(customerId)) next.delete(customerId)
      else next.add(customerId)
      return next
    })
  }

  function expandAll() {
    setExpanded(new Set(groups.map((g) => g.customerId)))
  }

  function collapseAll() {
    setExpanded(new Set())
  }

  const allExpanded = groups.length > 0 && expanded.size === groups.length

  function toggleCustomerSelection(id: number) {
    setSelectedCustomerIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  function clearCustomerFilter() {
    setSelectedCustomerIds([])
  }

  const filteredCustomerOptions = customers.filter((c) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  )

  function exportPDF() {
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

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">AR Aging Report</h1>
              <p className="text-sm text-slate-500">Accounts receivable aging analysis as of {asOfDate}</p>
            </div>
          </div>
          <button
            onClick={exportPDF}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <Download className="h-4 w-4" />
            PDF
          </button>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">As of</label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div className="relative" ref={customerDropdownRef}>
            <label className="mb-1 block text-xs font-medium text-slate-500">Customer</label>
            <button
              onClick={() => setShowCustomerDropdown((v) => !v)}
              className="flex min-w-[220px] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <span className="truncate">
                {selectedCustomerIds.length === 0
                  ? "All customers"
                  : selectedCustomerIds.length === 1
                  ? customers.find((c) => c.id === selectedCustomerIds[0])?.name
                  : `${selectedCustomerIds.length} customers selected`}
              </span>
              {selectedCustomerIds.length > 0 ? (
                <X
                  className="h-4 w-4 text-slate-400 hover:text-slate-600"
                  onClick={(e) => {
                    e.stopPropagation()
                    clearCustomerFilter()
                  }}
                />
              ) : (
                <ChevronRight className="h-4 w-4 rotate-90 text-slate-400" />
              )}
            </button>

            {showCustomerDropdown && (
              <div className="absolute z-10 mt-1 w-72 rounded-lg border border-slate-200 bg-white shadow-lg">
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    autoFocus
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search customers"
                    className="w-full text-sm outline-none"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  <button
                    onClick={clearCustomerFilter}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className={selectedCustomerIds.length === 0 ? "font-medium text-slate-900" : "text-slate-600"}>
                      All customers
                    </span>
                    {selectedCustomerIds.length === 0 && <Check className="h-4 w-4 text-blue-600" />}
                  </button>
                  {filteredCustomerOptions.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => toggleCustomerSelection(c.id)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className={selectedCustomerIds.includes(c.id) ? "font-medium text-slate-900" : "text-slate-600"}>
                        {c.name}
                      </span>
                      {selectedCustomerIds.includes(c.id) && <Check className="h-4 w-4 text-blue-600" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard label="Current" value={fmt(totals.current)} />
          <SummaryCard label="1-30 days" value={fmt(totals.days1to30)} />
          <SummaryCard label="31-60 days" value={fmt(totals.days31to60)} />
          <SummaryCard label="61-90 days" value={fmt(totals.days61to90)} warn />
          <SummaryCard label="90+ days" value={fmt(totals.over90)} danger />
          <SummaryCard label="Grand total" value={fmt(totals.total)} emphasize />
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="grid grid-cols-[2fr_repeat(6,1fr)] items-center border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500">
            <div className="flex items-center gap-2">
              <span>Customer</span>
              <button
                onClick={allExpanded ? collapseAll : expandAll}
                disabled={groups.length === 0}
                className="ml-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                {allExpanded ? "Collapse all" : "Expand all"}
              </button>
            </div>
            <div className="text-right">Current</div>
            <div className="text-right">1-30</div>
            <div className="text-right">31-60</div>
            <div className="text-right">61-90</div>
            <div className="text-right">90+</div>
            <div className="text-right">Total due</div>
          </div>

          {loading && <div className="px-4 py-8 text-center text-sm text-slate-400">Loading…</div>}

          {!loading && groups.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-400">No outstanding invoices found.</div>
          )}

          {!loading &&
            groups.map((g) => {
              const isOpen = expanded.has(g.customerId)
              const isRisky = g.over90 > 0 || g.days61to90 > 0
              return (
                <div key={g.customerId} className="border-b border-slate-100 last:border-b-0">
                  <button
                    onClick={() => toggleExpand(g.customerId)}
                    className="grid w-full grid-cols-[2fr_repeat(6,1fr)] items-center px-4 py-3 text-left text-sm hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2 font-medium text-slate-900">
                      <ChevronRight
                        className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                      {g.customerName}
                      {isRisky && (
                        <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                          <AlertTriangle className="h-3 w-3" />
                          At risk
                        </span>
                      )}
                      <span className="text-xs font-normal text-slate-400">
                        ({g.invoices.length} {g.invoices.length === 1 ? "invoice" : "invoices"})
                      </span>
                    </div>
                    <Cell value={isOpen ? 0 : g.current} />
                    <Cell value={isOpen ? 0 : g.days1to30} />
                    <Cell value={isOpen ? 0 : g.days31to60} />
                    <Cell value={isOpen ? 0 : g.days61to90} danger />
                    <Cell value={isOpen ? 0 : g.over90} danger />
                    <div className="text-right font-semibold text-slate-900">{isOpen ? "–" : fmt(g.total)}</div>
                  </button>

                  {isOpen && (
                    <div className="bg-slate-50/60">
                      {g.invoices.map((inv) => (
                        <div
                          key={inv.invoiceNo}
                          className="grid grid-cols-[2fr_repeat(6,1fr)] items-center px-4 py-2 pl-10 text-sm text-slate-600"
                        >
                          <div>
                            {inv.invoiceNo} <span className="text-slate-400">· {inv.invoiceDate}</span>
                          </div>
                          <Cell value={inv.current} muted />
                          <Cell value={inv.days1to30} muted />
                          <Cell value={inv.days31to60} muted />
                          <Cell value={inv.days61to90} muted danger />
                          <Cell value={inv.over90} muted danger />
                          <div className="text-right">{fmt(inv.total)}</div>
                        </div>
                      ))}
                      <div className="grid grid-cols-[2fr_repeat(6,1fr)] items-center border-t border-slate-200 px-4 py-2 pl-10 text-sm font-semibold text-slate-900">
                        <div>Total {g.customerName}</div>
                        <Cell value={g.current} />
                        <Cell value={g.days1to30} />
                        <Cell value={g.days31to60} />
                        <Cell value={g.days61to90} danger />
                        <Cell value={g.over90} danger />
                        <div className="text-right">{fmt(g.total)}</div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

          {!loading && groups.length > 0 && (
            <div className="grid grid-cols-[2fr_repeat(6,1fr)] border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
              <div>Grand total</div>
              <div className="text-right">{fmt(totals.current)}</div>
              <div className="text-right">{fmt(totals.days1to30)}</div>
              <div className="text-right">{fmt(totals.days31to60)}</div>
              <div className="text-right">{fmt(totals.days61to90)}</div>
              <div className="text-right">{fmt(totals.over90)}</div>
              <div className="text-right">{fmt(totals.total)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

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
      className={`rounded-lg px-4 py-3 ${
        danger
          ? "bg-red-50"
          : warn
          ? "bg-amber-50"
          : emphasize
          ? "border border-slate-300 bg-white"
          : "bg-slate-100"
      }`}
    >
      <div
        className={`mb-1 text-xs font-medium ${
          danger ? "text-red-600" : warn ? "text-amber-600" : "text-slate-500"
        }`}
      >
        {label}
      </div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function Cell({ value, muted, danger }: { value: number; muted?: boolean; danger?: boolean }) {
  const color = !value ? "text-slate-300" : danger ? "text-red-600" : muted ? "text-slate-500" : "text-slate-700"
  return <div className={`text-right ${color}`}>{fmt(value)}</div>
}
