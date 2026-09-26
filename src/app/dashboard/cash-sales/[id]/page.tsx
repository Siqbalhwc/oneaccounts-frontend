"use client"

import { fmtQty } from "@/lib/format-number"
import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Printer, Send } from "lucide-react"
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import RecordHistory from "@/components/RecordHistory"
import { usePlan } from "@/contexts/PlanContext"
import { useCompany } from "@/contexts/CompanyContext"
import { getWhatsAppLink } from "@/lib/whatsapp"
import { useRole } from "@/contexts/RoleContext"
import CashSaleReturnModal from "@/components/CashSaleReturnModal"
import CashSaleBalancePaymentModal, { ExistingBalancePayment } from "@/components/CashSaleBalancePaymentModal"

interface CashSaleItem {
  id: number
  description: string
  qty: number
  unit_price: number
  total: number
  product_id: number | null
  product_code?: string
  product_name?: string
  product_image?: string | null
}

interface CashSale {
  id: number
  sale_no: string
  date: string
  total: number
  total_cogs: number
  discount_amount?: number
  amount_received?: number
  reference?: string
  notes?: string
  party_id: number | null
  created_by?: string
  status?: string
  returned_at?: string | null
  company_id?: string
  items?: CashSaleItem[]
  customer?: {
    name: string
    code: string
    phone?: string
    country_code?: string
    address?: string
    email?: string
  }
}

