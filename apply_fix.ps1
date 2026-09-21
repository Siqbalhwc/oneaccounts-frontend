# apply_fix.ps1
# Adds "Opening balance / Current invoice(bill) / Total receivable(payable)" segment
# to the invoice + bill PDFs and to the public WhatsApp links.
# Safe to re-run: already-applied edits are skipped. Nothing is written unless ALL edits match.
# Run from: C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend

$ErrorActionPreference = "Stop"
$base = (Get-Location).Path
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
$edits = @()
$old = @'
  reference?: string

  // bank accounts to show at the bottom of the invoice
'@
$new = @'
  reference?: string

  // Account balance summary (as at issue) - printed on PDF / shared link only
  balanceSummary?: {
    partyType: "customer" | "supplier"
    opening:   number
    current:   number
    total:     number
  } | null

  // bank accounts to show at the bottom of the invoice
'@
$edits += [pscustomobject]@{ File = 'src\lib\pdf\invoicePDF.ts'; Old = $old; New = $new }
$old = @'
    doc.text(pkr(data.balanceDue), amtRightX, SY, { align: "right" })
    SY += 5
  }
'@
$new = @'
    doc.text(pkr(data.balanceDue), amtRightX, SY, { align: "right" })
    SY += 5
  }

  // ---- ACCOUNT BALANCE SUMMARY (as at issue) - PDF / shared link only ----
  if (data.balanceSummary) {
    const bs = data.balanceSummary
    const isCust = bs.partyType === "customer"
    const money = (n: number) => (n < 0 ? "(" + pkr(Math.abs(n)) + ")" : pkr(n))
    const boxH = 24
    SY += 6
    if (SY + boxH > PH - 20) { doc.addPage(); SY = 20 }
    const bx = amtRightX - 80
    const bw = 80
    const tx = bx + 3
    const vx = amtRightX - 3
    filledRect(doc, bx, SY - 4, bw, boxH, ROW_ALT)
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.3)
    doc.rect(bx, SY - 4, bw, boxH, "S")
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text("Opening Balance", tx, SY + 1)
    doc.text(isCust ? "Current Invoice" : "Current Bill", tx, SY + 7)
    doc.setTextColor(...DARK)
    doc.text(money(bs.opening), vx, SY + 1, { align: "right" })
    doc.text(money(bs.current), vx, SY + 7, { align: "right" })
    doc.setDrawColor(...BORDER)
    doc.line(bx + 3, SY + 10, amtRightX - 3, SY + 10)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...NAVY)
    doc.text(isCust ? "Total Receivable" : "Total Payable", tx, SY + 16)
    doc.text(money(bs.total), vx, SY + 16, { align: "right" })
    SY += boxH - 4
  }
'@
$edits += [pscustomobject]@{ File = 'src\lib\pdf\invoicePDF.ts'; Old = $old; New = $new }
$old = @'
  whtRate?:       number
  whtAmount?:     number
}
'@
$new = @'
  whtRate?:       number
  whtAmount?:     number

  // Account balance summary (as at issue) - printed on PDF / shared link only
  balanceSummary?: {
    partyType: "customer" | "supplier"
    opening:   number
    current:   number
    total:     number
  } | null
}
'@
$edits += [pscustomobject]@{ File = 'src\lib\pdf\billPDF.ts'; Old = $old; New = $new }
$old = @'
    doc.text(pkr(data.balanceDue), valX, SY, { align: "right" })
    SY += 5
  }
'@
$new = @'
    doc.text(pkr(data.balanceDue), valX, SY, { align: "right" })
    SY += 5
  }

  // ---- ACCOUNT BALANCE SUMMARY (as at issue) - PDF / shared link only ----
  if (data.balanceSummary) {
    const bs = data.balanceSummary
    const isCust = bs.partyType === "customer"
    const money = (n: number) => (n < 0 ? "(" + pkr(Math.abs(n)) + ")" : pkr(n))
    const boxH = 24
    SY += 6
    if (SY + boxH > PH - 20) { doc.addPage(); SY = 20 }
    const bx = valX - 80
    const bw = 80
    const tx = bx + 3
    const vx = valX - 3
    filledRect(doc, bx, SY - 4, bw, boxH, ROW_ALT)
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.3)
    doc.rect(bx, SY - 4, bw, boxH, "S")
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text("Opening Balance", tx, SY + 1)
    doc.text(isCust ? "Current Invoice" : "Current Bill", tx, SY + 7)
    doc.setTextColor(...DARK)
    doc.text(money(bs.opening), vx, SY + 1, { align: "right" })
    doc.text(money(bs.current), vx, SY + 7, { align: "right" })
    doc.setDrawColor(...BORDER)
    doc.line(bx + 3, SY + 10, valX - 3, SY + 10)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...NAVY)
    doc.text(isCust ? "Total Receivable" : "Total Payable", tx, SY + 16)
    doc.text(money(bs.total), vx, SY + 16, { align: "right" })
    SY += boxH - 4
  }
