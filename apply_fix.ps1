$path = "src\app\dashboard\reports\customer-ledger\page.tsx"
$content = Get-Content $path -Raw

$old = '      const openingNet = openingDebit - openingCredit + (customer.opening_balance || 0)'
$new = @'
      const hasTaggedOpeningEntry = (openingEntryLines || []).length > 0
      const openingNet = openingDebit - openingCredit + (hasTaggedOpeningEntry ? 0 : (customer.opening_balance || 0))
'@

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
if ($count -ne 1) {
    Write-Host "SAFETY CHECK FAILED: expected 1 match, found $count. No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old, $new)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}