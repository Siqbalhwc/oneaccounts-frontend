# apply_fix.ps1
# Run from: C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend
#
# Recovery + completion script. What happened last time:
#   - product.meta.ts: applied correctly, no action needed.
#   - EntityPicker.tsx: both patches applied correctly, no action needed.
#   - invoices/new/page.tsx: ABORTED before any change was written, because
#     my previous script's anchor text included the "..." (ellipsis)
#     character from your placeholder text, and that character got
#     corrupted when this script file was read - a known Windows
#     PowerShell quirk (reads .ps1 files without a BOM using the system
#     ANSI codepage, not UTF-8), same root cause your own project notes
#     already flag elsewhere. Not your file's fault - my script's fault
#     for including that character at all.
#
# This version never puts that ellipsis character into any anchor - it
# only matches surrounding plain-ASCII text - so it can't happen again.
# It also safely SKIPS anything already applied, so re-running this is
# safe no matter where the previous run stopped.
#
# Still to do: invoices/new/page.tsx, bills/new/page.tsx, cash-sales/new/page.tsx

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
    throw "ABORT [$label]: old-text matches=$oldCount, new-text matches=$newCount in $path. No changes written. Please paste this message back to Claude."
}

# ---------------------------------------------------------------------
# FILE 1 - src/lib/entities/product.meta.ts  (idempotent full overwrite)
# ---------------------------------------------------------------------
$metaPath = "src\lib\entities\product.meta.ts"

$metaContent = @'
import type { EntityConfig } from './types';

export const productMeta: EntityConfig = {
  entity: 'product',
  displayName: 'Product',
  apiBase: '/api/products',
  searchFields: ['code', 'name'],
  quickCreate: {
    enabled: true,
    fields: [
      { name: 'name',               label: 'Product Name',       type: 'text',   required: true },
      { name: 'opening_qty',        label: 'Opening Quantity',   type: 'number', required: false, defaultValue: 0 },
      { name: 'opening_cost_price', label: 'Opening Cost Price', type: 'number', required: false, defaultValue: 0 },
      { name: 'sale_price',         label: 'Sale Price',         type: 'number', required: false, defaultValue: 0 },
    ],
  },
  permissions: {
    create: ['admin', 'accountant'],
    edit:   ['admin', 'accountant'],
  },
  // Display stock in search results
  searchResultExtra: (record) => {
    if (record.qty_on_hand !== undefined) {
      return `Stock: ${record.qty_on_hand} ${record.unit || "PCS"}`;
    }
    return null;
  },
};
'@

$currentMeta = if (Test-Path $metaPath) { [System.IO.File]::ReadAllText($metaPath) } else { "" }
if ($currentMeta.Trim() -eq $metaContent.Trim()) {
    Write-Host "Skipped (already applied): product.meta.ts"
} else {
    Backup-File $metaPath
    [System.IO.File]::WriteAllText($metaPath, $metaContent, [System.Text.Encoding]::UTF8)
    Write-Host "Applied: product.meta.ts - added Opening Quantity + Opening Cost Price fields"
}

# ---------------------------------------------------------------------
# FILE 2 - src/components/entity-picker/EntityPicker.tsx  (2 patches)
# ---------------------------------------------------------------------
$epPath = "src\components\entity-picker\EntityPicker.tsx"
Backup-File $epPath

$epOld1 = @'
        const productPayload = {
          company_id: companyId,
          code: nextCode,
          name: payload.name || "",
          sale_price: parseFloat(payload.sale_price || 0),
          cost_price: parseFloat(payload.cost_price || 0),
          opening_qty: 0,
          qty_on_hand: 0,
          image_path: null,
        }
'@
$epNew1 = @'
        const openingQtyVal = parseFloat(payload.opening_qty || 0)
        const openingCostVal = parseFloat(payload.opening_cost_price || 0)
        const productPayload = {
          company_id: companyId,
          code: nextCode,
          name: payload.name || "",
          sale_price: parseFloat(payload.sale_price || 0),
          opening_qty: openingQtyVal,
          opening_cost_price: openingCostVal,
          cost_price: openingCostVal,
          image_path: null,
        }
