$path = "src\app\api\invoices\route.ts"
$content = Get-Content $path -Raw

$old = @"
  if (itemRows.length > 0) await supabase.from('invoice_items').insert(itemRows)

  await recordStockMoves(supabase, companyId, items, 'sale', id, 'out')
"@

$new = @"
  if (itemRows.length > 0) await supabase.from('invoice_items').insert(itemRows)

  // FIX: remove old stock movements for this invoice before recording new ones
  // (prevents duplicate stock deductions when an invoice with products is edited)
  await supabase.from('stock_moves').delete().eq('company_id', companyId).eq('source_type', 'invoice').eq('source_id', id)

  await recordStockMoves(supabase, companyId, items, 'sale', id, 'out')
"@

if ($content -notmatch [regex]::Escape($old)) {
    Write-Host "SAFETY CHECK FAILED: exact text not found. No changes made." -ForegroundColor Red
} else {
    $updated = $content.Replace($old, $new)
    Set-Content -Path $path -Value $updated -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}