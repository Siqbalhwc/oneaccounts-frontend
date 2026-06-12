"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer, Send, Upload, Trash2, FileText, Image, CheckCircle } from "lucide-react"
import { generatePaymentPDF } from "@/lib/pdf/paymentPDF"
import RecordHistory from "@/components/RecordHistory"
import { usePlan } from "@/contexts/PlanContext"
import { useCompany } from "@/contexts/CompanyContext"
import { getWhatsAppLink } from "@/lib/whatsapp"

interface Payment {
  id: number
  payment_no: string
  payment_date: string
  amount: number
  payment_method: string
  payment_type: string
  party_type: string
  bank_account_id: number | null
  reference?: string
  notes?: string
  party_id: number | null
  supplier?: {
    name: string
    code: string
    phone?: string
    email?: string
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

interface Attachment {
  id: number
  file_name: string
  file_url: string
  file_size: number
  mime_type: string
}

export default function PaymentDetailPage() {
  const router = useRouter()
  const params = useParams()
  const paymentId = params?.id as string
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { hasFeature } = usePlan()
  const { companyName, companyTagline, logoUrl } = useCompany()

  const [payment, setPayment] = useState<Payment | null>(null)
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")
  const [bankName, setBankName] = useState<string>("")
  const [journalLines, setJournalLines] = useState<JournalLine[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // Fetch payment details
  useEffect(() => {
    if (!companyId || !paymentId) return
    setLoading(true)

    supabase
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .eq("company_id", companyId)
      .single()
      .then(async ({ data }) => {
        if (!data) { setLoading(false); return }
        const pmt: Payment = data

        if (pmt.bank_account_id) {
          const { data: bank } = await supabase
            .from("bank_accounts")
            .select("bank_name")
            .eq("id", pmt.bank_account_id)
            .single()
          if (bank) setBankName(bank.bank_name)
        }

        if (pmt.party_id && pmt.party_type === "supplier") {
          const { data: supp } = await supabase
            .from("suppliers")
            .select("name, code, phone, email")
            .eq("id", pmt.party_id)
            .single()
          pmt.supplier = supp || undefined
        }

        const { data: allocs } = await supabase
          .from("payment_allocations")
          .select("amount, invoice_id, invoices(invoice_no)")
          .eq("payment_id", pmt.id)

        pmt.allocations = (allocs || []).map((a: any) => ({
          invoice_id: a.invoice_id,
          invoice_no: a.invoices?.invoice_no || "—",
          amount: a.amount,
        }))

        setPayment(pmt)
        setLoading(false)
      })

    supabase
      .from("journal_lines")
      .select("account_id, debit, credit, accounts(code, name)")
      .eq("company_id", companyId)
      .eq("source_type", "payment")
      .eq("source_id", paymentId)
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
  }, [companyId, paymentId])

  // Fetch attachments
  const fetchAttachments = async () => {
    if (!paymentId || !companyId) return
    const { data } = await supabase
      .from("attachments")
      .select("*")
      .eq("source_type", "payment")
      .eq("source_id", paymentId)
    setAttachments(data || [])
  }

  useEffect(() => {
    if (paymentId && companyId) {
      fetchAttachments()
    }
  }, [paymentId, companyId])

  const uploadFile = async (file: File) => {
    if (!paymentId || !companyId) return
    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const storagePath = `${companyId}/payment/${paymentId}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(storagePath, file)

    if (uploadError) {
      alert("Upload failed: " + uploadError.message)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from("attachments")
      .getPublicUrl(storagePath)

    const { error: dbError } = await supabase
      .from("attachments")
      .insert({
        company_id: companyId,
        source_type: "payment",
        source_id: parseInt(paymentId),
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: (await supabase.auth.getUser()).data.user?.email,
      })

    if (dbError) {
      alert("Failed to save attachment record: " + dbError.message)
    } else {
      await fetchAttachments()
      setUploadSuccess(`✅ ${file.name} uploaded`)
      setTimeout(() => setUploadSuccess(null), 3000)
    }
    setUploading(false)
  }

  const deleteAttachment = async (id: number, fileUrl: string) => {
    const pathParts = fileUrl.split('/')
    const storagePath = pathParts.slice(-3).join('/')
    await supabase.storage.from("attachments").remove([storagePath])
    await supabase.from("attachments").delete().eq("id", id)
    await fetchAttachments()
  }

  // WhatsApp link
  const waLink = payment && payment.supplier
    ? getWhatsAppLink(
        payment.supplier.phone || "",
        `Dear ${payment.supplier.name},\n\nYour payment ${payment.payment_no} for PKR ${payment.amount?.toLocaleString()} has been processed.\nDate: ${payment.payment_date}\nMethod: ${payment.payment_method}\n${payment.notes ? "Notes: " + payment.notes : ""}\n\nThank you.\n— ${companyName || "OneAccounts"}`
      )
    : ""

  const handlePrintPDF = async () => {
    if (!payment) return
    const pdfData = {
      companyName:    companyName || "OneAccounts",
      companyAddress: "",
      companyPhone:   "",
      companyEmail:   "",
      companyTagline: companyTagline || "",
      logoUrl:        logoUrl,
      paymentNo:      payment.payment_no,
      date:           payment.payment_date,
      supplierName:    payment.supplier?.name || "Supplier",
      supplierAddress: "",
      supplierPhone:   payment.supplier?.phone || "",
      supplierEmail:   payment.supplier?.email || "",
      paymentMethod:  payment.payment_method,
      notes:          payment.notes || null,
      status:         "Processed",
      items:          [{ description: `Payment ${payment.payment_no}`, qty: 1, unit_price: payment.amount, total: payment.amount }],
      subtotal:       payment.amount,
      total:          payment.amount,
      paid:           payment.amount,
      balanceDue:     0,
    }
    const doc = await generatePaymentPDF(pdfData)
    doc.save(`Payment_${payment.payment_no}.pdf`)
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", color: "var(--text-muted)" }}>Loading…</div>
  if (!payment) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", color: "var(--text-muted)" }}>Payment not found</div>

  const totalDebit = journalLines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = journalLines.reduce((s, l) => s + l.credit, 0)

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .row { display: flex; margin-bottom: 10px; font-size: 14px; align-items: center; }
        .label { width: 130px; color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; }
        .value { color: var(--text); font-weight: 500; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; min-width: 600px; }
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
        .table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; margin-top: 8px; }
        .attachments-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          max-height: 200px;
          overflow-y: auto;
          padding: 4px 0;
        }
        .attachment-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-soft);
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 12px;
        }
        .attachment-link {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--primary);
          text-decoration: none;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          max-width: calc(100% - 30px);
        }
        .attachment-link:hover { text-decoration: underline; }
        .toast {
          position: fixed;
          bottom: 24px;
          right: 24px;
          background: #065F46;
          color: white;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 8px;
          z-index: 200;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          animation: fadeOut 3s forwards;
        }
        @keyframes fadeOut {
          0% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; visibility: hidden; }
        }
        @media (max-width: 640px) {
          .row { flex-direction: column; align-items: flex-start; }
          .label { margin-bottom: 2px; }
          .attachments-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Toast notification */}
      {uploadSuccess && (
        <div className="toast">
          <CheckCircle size={16} /> {uploadSuccess}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn" onClick={() => router.push("/dashboard/payments")}><ArrowLeft size={16} /></button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Payment #{payment.payment_no}</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{payment.payment_type === "expense" ? "Expense Payment" : payment.supplier?.name || "Unknown Supplier"}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {waLink && hasFeature("whatsapp_invoice") && (
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-success"><Send size={16} /> WhatsApp</a>
          )}
          <button className="btn btn-primary" onClick={handlePrintPDF}><Printer size={16} /> Print PDF</button>
          <label className="btn" style={{ cursor: "pointer", position: "relative" }}>
            <Upload size={16} /> {uploading ? "Uploading..." : "Add Attachment"}
            <input
              type="file"
              onChange={(e) => {
                if (e.target.files?.[0]) uploadFile(e.target.files[0])
              }}
              disabled={uploading}
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
            />
          </label>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Payment Details</h3>
        <div className="row"><span className="label">Payment No.</span><span className="value">{payment.payment_no}</span></div>
        <div className="row"><span className="label">Date</span><span className="value">{payment.payment_date}</span></div>
        <div className="row"><span className="label">Type</span><span className="value">{payment.payment_type === "expense" ? "Expense Payment" : "Supplier Payment"}</span></div>
        {payment.supplier && <div className="row"><span className="label">Supplier</span><span className="value">{payment.supplier.code} – {payment.supplier.name}</span></div>}
        <div className="row"><span className="label">Amount</span><span className="value" style={{ fontSize: 18, fontWeight: 700, color: "#F59E0B" }}>PKR {payment.amount?.toLocaleString()}</span></div>
        {bankName && <div className="row"><span className="label">Bank</span><span className="value">{bankName}</span></div>}
        <div className="row"><span className="label">Method</span><span className="value">{payment.payment_method}</span></div>
        {payment.reference && <div className="row"><span className="label">Reference</span><span className="value">{payment.reference}</span></div>}
        {payment.notes && <div className="row"><span className="label">Notes</span><span className="value">{payment.notes}</span></div>}
      </div>

      {payment.allocations && payment.allocations.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Applied to Bills</h3>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Bill Number</th><th style={{ textAlign: "right" }}>Amount</th></tr>
              </thead>
              <tbody>
                {payment.allocations.map((alloc, idx) => (
                  <tr key={idx}>
                    <td>{alloc.invoice_no}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {alloc.amount?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {journalLines.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📒 Journal Entry</h3>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Account</th><th style={{ textAlign: "right" }}>Debit (PKR)</th><th style={{ textAlign: "right" }}>Credit (PKR)</th></tr>
              </thead>
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
                  <td style={{ fontWeight: 700 }}>Total</td>
                  <td style={{ textAlign: "right", color: "#F87171" }}>{totalDebit.toLocaleString()}</td>
                  <td style={{ textAlign: "right", color: "#2DD4BF" }}>{totalCredit.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Attachments Section – two‑column grid */}
      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📎 Attachments</h3>
        {attachments.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: 12 }}>
            No attachments. Use the "Add Attachment" button above.
          </div>
        ) : (
          <div className="attachments-grid">
            {attachments.map((att) => {
              const fileName = att.file_name.length > 40 ? att.file_name.substring(0, 37) + "..." : att.file_name
              return (
                <div key={att.id} className="attachment-item">
                  <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="attachment-link" title={att.file_name}>
                    {att.mime_type?.startsWith("image/") ? <Image size={14} /> : <FileText size={14} />}
                    <span>{fileName}</span>
                  </a>
                  <button className="btn" onClick={() => deleteAttachment(att.id, att.file_url)} style={{ padding: "2px 6px", borderColor: "#EF4444" }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {payment && payment.id && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📝 Change History</h3>
          <div className="record-history">
            <RecordHistory tableName="payments" recordId={String(payment.id)} />
          </div>
        </div>
      )}
    </div>
  )
}