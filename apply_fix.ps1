$path = "src\app\dashboard\bills\[id]\page.tsx"
$raw = Get-Content -LiteralPath $path -Raw
$hadCRLF = $raw -match "`r`n"
$content = $raw -replace "`r`n", "`n"

$old = "supabase`n      .from(""invoices"")`n      .select(""*"")`n      .eq(""id"", billId)`n      .eq(""company_id"", companyId)`n      .eq(""type"", ""purchase"")`n      .single()"
$new = "supabase`n      .from(""invoices"")`n      .select(""*"")`n      .eq(""id"", billId)`n      .eq(""type"", ""purchase"")`n      .single()"

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
Write-Host "Anchor matches found: $count"

if ($count -ne 1) {
    Write-Host "Anchor must match exactly once - stopping, no changes made." -ForegroundColor Red
    exit 1
}

$content = $content.Replace($old, $new)
if ($hadCRLF) { $content = $content -replace "`n", "`r`n" }
Set-Content -LiteralPath $path -Value $content -NoNewline
Write-Host "SUCCESS: removed redundant client-side company_id filter" -ForegroundColor Green