"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Eye, Edit, Search, ArrowUpDown, ArrowUp, ArrowDown, FileText, Send, Undo2, Receipt } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import { getWhatsAppLink } from "@/lib/whatsapp"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import { generateCashSaleSlipPDF, openCashSaleSlip, SlipWidth } from "@/lib/pdf/cashSaleSlipPDF"
import { useCompany } from "@/contexts/CompanyContext"
import ActionSlots from "@/components/ActionSlots"
import CashSaleReturnModal from "@/components/CashSaleReturnModal"
import { round2, fmtMoney, fmtRate } from "@/lib/money"
import CurrencyTag from "@/components/CurrencyTag"

type SortField = "sale_no" | "date" | "customer" | "total"
type SortDir = "asc" | "desc"
type StatusFilter = "all" | "paid" | "partial" | "returned"
type DatePreset = "all" | "today" | "this_month" | "last_month" | "custom"

const PAGE_SIZE = 50
const WALK_IN = "Walk‑in Customer"

const pad2 = (n: number) => String(n).padStart(2, "0")
const isoDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

// Money figures for one cash sale. `total` is the gross (before discount).
function saleFigures(sale: any) {
  const net = round2((sale.total || 0) - (sale.discount_amount || 0))
  const received = round2(sale.amount_received ?? sale.total ?? 0)
  const due = Math.max(0, round2(net - received))
  const returned = sale.status === "returned"
  const key: "paid" | "partial" | "returned" = returned ? "returned" : (due > 0 ? "partial" : "paid")
  return { net, received, due, key }
}

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  paid:     { label: "Paid",     color: "#10B981" },
  partial:  { label: "Partial",  color: "#F59E0B" },
  returned: { label: "Returned", color: "#3B82F6" },
}

function SkeletonRow() {
  return (
    <tr>
      {[60, 50, 999, 80, 80].map((w, i) => (
        <td key={i} style={{ padding: "12px 16px" }}>
          <div style={{
            width: w === 999 ? "70%" : w,
            height: 12,
            background: "var(--bg-soft)",
            borderRadius: 4,
            animation: "shimmer 1.5s ease-in-out infinite"
          }} />
        </td>
      ))}
    </tr>
  )
}