'@
$edits += [pscustomobject]@{ File = 'src\lib\pdf\billPDF.ts'; Old = $old; New = $new }
$old = @'
    const doc = await generateInvoicePDF(pdfData)
    doc.save(`Invoice_${invoice.invoice_no}.pdf`)
'@
$new = @'
    // Account balance summary (as at issue) - shown on the PDF only
    let balanceSummary: { partyType: "customer" | "supplier"; opening: number; current: number; total: number } | null = null
    try {
      const { data: bsum } = await supabase.rpc("get_document_balance_summary", {
        p_company_id: companyId,
        p_invoice_id: Number(invoiceId),
      })
      if (bsum) {
        balanceSummary = {
          partyType: bsum.party_type,
          opening: Number(bsum.opening_balance),
          current: Number(bsum.document_amount),
          total: Number(bsum.total),
        }
      }
    } catch {}
    const doc = await generateInvoicePDF({ ...pdfData, balanceSummary })
    doc.save(`Invoice_${invoice.invoice_no}.pdf`)
'@
$edits += [pscustomobject]@{ File = 'src\app\dashboard\invoices\[id]\page.tsx'; Old = $old; New = $new }
$old = @'
    const doc = await generateBillPDF(pdfData)
    doc.save(`Bill_${bill.invoice_no}.pdf`)
'@
$new = @'
    // Account balance summary (as at issue) - shown on the PDF only
    let balanceSummary: { partyType: "customer" | "supplier"; opening: number; current: number; total: number } | null = null
    try {
      const { data: bsum } = await supabase.rpc("get_document_balance_summary", {
        p_company_id: companyId,
        p_invoice_id: Number(billId),
      })
      if (bsum) {
        balanceSummary = {
          partyType: bsum.party_type,
          opening: Number(bsum.opening_balance),
          current: Number(bsum.document_amount),
          total: Number(bsum.total),
        }
      }
    } catch {}
    const doc = await generateBillPDF({ ...pdfData, balanceSummary })
    doc.save(`Bill_${bill.invoice_no}.pdf`)
'@
$edits += [pscustomobject]@{ File = 'src\app\dashboard\bills\[id]\page.tsx'; Old = $old; New = $new }
$old = @'
    const doc = await generateInvoicePDF(pdfData)
    const blob = doc.output("blob")
'@
$new = @'
    // Account balance summary (as at issue) - shown on the PDF only
    let balanceSummary: { partyType: "customer" | "supplier"; opening: number; current: number; total: number } | null = null
    if (invoiceIdForLink) try {
      const { data: bsum } = await supabase.rpc("get_document_balance_summary", {
        p_company_id: companyId,
        p_invoice_id: Number(invoiceIdForLink),
      })
      if (bsum) {
        balanceSummary = {
          partyType: bsum.party_type,
          opening: Number(bsum.opening_balance),
          current: Number(bsum.document_amount),
          total: Number(bsum.total),
        }
      }
    } catch {}
    const doc = await generateInvoicePDF({ ...pdfData, balanceSummary })
    const blob = doc.output("blob")
