$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$path = "src\app\dashboard\inventory\adjustments\new\page.tsx"

if (-not (Test-Path $path)) {
    Write-Host "ABORT: File not found: $path" -ForegroundColor Red
    return
}

$backupPath = "$path.bak_$(Get-Date -Format yyyyMMdd_HHmmss)"
Copy-Item -Path $path -Destination $backupPath
Write-Host "Backup created: $backupPath" -ForegroundColor Yellow

$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

$old = @'
      // Fetch products for THIS company only
      const { data: prods } = await supabase
        .from("products")
        .select("id, code, name, opening_qty, cost_price")
        .eq("company_id", cid)
        .order("code")
      if (!prods) return
      setProducts(prods)

      // Fetch invoice items (only for this company's invoices) and stock moves
      const [{ data: items }, { data: moves }] = await Promise.all([
        supabase
          .from("invoice_items")
          .select("qty, product_id, invoices!inner(type, company_id)")
          .eq("invoices.company_id", cid),
        supabase
          .from("stock_moves")
          .select("qty, product_id")
          .eq("company_id", cid),
      ])

      // Build closing stock map
      const map: Record<number, number> = {}
      prods.forEach((p: any) => {
        map[p.id] = p.opening_qty || 0
      })

      if (items) {
        items.forEach((item: any) => {
          const type = item.invoices?.type
          if (type === "purchase") map[item.product_id] = (map[item.product_id] || 0) + item.qty
          else if (type === "sale") map[item.product_id] = (map[item.product_id] || 0) - item.qty
        })
      }

      if (moves) {
        moves.forEach((m: any) => {
          map[m.product_id] = (map[m.product_id] || 0) + (m.qty || 0)
        })
      }

      setStockMap(map)
'@

$new = @'
      // Fetch products for THIS company only.
      // qty_on_hand is the single source of truth (opening_qty + SUM(stock_moves),
      // maintained by the trg_set_qty_on_hand trigger - see audit item C15).
      // Previously this form independently rebuilt stock from invoice_items + stock_moves,
      // which double-counted every invoice (invoices write their own stock_moves row,
      // so their effect was being added twice) and omitted cash_sale/return/stock_out moves.
      const { data: prods } = await supabase
        .from("products")
        .select("id, code, name, opening_qty, cost_price, qty_on_hand")
        .eq("company_id", cid)
        .order("code")
      if (!prods) return
      setProducts(prods)

      const map: Record<number, number> = {}
      prods.forEach((p: any) => {
        map[p.id] = p.qty_on_hand ?? p.opening_qty ?? 0
      })

      setStockMap(map)
'@

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
if ($count -ne 1) {
    Write-Host "ABORT: Anchor block found $count times (expected 1). No changes made." -ForegroundColor Red
    return
}

$newContent = $content.Replace($old, $new)
[System.IO.File]::WriteAllText($path, $newContent, $utf8NoBom)

Write-Host "FIXED (encoding-safe): $path" -ForegroundColor Green