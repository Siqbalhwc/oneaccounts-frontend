"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Search, Send } from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import DownloadPDFButton from "@/components/DownloadPDFButton"
import Pagination from "@/components/Pagination"

interface InvoiceItem {
  id: number
  invoice_no: string
  date: string
  due_date: string
  total: number
  paid: number
  status: string
  party_id: number
  customer_name?: string
  customer_phone?: string
}

export default function InvoicesPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [invoices, setInvoices] = useState<InvoiceItem[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)

  const loadInvoices = async () => {
    setLoading(true)

    // Get total count (for pagination)
    const { count } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .eq("type", "sale")

    setTotal(count || 0)

    // Fetch current page
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data: invData, error: invError } = await supabase
      .from("invoices")
      .select("id,invoice_no,date,due_date,total,paid,status,party_id")
      .eq("type", "sale")
      .order("date", { ascending: false })
      .range(from, to)

    if (invError || !invData) {
      setLoading(false)
      return
    }

    // Customer names (manual join)
    const customerIds = [...new Set(invData.map((i) => i.party_id).filter(Boolean))]
    let customerMap: Record<number, { name: string; phone: string }> = {}
    if (customerIds.length > 0) {
      const { data: custData } = await supabase
        .from("customers")
        .select("id, name, phone")
        .in("id", customerIds)
      if (custData) {
        custData.forEach((c: any) => {
          customerMap[c.id] = { name: c.name, phone: c.phone }
        })
      }
    }

    const enriched = invData.map((inv) => ({
      ...inv,
      customer_name: customerMap[inv.party_id]?.name || "Unknown",
      customer_phone: customerMap[inv.party_id]?.phone || "",
    }))

    setInvoices(enriched)
    setLoading(false)
  }

  useEffect(() => {
    loadInvoices()
  }, [page, pageSize])

  const filtered = invoices.filter(
    (i) =>
      (i.invoice_no || "").toLowerCase().includes(search.toLowerCase()) ||
      (i.customer_name || "").toLowerCase().includes(search.toLowerCase())
  )

  const statusStyle = (s: string) => {
    if (s === "Paid") return { bg: "#D1FAE5", color: "#065F46" }
    if (s === "Partial") return { bg: "#FEF3C7", color: "#92400E" }
    return { bg: "#FEE2E2", color: "#991B1B" }
  }

  const waLink = (phone: string, no: string, bal: number, name: string) => {
    if (!phone) return ""
    return `https://wa.me/92${phone.replace(/\D/g, "")}?text=${encodeURIComponent(
      `Dear ${name},\nPayment of PKR ${bal.toLocaleString()} for invoice ${no} is due.\nPlease clear it at your earliest convenience. 🙏`
    )}`
  }

  const handleDownloadPDF = async (invoice: InvoiceItem) => {
    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)
    if (!items) return
    const pdfInvoice = {
      ...invoice,
      customers: { name: invoice.customer_name, phone: invoice.customer_phone },
    }
    const doc = generateInvoicePDF(pdfInvoice, items)
    doc.save(`invoice-${invoice.invoice_no}.pdf`)
  }

  return (
    <div
      style={{
        padding: "clamp(16px,2.5vw,24px)",
        background: "#EFF4FB",
        minHeight: "100%",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <style>{`
        .il-table { background: white; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
        .il-header { display: grid; grid-template-columns: 110px 1fr 100px 90px 90px 90px 90px 60px; padding: 10px 16px; background: #F8FAFC; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94A3B8; }
        .il-row { display: grid; grid-template-columns: 110px 1fr 100px 90px 90px 90px 90px 60px; padding: 10px 16px; border-bottom: 1px solid #F1F5F9; font-size: 13px; align-items: center; }
        .il-row:last-child { border-bottom: none; }
        .il-row:hover { background: #FAFBFF; }
        @media (max-width: 800px) {
          .il-header, .il-row { grid-template-columns: 100px 1fr 80px 70px 60px; }
          .il-hide { display: none; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1E293B" }}>🧾 Sales Invoices</div>
          <div style={{ fontSize: 13, color: "#94A3B8" }}>View and manage all sales invoices</div>
        </div>
        <button
          onClick={() => router.push("/dashboard/invoices/new")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "9px 16px",
            borderRadius: 9,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            border: "none",
            fontFamily: "inherit",
            background: "linear-gradient(135deg, #1740C8, #071352)",
            color: "white",
          }}
        >
          <Plus size={16} /> New Invoice
        </button>
      </div>

      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={14} style={{ position: "absolute", left: 12, top: 13, color: "#94A3B8" }} />
        <input
          placeholder="Search by invoice no or customer name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 360,
            height: 40,
            border: "1.5px solid #E2E8F0",
            borderRadius: 9,
            padding: "0 14px 0 36px",
            fontSize: 13,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
      </div>

      <div className="il-table">
        <div className="il-header">
          <span>Invoice No</span>
          <span>Customer</span>
          <span>Date</span>
          <span className="il-hide">Due Date</span>
          <span>Total</span>
          <span>Status</span>
          <span>Action</span>
          <span>PDF</span>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>
            {total === 0 ? "No invoices yet — create your first one!" : "No invoices match your search"}
          </div>
        ) : (
          filtered.map((i) => {
            const bal = i.total - i.paid
            const st = statusStyle(i.status)
            return (
              <div key={i.id} className="il-row">
                <span style={{ fontWeight: 700, color: "#1E3A8A" }}>{i.invoice_no}</span>
                <span>{i.customer_name || "-"}</span>
                <span style={{ color: "#64748B" }}>{i.date}</span>
                <span className="il-hide" style={{ color: "#64748B" }}>{i.due_date}</span>
                <span style={{ fontWeight: 600 }}>PKR {i.total?.toLocaleString()}</span>
                <span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 600,
                      background: st.bg,
                      color: st.color,
                    }}
                  >
                    {i.status}
                  </span>
                </span>
                <span>
                  {i.status !== "Paid" && i.customer_phone && (
                    <a
                      href={waLink(i.customer_phone, i.invoice_no, bal, i.customer_name || "")}
                      target="_blank"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        background: "#25D366",
                        color: "white",
                        padding: "3px 8px",
                        borderRadius: 5,
                        fontSize: 10,
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      <Send size={10} /> Remind
                    </a>
                  )}
                </span>
                <span>
                  <DownloadPDFButton onGenerate={() => handleDownloadPDF(i)} />
                </span>
              </div>
            )
          })
        )}
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
      </div>
    </div>
  )
}