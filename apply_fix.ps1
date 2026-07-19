$path = "src\lib\entities\product.meta.ts"
$content = Get-Content $path -Raw

$old = @'
    if (record.qty_on_hand !== undefined) {
      return `Stock: ${record.qty_on_hand}`;
    }
'@

$new = @'
    if (record.qty_on_hand !== undefined) {
      return `Stock: ${record.qty_on_hand} ${record.unit || "PCS"}`;
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