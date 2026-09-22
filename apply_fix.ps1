# apply_fix.ps1
# Fixes the Payment PDF: replaces the meaningless "Amount Paid / Balance Due: PKR 0.00"
# line with the real vendor balance - "Total Payable / Current Payment / Total Balance Payable"
# (same numbers as the Vendor Ledger closing balance, as at the date of this payment).
#
# IMPORTANT: this needs the get_payment_balance_summary SQL function.
# If you have NOT already run get_payment_balance_summary.sql from the last message,
# run that in Supabase SQL Editor FIRST, then run this script.
#
# Safe to re-run: already-applied edits are skipped. Nothing is written unless ALL edits match.
# Run from: C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend

$ErrorActionPreference = "Stop"
$base = (Get-Location).Path
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
$edits = @()

# ---- Edit 1: paymentPDF.ts - add balanceSummary to the interface ----
$old = @'
  status:     string
  items:      PaymentItem[]
  subtotal:   number
  total:      number
  balanceDue: number
  paid:       number
}
'@
$new = @'
  status:     string
  items:      PaymentItem[]
  subtotal:   number
  total:      number
  balanceDue: number
  paid:       number

  // Account balance summary (as at issue) - PDF / shared link only
  balanceSummary?: {
    opening:  number   // payable balance before this payment
    current:  number   // amount THIS payment reduced payable by (net + tax)
    total:    number   // payable balance after this payment
  } | null
}
'@
$edits += [pscustomobject]@{ File = 'src\lib\pdf\paymentPDF.ts'; Old = $old; New = $new }

# ---- Edit 2: paymentPDF.ts - replace the Amount Paid / Balance Due block ----
$old = @'
  if (data.paid > 0) {
    SY += 2
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED)
    doc.text("Amount Paid", sumX, SY)
    doc.setTextColor(16, 185, 129).text("- " + pkr(data.paid), valX, SY, { align: "right" })
    SY += 5.5

    doc.setFont("helvetica", "bold").setTextColor(...[220,38,38])
    doc.text("Balance Due", sumX, SY)
    doc.text(pkr(data.balanceDue), valX, SY, { align: "right" })
    SY += 5
  }
'@
$new = @'
  // ---- ACCOUNT BALANCE SUMMARY (as at issue) - PDF / shared link only ----
  if (data.balanceSummary) {
    const bs = data.balanceSummary
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
    doc.text("Total Payable", tx, SY + 1)
    doc.text("Current Payment", tx, SY + 7)
    doc.setTextColor(...DARK)
    doc.text(money(bs.opening), vx, SY + 1, { align: "right" })
    doc.setTextColor(16, 185, 129)
    doc.text("- " + pkr(bs.current), vx, SY + 7, { align: "right" })
    doc.setDrawColor(...BORDER)
    doc.line(bx + 3, SY + 10, valX - 3, SY + 10)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...NAVY)
    doc.text("Total Balance Payable", tx, SY + 16)
    doc.text(money(bs.total), vx, SY + 16, { align: "right" })
    SY += boxH - 4
  }
'@
$edits += [pscustomobject]@{ File = 'src\lib\pdf\paymentPDF.ts'; Old = $old; New = $new }

# ---- Edit 3: payments/[id]/page.tsx - fetch the balance summary before building the PDF ----
$old = @'
  const handlePrintPDF = async () => {
    if (!payment) return
    const pdfData = {
'@
$new = @'
  const handlePrintPDF = async () => {
    if (!payment) return

    // Account balance summary (as at issue) - null if unavailable, PDF simply hides it
    let balanceSummary: { opening: number; current: number; total: number } | null = null
    try {
      const { data: bsum } = await supabase.rpc("get_payment_balance_summary", {
        p_company_id: companyId,
        p_payment_id: Number(payment.id),
      })
      if (bsum) {
        balanceSummary = {
          opening: bsum.opening_balance,
          current: bsum.document_amount,
          total:   bsum.total,
        }
      }
    } catch {
      balanceSummary = null
    }

    const pdfData = {
'@
$edits += [pscustomobject]@{ File = 'src\app\dashboard\payments\[id]\page.tsx'; Old = $old; New = $new }

# ---- Edit 4: payments/[id]/page.tsx - pass balanceSummary into pdfData ----
$old = @'
      paid:           payment.amount,
      balanceDue:     0,
    }
    const doc = await generatePaymentPDF(pdfData)
'@
$new = @'
      paid:           payment.amount,
      balanceDue:     0,
      balanceSummary,
    }
    const doc = await generatePaymentPDF(pdfData)
'@
$edits += [pscustomobject]@{ File = 'src\app\dashboard\payments\[id]\page.tsx'; Old = $old; New = $new }

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