'@
Replace-Unique $epPath $epOld1 $epNew1 "EntityPicker: product quick-create now takes opening qty/cost"

$epOld2 = @'
      // Update all records cache and select
      setAllRecords((prev) => (prev ? [newRecord, ...prev] : [newRecord]))
      onChange(newRecord)
      setIsModalOpen(false)
'@
$epNew2 = @'
      // Update all records cache and select
      const updatedRecords = allRecords ? [newRecord, ...allRecords] : [newRecord]
      setAllRecords(updatedRecords)
      if (onRecordsRefreshed) onRecordsRefreshed(updatedRecords)
      onChange(newRecord)
      setIsModalOpen(false)
'@
Replace-Unique $epPath $epOld2 $epNew2 "EntityPicker: sync new record to parent list"

# ---------------------------------------------------------------------
# FILE 3 - src/app/dashboard/invoices/new/page.tsx
# (ASCII-only anchor - does not touch or depend on the placeholder line)
# ---------------------------------------------------------------------
$invPath = "src\app\dashboard\invoices\new\page.tsx"
Backup-File $invPath

$invOld = @'
                          label="Add Item"
                          allowCreate={false}
                          clearCacheOnOpen
                          onRecordsRefreshed={handleProductsRefreshed}
'@
$invNew = @'
                          label="Add Item"
                          clearCacheOnOpen
                          onRecordsRefreshed={handleProductsRefreshed}
'@
Replace-Unique $invPath $invOld $invNew "Invoice: enable Quick Create on product picker"

# ---------------------------------------------------------------------
# FILE 4 - src/app/dashboard/bills/new/page.tsx
# (ASCII-only anchor)
# ---------------------------------------------------------------------
$billPath = "src\app\dashboard\bills\new\page.tsx"
Backup-File $billPath

$billOld = @'
                          label="Add Item"
                          allowCreate={false}
                          clearCacheOnOpen
                        />
'@
$billNew = @'
                          label="Add Item"
                          clearCacheOnOpen
                          onRecordsRefreshed={(records) => setProducts(records)}
                        />
'@
Replace-Unique $billPath $billOld $billNew "Bill: enable Quick Create on product picker"

# ---------------------------------------------------------------------
# FILE 5 - src/app/dashboard/cash-sales/new/page.tsx
# (already ASCII-only, unchanged from before)
# ---------------------------------------------------------------------
$csPath = "src\app\dashboard\cash-sales\new\page.tsx"
Backup-File $csPath

$csOld = @'
                <EntityPicker
                  entityType="product"
                  value={null}
                  onChange={(record: any) => { if (record) addProductItem(record) }}
                  placeholder="Search product..."
                  label=""
                  allowCreate={false}
                  clearCacheOnOpen
                />
'@
$csNew = @'
                <EntityPicker
                  entityType="product"
                  value={null}
                  onChange={(record: any) => { if (record) addProductItem(record) }}
                  placeholder="Search product..."
                  label=""
                  clearCacheOnOpen
                />
'@
Replace-Unique $csPath $csOld $csNew "Cash Sale: enable Quick Create on product picker"

Write-Host ""
Write-Host "All patches applied. Next steps:"
Write-Host "  1. rmdir /s /q `".next`""
Write-Host "  2. npm run dev"
Write-Host "  3. Test: Invoice -> Add Item -> type a NEW product name -> Quick Create Product"
Write-Host "           -> fill Opening Qty / Opening Cost / Sale Price -> Save"
Write-Host "           -> confirm it's added as a line item immediately, no refresh needed"
Write-Host "           -> repeat quickly for Bill and Cash Sale"
Write-Host "           -> afterward, check the product's Stock Register entry and the"
Write-Host "              General Ledger to confirm the opening-inventory entry posted correctly"
Write-Host "  4. git add -A"
Write-Host "  5. git commit -m `"Feature: inline product creation from Invoice/Bill/Cash Sale`""
Write-Host "  6. git push"
Write-Host "  7. Paste the full Vercel build log back before this is marked closed."