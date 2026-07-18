$path = "src\components\entity-picker\EntityPicker.tsx"
$content = Get-Content $path -Raw

$old1 = "    query.then(({ data, error }) => {"
$new1 = "    query.then(async ({ data, error }) => {"

$old2 = @'
      let records = data || []
      if (allowedIds && allowedIds.length > 0) {
        records = records.filter((r: any) => allowedIds.includes(r.id))
      }
      setAllRecords(records)
'@

$new2 = @'
      let records = data || []
      if (allowedIds && allowedIds.length > 0) {
        records = records.filter((r: any) => allowedIds.includes(r.id))
      }
      if (entityType === "product" && records.length > 0) {
        const productIds = records.map((r: any) => r.id)
        const { data: movesData } = await supabase
          .from("stock_moves")
          .select("product_id, qty")
          .in("product_id", productIds)
        if (movesData) {
          const sums: Record<number, number> = {}
          movesData.forEach((m: any) => {
            sums[m.product_id] = (sums[m.product_id] || 0) + Number(m.qty)
          })
          records = records.map((r: any) => ({
            ...r,
            qty_on_hand: Number(r.opening_qty || 0) + (sums[r.id] || 0),
          }))
        }
      }
      setAllRecords(records)
'@

$c1 = ([regex]::Matches($content, [regex]::Escape($old1))).Count
$c2 = ([regex]::Matches($content, [regex]::Escape($old2))).Count

if ($c1 -ne 1 -or $c2 -ne 1) {
    Write-Host "SAFETY CHECK FAILED: block1 matches=$c1 block2 matches=$c2. No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old1, $new1).Replace($old2, $new2)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}