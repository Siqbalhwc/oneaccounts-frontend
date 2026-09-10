$fileA = "src\app\api\products\route.ts"
$contentA = [System.IO.File]::ReadAllText($fileA)

$oldA2 = @"
  const newOpeningQty = Number(opening_qty || 0)
  const newCostPrice = Number(cost_price || 0)
  const newSalePrice = Number(sale_price || 0)
"@

$newA2 = @"
  const newOpeningQty = Number(opening_qty || 0)
  const newCostPrice = Number(cost_price || 0)
  const newSalePrice = Number(sale_price || 0)

  const { data: purchaseCheck } = await supabase
    .from('stock_moves')
    .select('id')
    .eq('product_id', id)
    .eq('company_id', companyId)
    .in('move_type', ['purchase', 'sale_return'])
    .limit(1)
  const hasPurchaseHistory = !!(purchaseCheck && purchaseCheck.length > 0)
"@

if ($contentA.Contains($oldA2)) {
    $contentA = $contentA.Replace($oldA2, $newA2)
    Write-Host "Fix 2a (purchase check) applied."
} else {
    Write-Host "Fix 2a anchor NOT found - stopping."
}

$oldA3 = @"
    .update({
      code, name,
      sale_price: newSalePrice,
      cost_price: newCostPrice,
      qty_on_hand: newOpeningQty,
      image_url: image_url || null,
    })
    .eq('id', id)
    .eq('company_id', companyId)
"@

$newA3 = @"
    .update({
      code, name,
      sale_price: newSalePrice,
      qty_on_hand: newOpeningQty,
      image_url: image_url || null,
      ...(hasPurchaseHistory ? {} : { cost_price: newCostPrice, opening_cost_price: newCostPrice }),
    })
    .eq('id', id)
    .eq('company_id', companyId)
"@

if ($contentA.Contains($oldA3)) {
    $contentA = $contentA.Replace($oldA3, $newA3)
    Write-Host "Fix 2b (update payload) applied."
} else {
    Write-Host "Fix 2b anchor NOT found - stopping."
}

[System.IO.File]::WriteAllText($fileA, $contentA, [System.Text.Encoding]::UTF8)
Write-Host "Done."