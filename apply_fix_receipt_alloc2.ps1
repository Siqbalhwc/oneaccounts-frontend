$path = "src\app\dashboard\receipts\new\page.tsx"
$raw = Get-Content -Raw $path
$hadCRLF = $raw -match "`r`n"
$content = $raw -replace "`r`n", "`n"

function Norm($s) { return ($s -replace "`r`n", "`n") }

$startAnchor = Norm(@'
      const invoiceIds = invs.map(inv => inv.id)
'@)
$endAnchor = Norm(@'
      const stillDue = enriched.filter(inv => inv.total - inv.paid > 0.001)
'@)

$cStart = ([regex]::Matches($content, [regex]::Escape($startAnchor))).Count
$cEnd = ([regex]::Matches($content, [regex]::Escape($endAnchor))).Count
Write-Host "Start-anchor (invoiceIds): matches found = $cStart"
Write-Host "End-anchor (stillDue): matches found = $cEnd"

if ($cStart -ne 1 -or $cEnd -ne 1) {
  Write-Host "One or both boundary anchors did not match exactly once - stopping, NO changes made." -ForegroundColor Red
  exit 1
}

$idxStart = $content.IndexOf($startAnchor)
$idxEnd = $content.IndexOf($endAnchor)
if ($idxEnd -le $idxStart) {
  Write-Host "End anchor appears before start anchor - stopping, NO changes made." -ForegroundColor Red
  exit 1
}

$replacement = Norm(@'
      const invoiceIds = invs.map(inv => inv.id)
      let allocQuery = supabase
        .from("receipt_allocations")
        .select("invoice_id, amount, receipt_id")
        .in("invoice_id", invoiceIds)
      if (editId) {
        allocQuery = allocQuery.neq("receipt_id", parseInt(editId))
      }
      const { data: allocationsData } = await allocQuery
      const paidMap: Record<number, number> = {}
      if (allocationsData) {
        allocationsData.forEach((a: any) => {
          paidMap[a.invoice_id] = (paidMap[a.invoice_id] || 0) + (a.amount || 0)
        })
      }
      const enriched = invs.map(inv => ({
        ...inv,
        paid: editId ? (paidMap[inv.id] || 0) : Math.max(inv.paid || 0, paidMap[inv.id] || 0),
      }))
'@)

$before = $content.Substring(0, $idxStart)
$after = $content.Substring($idxEnd)
$content = $before + $replacement + "`n" + $after

if ($hadCRLF) { $content = $content -replace "`n", "`r`n" }
Set-Content -Path $path -Value $content -NoNewline
Write-Host "SUCCESS: allocation calculation block replaced" -ForegroundColor Green