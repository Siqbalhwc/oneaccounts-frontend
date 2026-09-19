# apply_fix.ps1 - Qty / Rate / Total lock feature for Invoice, Bill, Cash Sale
# Safe: checks every edit first, writes nothing unless ALL edits match. Backups go to your TEMP folder.
$ErrorActionPreference = "Stop"
$root = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend"
if (-not (Test-Path -LiteralPath $root)) { throw "Folder not found: $root" }
Set-Location -LiteralPath $root
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $env:TEMP ("oneaccounts_backup_" + $stamp)
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Read-FileLines([string]$path) {
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $bom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
  $start = 0
  if ($bom) { $start = 3 }
  $text = [System.Text.Encoding]::UTF8.GetString($bytes, $start, $bytes.Length - $start)
  $nl = "`n"
  if ($text.Contains("`r`n")) { $nl = "`r`n" }
  $lines = New-Object System.Collections.Generic.List[string]
  foreach ($l in $text.Split([string[]]@("`n"), [System.StringSplitOptions]::None)) { $lines.Add($l.TrimEnd("`r")) }
  return @{ Bom = $bom; Nl = $nl; Lines = $lines; Text = $text }
}

function Apply-Edit($lines, [string[]]$old, [string[]]$new, [string]$file, [int]$num) {
  $n = $old.Count
  $hits = New-Object System.Collections.Generic.List[int]
  for ($i = 0; $i -le $lines.Count - $n; $i++) {
    $ok = $true
    for ($k = 0; $k -lt $n; $k++) {
      if ($lines[$i + $k].Trim() -ne $old[$k]) { $ok = $false; break }
    }
    if ($ok) { $hits.Add($i) }
  }
  if ($hits.Count -ne 1) {
    throw "STOPPED: edit #$num in $file matched $($hits.Count) places (expected 1). Nothing was changed. Send this message to Claude."
  }
  $lines.RemoveRange($hits[0], $n)
  $lines.InsertRange($hits[0], $new)
}

