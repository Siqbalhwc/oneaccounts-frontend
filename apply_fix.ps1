# apply_fix.ps1
# Fix: Qty/Rate fields in Sales Invoice and Purchase Bill showing "0" / "01"
# when cleared or retyped. Touches ONLY the 4 onChange handlers below.

$files = @(
    "src\app\dashboard\invoices\new\page.tsx",
    "src\app\dashboard\bills\new\page.tsx"
)

foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        Write-Host "SKIP (not found): $file" -ForegroundColor Yellow
        continue
    }

    $backup = "$file.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    Copy-Item $file $backup
    Write-Host "Backed up $file -> $backup"

    $content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
    $originalLength = $content.Length

    $content = $content.Replace(
        'onChange={e => updateItem(idx, "qty", Number(e.target.value))}',
        'onChange={e => updateItem(idx, "qty", e.target.value === "" ? "" : Number(e.target.value))}'
    )
    $content = $content.Replace(
        'onChange={e => updateItem(idx, "unit_price", Number(e.target.value))}',
        'onChange={e => updateItem(idx, "unit_price", e.target.value === "" ? "" : Number(e.target.value))}'
    )

    if ($content.Length -eq $originalLength) {
        Write-Host "WARNING: No changes made in $file - pattern not found (file may have changed since this script was written)." -ForegroundColor Red
    } else {
        [System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
        Write-Host "FIXED: $file" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Done. Now run: npm run dev  (to test locally) or deploy as usual." -ForegroundColor Cyan