$path = "src\app\api\bills\route.ts"
$content = Get-Content $path -Raw

$old = "  # FIX marker placeholder"
$new = "  // FIX: remove old stock movements before recording new ones (prevents duplicate stock on bill edit)"

$matchCount = ([regex]::Matches($content, [regex]::Escape($old))).Count

if ($matchCount -ne 1) {
    Write-Host "SAFETY CHECK FAILED: expected exactly 1 match, found $matchCount. No changes made." -ForegroundColor Red
} else {
    $updated = $content.Replace($old, $new)
    Set-Content -Path $path -Value $updated -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}