'@
$edits += [pscustomobject]@{ File = 'src\app\dashboard\invoices\new\page.tsx'; Old = $old; New = $new }
$old = @'
  return NextResponse.json({
    invoice: {
'@
$new = @'
  // Account balance summary (as at issue) - null if unavailable, the page simply hides it
  let balanceSummary: any = null
  try {
    const { data: bsum } = await supabaseAdmin.rpc('get_document_balance_summary', {
      p_company_id: invoice.company_id,
      p_invoice_id: invoice.id,
    })
    balanceSummary = bsum || null
  } catch {
    balanceSummary = null
  }

  return NextResponse.json({
    invoice: {
'@
$edits += [pscustomobject]@{ File = 'src\app\api\public\invoice\route.ts'; Old = $old; New = $new }
$old = @'
    items: itemsWithNames,
    company: {
'@
$new = @'
    items: itemsWithNames,
    balance_summary: balanceSummary,
    company: {
'@
$edits += [pscustomobject]@{ File = 'src\app\api\public\invoice\route.ts'; Old = $old; New = $new }
$old = @'
  return NextResponse.json({
    bill: {
'@
$new = @'
  // Account balance summary (as at issue) - null if unavailable, the page simply hides it
  let balanceSummary: any = null
  try {
    const { data: bsum } = await supabaseAdmin.rpc('get_document_balance_summary', {
      p_company_id: bill.company_id,
      p_invoice_id: bill.id,
    })
    balanceSummary = bsum || null
  } catch {
    balanceSummary = null
  }

  return NextResponse.json({
    bill: {
'@
$edits += [pscustomobject]@{ File = 'src\app\api\public\bill\route.ts'; Old = $old; New = $new }
$old = @'
    items: itemsWithNames,
    company: {
'@
$new = @'
    items: itemsWithNames,
    balance_summary: balanceSummary,
    company: {
'@
$edits += [pscustomobject]@{ File = 'src\app\api\public\bill\route.ts'; Old = $old; New = $new }
$old = @'
        {/* Notes */}
'@
$new = @'
        {/* Account summary (as at issue) */}
        {data.balance_summary && (() => {
          const bs = data.balance_summary
          const isCust = bs.party_type === "customer"
          const money = (n: number) => n < 0 ? "(PKR " + Math.abs(Number(n)).toLocaleString() + ")" : "PKR " + Number(n).toLocaleString()
          return (
            <div style={{ background: "white", borderRadius: 16, padding: "18px 22px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.06em", marginBottom: 12 }}>Account Summary</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 13 }}>
                <span style={{ color: "#64748b" }}>Opening Balance</span>
                <span style={{ fontWeight: 600, color: "#0f172a" }}>{money(bs.opening_balance)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 13 }}>
                <span style={{ color: "#64748b" }}>{isCust ? "Current Invoice" : "Current Bill"}</span>
                <span style={{ fontWeight: 600, color: "#0f172a" }}>{money(bs.document_amount)}</span>
              </div>
              <div style={{ height: 1, background: "#f1f5f9", margin: "8px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                <span style={{ color: "#64748b", fontWeight: 700 }}>{isCust ? "Total Receivable" : "Total Payable"}</span>
                <span style={{ fontWeight: 800, color: "#1740c8" }}>{money(bs.total)}</span>
              </div>
            </div>
          )
        })()}

        {/* Notes */}
'@
$edits += [pscustomobject]@{ File = 'src\app\invoice\[id]\InvoiceViewerClient.tsx'; Old = $old; New = $new }
$old = @'
        {bill.notes && (
'@
$new = @'
        {/* Account summary (as at issue) */}
        {data.balance_summary && (() => {
          const bs = data.balance_summary
          const isCust = bs.party_type === "customer"
          const money = (n: number) => n < 0 ? "(PKR " + Math.abs(Number(n)).toLocaleString() + ")" : "PKR " + Number(n).toLocaleString()
          return (
            <div style={{ background: "white", borderRadius: 16, padding: "18px 22px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.06em", marginBottom: 12 }}>Account Summary</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 13 }}>
                <span style={{ color: "#64748b" }}>Opening Balance</span>
                <span style={{ fontWeight: 600, color: "#0f172a" }}>{money(bs.opening_balance)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 13 }}>
                <span style={{ color: "#64748b" }}>{isCust ? "Current Invoice" : "Current Bill"}</span>
                <span style={{ fontWeight: 600, color: "#0f172a" }}>{money(bs.document_amount)}</span>
              </div>
              <div style={{ height: 1, background: "#f1f5f9", margin: "8px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                <span style={{ color: "#64748b", fontWeight: 700 }}>{isCust ? "Total Receivable" : "Total Payable"}</span>
                <span style={{ fontWeight: 800, color: "#1740c8" }}>{money(bs.total)}</span>
              </div>
            </div>
          )
        })()}

        {bill.notes && (
'@
$edits += [pscustomobject]@{ File = 'src\app\bill\[id]\BillViewerClient.tsx'; Old = $old; New = $new }

$content = @{}
$bom = @{}
$applied = 0
$skipped = 0
foreach ($e in $edits) {
    $path = Join-Path $base $e.File
    if (-not (Test-Path -LiteralPath $path)) { throw "File not found: $($e.File). Run this from the frontend folder." }
    if (-not $content.ContainsKey($e.File)) {
        $bytes = [System.IO.File]::ReadAllBytes($path)
        $bom[$e.File] = ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191)
        $content[$e.File] = [System.IO.File]::ReadAllText($path, $utf8NoBom)
    }
    $t = $content[$e.File]
    $isCrlf = $t.Contains("`r`n")
    $old = $e.Old.Replace("`r`n", "`n")
    $new = $e.New.Replace("`r`n", "`n")
    if ($isCrlf) { $old = $old.Replace("`n", "`r`n"); $new = $new.Replace("`n", "`r`n") }
    if ($t.Contains($new)) { $skipped++; Write-Host "SKIP (already applied): $($e.File)"; continue }
    $count = ([regex]::Matches($t, [regex]::Escape($old))).Count
    if ($count -ne 1) { throw "STOP - nothing was changed. Anchor found $count times (expected 1) in $($e.File). Send me this message." }
    $content[$e.File] = $t.Replace($old, $new)
    $applied++
}

foreach ($f in $content.Keys) {
    $enc = $utf8NoBom
    if ($bom[$f]) { $enc = $utf8Bom }
    [System.IO.File]::WriteAllText((Join-Path $base $f), $content[$f], $enc)
    Write-Host "UPDATED: $f"
}
Write-Host ""
Write-Host "Done. Edits applied: $applied, skipped: $skipped, files written: $($content.Count)"