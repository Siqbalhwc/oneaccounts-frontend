"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Download, Search, X, Check, ChevronRight, AlertTriangle } from "lucide-react"
import { useRouter } from "next/navigation"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { useCompany } from "@/contexts/CompanyContext"

// ── Types ──
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

interface SupplierGroup {
  supplierId: number
  supplierName: string
  current: number
  days1to30: number
  days31to60: number
  days61to90: number
  over90: number
  total: number
  invoices: InvoiceRow[]
}

interface APInvoice {
  invoice_id: number
  invoice_no: string
  date: string
  due_date: string
  total: number
  paid: number
  party_id: number
  supplier_name: string
  supplier_id: number
}

// ── Helpers ──
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

// ── Main Page ──
export default function APAgingPage() {
  const router = useRouter()
  const { companyId } = useCompany()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const [groups, setGroups] = useState<SupplierGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const today = new Date().toISOString().split("T")[0]
  const [asOfDate, setAsOfDate] = useState(today)
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<number[]>([])
  const [supplierSearch, setSupplierSearch] = useState("")
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false)
  const supplierDropdownRef = useRef<HTMLDivElement>(null)

  // ── Suppliers list ──
  useEffect(() => {
    if (!companyId) return
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => data && setSuppliers(data))
  }, [companyId])

  // ── Outside click ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(e.target as Node)) {
        setShowSupplierDropdown(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // ── Fetch & group data ──
  useEffect(() => {
    if (!companyId) {
      setLoading(false)
      return
    }
    setLoading(true)

    supabase
      .rpc('get_ap_aging', {
        p_company_id: companyId,
        p_as_of_date: asOfDate,
      })
      .then(({ data: invoices, error }) => {
        if (error) {
          console.error("AP Aging RPC error:", error)
          setGroups([])
          setLoading(false)
          return
        }

        if (!invoices || invoices.length === 0) {
          setGroups([])
          setLoading(false)
          return
        }

        let filteredInvoices: APInvoice[] = invoices
        if (selectedSupplierIds.length > 0) {
          filteredInvoices = invoices.filter((inv: APInvoice) =>
            selectedSupplierIds.includes(inv.supplier_id)
          )
        }

        const refDate = new Date(asOfDate)
        const bySupplier = new Map<number, SupplierGroup>()

        filteredInvoices.forEach((inv: APInvoice) => {
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

          const supId = inv.supplier_id || inv.party_id
          const supName = inv.supplier_name || "Unknown"

          if (!bySupplier.has(supId)) {
            bySupplier.set(supId, {
              supplierId: supId,
              supplierName: supName,
              current: 0,
              days1to30: 0,
              days31to60: 0,
              days61to90: 0,
              over90: 0,
              total: 0,
              invoices: [],
            })
          }

          const group = bySupplier.get(supId)!
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

        const groupList = Array.from(bySupplier.values())
        groupList.sort((a, b) => a.supplierId - b.supplierId)

        setGroups(groupList)
        setLoading(false)
      })
  }, [companyId, asOfDate, selectedSupplierIds])

  // ── Totals ──
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

  // ── Expand / collapse ──
  function toggleExpand(supplierId: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(supplierId)) next.delete(supplierId)
      else next.add(supplierId)
      return next
    })
  }

  function expandAll() {
    setExpanded(new Set(groups.map((g) => g.supplierId)))
  }

  function collapseAll() {
    setExpanded(new Set())
  }

  const allExpanded = groups.length > 0 && expanded.size === groups.length

  // ── Supplier filter ──
  function toggleSupplierSelection(id: number) {
    setSelectedSupplierIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  function clearSupplierFilter() {
    setSelectedSupplierIds([])
  }

  const filteredSupplierOptions = suppliers.filter((s) =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase())
  )

  // ── PDF export (unchanged logic, adapted to new group structure) ──
  const exportPDF = async () => {
    if (groups.length === 0) return alert("No data to export")

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
    const PW = 297, ML = 14, MR = 14
    const LOGO_SIZE = 20, LOGO_X = ML, LOGO_Y = 7

    // Keep logo if available – use company context
    const { logoUrl, companyName, companyTagline } = useCompany()
    if (logoUrl) {
      try {
        const r = await fetch(logoUrl)
        if (r.ok) {
          const b = await r.blob()
          const reader = new FileReader()
          const dataUrl = await new Promise<string>((res) => {
            reader.onload = () => res(reader.result as string)
            reader.onerror = () => res("")
            reader.readAsDataURL(b)
          })
          if (dataUrl) doc.addImage(dataUrl, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)
        }
      } catch {}
    }

    const textX = logoUrl ? LOGO_X + LOGO_SIZE + 5 : ML
    doc.setTextColor(7, 8, 91).setFont("helvetica", "bold").setFontSize(14)
    doc.text(companyName || "", textX, LOGO_Y + 7)
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(107, 114, 128)
    doc.text(companyTagline || "", textX, LOGO_Y + 13)

    doc.setFont("helvetica", "bold").setFontSize(24).setTextColor(7, 8, 91)
    doc.text("AP AGING REPORT", PW - MR, LOGO_Y + 8, { align: "right" })

    const supplierFilter = selectedSupplierIds.length === 1
      ? suppliers.find(s => s.id === selectedSupplierIds[0])?.name || "Selected Supplier"
      : "All Suppliers"

    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(107, 114, 128)
    doc.text(`Supplier: ${supplierFilter}`, PW - MR, LOGO_Y + 16, { align: "right" })
    doc.text(`As of: ${asOfDate}`, PW - MR, LOGO_Y + 21, { align: "right" })

    const HEADER_BOTTOM = LOGO_Y + LOGO_SIZE + 5
    doc.setDrawColor(7, 8, 91).setLineWidth(0.6).line(ML, HEADER_BOTTOM, PW - MR, HEADER_BOTTOM)

    let Y = HEADER_BOTTOM + 6
    const headers = ["Supplier", "Invoice #", "Inv Date", "Current", "1-30", "31-60", "61-90", ">90", "Total"]

    const body: any[] = []
    groups.forEach((g) => {
      body.push([
        { content: g.supplierName, styles: { fontStyle: "bold", fillColor: [245, 247, 250] } },
        "", "", "", "", "", "", "", "",
      ])
      g.invoices.forEach((inv) => {
        body.push([
          "",
          inv.invoiceNo,
          inv.invoiceDate,
          inv.current > 0 ? fmt(inv.current) : "",
          inv.days1to30 > 0 ? fmt(inv.days1to30) : "",
          inv.days31to60 > 0 ? fmt(inv.days31to60) : "",
          inv.days61to90 > 0 ? fmt(inv.days61to90) : "",
          inv.over90 > 0 ? fmt(inv.over90) : "",
          inv.total > 0 ? fmt(inv.total) : "",
        ])
      })
      body.push([
        { content: "Subtotal", styles: { fontStyle: "bold", fillColor: [240, 242, 245] } },
        "",
        "",
        g.current > 0 ? fmt(g.current) : "",
        g.days1to30 > 0 ? fmt(g.days1to30) : "",
        g.days31to60 > 0 ? fmt(g.days31to60) : "",
        g.days61to90 > 0 ? fmt(g.days61to90) : "",
        g.over90 > 0 ? fmt(g.over90) : "",
        g.total > 0 ? fmt(g.total) : "",
      ])
    })

    autoTable(doc, {
      startY: Y,
      margin: { left: ML, right: MR },
      tableWidth: 'auto',
      head: [headers],
      body,
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        textColor: [17, 24, 39],
        lineColor: [229, 231, 235],
        lineWidth: 0.2,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [7, 8, 91],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      columnStyles: {
        0: { halign: 'left' },
        1: { halign: 'left' },
        2: { halign: 'left' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'head' && hookData.column.index >= 3) {
          hookData.cell.styles.halign = 'center'
        }
        if (hookData.section === 'body') {
          const row = hookData.row.raw
          if (row && Array.isArray(row) && row[0] === "Subtotal") {
            hookData.cell.styles.fillColor = [240, 242, 245]
            hookData.cell.styles.fontStyle = "bold"
          }
        }
      },
    })

    const PH = 210
    doc.setDrawColor(7, 8, 91).setLineWidth(0.4).line(ML, PH - 14, PW - MR, PH - 14)
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(107, 114, 128)
    doc.text(
      `Generated by ${companyName || "OneAccounts"}  ·  ${companyTagline || ""}`,
      PW / 2,
      PH - 8,
      { align: "center" }
    )

    doc.save("ap-aging-report.pdf")
  }

  // ── Render ──
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">AP Aging Report</h1>
              <p className="text-sm text-slate-500">Accounts Payable aging analysis as of {asOfDate}</p>
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

        {/* Filters */}
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

          <div className="relative" ref={supplierDropdownRef}>
            <label className="mb-1 block text-xs font-medium text-slate-500">Supplier</label>
            <button
              onClick={() => setShowSupplierDropdown((v) => !v)}
              className="flex min-w-[220px] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <span className="truncate">
                {selectedSupplierIds.length === 0
                  ? "All suppliers"
                  : selectedSupplierIds.length === 1
                  ? suppliers.find((s) => s.id === selectedSupplierIds[0])?.name
                  : `${selectedSupplierIds.length} suppliers selected`}
              </span>
              {selectedSupplierIds.length > 0 ? (
                <X
                  className="h-4 w-4 text-slate-400 hover:text-slate-600"
                  onClick={(e) => {
                    e.stopPropagation()
                    clearSupplierFilter()
                  }}
                />
              ) : (
                <ChevronRight className="h-4 w-4 rotate-90 text-slate-400" />
              )}
            </button>

            {showSupplierDropdown && (
              <div className="absolute z-10 mt-1 w-72 rounded-lg border border-slate-200 bg-white shadow-lg">
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    autoFocus
                    value={supplierSearch}
                    onChange={(e) => setSupplierSearch(e.target.value)}
                    placeholder="Search suppliers"
                    className="w-full text-sm outline-none"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  <button
                    onClick={clearSupplierFilter}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className={selectedSupplierIds.length === 0 ? "font-medium text-slate-900" : "text-slate-600"}>
                      All suppliers
                    </span>
                    {selectedSupplierIds.length === 0 && <Check className="h-4 w-4 text-blue-600" />}
                  </button>
                  {filteredSupplierOptions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => toggleSupplierSelection(s.id)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className={selectedSupplierIds.includes(s.id) ? "font-medium text-slate-900" : "text-slate-600"}>
                        {s.name}
                      </span>
                      {selectedSupplierIds.includes(s.id) && <Check className="h-4 w-4 text-blue-600" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard label="Current" value={fmt(totals.current)} />
          <SummaryCard label="1-30 days" value={fmt(totals.days1to30)} />
          <SummaryCard label="31-60 days" value={fmt(totals.days31to60)} />
          <SummaryCard label="61-90 days" value={fmt(totals.days61to90)} warn />
          <SummaryCard label=">90 days" value={fmt(totals.over90)} danger />
          <SummaryCard label="Grand Total" value={fmt(totals.total)} emphasize />
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="grid grid-cols-[2fr_repeat(6,1fr)] items-center border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500">
            <div className="flex items-center gap-2">
              <span>Supplier</span>
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
            <div className="text-right">&gt;90</div>
            <div className="text-right">Total due</div>
          </div>

          {loading && <div className="px-4 py-8 text-center text-sm text-slate-400">Loading…</div>}

          {!loading && groups.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-400">No outstanding payables found.</div>
          )}

          {!loading &&
            groups.map((g) => {
              const isOpen = expanded.has(g.supplierId)
              const isRisky = g.over90 > 0 || g.days61to90 > 0
              return (
                <div key={g.supplierId} className="border-b border-slate-100 last:border-b-0">
                  <button
                    onClick={() => toggleExpand(g.supplierId)}
                    className="grid w-full grid-cols-[2fr_repeat(6,1fr)] items-center px-4 py-3 text-left text-sm hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2 font-medium text-slate-900">
                      <ChevronRight
                        className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                      {g.supplierName}
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
                        <div>Total {g.supplierName}</div>
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