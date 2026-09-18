$ts = Get-Date -Format "yyyyMMdd_HHmmss"

function Patch-File($path, $replacements) {
    if (-not (Test-Path -LiteralPath $path)) {
        Write-Host "FILE NOT FOUND: $path"
        return
    }
    Copy-Item -LiteralPath $path -Destination "$path.bak_$ts"
    $content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    foreach ($r in $replacements) {
        if (-not $content.Contains($r[0])) {
            Write-Host "ANCHOR NOT FOUND in $path -- STOPPING, no changes written for this file:"
            Write-Host $r[0]
            return
        }
        $content = $content.Replace($r[0], $r[1])
    }
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Patched: $path"
}

# ---------- receipts/page.tsx (list) ----------
$rl = @()
$rl += ,@(
'    const msg = `Dear ${cust.name}, your receipt ${rec.receipt_no} of PKR ${rec.amount?.toLocaleString()} has been recorded.`'
,
'    const msg = `Dear ${cust.name}, Your receipt ${rec.receipt_no} of PKR ${rec.amount?.toLocaleString()} has been recorded.\nView Online: https://app.oneaccountsbysiqbal.com/receipt/${rec.id}\nDate: ${rec.date}\nThank you for your business.\n- OneAccounts by Siqbal`'
)
Patch-File "src\app\dashboard\receipts\page.tsx" $rl

# ---------- receipts/[id]/page.tsx (detail) ----------
$rd = @()
$rd += ,@(
'        `Dear ${customer.name},\n\nYour receipt ${receipt?.receipt_no} for PKR ${receipt?.amount?.toLocaleString()} has been recorded.\n\nThank you for your business.\n'
,
'        `Dear ${customer.name}, Your receipt ${receipt?.receipt_no} of PKR ${receipt?.amount?.toLocaleString()} has been recorded.\nView Online: https://app.oneaccountsbysiqbal.com/receipt/${receipt?.id}\nDate: ${receipt?.date}\nThank you for your business.\n'
)
Patch-File "src\app\dashboard\receipts\[id]\page.tsx" $rd

# ---------- receipts/new/page.tsx (create/edit) ----------
$rn = @()
$rn += ,@(
'import { ArrowLeft, Search, X, CheckCircle, RefreshCw, Paperclip, ChevronDown, FileText, Upload } from "lucide-react"
import { useTheme } from "@/contexts/ThemeContext"'
,
'import { ArrowLeft, Search, X, CheckCircle, RefreshCw, Paperclip, ChevronDown, FileText, Upload, Send } from "lucide-react"
import { useTheme } from "@/contexts/ThemeContext"
import { getWhatsAppLink } from "@/lib/whatsapp"'
)
$rn += ,@(
'  const [flash, setFlash] = useState<string | null>(null)'
,
'  const [flash, setFlash] = useState<string | null>(null)
  const [savedReceiptId, setSavedReceiptId] = useState<number | null>(null)
  const [savedReceiptNo, setSavedReceiptNo] = useState<string>("")
  const [savedCustomerName, setSavedCustomerName] = useState<string>("")
  const [savedCustomerPhone, setSavedCustomerPhone] = useState<string>("")
  const [savedAmount, setSavedAmount] = useState<number>(0)
  const [savedDate, setSavedDate] = useState<string>("")'
)
$rn += ,@(
'        setTimeout(() => router.push("/dashboard/receipts"), 1500)'
,
'        setSavedReceiptId(parseInt(editId))
        setSavedCustomerName(selectedCustomer?.name || "")
        setSavedCustomerPhone(selectedCustomer?.phone || "")
        setSavedAmount(totalAmount)
        setSavedDate(receiptDate)
        const { data: savedReceiptRow } = await supabase.from("receipts").select("receipt_no").eq("id", editId).single()
        setSavedReceiptNo(savedReceiptRow?.receipt_no || "")'
)
$rn += ,@(
'        if (data?.receipt_id) {
          try {
            await supabase.rpc(''link_receipt_attachments'', { p_company_id: companyId, p_temp_key: tempAttachKey, p_receipt_id: data.receipt_id })
          } catch (linkErr) {
            console.error(''Attachment linking failed (receipt already saved successfully):'', linkErr)
          }
        }'
,
'        setSavedReceiptId(data?.receipt_id || null)
        setSavedCustomerName(selectedCustomer?.name || "")
        setSavedCustomerPhone(selectedCustomer?.phone || "")
        setSavedAmount(totalAmount)
        setSavedDate(receiptDate)
        if (data?.receipt_id) {
          const { data: savedReceiptRow } = await supabase.from("receipts").select("receipt_no").eq("id", data.receipt_id).single()
          setSavedReceiptNo(savedReceiptRow?.receipt_no || "")
        }
        if (data?.receipt_id) {
          try {
            await supabase.rpc(''link_receipt_attachments'', { p_company_id: companyId, p_temp_key: tempAttachKey, p_receipt_id: data.receipt_id })
          } catch (linkErr) {
            console.error(''Attachment linking failed (receipt already saved successfully):'', linkErr)
          }
        }'
)
$rn += ,@(
'        {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}'
,
'        {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}
        {savedReceiptId && (
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>What would you like to do next?</span>
            <button className="inv-btn" onClick={() => { if (editId) { window.location.href = "/dashboard/receipts/new" } else { setSavedReceiptId(null) } }}>+ Add Another Receipt</button>
            <button className="inv-btn" onClick={() => router.push("/dashboard/receipts")}>Go to List</button>
            {savedCustomerPhone && (
              <button
                className="inv-btn"
                onClick={() => {
                  const msg = `Dear ${savedCustomerName}, Your receipt ${savedReceiptNo} of PKR ${savedAmount.toLocaleString()} has been recorded.\nView Online: https://app.oneaccountsbysiqbal.com/receipt/${savedReceiptId}\nDate: ${savedDate}\nThank you for your business.\n- OneAccounts by Siqbal`
                  window.open(getWhatsAppLink(savedCustomerPhone, msg), "_blank")
                }}
              >
                <Send size={14} /> Send WhatsApp
              </button>
            )}
          </div>
        )}'
)
Patch-File "src\app\dashboard\receipts\new\page.tsx" $rn

