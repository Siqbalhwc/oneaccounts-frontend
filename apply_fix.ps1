$path = "src\app\dashboard\cash-sales\new\page.tsx"
$content = Get-Content $path -Raw

$old = "        .cs-page { max-width: 1100px; margin: 0 auto; padding: 20px 16px; }"
$new = "        .cs-page { padding: 20px 16px; overflow: visible; }"

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
if ($count -ne 1) {
    Write-Host "SAFETY CHECK FAILED: expected 1 match, found $count. No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old, $new)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}