$plan = @(
  @{ File = 'src\app\dashboard\invoices\new\page.tsx'; Edits = @(
      @{ Old = @('import EntityPicker from "@/components/entity-picker/EntityPicker"'); New = @('import EntityPicker from "@/components/entity-picker/EntityPicker"', 'import { applyLineEdit, setLineLock, lineDisplay, getLock, type CalcLock } from "@/lib/line-calc"', 'import LineCalcInput from "@/components/LineCalcInput"') },
      @{ Old = @('qty: 1,', 'unit_price: prod.sale_price,', 'cost_price: prod.cost_price,', 'total: prod.sale_price,'); New = @('      qty: "",', '      unit_price: prod.sale_price,', '      cost_price: prod.cost_price,', '      total: 0,') },
      @{ Old = @('newTaxAmount = (prod.sale_price * newTaxRate) / 100'); New = @('        newTaxAmount = 0') },
      @{ Old = @('if (field === "qty" || field === "unit_price") {', 'updated[idx].total = updated[idx].qty * updated[idx].unit_price', 'if (updated[idx].tax_rate > 0) {', 'updated[idx].tax_amount = (updated[idx].qty * updated[idx].unit_price * updated[idx].tax_rate) / 100', '} else {', 'updated[idx].tax_amount = 0', '}', '}', '', 'if (field === "total") {', 'updated[idx].unit_price = updated[idx].qty > 0 ? updated[idx].total / updated[idx].qty : 0', 'if (updated[idx].tax_rate > 0) {', 'updated[idx].tax_amount = (updated[idx].qty * updated[idx].unit_price * updated[idx].tax_rate) / 100', '} else {', 'updated[idx].tax_amount = 0', '}', '}'); New = @('    if (field === "qty" || field === "unit_price" || field === "total") {', '      updated[idx] = applyLineEdit(updated[idx], field, value)', '      if (updated[idx].tax_rate > 0) {', '        updated[idx].tax_amount = (Number(updated[idx].qty || 0) * Number(updated[idx].unit_price || 0) * updated[idx].tax_rate) / 100', '      } else {', '        updated[idx].tax_amount = 0', '      }', '    }') },
      @{ Old = @('const updateTax = (idx: number, codeId: string | null) => {'); New = @('  const toggleLineLock = (idx: number, lock: CalcLock) => {', '    const updated = [...items]', '    updated[idx] = setLineLock(updated[idx], lock)', '    if (updated[idx].tax_rate > 0) {', '      updated[idx].tax_amount = (Number(updated[idx].qty || 0) * Number(updated[idx].unit_price || 0) * updated[idx].tax_rate) / 100', '    }', '    setItems(updated)', '  }', '', '  const updateTax = (idx: number, codeId: string | null) => {') },
      @{ Old = @('if (!customerId) { setError("Please select a customer"); return }', 'if (items.length === 0) { setError("Add at least one item"); return }'); New = @('    if (!customerId) { setError("Please select a customer"); return }', '    if (items.length === 0) { setError("Add at least one item"); return }', '    if (items.some((i: any) => i.qty === "" || !Number(i.qty) || i.unit_price === "")) { setError("Enter Qty and Rate for every item"); return }') },
      @{ Old = @('<input className="inv-input" style={{ height: 32, fontSize: 12, textAlign: "center", borderColor: stockError ? "#EF4444" : undefined }} type="number" value={item.qty} onChange={e => updateItem(idx, "qty", e.target.value === "" ? "" : Number(e.target.value))} />'); New = @('                          <LineCalcInput className="inv-input" style={{ height: 32, fontSize: 12, textAlign: "center", borderColor: stockError ? "#EF4444" : undefined }} value={lineDisplay(item, "qty")} locked={getLock(item) === "qty"} onChange={v => updateItem(idx, "qty", v)} onLock={() => toggleLineLock(idx, "qty")} />') },
      @{ Old = @('<input className="inv-input" style={{ height: 32, fontSize: 12, textAlign: "right" }} type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", e.target.value === "" ? "" : Number(e.target.value))} />'); New = @('                          <LineCalcInput className="inv-input" style={{ height: 32, fontSize: 12, textAlign: "right" }} value={lineDisplay(item, "unit_price")} locked={getLock(item) === "rate"} onChange={v => updateItem(idx, "unit_price", v)} onLock={() => toggleLineLock(idx, "rate")} />') },
      @{ Old = @('<input className="inv-input" style={{ height: 32, fontSize: 12, textAlign: "right", fontWeight: 600 }} type="number" value={item.total} onChange={e => updateItem(idx, "total", Number(e.target.value))} />'); New = @('                          <LineCalcInput className="inv-input" style={{ height: 32, fontSize: 12, textAlign: "right", fontWeight: 600 }} value={lineDisplay(item, "total")} locked={getLock(item) === "total"} onChange={v => updateItem(idx, "total", v)} onLock={() => toggleLineLock(idx, "total")} />') }
    ) },
  @{ File = 'src\app\dashboard\bills\new\page.tsx'; Edits = @(
      @{ Old = @('import EntityPicker from "@/components/entity-picker/EntityPicker"'); New = @('import EntityPicker from "@/components/entity-picker/EntityPicker"', 'import { applyLineEdit, setLineLock, lineDisplay, getLock, type CalcLock } from "@/lib/line-calc"', 'import LineCalcInput from "@/components/LineCalcInput"') },
      @{ Old = @('qty: 1,', 'unit_price: prod.cost_price,', 'total: prod.cost_price,'); New = @('      qty: "",', '      unit_price: prod.cost_price,', '      total: 0,') },
      @{ Old = @('if (field === "qty" || field === "unit_price") {', 'updated[idx].total = updated[idx].qty * updated[idx].unit_price', 'if (taxEnabled && updated[idx].tax_code_id) {'); New = @('    if (field === "qty" || field === "unit_price" || field === "total") {', '      updated[idx] = applyLineEdit(updated[idx], field, value)', '      if (taxEnabled && updated[idx].tax_code_id) {') },
      @{ Old = @('const updateTax = (idx: number, codeId: string | null) => {'); New = @('  const toggleLineLock = (idx: number, lock: CalcLock) => {', '    const updated = [...items]', '    updated[idx] = setLineLock(updated[idx], lock)', '    if (updated[idx].tax_rate > 0) {', '      updated[idx].tax_amount = (Number(updated[idx].qty || 0) * Number(updated[idx].unit_price || 0) * updated[idx].tax_rate) / 100', '    }', '    setItems(updated)', '  }', '', '  const updateTax = (idx: number, codeId: string | null) => {') },
      @{ Old = @('if (!supplierId) { setError("Please select a supplier"); return }', 'if (items.length === 0) { setError("Add at least one item"); return }'); New = @('    if (!supplierId) { setError("Please select a supplier"); return }', '    if (items.length === 0) { setError("Add at least one item"); return }', '    if (items.some((i: any) => i.qty === "" || !Number(i.qty) || i.unit_price === "")) { setError("Enter Qty and Rate for every item"); return }') },
      @{ Old = @('<input', 'className="inv-input"', 'style={{ height: 34, fontSize: 12, textAlign: "center" }}', 'type="number"', 'value={item.qty}', 'onChange={e => updateItem(idx, "qty", e.target.value === "" ? "" : Number(e.target.value))}', '/>'); New = @('                          <LineCalcInput className="inv-input" style={{ height: 34, fontSize: 12, textAlign: "center" }} value={lineDisplay(item, "qty")} locked={getLock(item) === "qty"} onChange={v => updateItem(idx, "qty", v)} onLock={() => toggleLineLock(idx, "qty")} />') },
      @{ Old = @('<input', 'className="inv-input"', 'style={{ height: 34, fontSize: 12, textAlign: "right" }}', 'type="number"', 'value={item.unit_price}', 'onChange={e => updateItem(idx, "unit_price", e.target.value === "" ? "" : Number(e.target.value))}', '/>'); New = @('                          <LineCalcInput className="inv-input" style={{ height: 34, fontSize: 12, textAlign: "right" }} value={lineDisplay(item, "unit_price")} locked={getLock(item) === "rate"} onChange={v => updateItem(idx, "unit_price", v)} onLock={() => toggleLineLock(idx, "rate")} />') },
      @{ Old = @('<div className="inv-cell inv-cell-total" style={{ color: overBudget ? "#FCA5A5" : undefined }}>', 'PKR {item.total.toLocaleString()}', '</div>'); New = @('                          <LineCalcInput className="inv-input" style={{ height: 34, fontSize: 12, textAlign: "right", fontWeight: 600, color: overBudget ? "#FCA5A5" : undefined }} value={lineDisplay(item, "total")} locked={getLock(item) === "total"} onChange={v => updateItem(idx, "total", v)} onLock={() => toggleLineLock(idx, "total")} />') }
    ) },
  @{ File = 'src\app\dashboard\cash-sales\new\page.tsx'; Edits = @(
      @{ Old = @('import EntityPicker from "@/components/entity-picker/EntityPicker"'); New = @('import EntityPicker from "@/components/entity-picker/EntityPicker"', 'import { applyLineEdit, setLineLock, lineDisplay, getLock, type CalcLock } from "@/lib/line-calc"', 'import LineCalcInput from "@/components/LineCalcInput"') },
      @{ Old = @('qty: 1,', 'unit_price: prod.sale_price || 0,', 'total: prod.sale_price || 0,'); New = @('      qty: "",', '      unit_price: prod.sale_price || 0,', '      total: 0,') },
      @{ Old = @('if (field === "qty" || field === "unit_price") {', 'updated[idx].total = updated[idx].qty * updated[idx].unit_price', '} else if (field === "total") {', 'updated[idx].unit_price = updated[idx].qty > 0 ? updated[idx].total / updated[idx].qty : 0', '}'); New = @('    if (field === "qty" || field === "unit_price" || field === "total") {', '      updated[idx] = applyLineEdit(updated[idx], field, value)', '    }') },
      @{ Old = @('const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx))'); New = @('  const toggleLineLock = (idx: number, lock: CalcLock) => {', '    const updated = [...items]', '    updated[idx] = setLineLock(updated[idx], lock)', '    setItems(updated)', '  }', '', '  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx))') },
      @{ Old = @('if (items.length === 0) { setError("Add at least one item"); return }', 'if (hasStockErrors) { setError("Cannot save: some items have insufficient stock."); return }'); New = @('    if (items.length === 0) { setError("Add at least one item"); return }', '    if (items.some((i: any) => i.qty === "" || !Number(i.qty) || i.unit_price === "")) { setError("Enter Qty and Rate for every item"); return }', '    if (hasStockErrors) { setError("Cannot save: some items have insufficient stock."); return }') },
      @{ Old = @('<input className="cs-input" style={{ height: 34, textAlign: "center", borderColor: stockErrors[idx] ? "#EF4444" : undefined }} type="number" value={item.qty} onChange={e => updateItem(idx, "qty", Number(e.target.value))} />'); New = @('                    <LineCalcInput className="cs-input" style={{ height: 34, textAlign: "center", borderColor: stockErrors[idx] ? "#EF4444" : undefined }} value={lineDisplay(item, "qty")} locked={getLock(item) === "qty"} onChange={v => updateItem(idx, "qty", v)} onLock={() => toggleLineLock(idx, "qty")} />') },
      @{ Old = @('<input className="cs-input" style={{ height: 34, textAlign: "right" }} type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} />'); New = @('                    <LineCalcInput className="cs-input" style={{ height: 34, textAlign: "right" }} value={lineDisplay(item, "unit_price")} locked={getLock(item) === "rate"} onChange={v => updateItem(idx, "unit_price", v)} onLock={() => toggleLineLock(idx, "rate")} />') },
      @{ Old = @('<input className="cs-input cs-total" style={{ height: 34, textAlign: "right", fontWeight: 600 }} type="number" value={item.total} onChange={e => updateItem(idx, "total", Number(e.target.value))} />'); New = @('                    <LineCalcInput className="cs-input cs-total" style={{ height: 34, textAlign: "right", fontWeight: 600 }} value={lineDisplay(item, "total")} locked={getLock(item) === "total"} onChange={v => updateItem(idx, "total", v)} onLock={() => toggleLineLock(idx, "total")} />') }
    ) }
)