export default function CashSaleDetailPage() {
  const router = useRouter()
  const params = useParams()
  const saleId = params?.id as string
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { hasFeature } = usePlan()
  const { companyName, companyTagline, logoUrl } = useCompany()

  const [sale, setSale] = useState<CashSale | null>(null)
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")
  const { role } = useRole()
  const canReturn = role === "admin" || role === "accountant"
  const [showReturn, setShowReturn] = useState(false)

  const [payments, setPayments] = useState<ExistingBalancePayment[]>([])
  const [bankAccounts, setBankAccounts] = useState<{ id: number; name: string }[]>([])
  const [balanceModal, setBalanceModal] = useState<{ mode: "receive" | "edit"; payment?: ExistingBalancePayment } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId || !saleId) return
    setLoading(true)

    supabase
      .from("cash_sales")
      .select("*")
      .eq("id", saleId)
      .eq("company_id", companyId)
      .single()
      .then(async ({ data }) => {
        if (!data) { setLoading(false); return }
        const cs: CashSale = data

        if (cs.party_id) {
          const { data: cust } = await supabase
            .from("customers")
            .select("name, code, phone, country_code, address, email")
            .eq("id", cs.party_id)
            .single()
          cs.customer = cust || undefined
        }

        const { data: items } = await supabase
          .from("cash_sale_items")
          .select("*")
          .eq("cash_sale_id", cs.id)

        if (items && items.length > 0) {
          const productIds = items.map((i: any) => i.product_id).filter((id: any) => id != null)
          if (productIds.length > 0) {
            const { data: products } = await supabase.from("products")
              .select("id, code, name, image_path").in("id", productIds)
            const productMap: Record<number, any> = {}
            if (products) products.forEach((p: any) => { productMap[p.id] = p })
            cs.items = items.map((item: any) => {
              const prod = productMap[item.product_id]
              return {
                ...item,
                product_code: prod?.code || "",
                product_name: prod?.name || "",
                product_image: prod?.image_path || null
              }
            })
          } else {
            cs.items = items.map((item: any) => ({
              ...item,
              product_code: "",
              product_name: "",
              product_image: null
            }))
          }
        } else {
          cs.items = []
        }

        setSale(cs)
        setLoading(false)

        const { data: pays } = await supabase
          .from("cash_sale_payments")
          .select("id, amount, payment_date, bank_account_id, status, reference")
          .eq("cash_sale_id", cs.id)
          .eq("company_id", companyId)
          .order("payment_date", { ascending: true })
        setPayments(pays || [])

        const { data: banks } = await supabase
          .from("bank_accounts")
          .select("id, name")
          .eq("company_id", companyId)
        setBankAccounts(banks || [])
      })
  }, [companyId, saleId, reloadKey])

  const isReturned = !!sale && sale.status === "returned"
  const netTotal = sale ? (sale.total || 0) - (sale.discount_amount || 0) : 0
  const amountReceived = sale ? (sale.amount_received ?? sale.total ?? 0) : 0
  const dueAmount = Math.max(0, netTotal - amountReceived)
  const isPartial = !isReturned && dueAmount > 0
  const activePayments = payments.filter(p => (p as any).status !== "reversed")

  const waLink = sale && sale.customer
    ? getWhatsAppLink(
        sale.customer.phone || "",
        `Dear ${sale.customer.name},\n\nYour cash sale ${sale.sale_no} of PKR ${sale.total?.toLocaleString()} has been recorded.\n\n📄 View Online: https://app.oneaccountsbysiqbal.com/dashboard/cash-sales/${sale.id}\n📅 Date: ${sale.date}\n\nThank you for your business.\n— OneAccounts by Siqbal`
      )
    : ""

  const handlePrintPDF = async () => {
    if (!sale) return
    const customer = sale.customer
    const subTotal = sale.items?.reduce((s, i) => s + i.total, 0) || 0

    // Map cash sale data into the invoice PDF structure
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
      dueDate: sale.date,   // cash sale has no due date, use same date

      customerName: customer?.name || "Walk‑in Customer",
      customerAddress: customer?.address || "",
      customerPhone: customer?.phone || "",
      customerEmail: customer?.email || "",

      paymentTerms: null,
      notes: sale.notes || null,
      createdBy: sale.created_by || "—",
      status: sale.status === "returned" ? "Returned" : (dueAmount > 0 ? "Partial" : "Paid"),

      items: (sale.items || []).map(item => ({
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
      paid: amountReceived,
      balanceDue: dueAmount,
    }

    const doc = await generateInvoicePDF(pdfData)
    doc.save(`CashSale_${sale.sale_no}.pdf`)
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Loading…</div>
  if (!sale) return <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>Cash sale not found</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .label { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
        .value { font-size: 14px; font-weight: 500; color: var(--text); }
        .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; min-width: 500px; }
        th { text-align: left; padding: 10px 12px; background: var(--card-hover); font-weight: 700; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border); white-space: nowrap; }
        td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text); }
        tr:hover td { background: var(--card-hover); }
        .btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-family: inherit; text-decoration: none; }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-primary:hover { background: var(--primary-hover); }
        .btn-success { background: #25D366; color: white; border-color: #25D366; }
        .btn-success:hover { background: #22C55E; }
        .badge-returned { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; background: #1D4ED8; color: #DBEAFE; }
        .badge-paid { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; background: #065F46; color: #6EE7B7; }
        .badge-partial { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; background: #92400E; color: #FDE68A; }
        .record-history { background: var(--bg-soft); border-radius: 8px; padding: 8px; }
        .hide-mobile { }
        @media (max-width: 640px) {
          .grid-2col { grid-template-columns: 1fr; }
          .hide-mobile { display: none; }
          table { min-width: 480px; font-size: 12px; }
          th, td { padding: 8px 10px; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn" onClick={() => router.push("/dashboard/cash-sales")}><ArrowLeft size={16} /></button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Cash Sale #{sale.sale_no}</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{sale.customer?.name || "Walk‑in Customer"}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!isReturned && <button className="btn" onClick={() => router.push(`/dashboard/cash-sales/new?id=${sale.id}`)}>✏️ Edit</button>}
          {!isReturned && dueAmount > 0 && (
            <button className="btn btn-primary" onClick={() => setBalanceModal({ mode: "receive" })}>💰 Receive Balance</button>
          )}
          {!isReturned && canReturn && <button className="btn" onClick={() => setShowReturn(true)} title="Fully reverse this cash sale">↩️ Return</button>}
          {isReturned && <span className="badge-returned">↩️ Returned</span>}
          {waLink && hasFeature("whatsapp_invoice") && (
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-success">
              <Send size={14} /> WhatsApp
            </a>
          )}
          <button className="btn btn-primary" onClick={handlePrintPDF}>
            <Printer size={14} /> Print PDF
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Cash Sale Details</h3>
        <div className="grid-2col">
          <div>
            <div className="label">Sale No</div>
            <div className="value">{sale.sale_no}</div>
          </div>
          <div>
            <div className="label">Date</div>
            <div className="value">{sale.date}</div>
          </div>
          <div>
            <div className="label">Customer</div>
            <div className="value">{sale.customer?.code ? `${sale.customer.code} – ` : ""}{sale.customer?.name || "Walk‑in Customer"}</div>
          </div>
          <div>
            <div className="label">Total</div>
            <div className="value" style={{ fontSize: 18, fontWeight: 700, color: "#10B981" }}>PKR {sale.total?.toLocaleString()}</div>
          </div>
          {(sale.discount_amount || 0) > 0 && (
            <div>
              <div className="label">Discount</div>
              <div className="value">PKR {(sale.discount_amount || 0).toLocaleString()}</div>
            </div>
          )}
          {isPartial && (
            <>
              <div>
                <div className="label">Received</div>
                <div className="value" style={{ fontWeight: 600 }}>PKR {amountReceived.toLocaleString()}</div>
              </div>
              <div>
                <div className="label">Due</div>
                <div className="value" style={{ fontWeight: 700, color: "#F59E0B" }}>PKR {dueAmount.toLocaleString()}</div>
              </div>
            </>
          )}
          {sale.total_cogs > 0 && (
            <div>
              <div className="label">Cost of Goods</div>
              <div className="value">PKR {sale.total_cogs?.toLocaleString()}</div>
            </div>
          )}
          <div>
            <div className="label">Gross Profit</div>
            <div className="value" style={{ color: "#10B981", fontWeight: 600 }}>
              PKR {((sale.total || 0) - (sale.total_cogs || 0)).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="label">Status</div>
            {isReturned ? <span className="badge-returned">RETURNED</span> : isPartial ? <span className="badge-partial">PARTIAL</span> : <span className="badge-paid">PAID</span>}
          </div>
          {isReturned && sale.returned_at && <div><div className="label">Returned On</div><div className="value">{sale.returned_at}</div></div>}
          {sale.reference && <div><div className="label">Reference</div><div className="value">{sale.reference}</div></div>}
          {sale.notes && <div><div className="label">Notes</div><div className="value">{sale.notes}</div></div>}
        </div>
      </div>

      {sale.items && sale.items.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Items</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Description</th>
                  <th style={{ textAlign: "center" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>Unit Price</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map(item => (
                  <tr key={item.id}>
                    <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {item.product_image ? (
                        <img src={item.product_image} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4 }} />
                      ) : (
                        <div style={{ width: 28, height: 28, background: "var(--card-hover)", borderRadius: 4 }} />
                      )}
                      <span style={{ fontWeight: 600 }}>
                        {item.product_code ? `${item.product_code} – ${item.product_name || ""}` : item.description}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-muted)" }}>{item.product_code ? item.description : ""}</td>
                    <td style={{ textAlign: "center" }}>{fmtQty(item.qty)}</td>
                    <td style={{ textAlign: "right" }}>PKR {item.unit_price?.toLocaleString()}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {item.total?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {payments.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Payment History</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th className="hide-mobile"></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id}>
                    <td>{p.payment_date}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {Number(p.amount).toLocaleString()}</td>
                    <td style={{ color: "var(--text-muted)" }}>{p.reference || "—"}</td>
                    <td>
                      {p.status === "reversed"
                        ? <span className="badge-returned">REVERSED</span>
                        : p.status === "edited"
                          ? <span className="badge-paid">EDITED</span>
                          : <span className="badge-paid">POSTED</span>}
                    </td>
                    <td className="hide-mobile" style={{ textAlign: "right" }}>
                      {p.status !== "reversed" && !isReturned && (
                        <button
                          className="btn"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => setBalanceModal({ mode: "edit", payment: p })}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {balanceModal && sale && sale.company_id && (
        <CashSaleBalancePaymentModal
          mode={balanceModal.mode}
          sale={{
            id: sale.id,
            sale_no: sale.sale_no,
            company_id: sale.company_id,
            due: balanceModal.mode === "edit" && balanceModal.payment
              ? dueAmount + Number(balanceModal.payment.amount)
              : dueAmount,
          }}
          payment={balanceModal.payment}
          bankAccounts={bankAccounts}
          onClose={() => setBalanceModal(null)}
          onDone={() => { setBalanceModal(null); setReloadKey(k => k + 1) }}
        />
      )}

      {showReturn && sale && sale.company_id && (
        <CashSaleReturnModal
          sale={{ id: sale.id, sale_no: sale.sale_no, date: sale.date, total: sale.total, company_id: sale.company_id }}
          onClose={() => setShowReturn(false)}
          onDone={() => window.location.reload()}
        />
      )}

      {sale && (
        <div className="card hide-mobile">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📝 Change History</h3>
          <div className="record-history">
            <RecordHistory tableName="cash_sales" recordId={String(sale.id)} />
          </div>
        </div>
      )}
    </div>
  )
}