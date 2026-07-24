$path = "src\app\api\payments\route.ts"
$content = Get-Content $path -Raw

$old = @'
  if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
    return NextResponse.json({ error: 'Allocations are required for supplier payment' }, { status: 400 })
  }
'@

$new = @'
  const hasBillAllocations = allocations && Array.isArray(allocations) && allocations.length > 0
  const hasOpeningAllocation = (opening_allocation || 0) > 0
  if (!hasBillAllocations && !hasOpeningAllocation) {
    return NextResponse.json({ error: 'Please allocate the payment to at least one bill or the opening balance' }, { status: 400 })
  }
'@

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
if ($count -ne 1) {
    Write-Host "SAFETY CHECK FAILED: expected 1 match, found $count. No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old, $new)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}