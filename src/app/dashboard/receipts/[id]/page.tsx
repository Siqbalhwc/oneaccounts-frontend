"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer, Send } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import { useCompany } from "@/contexts/CompanyContext"
import { generateReceiptPDF } from "@/lib/pdf/receiptPDF"
import RecordHistory from "@/components/RecordHistory"

interface Receipt {
  id: number
  receipt_no: string
  date: string
  amount: number
  payment_method: string
  bank_account_id: number | null
  income_account_id: number | null
  party_id: number | null
  reference?: string
  notes?: string
}

interface Customer {
  id: number
  code: string
  name: string
  phone?: string
  country_code?: string
  balance: number
}

interface Bank {
  id: number
  bank_name: string
  account_number?: string
}

interface JournalLine {
  account_id: number
  account_code?: string
  account_name?: string
  debit: number
  credit: number
}

export default function ReceiptDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const { hasFeature } = usePlan()
  const { companyName, companyTagline, logoUrl } = useCompany()

  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [bank, setBank] = useState<Bank | null>(null)
  const [journalLines, setJournalLines] = useState<JournalLine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!role || !id) return
    const fetchData = async () => {
      const { data: rec } = await supabase.from("receipts").select("*").eq("id", id).single()
      if (!rec) { setLoading(false); return }
      setReceipt(rec)

      if (rec.party_id) {
        const { data: cust } = await supabase.from("customers").select("id, code, name, phone, country_code, balance").eq("id", rec.party_id).single()
        setCustomer(cust)
      }

      if (rec.bank_account_id) {
        const { data: bk } = await supabase.from("bank_accounts").select("id, bank_name, account_number").eq("id", rec.bank_account_id).single()
        setBank(bk ? { id: bk.id, bank_name: bk.bank_name, account_number: bk.account_number } : null)
      }

      const { data: lines } = await supabase.from("journal_lines").select("account_id, debit, credit, accounts(code, name)").eq("source_type", "receipt").eq("source_id", id)
      if (lines) {
        const formatted = lines.map((l: any) => ({
          account_id: l.account_id,
          account_code: l.accounts?.code || "",
          account_name: l.accounts?.name || "",
          debit: l.debit || 0,
          credit: l.credit || 0,
        }))
        setJournalLines(formatted)
      }

      setLoading(false)
    }
    fetchData()
  }, [role, id])

  const getWhatsAppLink = () => {
    if (!customer?.phone) return ""
    const code = (customer.country_code || "+92").replace(/\D/g, "")
    const phone = customer.phone.replace(/\D/g, "")
    const msg = `Dear ${customer.name},\n\nYour receipt ${receipt?.receipt_no} for PKR ${receipt?.amount?.toLocaleString()} has been recorded.\n\nThank you for your business.\n— OneAccounts`
    return `https://wa.me/${code}${phone}?text=${encodeURIComponent(msg)}`
  }

  const handlePrintPDF = async () => {
    if (!receipt) return
    const pdfData = {
      companyName:    companyName || "OneAccounts",
      companyAddress: "",  // not yet in context, can be added later
      companyPhone:   "",
      companyEmail:   "",
      companyTagline: companyTagline || "",
      logoUrl:        logoUrl,   // directly from context
      receiptNo:      receipt.receipt_no,
      date:           receipt.date,
      customerName:    customer?.name || "Customer",
      customerAddress: "",
      customerPhone:   customer?.phone || "",
      customerEmail:   "",
      items:          [{ description: `Receipt ${receipt.receipt_no}`, qty: 1, unit_price: receipt.amount, total: receipt.amount }],
      subtotal:       receipt.amount,
      total:          receipt.amount,
      paid:           receipt.amount,
      balanceDue:     0,
      status:         "Active",
      paymentMethod:  receipt.payment_method || "",
      notes:          receipt.notes || null,
    }

    const doc = await generateReceiptPDF(pdfData)
    doc.save(`Receipt_${receipt.receipt_no}.pdf`)
  }

  if (loading || !role) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Loading…</div>
  if (!receipt) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Receipt not found.</div>

  const totalDebit = journalLines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = journalLines.reduce((s, l) => s + l.credit, 0)

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .label { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
        .value { font-size: 14px; font-weight: 500; color: var(--text); }
        .btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-family: inherit; text-decoration: none; }
        .btn:hover { background: var(--card-hover); }
        .btn-success { background: #25D366; color: white; border-color: #25D366; }
        .btn-success:hover { background: #22C55E; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { text-align: left; padding: 10px 12px; background: var(--card-hover); font-weight: 700; color: var(--text-muted); font-size: 10px; text-transform: uppercase; border-bottom: 1px solid var(--border); }
        td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text); }
        tr:hover td { background: var(--card-hover); }
        .record-history { background: var(--bg-soft); border-radius: 8px; padding: 8px; }
        @media (max-width: 640px) { .grid-2col { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn" onClick={() => router.push("/dashboard/receipts")}><ArrowLeft size={16} /></button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Receipt #{receipt.receipt_no}</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{customer?.name || "Unknown Customer"}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={handlePrintPDF}><Printer size={14} /> Print</button>
          {getWhatsAppLink() && hasFeature("whatsapp_invoice") && (
            <a href={getWhatsAppLink()} target="_blank" rel="noopener noreferrer" className="btn btn-success"><Send size={14} /> WhatsApp</a>
          )}
        </div>
      </div>

      <div className="card">
        <div className="grid-2col">
          <div><div className="label">Date</div><div className="value">{new Date(receipt.date).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}</div></div>
          <div><div className="label">Customer</div><div className="value">{customer ? `${customer.code} – ${customer.name}` : "—"}</div></div>
          <div><div className="label">Amount</div><div className="value" style={{ fontSize:18, fontWeight:700, color:"#F59E0B" }}>PKR {receipt.amount?.toLocaleString()}</div></div>
          <div><div className="label">Payment Method</div><div className="value">{receipt.payment_method || "—"}</div></div>
          <div><div className="label">Bank Account</div><div className="value">{bank ? `${bank.bank_name} · ${bank.account_number || "—"}` : "—"}</div></div>
          <div><div className="label">Reference</div><div className="value">{receipt.reference || "—"}</div></div>
          <div><div className="label">Notes</div><div className="value">{receipt.notes || "—"}</div></div>
          <div><div className="label">Status</div><span style={{ padding:"2px 10px", borderRadius:12, fontSize:12, fontWeight:700, background:"#065F46", color:"#6EE7B7" }}>Active</span></div>
        </div>
      </div>

      {journalLines.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop:0, fontSize:16, fontWeight:700, color:"var(--text)", marginBottom:12 }}>📒 Journal Entry</h3>
          <table>
            <thead>
              <tr><th>Account</th><th style={{ textAlign:"right" }}>Debit (PKR)</th><th style={{ textAlign:"right" }}>Credit (PKR)</th></tr>
            </thead>
            <tbody>
              {journalLines.map((line, idx) => (
                <tr key={idx}>
                  <td>{line.account_code} – {line.account_name}</td>
                  <td style={{ textAlign:"right", color: line.debit>0 ? "#F87171" : "var(--text-muted)" }}>{line.debit>0 ? line.debit.toLocaleString() : "–"}</td>
                  <td style={{ textAlign:"right", color: line.credit>0 ? "#2DD4BF" : "var(--text-muted)" }}>{line.credit>0 ? line.credit.toLocaleString() : "–"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background:"var(--card-hover)", fontWeight:700 }}>
                <td>Total</td>
                <td style={{ textAlign:"right", color:"#F87171" }}>{totalDebit.toLocaleString()}</td>
                <td style={{ textAlign:"right", color:"#2DD4BF" }}>{totalCredit.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {receipt && (
        <div className="card">
          <h3 style={{ marginTop:0, fontSize:16, fontWeight:700, color:"var(--text)", marginBottom:12 }}>📝 Change History</h3>
          <div className="record-history"><RecordHistory tableName="receipts" recordId={String(receipt.id)} companyId={companyId} /></div>
        </div>
      )}
    </div>
  )
}