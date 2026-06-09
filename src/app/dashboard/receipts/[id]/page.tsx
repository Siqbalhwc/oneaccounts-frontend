"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer, Send } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import { generateReceiptPDF } from "@/lib/pdf/receiptPDF"
import { useCompany } from "@/contexts/CompanyContext"
import RecordHistory from "@/components/RecordHistory"
import { getWhatsAppLink } from "@/lib/whatsapp"

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
  description?: string
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
  const [allocations, setAllocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!role || !id) return

    const fetchData = async () => {
      // 1. Receipt
      const { data: rec } = await supabase
        .from("receipts")
        .select("*")
        .eq("id", id)
        .single()
      if (!rec) { setLoading(false); return }
      setReceipt(rec)

      // 2. Customer
      if (rec.party_id) {
        const { data: cust } = await supabase
          .from("customers")
          .select("id, code, name, phone, country_code, balance")
          .eq("id", rec.party_id)
          .single()
        setCustomer(cust)
      }

      // 3. Bank
      if (rec.bank_account_id) {
        const { data: bk } = await supabase
          .from("bank_accounts")
          .select("id, bank_name, account_number")
          .eq("id", rec.bank_account_id)
          .single()
        setBank(bk ? { id: bk.id, bank_name: bk.bank_name, account_number: bk.account_number } : null)
      }

      // 4. Journal lines
      const { data: lines } = await supabase
        .from("journal_lines")
        .select("account_id, debit, credit, accounts(code, name)")
        .eq("source_type", "receipt")
        .eq("source_id", id)
      if (lines) {
        const formatted = lines.map((l: any) => ({
          account_id: l.account_id,
          account_code: l.accounts?.code || "",
          account_name: l.accounts?.name || "",
          description: l.description || "",
          debit: l.debit || 0,
          credit: l.credit || 0,
        }))
        setJournalLines(formatted)
      }

      // 5. Allocations
      supabase
        .from("receipt_allocations")
        .select("amount, invoices(invoice_no)")
        .eq("receipt_id", rec.id)
        .then(({ data: allocs }) => {
          if (allocs) {
            const mapped = allocs.map((a: any) => ({
              invoice_no: a.invoices?.invoice_no || "—",
              amount: a.amount,
            }))
            setAllocations(mapped)
          }
        })

      setLoading(false)
    }
    fetchData()
  }, [role, id])

  // Safe WhatsApp link using the helper
  const waLink = customer?.phone
    ? getWhatsAppLink(
        customer.phone,
        `Dear ${customer.name},\n\nYour receipt ${receipt?.receipt_no} for PKR ${receipt?.amount?.toLocaleString()} has been recorded.\n\nThank you for your business.\n— OneAccounts`
      )
    : ""

  const handlePDF = async () => {
    if (!receipt) return

    const pdfData: any = {
      companyName:    companyName || "OneAccounts",
      companyAddress: "",
      companyPhone:   "",
      companyEmail:   "",
      companyTagline: companyTagline || "",
      logoUrl:        logoUrl,
      receiptNo:      receipt.receipt_no,
      date:           receipt.date,
      customerName:    customer?.name || "Customer",
      customerAddress: "",
      customerPhone:   customer?.phone || "",
      customerEmail:   "",
      paymentMethod:   receipt.payment_method,
      amount:          receipt.amount || 0,
      reference:       receipt.reference || "",
      notes:           receipt.notes || "",
      status:          "Active",
      journalLines:    journalLines.map(l => ({
        account_code: l.account_code || "",
        account_name: l.account_name || "",
        description:   l.description || "",
        debit:         l.debit,
        credit:        l.credit,
      })),
    }

    const doc = await generateReceiptPDF(pdfData)
    doc.save(`Receipt_${receipt.receipt_no}.pdf`)
  }

  if (loading || !role) {
    return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Loading…</div>
  }
  if (!receipt) {
    return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Receipt not found.</div>
  }

  const totalDebit = journalLines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = journalLines.reduce((s, l) => s + l.credit, 0)

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .receipt-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .label { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
        .value { font-size: 14px; font-weight: 500; color: var(--text); }
        .btn {
          padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px; transition: 0.2s;
          border: 1.5px solid var(--border); background: transparent; color: var(--text-muted);
          font-family: inherit; text-decoration: none;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-success { background: #25D366; color: white; border-color: #25D366; }
        .btn-success:hover { background: #22C55E; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { text-align: left; padding: 10px 12px; background: var(--card); font-weight: 700; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 2px solid var(--border); }
        td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text); }
        tr:hover td { background: var(--card-hover); }
        .record-history { background: var(--bg); border-radius: 8px; padding: 8px; }
        .status-badge { padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; background: #065F46; color: #6EE7B7; display: inline-block; }
        @media (max-width: 640px) {
          .grid-2col { grid-template-columns: 1fr; }
          .receipt-card { padding: 16px; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn" onClick={() => router.push("/dashboard/receipts")}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Receipt #{receipt.receipt_no}</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{customer?.name || "Unknown Customer"}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={handlePDF}><Printer size={14} /> PDF</button>
          {waLink && hasFeature("whatsapp_invoice") && (
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-success">
              <Send size={14} /> WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* Details card */}
      <div className="receipt-card">
        <div className="grid-2col">
          <div>
            <div className="label">Date</div>
            <div className="value">{new Date(receipt.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
          </div>
          <div>
            <div className="label">Customer</div>
            <div className="value">{customer ? `${customer.code} – ${customer.name}` : "—"}</div>
          </div>
          <div>
            <div className="label">Amount</div>
            <div className="value" style={{ fontSize: 18, fontWeight: 700, color: "#F59E0B" }}>PKR {receipt.amount?.toLocaleString()}</div>
          </div>
          <div>
            <div className="label">Payment Method</div>
            <div className="value">{receipt.payment_method || "—"}</div>
          </div>
          <div>
            <div className="label">Bank Account</div>
            <div className="value">{bank ? `${bank.bank_name} · ${bank.account_number || "—"}` : "—"}</div>
          </div>
          <div>
            <div className="label">Reference</div>
            <div className="value">{receipt.reference || "—"}</div>
          </div>
          <div>
            <div className="label">Notes</div>
            <div className="value">{receipt.notes || "—"}</div>
          </div>
          <div>
            <div className="label">Status</div>
            <span className="status-badge">Active</span>
          </div>
        </div>
      </div>

      {/* Allocations */}
      {allocations.length > 0 && (
        <div className="receipt-card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Applied to Invoices</h3>
          <table>
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((alloc, idx) => (
                <tr key={idx}>
                  <td>{alloc.invoice_no}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {alloc.amount?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Journal Entry */}
      {journalLines.length > 0 && (
        <div className="receipt-card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📒 Journal Entry</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ minWidth: "400px" }}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th style={{ textAlign: "right" }}>Debit (PKR)</th>
                  <th style={{ textAlign: "right" }}>Credit (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {journalLines.map((line, idx) => (
                  <tr key={idx}>
                    <td>{line.account_code} – {line.account_name}</td>
                    <td style={{ textAlign: "right", color: line.debit > 0 ? "#F87171" : "inherit" }}>
                      {line.debit > 0 ? line.debit.toLocaleString() : "–"}
                    </td>
                    <td style={{ textAlign: "right", color: line.credit > 0 ? "#2DD4BF" : "inherit" }}>
                      {line.credit > 0 ? line.credit.toLocaleString() : "–"}
                    </td>
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
        </div>
      )}

      {/* Change History */}
      <div className="receipt-card">
        <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>
          📝 Change History
        </h3>
        <div className="record-history">
          <RecordHistory tableName="receipts" recordId={String(receipt.id)} />
        </div>
      </div>
    </div>
  )
}