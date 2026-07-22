$path = "src\app\dashboard\reports\customer-ledger\page.tsx"
$content = Get-Content $path -Raw

$old = '      const allLines: any[] = [openingLine, ...periodLines]'
$new = '      const allLines: any[] = openingNet !== 0 ? [openingLine, ...periodLines] : [...periodLines]'

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
if ($count -ne 1) {
    Write-Host "SAFETY CHECK FAILED: expected 1 match, found $count. No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old, $new)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}