# ---- Stage everything in memory first ----
$staged = @()
foreach ($item in $plan) {
  $path = Join-Path $root $item.File
  if (-not (Test-Path -LiteralPath $path)) { throw "File not found: $($item.File)" }
  $f = Read-FileLines $path
  if ($f.Text.Contains("applyLineEdit")) {
    Write-Host "Already applied, nothing to do: $($item.File)" -ForegroundColor Yellow
    continue
  }
  $num = 0
  foreach ($e in $item.Edits) {
    $num++
    Apply-Edit $f.Lines ([string[]]$e.Old) ([string[]]$e.New) $item.File $num
  }
  $staged += @{ Path = $path; Rel = $item.File; Bom = $f.Bom; Nl = $f.Nl; Lines = $f.Lines }
}

# ---- New files ----
$libCode = @'
// Shared Qty / Rate / Total calculation for line items (Invoice, Bill, Cash Sale).
// Exactly one of the three fields is "locked" (auto-calculated) per line.
// Default lock is "total" (Total = Qty x Rate), which is the normal behaviour.
// Locked "qty"  -> Qty  = Total / Rate
// Locked "rate" -> Rate = Total / Qty
// Numbers stay in line.qty / line.unit_price / line.total (total is always a number).
// line.total_txt holds the raw text while the user types into an unlocked Total box.

