$path = "src\app\dashboard\invoices\new\page.tsx"
$content = Get-Content $path -Raw

$old1 = @'
                product_image: item.products?.image_path || null,
                qty: item.qty,
                unit_price: item.unit_price,
'@

$new1 = @'
                product_image: item.products?.image_path || null,
                qty: item.qty,
                original_qty: item.qty,
                unit_price: item.unit_price,
'@

$old2 = @'
  useEffect(() => {
    const errors: Record<number, string> = {}
    items.forEach((item, idx) => {
      if (item.product_id && item.qty > 0) {
        const product = products.find(p => p.id === item.product_id)
        if (product && item.qty > (product.qty_on_hand || 0)) {
          errors[idx] = `Insufficient stock: available ${product.qty_on_hand}`
        }
      }
    })
    setStockErrors(errors)
  }, [items, products])
'@

$new2 = @'
  useEffect(() => {
    const errors: Record<number, string> = {}
    items.forEach((item, idx) => {
      if (item.product_id && item.qty > 0) {
        const product = products.find(p => p.id === item.product_id)
        if (product) {
          const available = (product.qty_on_hand || 0) + (editId ? (item.original_qty || 0) : 0)
          if (item.qty > available) {
            errors[idx] = `Insufficient stock: available ${available}`
          }
        }
      }
    })
    setStockErrors(errors)
  }, [items, products, editId])
'@

$ok1 = $content -match [regex]::Escape($old1)
$ok2 = $content -match [regex]::Escape($old2)

if (-not $ok1 -or -not $ok2) {
    Write-Host "SAFETY CHECK FAILED: one or both exact blocks not found. No changes made." -ForegroundColor Red
    Write-Host "Block 1 found: $ok1"
    Write-Host "Block 2 found: $ok2"
} else {
    $updated = $content.Replace($old1, $new1).Replace($old2, $new2)
    Set-Content -Path $path -Value $updated -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}