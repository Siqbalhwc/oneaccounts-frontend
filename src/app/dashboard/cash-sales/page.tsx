"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Eye, Edit, Search, ArrowUpDown, ArrowUp, ArrowDown, FileText, Send } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import { getWhatsAppLink } from "@/lib/whatsapp"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import { useCompany } from "@/contexts/CompanyContext"

type SortField = "sale_no" | "date" | "customer" | "total"
type SortDir = "asc" | "desc"

function SkeletonRow() {
  return (
    <tr>
      {[60, 50, 999, 40, 50, 80].map((w, i) => (
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
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [companyId, setCompanyId] = useState("")

  const [customerMap, setCustomerMap] = useState<Record<number, { name: string; phone: string }>>({})

  const { companyName, companyTagline, logoUrl } = useCompany()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

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

  useEffect(() => {
    if (!role) return
    if (!canView) { setLoading(false); return }
    if (!companyId) return

    setLoading(true)
    supabase
      .from("cash_sales")
      .select("*")
      .eq("company_id", companyId)
      .order(sortField === "customer" ? "party_id" : sortField, { ascending: sortDir === "asc" })
      .then(({ data }) => {
        setSales(data || [])
        setLoading(false)
      })
  }, [role, canView, companyId, sortField, sortDir])

  const filtered = sales.filter((s) => {
    if (search.trim()) {
      const cust = customerMap[s.party_id]
      const custName = cust?.name || ""
      if (!s.sale_no?.toLowerCase().includes(search.toLowerCase()) &&
          !custName.toLowerCase().includes(search.toLowerCase())) return false
    }
    return true
  })

  const sortedFiltered = [...filtered].sort((a, b) => {
    let valA: any, valB: any
    if (sortField === "customer") {
      valA = (customerMap[a.party_id]?.name || "").toLowerCase()
      valB = (customerMap[b.party_id]?.name || "").toLowerCase()
    } else if (sortField === "total") {
      valA = Number(a.total) || 0
      valB = Number(b.total) || 0
    } else {
      valA = (a[sortField] || "").toString().toLowerCase()
      valB = (b[sortField] || "").toString().toLowerCase()
    }
    return sortDir === "asc" ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1)
  })

  const totalSales = sortedFiltered.length
  const totalAmount = sortedFiltered.reduce((s, i) => s + (i.total || 0), 0)
  const today = new Date().toISOString().split("T")[0]
  const todaySales = sortedFiltered.filter(s => s.date === today).length
  const todayAmount = sortedFiltered.filter(s => s.date === today).reduce((s, i) => s + (i.total || 0), 0)

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
      `Your cash sale ${sale.sale_no} of PKR ${sale.total?.toLocaleString()} has been recorded.`,
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
        .btn {
          padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          color: white; border: none; transition: all 0.2s;
        }
        .btn:hover {
          background: linear-gradient(135deg, #1E55E8 0%, #0F2280 100%);
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(7,19,82,0.45);
        }
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

        @media (max-width: 480px) {
          .page-wrap { padding: 12px !important; }
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>💵 Cash Sales</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Record of direct cash counter sales</p>
        </div>
        {canEdit && (
          <button className="btn" onClick={() => router.push("/dashboard/cash-sales/new")}><Plus size={16} /> New Cash Sale</button>
        )}
      </div>

      <div className="summary-grid">
        <div className="summary-item"><div className="summary-label">Total Sales</div><div className="summary-value">{totalSales}</div></div>
        <div className="summary-item"><div className="summary-label">Total Amount</div><div className="summary-value" style={{ color: "#10B981" }}>PKR {totalAmount.toLocaleString()}</div></div>
        <div className="summary-item"><div className="summary-label">Today's Sales</div><div className="summary-value">{todaySales}</div></div>
        <div className="summary-item"><div className="summary-label">Today's Amount</div><div className="summary-value" style={{ color: "#10B981" }}>PKR {todayAmount.toLocaleString()}</div></div>
      </div>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="input" placeholder="Search sale no or customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="cs-table">
            <colgroup>
              <col style={{ width: 140 }} />  {/* Sale No */}
              <col style={{ width: 100 }} />  {/* Date */}
              <col />                           {/* Customer */}
              <col style={{ width: 120 }} />  {/* Total */}
              <col style={{ width: 160 }} />  {/* Actions (wider to fit all icons) */}
            </colgroup>
            <thead>
              <tr>
                <SortTh field="sale_no">Sale No</SortTh>
                <SortTh field="date">Date</SortTh>
                <SortTh field="customer" style={{ textAlign: "left" }}>Customer</SortTh>
                <SortTh field="total" style={{ textAlign: "right" }}>Total</SortTh>
                <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : sortedFiltered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                    No cash sales found.
                  </td>
                </tr>
              ) : (
                sortedFiltered.map((sale) => {
                  const cust = customerMap[sale.party_id]
                  const custName = cust?.name || "Walk‑in Customer"
                  return (
                    <tr key={sale.id}>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, color: "var(--primary)" }}>{sale.sale_no}</span>
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{sale.date}</td>
                      <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {custName}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>
                        PKR {sale.total?.toLocaleString()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          <button className="btn-icon" onClick={() => router.push(`/dashboard/cash-sales/${sale.id}`)} title="View">
                            <Eye size={13} />
                          </button>
                          <button className="btn-icon" onClick={() => router.push(`/dashboard/cash-sales/new?id=${sale.id}`)} title="Edit">
                            <Edit size={13} />
                          </button>
                          <button className="btn-icon" onClick={() => handlePrintPDF(sale)} title="PDF">
                            <FileText size={13} />
                          </button>
                          {hasFeature("whatsapp_invoice") && cust?.phone && (
                            <button className="btn-icon" onClick={() => sendWhatsApp(sale)} title="Send WhatsApp" style={{ color: "#25D366" }}>
                              <Send size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}