export default function CashSalesListPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature } = usePlan()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [sales, setSales] = useState<any[]>([])
  const [returnSale, setReturnSale] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [companyId, setCompanyId] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [datePreset, setDatePreset] = useState<DatePreset>("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [todayStats, setTodayStats] = useState<{ count: number; amount: number }>({ count: 0, amount: 0 })

  const [customerMap, setCustomerMap] = useState<Record<number, { name: string; phone: string }>>({})

  const { companyId: ctxCompanyId, companyName, companyTagline, logoUrl } = useCompany()

  // Company: use the one provided by the dashboard; fall back to the login token.
  useEffect(() => {
    if (ctxCompanyId) { setCompanyId(ctxCompanyId); return }
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [ctxCompanyId])

  useEffect(() => {
    if (!companyId) return
    supabase
      .from("customers")
      .select("id, name, phone")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .then(({ data }) => {
        if (data) {
          const map: Record<number, { name: string; phone: string }> = {}
          data.forEach((c: any) => { map[c.id] = { name: c.name || "", phone: c.phone || "" } })
          setCustomerMap(map)
        }
      })
  }, [companyId])

  // Date range sent to the database (so large histories are not downloaded needlessly)
  const todayISO = isoDate(new Date())
  const getRange = (): { from: string; to: string } => {
    const now = new Date()
    if (datePreset === "today") return { from: todayISO, to: todayISO }
    if (datePreset === "this_month") {
      return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
    }
    if (datePreset === "last_month") {
      return { from: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)) }
    }
    if (datePreset === "custom") return { from: dateFrom, to: dateTo }
    return { from: "", to: "" }
  }
  const range = getRange()

  useEffect(() => {
    if (!role) return
    if (!canView) { setLoading(false); return }
    if (!companyId) return

    setLoading(true)
    let q = supabase
      .from("cash_sales")
      .select("*")
      .eq("company_id", companyId)
    if (range.from) q = q.gte("date", range.from)
    if (range.to) q = q.lte("date", range.to)
    q
      .order(sortField === "customer" ? "party_id" : sortField, { ascending: sortDir === "asc" })
      .then(({ data }) => {
        setSales(data || [])
        setLoading(false)
      })
  }, [role, canView, companyId, sortField, sortDir, datePreset, dateFrom, dateTo])

  // "Today" card is independent of the filters above
  useEffect(() => {
    if (!role || !canView || !companyId) return
    supabase
      .from("cash_sales")
      .select("total, discount_amount, status")
      .eq("company_id", companyId)
      .eq("date", todayISO)
      .then(({ data }) => {
        const active = (data || []).filter((s: any) => s.status !== "returned")
        setTodayStats({
          count: active.length,
          amount: active.reduce((sum: number, s: any) => sum + ((s.total || 0) - (s.discount_amount || 0)), 0),
        })
      })
  }, [role, canView, companyId, sales])

  // Reset "show more" whenever the view changes
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [search, statusFilter, datePreset, dateFrom, dateTo, sortField, sortDir])

  // Search + date are applied first; status chips then narrow the result (chip counts use the pre-status set)
  const searched = sales.filter((s) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const cust = customerMap[s.party_id]
    return (s.sale_no || "").toLowerCase().includes(q) ||
           (cust?.name || "").toLowerCase().includes(q) ||
           (cust?.phone || "").toLowerCase().includes(q)
  })

  const counts = { all: searched.length, paid: 0, partial: 0, returned: 0 }
  searched.forEach(s => { counts[saleFigures(s).key]++ })

  const filtered = statusFilter === "all" ? searched : searched.filter(s => saleFigures(s).key === statusFilter)

  const sortedFiltered = [...filtered].sort((a, b) => {
    let valA: any, valB: any
    if (sortField === "customer") {
      valA = (customerMap[a.party_id]?.name || "").toLowerCase()
      valB = (customerMap[b.party_id]?.name || "").toLowerCase()
    } else if (sortField === "total") {
      valA = saleFigures(a).net
      valB = saleFigures(b).net
    } else {
      valA = (a[sortField] || "").toString().toLowerCase()
      valB = (b[sortField] || "").toString().toLowerCase()
    }
    return sortDir === "asc" ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1)
  })

  const visibleRows = sortedFiltered.slice(0, visibleCount)
  const remaining = sortedFiltered.length - visibleRows.length

  // Cards: returned sales are not counted (the cash was refunded). Amounts are net of discount.
  const activeSales = sortedFiltered.filter(s => s.status !== "returned")
  const totalSales = activeSales.length
  const netAmount = activeSales.reduce((sum, s) => sum + saleFigures(s).net, 0)
  const totalDue = activeSales.reduce((sum, s) => sum + saleFigures(s).due, 0)

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("asc") }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const sendWhatsApp = (sale: any) => {
    const cust = customerMap[sale.party_id]
    if (!cust?.phone) { alert("No phone number."); return }
    const link = `https://app.oneaccountsbysiqbal.com/dashboard/cash-sales/${sale.id}`
    const message = [
      `Dear ${cust.name},`,
      ``,
      `Your cash sale ${sale.sale_no} of PKR ${fmtMoney(sale.total)} has been recorded.`,
      ``,
      `📄 View Online: ${link}`,
      `📅 Date: ${sale.date}`,
      ``,
      `Thank you for your business.`,
      `— OneAccounts by Siqbal`,
    ].join("\n")
    const waLink = getWhatsAppLink(cust.phone, message)
    if (waLink) window.open(waLink, "_blank")
  }

  const handlePrintPDF = async (sale: any) => {
    try {
      // Fetch customer data (already in map, but we need full object for PDF)
      const cust = customerMap[sale.party_id]
      const customer = cust ? { name: cust.name, code: "", phone: cust.phone } : undefined

      // Fetch line items
      const { data: items } = await supabase
        .from("cash_sale_items")
        .select("*")
        .eq("cash_sale_id", sale.id)
        .eq("company_id", companyId)

      // Enrich with product images if any
      let enrichedItems = items || []
      if (enrichedItems.length > 0) {
        const productIds = enrichedItems.map((i: any) => i.product_id).filter((id: any) => id != null)
        if (productIds.length > 0) {
          const { data: products } = await supabase.from("products")
            .select("id, code, name, image_path").in("id", productIds)
          const productMap: Record<number, any> = {}
          if (products) products.forEach((p: any) => { productMap[p.id] = p })
          enrichedItems = enrichedItems.map((item: any) => {
            const prod = productMap[item.product_id]
            return {
              ...item,
              product_code: prod?.code || "",
              product_name: prod?.name || "",
              product_image: prod?.image_path || null
            }
          })
        }
      }

      const subTotal = enrichedItems.reduce((s: number, i: any) => s + (i.total || 0), 0)

      const pdfData = {
        companyName: companyName || "",
        companyAddress: "",
        companyPhone: "",
        companyEmail: "",
        companyTagline: companyTagline || "",
        logoUrl,
        businessType: "",
        invoiceNo: sale.sale_no,
        date: sale.date,
        dueDate: sale.date,
        customerName: customer?.name || "Walk‑in Customer",
        customerAddress: "",
        customerPhone: customer?.phone || "",
        customerEmail: "",
        paymentTerms: null,
        notes: sale.notes || null,
        createdBy: sale.created_by || "—",
        status: "Paid",
        items: enrichedItems.map((item: any) => ({
          description: item.description || "",
          qty: item.qty || 0,
          unit_price: item.unit_price || 0,
          total: item.total || 0,
          image_path: item.product_image || null,
          product_id: item.product_code || null,
          product_name: item.product_name || "",
          tax_rate: 0,
          tax_amount: 0,
        })),
        subtotal: subTotal,
        total: sale.total,
        totalTax: 0,
        paid: sale.total,
        balanceDue: 0,
        hideTerms: true,
      }

      const doc = await generateInvoicePDF(pdfData)
      doc.save(`CashSale_${sale.sale_no}.pdf`)
    } catch (err) {
      alert("Failed to generate PDF. Please try again.")
      console.error(err)
    }
  }

  const handlePrintSlip = async (sale: any, width: SlipWidth) => {
    try {
      await openCashSaleSlip(async () => {
        const cust = customerMap[sale.party_id]
        const { data: items } = await supabase
          .from("cash_sale_items")
          .select("*")
          .eq("cash_sale_id", sale.id)
          .eq("company_id", companyId)

        const rows: any[] = items || []
        const productIds = rows.map((i: any) => i.product_id).filter((id: any) => id != null)
        const productMap: Record<number, any> = {}
        if (productIds.length > 0) {
          const { data: products } = await supabase.from("products")
            .select("id, name").in("id", productIds)
          if (products) products.forEach((p: any) => { productMap[p.id] = p })
        }

        const f = saleFigures(sale)
        return generateCashSaleSlipPDF({
          companyName: companyName || "",
          companyTagline: companyTagline || "",
          logoUrl,
          saleNo: sale.sale_no,
          date: sale.date,
          customerName: cust?.name || "Walk-in Customer",
          returned: f.key === "returned",
          items: rows.map((item: any) => ({
            name: productMap[item.product_id]?.name || item.description || "",
            qty: item.qty || 0,
            rate: item.unit_price || 0,
            total: item.total || 0,
          })),
          subtotal: round2(sale.total || 0),
          discount: round2(sale.discount_amount || 0),
          net: f.net,
          received: f.received,
          due: f.due,
        }, width)
      }, `CashSaleSlip_${sale.sale_no}.pdf`)
    } catch (err) {
      alert("Failed to generate the slip. Please try again.")
      console.error(err)
    }
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  const thStyle: React.CSSProperties = {
    padding: "12px 16px",
    background: "var(--card-hover)",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    userSelect: "none",
  }
  const tdStyle: React.CSSProperties = {
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
    verticalAlign: "middle",
  }

  const SortTh = ({ field, children, style }: { field: SortField; children: React.ReactNode; style?: React.CSSProperties }) => (
    <th style={{ ...thStyle, ...style }}>
      <button
        onClick={() => handleSort(field)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          font: "inherit", fontSize: 12, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)",
          display: "inline-flex", alignItems: "center", gap: 4, padding: 0,
          whiteSpace: "nowrap",
        }}
      >
        {children} {getSortIcon(field)}
      </button>
    </th>
  )

  const StatusBadge = ({ k }: { k: string }) => {
    if (k === "paid") return null // the normal case needs no badge
    const st = STATUS_STYLE[k]
    return (
      <span style={{ fontSize: 10, fontWeight: 700, color: st.color, border: `1px solid ${st.color}`, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>
        {st.label.toUpperCase()}
      </span>
    )
  }

  const renderActions = (sale: any, cust: any) => (
    <ActionSlots
      slot1={{
        icon: <Eye size={13} />,
        title: "View",
        onClick: () => router.push(`/dashboard/cash-sales/${sale.id}`),
      }}
      slot2={sale.status === "returned" ? null : {
        icon: <Edit size={13} />,
        title: "Edit",
        onClick: () => router.push(`/dashboard/cash-sales/new?id=${sale.id}`),
      }}
      slot3={(hasFeature("whatsapp_invoice") && cust?.phone) ? {
        icon: <Send size={13} />,
        title: "Send WhatsApp",
        color: "#25D366",
        onClick: () => sendWhatsApp(sale),
      } : null}
      overflow={[
        {
          key: "return",
          label: "Return cash sale",
          color: "#EF4444",
          hidden: !(canEdit && sale.status !== "returned"),
          icon: <Undo2 size={14} />,
          onClick: () => setReturnSale(sale),
        },
        {
          key: "pdf",
          label: "PDF",
          icon: <FileText size={14} />,
          onClick: () => handlePrintPDF(sale),
        },
        {
          key: "slip80",
          label: "Slip 80 mm",
          icon: <Receipt size={14} />,
          onClick: () => handlePrintSlip(sale, 80),
        },
        {
          key: "slip58",
          label: "Slip 58 mm",
          icon: <Receipt size={14} />,
          onClick: () => handlePrintSlip(sale, 58),
        },
      ]}
    />
  )

  const chips: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "paid", label: "Paid" },
    { key: "partial", label: "Partial" },
    { key: "returned", label: "Returned" },
  ]

  return (
    <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
        .cs-table { width: 100%; border-collapse: collapse; }
        .cs-table tbody tr:last-child td { border-bottom: none; }
        .cs-table tbody tr:hover td { background: var(--card-hover); }
        .cs-table tbody tr.cs-row { cursor: pointer; }
        .btn-icon {
          background: transparent; border: 1.5px solid var(--border);
          color: var(--text-muted); padding: 5px; border-radius: 6px;
          cursor: pointer; display: inline-flex; align-items: center;
          justify-content: center; flex-shrink: 0; line-height: 1;
        }
        .btn-icon:hover { background: var(--card-hover); }
        .input {
          width: 100%; height: 38px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px;
          background: var(--card); color: var(--text); outline: none;
          box-sizing: border-box;
        }
        .input:focus { border-color: var(--primary); }
        .cs-select, .cs-date {
          height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
          padding: 0 10px; font-size: 13px; background: var(--card); color: var(--text);
          outline: none; box-sizing: border-box;
        }
        .cs-select:focus, .cs-date:focus { border-color: var(--primary); }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px; margin-bottom: 20px;
        }
        .summary-item {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px;
        }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
        .summary-sub { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
        .card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; overflow: hidden;
          box-shadow: var(--shadow-sm);
        }
        .table-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }
        .table-scroll::-webkit-scrollbar { height: 4px; }
        .table-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .cs-table { min-width: 650px; }

        .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }

        .cs-filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
        .cs-search { position: relative; flex: 1; min-width: 200px; max-width: 320px; }
        .cs-chips { display: flex; gap: 8px; margin-bottom: 16px; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 2px; }
        .cs-chip {
          flex-shrink: 0; height: 34px; padding: 0 14px; border-radius: 999px;
          border: 1.5px solid var(--border); background: var(--card); color: var(--text-muted);
          font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
        }
        .cs-chip.active { background: var(--primary); border-color: var(--primary); color: #fff; }

        /* Mobile card list: hidden by default (desktop/tablet shows the table) */
        .cs-cards { display: none; flex-direction: column; gap: 10px; }
        .cs-card-row {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 14px 16px; box-shadow: var(--shadow-sm); cursor: pointer;
        }
        .cs-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
        .cs-card-no { font-size: 15px; font-weight: 700; color: var(--primary); line-height: 1.3; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .cs-card-cust { font-size: 13px; color: var(--text); margin-top: 4px; }
        .cs-card-date { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
        .cs-card-amount { font-size: 15px; font-weight: 800; white-space: nowrap; text-align: right; color: var(--text); }
        .cs-card-sub { font-size: 11px; font-weight: 600; text-align: right; margin-top: 2px; }
        .cs-card-actions { display: flex; justify-content: flex-end; gap: 4px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
        .cs-card-empty { text-align: center; color: var(--text-muted); padding: 32px 16px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; }
        .cs-more { display: flex; justify-content: center; margin-top: 14px; }

        @media (max-width: 640px) {
          .page-wrap { padding: 12px !important; }
          .summary-grid { grid-template-columns: 1fr 1fr !important; }
          .summary-value { font-size: 18px; }
          .header-row { flex-direction: column; align-items: stretch; }
          .cs-search { max-width: 100%; min-width: 100%; }
          .cs-filters .cs-select, .cs-filters .cs-date { flex: 1; min-width: 120px; }
          .desktop-table { display: none; }
          .cs-cards { display: flex; }
        }
      `}</style>

      <div className="oa-list-header">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Cash Sales</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Record of direct cash counter sales</p>
        </div>
        {canEdit && (
          <button className="oa-btn oa-btn-primary" onClick={() => router.push("/dashboard/cash-sales/new")}><Plus size={16} /> New Cash Sale</button>
        )}
      </div>

      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">Sales</div>
          <div className="summary-value">{totalSales}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Net Sales</div>
          <div className="summary-value" style={{ color: "#10B981", fontVariantNumeric: "tabular-nums" }}><CurrencyTag size={12} />{fmtMoney(netAmount)}</div>
          <div className="summary-sub">after discount</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Outstanding Due</div>
          <div className="summary-value" style={{ color: totalDue > 0 ? "#F59E0B" : "var(--text)", fontVariantNumeric: "tabular-nums" }}><CurrencyTag size={12} />{fmtMoney(totalDue)}</div>
          <div className="summary-sub">partial sales</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Today</div>
          <div className="summary-value" style={{ color: "#10B981", fontVariantNumeric: "tabular-nums" }}><CurrencyTag size={12} />{fmtMoney(todayStats.amount)}</div>
          <div className="summary-sub">{todayStats.count} {todayStats.count === 1 ? "sale" : "sales"}</div>
        </div>
      </div>

      <div className="cs-filters">
        <div className="cs-search">
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="input" placeholder="Search sale no, customer, phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="cs-select" value={datePreset} onChange={(e) => setDatePreset(e.target.value as DatePreset)} aria-label="Date range">
          <option value="all">All time</option>
          <option value="today">Today</option>
          <option value="this_month">This month</option>
          <option value="last_month">Last month</option>
          <option value="custom">Custom range</option>
        </select>
        {datePreset === "custom" && (
          <>
            <input type="date" className="cs-date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
            <input type="date" className="cs-date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />
          </>
        )}
      </div>

      <div className="cs-chips">
        {chips.map(c => (
          <button key={c.key} className={"cs-chip" + (statusFilter === c.key ? " active" : "")} onClick={() => setStatusFilter(c.key)}>
            {c.label} ({counts[c.key]})
          </button>
        ))}
      </div>

      {/* Table (desktop / tablet) */}
      <div className="card desktop-table">
        <div className="table-scroll">
          <table className="cs-table">
            <colgroup>
              <col style={{ width: 170 }} />  {/* Sale No + status */}
              <col style={{ width: 110 }} />  {/* Date */}
              <col />                           {/* Customer */}
              <col style={{ width: 140 }} />  {/* Amount */}
              <col style={{ width: 160 }} />  {/* Actions */}
            </colgroup>
            <thead>
              <tr>
                <SortTh field="sale_no">Sale No</SortTh>
                <SortTh field="date">Date</SortTh>
                <SortTh field="customer" style={{ textAlign: "left" }}>Customer</SortTh>
                <SortTh field="total" style={{ textAlign: "right" }}>Amount (PKR)</SortTh>
                <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                    No cash sales found.
                  </td>
                </tr>
              ) : (
                visibleRows.map((sale) => {
                  const cust = customerMap[sale.party_id]
                  const custName = cust?.name || WALK_IN
                  const f = saleFigures(sale)
                  return (
                    <tr key={sale.id} className="cs-row" onClick={() => router.push(`/dashboard/cash-sales/${sale.id}`)}>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, color: "var(--primary)", marginRight: 8 }}>{sale.sale_no}</span>
                        <StatusBadge k={f.key} />
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{sale.date}</td>
                      <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {custName}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {fmtMoney(f.net)}
                        {f.key === "partial" && (
                          <div style={{ fontSize: 11, fontWeight: 600, color: "#F59E0B" }}>Due {fmtMoney(f.due)}</div>
                        )}
                        {(sale.discount_amount || 0) > 0 && f.key !== "partial" && (
                          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}>Disc {fmtMoney(sale.discount_amount || 0)}</div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        {renderActions(sale, cust)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: card list, shown instead of the table below 640px */}
      <div className="cs-cards">
        {loading ? (
          [1, 2, 3, 4].map(i => (
            <div className="cs-card-row" key={i}>
              <div style={{ width: "55%", height: 14, background: "var(--bg-soft)", borderRadius: 4, animation: "shimmer 1.5s ease-in-out infinite", marginBottom: 8 }} />
              <div style={{ width: "35%", height: 12, background: "var(--bg-soft)", borderRadius: 4, animation: "shimmer 1.5s ease-in-out infinite" }} />
            </div>
          ))
        ) : visibleRows.length === 0 ? (
          <div className="cs-card-empty">No cash sales found.</div>
        ) : (
          visibleRows.map((sale) => {
            const cust = customerMap[sale.party_id]
            const custName = cust?.name || WALK_IN
            const f = saleFigures(sale)
            return (
              <div key={sale.id} className="cs-card-row" onClick={() => router.push(`/dashboard/cash-sales/${sale.id}`)}>
                <div className="cs-card-top">
                  <div style={{ minWidth: 0 }}>
                    <div className="cs-card-no">{sale.sale_no} <StatusBadge k={f.key} /></div>
                    <div className="cs-card-cust">{custName}</div>
                    <div className="cs-card-date">{sale.date}</div>
                  </div>
                  <div>
                    <div className="cs-card-amount" style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}><CurrencyTag />{fmtMoney(f.net)}</div>
                    {f.key === "partial" && (
                      <div className="cs-card-sub" style={{ color: "#F59E0B" }}>Due {fmtMoney(f.due)}</div>
                    )}
                    {(sale.discount_amount || 0) > 0 && f.key !== "partial" && (
                      <div className="cs-card-sub" style={{ color: "var(--text-muted)", fontWeight: 500 }}>Disc {fmtMoney(sale.discount_amount || 0)}</div>
                    )}
                  </div>
                </div>
                <div className="cs-card-actions" onClick={(e) => e.stopPropagation()}>
                  {renderActions(sale, cust)}
                </div>
              </div>
            )
          })
        )}
      </div>

      {!loading && remaining > 0 && (
        <div className="cs-more">
          <button className="oa-btn oa-btn-outline" onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>
            Show more ({remaining} remaining)
          </button>
        </div>
      )}

      {returnSale && (
        <CashSaleReturnModal
          sale={{ id: returnSale.id, sale_no: returnSale.sale_no, date: returnSale.date, total: returnSale.total, company_id: returnSale.company_id }}
          onClose={() => setReturnSale(null)}
          onDone={(saleId) => router.push(`/dashboard/cash-sales/${saleId}`)}
        />
      )}
    </div>
  )
}
