$path = "src\app\dashboard\invoices\new\page.tsx"
$content = Get-Content $path -Raw

$old = @"
        supabase.from("invoice_items")
          .select("*")
          .eq("invoice_id", bill.id)
          .order("id")
          .then(({ data: itemsData }) => {
            if (itemsData) {
              const loaded = itemsData.map((item: any) => ({
                product_id: item.product_id,
                description: item.description,
                product_name: "",
                product_image: null,
"@

$new = @"
        supabase.from("invoice_items")
          .select("*, products(name, image_path)")
          .eq("invoice_id", bill.id)
          .order("id")
          .then(({ data: itemsData }) => {
            if (itemsData) {
              const loaded = itemsData.map((item: any) => ({
                product_id: item.product_id,
                description: item.description,
                product_name: item.products?.name || "",
                product_image: item.products?.image_path || null,
"@

if ($content -notmatch [regex]::Escape($old)) {
    Write-Host "SAFETY CHECK FAILED: exact text not found. No changes made." -ForegroundColor Red
} else {
    $updated = $content.Replace($old, $new)
    Set-Content -Path $path -Value $updated -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}