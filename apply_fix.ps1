$path = "src\app\dashboard\products\page.tsx"
$content = Get-Content $path -Raw

$old = "  const closing = prod.qty_on_hand"

$new = "  const closing = prod.qty_on_hand`n  const productUnit = prod.unit || `"PCS`""

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
if ($count -ne 1) {
    Write-Host "SAFETY CHECK FAILED: expected 1 match, found $count. No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old, $new)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}