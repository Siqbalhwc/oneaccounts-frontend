# apply_fix2.ps1
# Run from: C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend
#
# Recovery script. What happened last time: EntityPicker.tsx was fixed
# correctly and fully - nothing to redo there. products\page.tsx got
# partially patched (state + fetch function added) then correctly stopped
# itself before touching anything else, because my first script used the
# wrong kind of PowerShell here-string and mangled a backtick in your file's
# own template-literal text while trying to match it - not a bug in your
# code, a bug in my script's quoting. This one uses the literal kind
# (@'...'@) so backticks pass through untouched.
#
# This script only applies the two pieces that did NOT get applied last time:
#   2c. call fetchAllProductsValue() after a product delete
#   2d. add the new "Total Stock Value (All Products, All Pages)" KPI card

$ErrorActionPreference = "Stop"

function Backup-File($path) {
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupPath = "$path.bak_$stamp"
    Copy-Item -LiteralPath $path -Destination $backupPath
    Write-Host "Backed up: $backupPath"
}

function Replace-Unique($path, $old, $new, $label) {
    $content = [System.IO.File]::ReadAllText($path)
    $oldCount = ([regex]::Matches($content, [regex]::Escape($old))).Count
    $newCount = ([regex]::Matches($content, [regex]::Escape($new))).Count

    if ($oldCount -eq 1) {
        $updated = $content.Replace($old, $new)
        [System.IO.File]::WriteAllText($path, $updated, [System.Text.Encoding]::UTF8)
        Write-Host "Applied: $label"
        return
    }
    if ($oldCount -eq 0 -and $newCount -ge 1) {
        Write-Host "Skipped (already applied): $label"
        return
    }
    throw "ABORT [$label]: old-text matches=$oldCount, new-text matches=$newCount in $path. Expected old=1 (apply) or old=0/new>=1 (already done). No changes written. Please paste this message back to Claude."
}

$prodPath = "src\app\dashboard\products\page.tsx"
Backup-File $prodPath

# 2c. Refresh the all-products total after a delete
$old5 = @'
    await supabase.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", companyId)
    setFlash(`${isConstruction ? "Unit/plot" : "Product"} deleted.`)
    fetchProducts()
    setTimeout(() => setFlash(""), 3000)
'@
$new5 = @'
    await supabase.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", companyId)
    setFlash(`${isConstruction ? "Unit/plot" : "Product"} deleted.`)
    fetchProducts()
    fetchAllProductsValue()
    setTimeout(() => setFlash(""), 3000)
'@
Replace-Unique $prodPath $old5 $new5 "products page: refresh total after delete"

# 2d. Add the new, clearly-labeled third KPI card (existing two cards untouched)
$old6 = @'
        <div className="summary-item">
          <div className="summary-label">{isConstruction ? "Unsold Units Value" : "Closing Stock Value"}</div>
          <div className="summary-value" style={{ color: "#10B981" }}>
            <sup>PKR</sup> {totalStockValue.toLocaleString()}
          </div>
        </div>
      </div>
'@
$new6 = @'
        <div className="summary-item">
          <div className="summary-label">{isConstruction ? "Unsold Units Value" : "Closing Stock Value"}</div>
          <div className="summary-value" style={{ color: "#10B981" }}>
            <sup>PKR</sup> {totalStockValue.toLocaleString()}
          </div>
        </div>
        <div className="summary-item">
          <div className="summary-label">{isConstruction ? "Unsold Units Value (All Pages)" : "Total Stock Value (All Products, All Pages)"}</div>
          <div className="summary-value" style={{ color: "#10B981" }}>
            {allProductsValue === null ? (
              <span style={{ fontSize: 14, color: "var(--text-muted)" }}>Loading...</span>
            ) : (
              <><sup>PKR</sup> {allProductsValue.toLocaleString()}</>
            )}
          </div>
        </div>
      </div>
'@
Replace-Unique $prodPath $old6 $new6 "products page: add all-products-value KPI card"

Write-Host ""
Write-Host "Done. products/page.tsx should now be fully patched."
Write-Host "EntityPicker.tsx needed no further changes."
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. rmdir /s /q `".next`""
Write-Host "  2. npm run dev   (check Invoice/Bill Add Item search scroll, and Products page 3rd KPI card)"
Write-Host "  3. git add -A"
Write-Host "  4. git commit -m `"Fix: EntityPicker scroll cap removed; add all-products stock value KPI`""
Write-Host "  5. git push"
Write-Host "  6. Paste the full Vercel build log back before this is marked closed."