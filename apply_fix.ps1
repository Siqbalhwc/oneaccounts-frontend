$path = "src\app\dashboard\reports\ar-aging\page.tsx"
$content = Get-Content $path -Raw

$old = "          if (bal <= 0) return"
$new = "          if (bal === 0) return"

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
if ($count -ne 1) {
    Write-Host "SAFETY CHECK FAILED: expected 1 match, found $count. No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old, $new)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}