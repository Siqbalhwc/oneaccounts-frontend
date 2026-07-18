$path = "src\app\api\bills\route.ts"
$content = Get-Content $path -Raw

$old = "  await recordStockMoves(supabase, companyId, items, 'purchase', id, 'in')"

$new = @"
  # FIX marker placeholder
  await supabase.from('stock_moves').delete().eq('company_id', companyId).eq('source_type', 'invoice').eq('source_id', id)
  await recordStockMoves(supabase, companyId, items, 'purchase', id, 'in')
"@

$matchCount = ([regex]::Matches($content, [regex]::Escape($old))).Count

if ($matchCount -ne 1) {
    Write-Host "SAFETY CHECK FAILED: expected exactly 1 match, found $matchCount. No changes made." -ForegroundColor Red
} else {
    $updated = $content.Replace($old, $new)
    Set-Content -Path $path -Value $updated -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}