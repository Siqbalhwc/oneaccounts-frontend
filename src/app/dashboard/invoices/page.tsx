"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Eye, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import { getWhatsAppLink } from "@/lib/whatsapp"

type SortField = "invoice_no" | "date" | "customer" | "total" | "status"
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

export default function InvoicesPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const searchParams = useSearchParams()
  const { role } = useRole()
  const { hasFeature } = usePlan()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [companyId, setCompanyId] = useState("")

  const statusFilter = searchParams.get("status") || ""
  const overdueFilter = searchParams.get("overdue") === "true"

  const [customerMap, setCustomerMap] = useState<Record<number, { name: string; phone: string }>>({})

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
      .from("invoices")
      .select("*")
      .eq("company_id", companyId)
      .eq("type", "sale")
      .is("deleted_at", null)
      .order(sortField === "customer" ? "party_id" : sortField, { ascending: sortDir === "asc" })
      .then(({ data }) => {
        setInvoices(data || [])
        setLoading(false)
      })
  }, [role, canView, companyId, sortField, sortDir])

  const todayISO = new Date().toISOString().split("T")[0]

  const filtered = invoices.filter((inv) => {
    if (search.trim()) {
      const cust = customerMap[inv.party_id]
      const custName = cust?.name || ""
      if (!inv.invoice_no?.toLowerCase().includes(search.toLowerCase()) &&
          !custName.toLowerCase().includes(search.toLowerCase())) return false
    }
    if (statusFilter && inv.status !== statusFilter) return false
    if (overdueFilter) {
      if (inv.status === "Paid" || inv.due_date >= todayISO) return false
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
    } else if (sortField === "status") {
      valA = (a.status || "").toLowerCase()
      valB = (b.status || "").toLowerCase()
    } else {
      valA = (a[sortField] || "").toString().toLowerCase()
      valB = (b[sortField] || "").toString().toLowerCase()
    }
    return sortDir === "asc" ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1)
  })

  const totalInvoices = sortedFiltered.length
  const totalAmount = sortedFiltered.reduce((s, i) => s + (i.total || 0), 0)
  const unpaidCount = sortedFiltered.filter(i => i.status === "Unpaid").length
  const unpaidAmount = sortedFiltered.filter(i => i.status === "Unpaid").reduce((s, i) => s + (i.total || 0), 0)

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("asc") }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const sendWhatsApp = (inv: any) => {
    const cust = customerMap[inv.party_id]
    if (!cust?.phone) { alert("No phone number."); return }
    const invoiceLink = `https://www.oneaccountsbysiqbal.com/invoice/${inv.id}`
    const message = [
      `Dear ${cust.name},`,
      ``,
      `Your invoice ${inv.invoice_no} of PKR ${inv.total?.toLocaleString()} has been generated.`,
      ``,
      `📄 View Online: ${invoiceLink}`,
      `📅 Date: ${inv.date}`,
      `📆 Due: ${inv.due_date}`,
      ``,
      `Thank you for your business.`,
      `— OneAccounts by Siqbal`,
    ].join("\n")
    const link = getWhatsAppLink(cust.phone, message)
    if (link) window.open(link, "_blank")
  }

  const sendReminder = (inv: any) => {
    const cust = customerMap[inv.party_id]
    if (!cust?.phone) { alert("No phone number."); return }
    const invoiceLink = `https://www.oneaccountsbysiqbal.com/invoice/${inv.id}`
    const message = [
      `Dear ${cust.name},`,
      ``,
      `Friendly reminder: Your invoice ${inv.invoice_no} for PKR ${inv.total?.toLocaleString()} is overdue.`,
      ``,
      `📄 View & Pay: ${invoiceLink}`,
      ``,
      `Thank you.`,
      `— OneAccounts by Siqbal`,
    ].join("\n")
    const link = getWhatsAppLink(cust.phone, message)
    if (link) window.open(link, "_blank")
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  /* ── shared th/td styles ── */
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
        .inv-table { width: 100%; border-collapse: collapse; }
        .inv-table tbody tr:last-child td { border-bottom: none; }
        .inv-table tbody tr:hover td { background: var(--card-hover); }
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
        /* table-scroll: enables horizontal swipe on mobile.
           The table itself has a min-width so columns never collapse. */
        .table-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          /* show a subtle scrollbar on mobile so user knows it's scrollable */
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }
        .table-scroll::-webkit-scrollbar { height: 4px; }
        .table-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .inv-table { min-width: 650px; }  /* never collapse below this */

        /* on very small screens, reduce outer page padding so table gets more room */
        @media (max-width: 480px) {
          .page-wrap { padding: 12px !important; }
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      {/* ── Page header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>🧾 Sales Invoices</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{canEdit ? "Create and manage invoices" : "View invoices"}</p>
        </div>
        {canEdit && (
          <button className="btn" onClick={() => router.push("/dashboard/invoices/new")}><Plus size={16} /> New Invoice</button>
        )}
      </div>

      {/* ── Summary cards ── */}
      <div className="summary-grid">
        <div className="summary-item"><div className="summary-label">Total Invoices</div><div className="summary-value">{totalInvoices}</div></div>
        <div className="summary-item"><div className="summary-label">Total Amount</div><div className="summary-value" style={{ color: "#F59E0B" }}>PKR {totalAmount.toLocaleString()}</div></div>
        <div className="summary-item"><div className="summary-label">Unpaid</div><div className="summary-value" style={{ color: "#EF4444" }}>{unpaidCount}</div></div>
        <div className="summary-item"><div className="summary-label">Unpaid Amount</div><div className="summary-value" style={{ color: "#EF4444" }}>PKR {unpaidAmount.toLocaleString()}</div></div>
      </div>

      {/* ── Search ── */}
      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="input" placeholder="Search invoice or customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* ── Table ── */}
      <div className="card">
        <div className="table-scroll">
          <table className="inv-table">
            {/* Fixed column widths — browser guarantees th & td stay in sync */}
            <colgroup>
              <col style={{ width: 140 }} /> {/* Invoice # */}
              <col style={{ width: 100 }} /> {/* Date */}
              <col />                         {/* Customer — takes remaining space */}
              <col style={{ width: 120 }} /> {/* Total */}
              <col style={{ width: 80  }} /> {/* Status */}
              <col style={{ width: 110 }} /> {/* Actions */}
            </colgroup>

            <thead>
              <tr>
                <SortTh field="invoice_no">Invoice #</SortTh>
                <SortTh field="date">Date</SortTh>
                <SortTh field="customer" style={{ textAlign: "left" }}>Customer</SortTh>
                <SortTh field="total" style={{ textAlign: "right" }}>Total</SortTh>
                <SortTh field="status" style={{ textAlign: "center" }}>Status</SortTh>
                {/* Plain th — not sortable */}
                <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : sortedFiltered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                    No invoices found.
                  </td>
                </tr>
              ) : (
                sortedFiltered.map((inv) => {
                  const cust = customerMap[inv.party_id]
                  const custName = cust?.name || "—"
                  const statusColor =
                    inv.status === "Paid"   ? "#10B981" :
                    inv.status === "Unpaid" ? "#EF4444" : "#F59E0B"
                  return (
                    <tr key={inv.id}>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, color: "var(--primary)" }}>{inv.invoice_no}</span>
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{inv.date}</td>
                      <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {custName}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>
                        PKR {inv.total?.toLocaleString()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", fontWeight: 600, color: statusColor, whiteSpace: "nowrap" }}>
                        {inv.status}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          <button className="btn-icon" onClick={() => router.push(`/dashboard/invoices/${inv.id}`)} title="View">
                            <Eye size={13} />
                          </button>
                          {hasFeature("whatsapp_invoice") && (
                            <button className="btn-icon" onClick={() => sendWhatsApp(inv)} title="Send WhatsApp" style={{ color: "#25D366" }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                            </button>
                          )}
                          {hasFeature("payment_reminders") && inv.status !== "Paid" && (
                            <button className="btn-icon" onClick={() => sendReminder(inv)} title="Send Reminder" style={{ color: "#F97316" }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                              </svg>
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