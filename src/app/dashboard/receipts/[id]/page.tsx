"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer, Send } from "lucide-react"
import { generateReceiptPDF } from "@/lib/pdf/receiptPDF"
import RecordHistory from "@/components/RecordHistory"
import { usePlan } from "@/contexts/PlanContext"
import { useCompany } from "@/contexts/CompanyContext"

interface Receipt {
  id: number
  receipt_no: string
  date: string
  amount: number
  payment_method: string
  party_type: string
  party_id: number | null
  bank_account_id: number | null
  reference?: string
  notes?: string
  customer?: {
    name: string
    code: string
    phone?: string
    email?: string
    address?: string
  }
  allocations?: {
    invoice_id: number
    invoice_no: string
    amount: number
  }[]
}

interface JournalLine {
  account_id: number
  account_code?: string
  account_name?: string
  debit: number
  credit: number
}

export default function ReceiptDetailPage() {
  const router = useRouter()
  const params = useParams()
  const receiptId = params?.id as string
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { hasFeature } = usePlan()
  const { companyName, companyTagline, logoUrl } = useCompany()

  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")
  const [bankName, setBankName] = useState<string>("")
  const [journalLines, setJournalLines] = useState<JournalLine[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId || !receiptId) return
    setLoading(true)

    supabase
      .from("receipts")
      .select("*")
      .eq("id", receiptId)
      .eq("company_id", companyId)
      .single()
      .then(async ({ data }) => {
        if (!data) { setLoading(false); return }
        const rec: Receipt = data

        if (rec.bank_account_id) {
          const { data: bank } = await supabase
            .from("bank_accounts")
            .select("bank_name")
            .eq("id", rec.bank_account_id)
            .single()
          if (bank) setBankName(bank.bank_name)
        }

        if (rec.party_id && rec.party_type === "customer") {
          const { data: cust } = await supabase
            .from("customers")
            .select("name, code, phone, email, address")
            .eq("id", rec.party_id)
            .single()
          rec.customer = cust || undefined
        }

        // Fetch receipt allocations (if any)
        const { data: allocs } = await supabase
          .from("receipt_allocations")
          .select("amount, invoice_id, invoices(invoice_no)")
          .eq("receipt_id", rec.id)

        rec.allocations = (allocs || []).map((a: any) => ({
          invoice_id: a.invoice_id,
          invoice_no: a.invoices?.invoice_no || "—",
          amount: a.amount,
        }))

        setReceipt(rec)
        setLoading(false)
      })

    // Fetch journal lines
    supabase
      .from("journal_lines")
      .select("account_id, debit, credit, accounts(code, name)")
      .eq("company_id", companyId)
      .eq("source_type", "receipt")
      .eq("source_id", receiptId)
      .then(({ data: lines }) => {
        if (lines && lines.length > 0) {
          const formatted = lines.map((l: any) => ({
            account_id: l.account_id,
            account_code: l.accounts?.code || "",
            account_name: l.accounts?.name || "",
            debit: l.debit || 0,
            credit: l.credit || 0,
          }))
          setJournalLines(formatted)
        }
      })
  }, [companyId, receiptId])

  const getWhatsAppLink = () => {
    if (!receipt || !receipt.customer) return ""
    const phone = (receipt.customer.phone || "").replace(/\D/g, "")
    if (!phone) return ""
    const msg = `Dear ${receipt.customer.name},\n\nYour receipt ${receipt.receipt_no} for PKR ${receipt.amount?.toLocaleString()} has been recorded.\nDate: ${receipt.date}\nMethod: ${receipt.payment_method}\n${receipt.notes ? "Notes: " + receipt.notes : ""}\n\nThank you.\n— OneAccounts`
    return `https://wa.me/92${phone}?text=${encodeURIComponent(msg)}`
  }

  const handlePrintPDF = async () => {
    if (!receipt) return

    const pdfData = {
      companyName:    companyName || "OneAccounts",
      companyAddress: "",
      companyPhone:   "",
      companyEmail:   "",
      companyTagline: companyTagline || "",
      logoUrl:        logoUrl,
      receiptNo:      receipt.receipt_no,
      date:           receipt.date,
      customerName:    receipt.customer?.name || "Customer",
      customerAddress: receipt.customer?.address || "",
      customerPhone:   receipt.customer?.phone || "",
      customerEmail:   receipt.customer?.email || "",
      paymentMethod:   receipt.payment_method,
      amount:          receipt.amount || 0,
      reference:       receipt.reference || "",
      notes:           receipt.notes || "",
    }

    const doc = await generateReceiptPDF(pdfData)
    doc.save(`Receipt_${receipt.receipt_no}.pdf`)
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", color: "var(--text-muted)" }}>Loading…</div>
  if (!receipt) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", color: "var(--text-muted)" }}>Receipt not found</div>

  const waLink = getWhatsAppLink()
  const totalDebit = journalLines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = journalLines.reduce((s, l) => s + l.credit, 0)

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .row { display: flex; margin-bottom: 10px; font-size: 14px; align-items: center; }
        .label { width: 130px; color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; }
        .value { color: var(--text); font-weight: 500; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { text-align: left; padding: 10px 12px; background: var(--card-hover); font-weight: 700; color: var(--text-muted); font-size: 10px; text-transform: uppercase; border-bottom: 1px solid var(--border); }
        td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text); }
        tr:hover td { background: var(--card-hover); }
        .btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-family: inherit; text-decoration: none; }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-primary:hover { background: var(--primary-hover); }
        .btn-success { background: #25D366; color: white; border-color: #25D366; }
        .btn-success:hover { background: #22C55E; }
        .record-history { background: var(--bg-soft); border-radius: 8px; padding: 8px; }
        @media (max-width: 640px) {
          .row { flex-direction: column; align-items: flex-start; }
          .label { margin-bottom: 2px; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn" onClick={() => router.push("/dashboard/receipts")}><ArrowLeft size={16} /></button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Receipt #{receipt.receipt_no}</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{receipt.customer?.name || "Unknown Customer"}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {waLink && hasFeature("whatsapp_invoice") && (
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-success"><Send size={16} /> WhatsApp</a>
          )}
          <button className="btn btn-primary" onClick={handlePrintPDF}><Printer size={16} /> Print PDF</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Receipt Details</h3>
        <div className="row"><span className="label">Receipt No.</span><span className="value">{receipt.receipt_no}</span></div>
        <div className="row"><span className="label">Date</span><span className="value">{receipt.date}</span></div>
        <div className="row"><span className="label">Type</span><span className="value">{receipt.party_type === "donation" ? "Donation" : "Customer Receipt"}</span></div>
        {receipt.customer && <div className="row"><span className="label">Customer</span><span className="value">{receipt.customer.code} – {receipt.customer.name}</span></div>}
        <div className="row"><span className="label">Amount</span><span className="value" style={{ fontSize: 18, fontWeight: 700, color: "#10B981" }}>PKR {receipt.amount?.toLocaleString()}</span></div>
        {bankName && <div className="row"><span className="label">Bank</span><span className="value">{bankName}</span></div>}
        <div className="row"><span className="label">Method</span><span className="value">{receipt.payment_method}</span></div>
        {receipt.reference && <div className="row"><span className="label">Reference</span><span className="value">{receipt.reference}</span></div>}
        {receipt.notes && <div className="row"><span className="label">Notes</span><span className="value">{receipt.notes}</span></div>}
      </div>

      {receipt.allocations && receipt.allocations.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Applied to Invoices</h3>
          <table>
            <thead><tr><th>Invoice Number</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
            <tbody>
              {receipt.allocations.map((alloc, idx) => (
                <tr key={idx}><td>{alloc.invoice_no}</td><td style={{ textAlign: "right", fontWeight: 600 }}>PKR {alloc.amount?.toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {journalLines.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📒 Journal Entry</h3>
          <table>
            <thead><tr><th>Account</th><th style={{ textAlign: "right" }}>Debit (PKR)</th><th style={{ textAlign: "right" }}>Credit (PKR)</th></tr></thead>
            <tbody>
              {journalLines.map((line, idx) => (
                <tr key={idx}>
                  <td>{line.account_code} – {line.account_name}</td>
                  <td style={{ textAlign: "right", color: line.debit > 0 ? "#F87171" : "var(--text-muted)" }}>{line.debit > 0 ? line.debit.toLocaleString() : "–"}</td>
                  <td style={{ textAlign: "right", color: line.credit > 0 ? "#2DD4BF" : "var(--text-muted)" }}>{line.credit > 0 ? line.credit.toLocaleString() : "–"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--card-hover)", fontWeight: 700 }}>
                <td>Total</td>
                <td style={{ textAlign: "right", color: "#F87171" }}>{totalDebit.toLocaleString()}</td>
                <td style={{ textAlign: "right", color: "#2DD4BF" }}>{totalCredit.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {receipt && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📝 Change History</h3>
          <div className="record-history"><RecordHistory tableName="receipts" recordId={String(receipt.id)} /></div>
        </div>
      )}
    </div>
  )
}