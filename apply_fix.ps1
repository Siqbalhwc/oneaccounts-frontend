$path = "src\app\dashboard\bills\new\page.tsx"
$content = Get-Content $path -Raw

$old = '      const path = `bills/${companyId}/${Date.now()}-${file.name}`'
$new = '      const path = `${companyId}/bills/${Date.now()}-${file.name}`'

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
if ($count -ne 1) {
    Write-Host "SAFETY CHECK FAILED: expected 1 match, found $count. No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old, $new)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}