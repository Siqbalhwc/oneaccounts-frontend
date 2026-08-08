$path = "src\app\dashboard\suppliers\new\page.tsx"
$content = Get-Content $path -Raw

$old = @"
      setFlash(``✅ Supplier `${data.code} – `${data.name} created!``)
"@

$callBlock = @"
      if (balance !== 0 && data) {
        try {
          await fetch("/api/suppliers/opening-entry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ supplierId: data.id, supplierName: data.name, amount: balance }),
          })
        } catch (err) {
          console.error("Opening entry failed:", err)
        }
      }

      setFlash(``✅ Supplier `${data.code} – `${data.name} created!``)
"@

if (([regex]::Matches($content, [regex]::Escape($old.Trim()))).Count -ne 1) {
    Write-Output "wire-opening-entry: anchor did not match exactly once - stopping, NO changes made."
} else {
    $updated = $content -replace [regex]::Escape($old.Trim()), $callBlock.Trim()
    Set-Content -Path $path -Value $updated -NoNewline
    Write-Output "wire-opening-entry: SUCCESS"
}