export type CalcLock = "total" | "qty" | "rate"

const isBlank = (v: any) => v === "" || v === null || v === undefined
const r4 = (n: number) => Math.round(n * 10000) / 10000
const r2 = (n: number) => Math.round(n * 100) / 100
const r6 = (n: number) => Math.round(n * 1000000) / 1000000

export const getLock = (line: any): CalcLock => line?.calc_lock || "total"

// Recalculate the locked field from the other two.
export function recalcLine(line: any): any {
  const next = { ...line }
  const lock = getLock(next)
  const qBlank = isBlank(next.qty)
  const rBlank = isBlank(next.unit_price)
  const tBlank = next.total_txt !== undefined
    ? next.total_txt === ""
    : false

  if (lock === "total") {
    next.total = qBlank || rBlank ? 0 : Number(next.qty) * Number(next.unit_price)
    delete next.total_txt
  } else if (lock === "qty") {
    const rate = Number(next.unit_price)
    next.qty = rBlank || !rate || tBlank ? "" : Number(next.total) / rate
  } else {
    const qty = Number(next.qty)
    next.unit_price = qBlank || !qty || tBlank ? "" : Number(next.total) / qty
  }
  return next
}

// Apply a user edit to qty / unit_price / total, then recalculate the locked field.
export function applyLineEdit(line: any, field: "qty" | "unit_price" | "total", raw: any): any {
  if (getLock(line) === field) return line
  const next = { ...line }
  if (next.calc_shadow === field) delete next.calc_shadow
  if (field === "total") {
    next.total_txt = raw === "" || raw === null || raw === undefined ? "" : String(raw)
    next.total = next.total_txt === "" ? 0 : Number(next.total_txt) || 0
  } else {
    next[field] = raw === "" || raw === null || raw === undefined ? "" : Number(raw)
  }
  return recalcLine(next)
}

