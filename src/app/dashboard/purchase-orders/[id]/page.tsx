"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, FileText, Download, CheckCircle, Printer } from "lucide-react"
import RecordHistory from "@/components/RecordHistory"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import { useCompany } from "@/contexts/CompanyContext"
import { generatePurchaseOrderPDF } from "@/lib/pdf/purchaseOrderPDF"

export default function PurchaseOrderDetailPage() {
  const router = useRouter()
  const params = useParams()
  const poId = params?.id as string

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const { hasFeature } = usePlan()
  const { companyName, companyTagline, logoUrl } = useCompany()

  const [po, setPo] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [attachments, setAttachments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState("")
  const [supplierName, setSupplierName] = useState("")
  const [supplierPhone, setSupplierPhone] = useState("")
  const [supplierAddress, setSupplierAddress] = useState("")
  const [canApprove, setCanApprove] = useState(false)
  const [approving, setApproving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id || '00000000-0000-0000-0000-000000000001'
      setCompanyId(cid)

      if (role === "admin") {
        setCanApprove(true)
        return
      }

      supabase
        .from("user_roles")
        .select("permissions")
        .eq("user_id", user.id)
        .eq("company_id", cid)
        .maybeSingle()
        .then(({ data: userRole }) => {
          const perms = userRole?.permissions || {}
          setCanApprove(perms["Can Approve Purchase Orders"] === true)
        })
    })
  }, [role])

  useEffect(() => {
    if (!companyId || !poId) return
    setLoading(true)

    supabase
      .from("purchase_orders")
      .select("*, items:purchase_order_items(*)")
      .eq("id", poId)
      .eq("company_id", companyId)
      .single()
      .then(async ({ data }) => {
        if (!data) {
          setLoading(false)
          return
        }
        setPo(data)
        setItems(data.items || [])

        const { data: supp } = await supabase
          .from("suppliers")
          .select("name, phone, address")
          .eq("id", data.supplier_id)
          .single()
        if (supp) {
          setSupplierName(supp.name)
          setSupplierPhone(supp.phone || "")
          setSupplierAddress(supp.address || "")
        }

        const { data: atts } = await supabase
          .from("attachments")
          .select("*")
          .eq("owner_type", "purchase_order")
          .eq("owner_id", poId)
          .eq("company_id", companyId)
        setAttachments(atts || [])

        setLoading(false)
      })
  }, [companyId, poId])

  const handleApprove = async () => {
    if (!canApprove || !po) return
    setApproving(true)
    setMessage("")

    const res = await fetch("/api/purchase-orders/approve", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: po.id, company_id: companyId }),
    })
    const result = await res.json()
    if (result.success) {
      setPo({ ...po, status: "Approved" })
      setMessage("✅ Purchase Order approved!")
    } else {
      setMessage(`❌ ${result.error || "Error approving PO"}`)
    }
    setApproving(false)
    setTimeout(() => setMessage(""), 4000)
  }

  const handlePrintPDF = async () => {
    if (!po) return
    const total = items.reduce((sum, i) => sum + (i.total || 0), 0)

    const pdfData = {
      companyName:    companyName || "",
      companyAddress: "",
      companyPhone:   "",
      companyEmail:   "",
      companyTagline: companyTagline || "",
      logoUrl:        logoUrl,
      poNo:           po.po_no,
      date:           po.date,
      expectedDelivery: po.expected_delivery || "",
      supplierName:    supplierName || "Unknown",
      supplierAddress: supplierAddress,
      supplierPhone:   supplierPhone,
      notes:           po.notes || null,
      status:          po.status,
      items: items.map((item: any) => ({
        description: item.description || "",
        qty:         item.qty || 0,
        unit_price:  item.unit_price || 0,
        total:       item.total || 0,
      })),
      total: total,
    }

    const doc = await generatePurchaseOrderPDF(pdfData)
    doc.save(`PO_${po.po_no}.pdf`)
  }

  if (!hasFeature("purchase_orders")) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Purchase Orders feature is not enabled.</div>
  }

  if (loading) return (
    <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>
      Loading…
    </div>
  )

  if (!po) return (
    <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>
      Purchase Order not found.
    </div>
  )

  const totalAmount = items.reduce((sum, i) => sum + (i.total || 0), 0)

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; box-shadow: var(--shadow-sm); margin-bottom: 16px; }
        .row { display: flex; margin-bottom: 10px; font-size: 14px; align-items: center; }
        .label { width: 150px; color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; }
        .value { color: var(--text); font-weight: 500; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { text-align: left; padding: 10px 12px; background: var(--card-hover); font-weight: 700; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border); }
        td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text); }
        tr:hover td { background: var(--card-hover); }
        .btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-family: inherit; text-decoration: none; }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-warning { background: #F97316; color: white; border-color: #F97316; }
        .btn-warning:hover { background: #EA580C; }
        .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; }
        .badge-draft { background: #FEF3C7; color: #92400E; }
        .badge-approved { background: #D1FAE5; color: #065F46; }
        .message { padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; }
        .attachments-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .attachment-item { background: var(--card-hover); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; display: flex; align-items: center; gap: 8px; font-size: 13px; }
        @media (max-width: 640px) {
          .row { flex-direction: column; align-items: flex-start; }
          .label { margin-bottom: 2px; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn" onClick={() => router.push("/dashboard/purchase-orders")}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>PO #{po.po_no}</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{supplierName || "Unknown Supplier"}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {po.status === "Draft" && (
            <button className="btn" onClick={() => router.push(`/dashboard/purchase-orders/new?id=${po.id}`)}>
              ✏️ Edit
            </button>
          )}
          {canApprove && po.status === "Draft" && (
            <button className="btn btn-warning" onClick={handleApprove} disabled={approving}>
              <CheckCircle size={14} /> {approving ? "Approving..." : "Approve"}
            </button>
          )}
          <button className="btn btn-primary" onClick={handlePrintPDF}>
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {message && (
        <div className="message" style={{ background: message.startsWith("✅") ? "#065F46" : "#7C2D12", color: "white" }}>
          {message}
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Order Details</h3>
        <div className="row"><span className="label">PO Number</span><span className="value">{po.po_no}</span></div>
        <div className="row"><span className="label">Date</span><span className="value">{po.date}</span></div>
        <div className="row"><span className="label">Expected Delivery</span><span className="value">{po.expected_delivery || "—"}</span></div>
        <div className="row"><span className="label">Supplier</span><span className="value">{supplierName || "—"}</span></div>
        <div className="row"><span className="label">Total</span><span className="value" style={{ fontSize: 18, fontWeight: 700, color: "#F59E0B" }}>PKR {totalAmount.toLocaleString()}</span></div>
        <div className="row">
          <span className="label">Status</span>
          <span className={`badge ${po.status === "Approved" ? "badge-approved" : "badge-draft"}`}>{po.status}</span>
        </div>
        {po.notes && <div className="row"><span className="label">Notes</span><span className="value">{po.notes}</span></div>}
      </div>

      {items.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Items</h3>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ textAlign: "center" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Unit Price</th>
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td>{item.description || "—"}</td>
                  <td style={{ textAlign: "center" }}>{item.qty}</td>
                  <td style={{ textAlign: "right" }}>PKR {item.unit_price?.toLocaleString()}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {item.total?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📎 Attachments</h3>
          <div className="attachments-list">
            {attachments.map((att) => {
              const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${att.file_path}`
              return (
                <a key={att.id} href={publicUrl} target="_blank" rel="noopener noreferrer" className="attachment-item">
                  <FileText size={14} /> {att.file_name}
                  <Download size={12} />
                </a>
              )
            })}
          </div>
        </div>
      )}

      {po && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>
            📝 Change History
          </h3>
          <RecordHistory tableName="purchase_orders" recordId={String(po.id)} />
        </div>
      )}
    </div>
  )
}