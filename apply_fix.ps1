$path = "src\app\dashboard\invoices\new\page.tsx"
$raw = Get-Content -Raw $path
$hadCRLF = $raw -match "`r`n"
$content = $raw -replace "`r`n", "`n"

$old = 'const path = `/invoices/${Date.now()}-${file.name}`'
$new = 'const path = `${companyId}/invoices/${Date.now()}-${file.name}`'

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
Write-Host "Anchor matches found: $count"

if ($count -ne 1) {
    Write-Host "Anchor must match exactly once - stopping, no changes made." -ForegroundColor Red
    exit 1
}

$content = $content.Replace($old, $new)
if ($hadCRLF) { $content = $content -replace "`n", "`r`n" }
Set-Content -Path $path -Value $content -NoNewline
Write-Host "SUCCESS: companyId restored in attachment upload path" -ForegroundColor Green