// Move the lock to another field (the field that becomes editable keeps what is on screen).
export function setLineLock(line: any, lock: CalcLock): any {
  const prev = getLock(line)
  if (prev === lock) return line
  const next = { ...line }
  if (prev === "total") {
    next.total_txt = isBlank(next.qty) || isBlank(next.unit_price) ? "" : String(r6(Number(next.total)))
  } else if (prev === "qty") {
    next.calc_shadow = "qty" // keep full precision, show rounded
  } else if (prev === "rate") {
    next.calc_shadow = "unit_price"
  }
  next.calc_lock = lock
  return recalcLine(next)
}

// What to show inside each box.
export function lineDisplay(line: any, field: "qty" | "unit_price" | "total"): string | number {
  const lock = getLock(line)
  if (field === "qty") {
    if (lock === "qty" || line.calc_shadow === "qty") return isBlank(line.qty) ? "" : r4(Number(line.qty))
    return line.qty ?? ""
  }
  if (field === "unit_price") {
    if (lock === "rate" || line.calc_shadow === "unit_price") return isBlank(line.unit_price) ? "" : r4(Number(line.unit_price))
    return line.unit_price ?? ""
  }
  if (lock === "total") {
    return isBlank(line.qty) || isBlank(line.unit_price) ? "" : r2(Number(line.total) || 0)
  }
  if (line.total_txt !== undefined) return line.total_txt
  return line.total ? line.total : ""
}
'@

$compCode = @'
"use client"
import { Lock, Unlock } from "lucide-react"
import type { CSSProperties } from "react"

type Props = {
  value: string | number
  onChange: (raw: string) => void
  locked: boolean
  onLock: () => void
  className?: string
  style?: CSSProperties
}

// Number box with a small lock icon. Locked = calculated automatically (read-only).
// Click the lock on an unlocked box to make that box the automatic one.
export default function LineCalcInput({ value, onChange, locked, onLock, className, style }: Props) {
  return (
    <div style={{ position: "relative", width: "100%", minWidth: 0 }}>
      <style href="lc-input-css" precedence="default">{`
        .lc-input::-webkit-outer-spin-button,
        .lc-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .lc-input { -moz-appearance: textfield; appearance: textfield; }
      `}</style>
      <input
        className={`${className || ""} lc-input`}
        style={{
          ...style,
          width: "100%",
          boxSizing: "border-box",
          paddingRight: 20,
          background: locked ? "var(--bg)" : undefined,
        }}
        type="number"
        step="any"
        value={value}
        readOnly={locked}
        onChange={e => onChange(e.target.value)}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={locked ? undefined : onLock}
        title={locked ? "Calculated automatically" : "Click to calculate this field automatically"}
        style={{
          position: "absolute",
          right: 3,
          top: "50%",
          transform: "translateY(-50%)",
          border: "none",
          background: "transparent",
          padding: 2,
          lineHeight: 0,
          cursor: locked ? "default" : "pointer",
          color: locked ? "var(--primary)" : "var(--text-muted)",
          opacity: locked ? 1 : 0.55,
        }}
      >
        {locked ? <Lock size={11} /> : <Unlock size={11} />}
      </button>
    </div>
  )
}
'@

$newFiles = @(
  @{ Rel = "src\lib\line-calc.ts"; Code = $libCode },
  @{ Rel = "src\components\LineCalcInput.tsx"; Code = $compCode }
)

# ---- Everything matched: backup then write ----
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
foreach ($s in $staged) {
  Copy-Item -LiteralPath $s.Path -Destination (Join-Path $backupDir (($s.Rel) -replace "[\\/]", "_")) -Force
  $body = [string]::Join($s.Nl, $s.Lines)
  $bytes = $utf8.GetBytes($body)
  if ($s.Bom) { $bytes = [byte[]](@(0xEF, 0xBB, 0xBF) + $bytes) }
  [System.IO.File]::WriteAllBytes($s.Path, $bytes)
  Write-Host "Patched: $($s.Rel)" -ForegroundColor Green
}
foreach ($nf in $newFiles) {
  $p = Join-Path $root $nf.Rel
  if (Test-Path -LiteralPath $p) { Copy-Item -LiteralPath $p -Destination (Join-Path $backupDir (($nf.Rel) -replace "[\\/]", "_")) -Force }
  [System.IO.File]::WriteAllText($p, $nf.Code + "`r`n", $utf8)
  Write-Host "Written: $($nf.Rel)" -ForegroundColor Green
}
Write-Host ""
Write-Host "Done. Backups are in: $backupDir" -ForegroundColor Cyan
Write-Host "Next: Remove-Item -Recurse -Force .next ; npm run dev   (test locally), then deploy." -ForegroundColor Cyan