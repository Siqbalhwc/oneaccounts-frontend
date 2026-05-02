"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, Search, Send } from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import DownloadPDFButton from "@/components/DownloadPDFButton"

// ── FIX 1: customers is a single object, not an array ────────────────────────
// Supabase returns joined relations as arrays by default.
// We cast it correctly here so TypeScript is happy and
// we access it as i.customers?.name (not i.customers[0]?.name)
interface Invoice {
  id: number
  invoice_no: string
  date: string
  due_date: string
  total: number
  paid: number
  status: string
  customers?: { name: string; phone: string; address?: string } | null
}

export default function InvoicesPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  const loadInvoices = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("invoices")
      .select("id,invoice_no,date,due_date,total,paid,status,customers!party_id(name,phone,address)")
      .eq("type", "sale")
      .order("date", { ascending: false })

    console.log("Invoices fetch:", data, error)

    if (!error && data) {
      // ── FIX 2: Supabase returns the joined relation as an array.
      // We normalise it to a single object so our interface is satisfied
      // and i.customers?.name works correctly everywhere.
      const normalised: Invoice[] = (data as any[]).map((row) => ({
        ...row,
        customers: Array.isArray(row.customers)
          ? (row.customers[0] ?? null)
          : (row.customers ?? null),
      }))
      setInvoices(normalised)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadInvoices()
  }, [])

  const filtered = invoices.filter(i =>
    (i.invoice_no || "").toLowerCase().includes(search.toLowerCase()) ||
    (i.customers?.name || "").toLowerCase().includes(search.toLowerCase())
  )

  const statusStyle = (s: string) => {
    if (s === "Paid")    return { bg: "#D1FAE5", color: "#065F46" }
    if (s === "Partial") return { bg: "#FEF3C7", color: "#92400E" }
    return { bg: "#FEE2E2", color: "#991B1B" }
  }

  const waLink = (phone: string, no: string, bal: number, name: string) => {
    if (!phone) return ""
    return `https://wa.me/92${phone.replace(/\D/g, "")}?text=${encodeURIComponent(
      `Dear ${name},\nPayment of PKR ${bal.toLocaleString()} for invoice ${no} is due.\nPlease clear it at your earliest convenience. 🙏`
    )}`
  }

  const handleDownloadPDF = async (invoice: Invoice) => {
    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)
    if (!items) return
    const doc = generateInvoicePDF(invoice, items)
    doc.save(`invoice-${invoice.invoice_no}.pdf`)
  }

  return (
    <div style={{ padding: "clamp(16px,2.5vw,24px)", background: "#EFF4FB", minHeight: "100%", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
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
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "inherit", background: "linear-gradient(135deg, #1740C8, #071352)", color: "white" }}>
          <Plus size={16} /> New Invoice
        </button>
      </div>

      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={14} style={{ position: "absolute", left: 12, top: 13, color: "#94A3B8" }} />
        <input
          placeholder="Search by invoice no or customer name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: "100%", maxWidth: 360, height: 40, border: "1.5px solid #E2E8F0", borderRadius: 9, padding: "0 14px 0 36px", fontSize: 13, outline: "none", fontFamily: "inherit" }}
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
            {invoices.length === 0 ? "No invoices yet — create your first one!" : "No invoices match your search"}
          </div>
        ) : (
          filtered.map(i => {
            const bal = i.total - i.paid
            const st = statusStyle(i.status)
            return (
              <div key={i.id} className="il-row">
                <span style={{ fontWeight: 700, color: "#1E3A8A" }}>{i.invoice_no}</span>
                <span>{i.customers?.name || "-"}</span>
                <span style={{ color: "#64748B" }}>{i.date}</span>
                <span className="il-hide" style={{ color: "#64748B" }}>{i.due_date}</span>
                <span style={{ fontWeight: 600 }}>PKR {i.total?.toLocaleString()}</span>
                <span>
                  <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>
                    {i.status}
                  </span>
                </span>
                <span>
                  {i.status !== "Paid" && i.customers?.phone && (
                    <a
                      href={waLink(i.customers.phone, i.invoice_no, bal, i.customers.name)}
                      target="_blank"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#25D366", color: "white", padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, textDecoration: "none" }}>
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
      </div>
    </div>
  )
}