# ---------- payments/page.tsx (list) ----------
$pl = @()
$pl += ,@(
'    const msg = `Dear ${supp.name}, your payment ${pay.payment_no} of PKR ${pay.amount?.toLocaleString()} has been recorded.`'
,
'    const msg = `Dear ${supp.name}, Your payment ${pay.payment_no} of PKR ${pay.amount?.toLocaleString()} has been recorded.\nView Online: https://app.oneaccountsbysiqbal.com/payment/${pay.id}\nDate: ${pay.payment_date}\nThank you for your business.\n- OneAccounts by Siqbal`'
)
Patch-File "src\app\dashboard\payments\page.tsx" $pl

# ---------- payments/[id]/page.tsx (detail) ----------
$pd = @()
$pd += ,@(
'        `Dear ${payment.supplier.name},\n\nYour payment ${payment.payment_no} for PKR ${payment.amount?.toLocaleString()} has been processed.\nDate: ${payment.payment_date}\nMethod: ${payment.payment_method}\n${payment.notes ? "Notes: " + payment.notes : ""}\n\nThank you.\n'
,
'        `Dear ${payment.supplier.name}, Your payment ${payment.payment_no} of PKR ${payment.amount?.toLocaleString()} has been recorded.\nView Online: https://app.oneaccountsbysiqbal.com/payment/${payment.id}\nDate: ${payment.payment_date}\nThank you for your business.\n'
)
Patch-File "src\app\dashboard\payments\[id]\page.tsx" $pd

# ---------- payments/new/page.tsx (create/edit) ----------
$pn = @()
$pn += ,@(
'import { ArrowLeft, Search, X, CheckCircle, RefreshCw, Paperclip, ChevronDown, FileText, Upload } from "lucide-react"'
,
'import { ArrowLeft, Search, X, CheckCircle, RefreshCw, Paperclip, ChevronDown, FileText, Upload, Send } from "lucide-react"
import { getWhatsAppLink } from "@/lib/whatsapp"'
)
$pn += ,@(
'  const [flash, setFlash] = useState<string | null>(null)'
,
'  const [flash, setFlash] = useState<string | null>(null)
  const [savedPaymentId, setSavedPaymentId] = useState<number | null>(null)
  const [savedPaymentNo, setSavedPaymentNo] = useState<string>("")
  const [savedSupplierName, setSavedSupplierName] = useState<string>("")
  const [savedSupplierPhone, setSavedSupplierPhone] = useState<string>("")
  const [savedAmount, setSavedAmount] = useState<number>(0)
  const [savedDate, setSavedDate] = useState<string>("")'
)
$pn += ,@(
'        setTimeout(() => router.push("/dashboard/payments"), 1500)'
,
'        setSavedPaymentId(parseInt(editId))
        setSavedPaymentNo("")
        setSavedSupplierName(selectedSupplier?.name || "")
        setSavedSupplierPhone(selectedSupplier?.phone || "")
        setSavedAmount(totalAmount)
        setSavedDate(paymentDate)'
)
$pn += ,@(
'        setFlash(`Payment ${result.payment_no} saved!`)
        if (result.payment?.id) {'
,
'        setFlash(`Payment ${result.payment_no} saved!`)
        setSavedPaymentId(result.payment?.id || null)
        setSavedPaymentNo(result.payment_no || "")
        setSavedSupplierName(selectedSupplier?.name || "")
        setSavedSupplierPhone(selectedSupplier?.phone || "")
        setSavedAmount(totalAmount)
        setSavedDate(paymentDate)
        if (result.payment?.id) {'
)
$pn += ,@(
'        {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}'
,
'        {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}
        {savedPaymentId && (
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>What would you like to do next?</span>
            <button className="pay-btn" onClick={() => { if (editId) { window.location.href = "/dashboard/payments/new" } else { setSavedPaymentId(null) } }}>+ Add Another Payment</button>
            <button className="pay-btn" onClick={() => router.push("/dashboard/payments")}>Go to List</button>
            {savedSupplierPhone && (
              <button
                className="pay-btn"
                onClick={() => {
                  const msg = `Dear ${savedSupplierName}, Your payment ${savedPaymentNo} of PKR ${savedAmount.toLocaleString()} has been recorded.\nView Online: https://app.oneaccountsbysiqbal.com/payment/${savedPaymentId}\nDate: ${savedDate}\nThank you for your business.\n- OneAccounts by Siqbal`
                  window.open(getWhatsAppLink(savedSupplierPhone, msg), "_blank")
                }}
              >
                <Send size={14} /> Send WhatsApp
              </button>
            )}
          </div>
        )}'
)
Patch-File "src\app\dashboard\payments\new\page.tsx" $pn

Write-Host "Done. Review .bak_$ts backups before deploying if anything looks off."