# apply_fix.ps1
# Adds the "Opening Balance / This Payment / Total Payable" Account Summary box
# to the public WhatsApp payment link (vendor payments only).
# Run the SQL file (get_payment_balance_summary.sql) in Supabase FIRST, then run this.
# Safe to re-run: already-applied edits are skipped. Nothing is written unless ALL edits match.
# Run from: C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend

$ErrorActionPreference = "Stop"
$base = (Get-Location).Path
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
$edits = @()

# ---- Edit 1: fetch balance summary in the public payment API route ----
$old = @'
  const { data: payment, error } = await supabaseAdmin
    .from('payments')
    .select('id, payment_no, payment_date, amount, payment_method, reference, notes, party_id, party_type, company_id')
    .eq('id', id)
    .single()

  if (error || !payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }
'@
$new = @'
  const { data: payment, error } = await supabaseAdmin
    .from('payments')
    .select('id, payment_no, payment_date, amount, payment_method, reference, notes, party_id, party_type, company_id')
    .eq('id', id)
    .single()

  if (error || !payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  // Account balance summary (as at issue) - null if unavailable, the page simply hides it
  let balanceSummary: any = null
  try {
    const { data: bsum } = await supabaseAdmin.rpc('get_payment_balance_summary', {
      p_company_id: payment.company_id,
      p_payment_id: payment.id,
    })
    balanceSummary = bsum || null
  } catch {
    balanceSummary = null
  }
'@
$edits += [pscustomobject]@{ File = 'src\app\api\public\payment\route.ts'; Old = $old; New = $new }

# ---- Edit 2: return the balance summary in the JSON response ----
$old = @'
  return NextResponse.json({
    payment: {
      ...payment,
      supplier_name: supplierName,
      supplier_phone: supplierPhone,
      supplier_address: supplierAddress,
    },
    company: {
'@
$new = @'
  return NextResponse.json({
    payment: {
      ...payment,
      supplier_name: supplierName,
      supplier_phone: supplierPhone,
      supplier_address: supplierAddress,
    },
    balance_summary: balanceSummary,
    company: {
'@
$edits += [pscustomobject]@{ File = 'src\app\api\public\payment\route.ts'; Old = $old; New = $new }

# ---- Edit 3: render the Account Summary box on the payment link page ----
$old = @'
        <div style={{ background: "white", borderRadius: 16, padding: "20px 22px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
          <DetailRow label="Date" value={payment.payment_date} />
          <DetailRow label="Method" value={payment.payment_method} />
          {payment.reference && <DetailRow label="Reference" value={payment.reference} />}
          <div style={{ height: 1, background: "#f1f5f9", margin: "10px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16 }}>
            <span style={{ fontWeight: 700, color: "#64748b" }}>Amount Paid</span>
            <span style={{ fontWeight: 800, color: "#10b981" }}>PKR {Number(payment.amount || 0).toLocaleString()}</span>
          </div>
        </div>

        {payment.notes && (
'@
$new = @'
        <div style={{ background: "white", borderRadius: 16, padding: "20px 22px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
          <DetailRow label="Date" value={payment.payment_date} />
          <DetailRow label="Method" value={payment.payment_method} />
          {payment.reference && <DetailRow label="Reference" value={payment.reference} />}
          <div style={{ height: 1, background: "#f1f5f9", margin: "10px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16 }}>
            <span style={{ fontWeight: 700, color: "#64748b" }}>Amount Paid</span>
            <span style={{ fontWeight: 800, color: "#10b981" }}>PKR {Number(payment.amount || 0).toLocaleString()}</span>
          </div>
        </div>

        {data.balance_summary && (() => {
          const bs = data.balance_summary
          const money = (n: number) => n < 0 ? "(PKR " + Math.abs(Number(n)).toLocaleString() + ")" : "PKR " + Number(n).toLocaleString()
          return (
            <div style={{ background: "white", borderRadius: 16, padding: "18px 22px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.06em", marginBottom: 12 }}>Account Summary</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 13 }}>
                <span style={{ color: "#64748b" }}>Opening Balance</span>
                <span style={{ fontWeight: 600, color: "#0f172a" }}>{money(bs.opening_balance)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 13 }}>
                <span style={{ color: "#64748b" }}>Less: This Payment</span>
                <span style={{ fontWeight: 600, color: "#0f172a" }}>{money(bs.document_amount)}</span>
              </div>
              <div style={{ height: 1, background: "#f1f5f9", margin: "8px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                <span style={{ color: "#64748b", fontWeight: 700 }}>Total Payable</span>
                <span style={{ fontWeight: 800, color: "#1740c8" }}>{money(bs.total)}</span>
              </div>
            </div>
          )
        })()}

        {payment.notes && (
'@
$edits += [pscustomobject]@{ File = 'src\app\payment\[id]\PaymentViewerClient.tsx'; Old = $old; New = $new }

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