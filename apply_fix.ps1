$ErrorActionPreference = "Stop"
$base = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$utf8 = New-Object System.Text.UTF8Encoding($true)

function Apply-Edit {
    param([string]$content, [string]$old, [string]$new, [string]$label)
    $contentNorm = $content -replace "`r`n", "`n"
    $oldNorm = $old -replace "`r`n", "`n"
    $newNorm = $new -replace "`r`n", "`n"
    if (-not $contentNorm.Contains($oldNorm)) {
        throw "Anchor not found for edit: $label"
    }
    return $contentNorm.Replace($oldNorm, $newNorm)
}

# ============ 1. ActionSlots.tsx - full overwrite (small file) ============
$actionSlotsPath = Join-Path $base "src\components\ActionSlots.tsx"
$actionSlotsContent = @'
"use client"

import RowActionsMenu, { RowAction } from "./RowActionsMenu"
import { ChevronRight } from "lucide-react"

/** A single fixed-position action (View / Edit / WhatsApp slot). */
export interface ActionSlotItem {
  icon: React.ReactNode
  title?: string
  color?: string
  onClick?: () => void
  /** Escape hatch for a slot that needs its own trigger (e.g. a component managing its own modal), same pattern as RowAction.render. */
  render?: () => React.ReactNode
}

interface ActionSlotsProps {
  /** 1st fixed slot - View / View Ledger. Omit (undefined) if this page never has this action. Pass null if the page has it but not this row. */
  slot1?: ActionSlotItem | null
  /** 2nd fixed slot - Edit. Omit (undefined) if this page never has this action. Pass null if the page has it but not this row. */
  slot2?: ActionSlotItem | null
  /** 3rd fixed slot - WhatsApp. Omit (undefined) if this page never has this action. Pass null if the page has it but not this row. */
  slot3?: ActionSlotItem | null
  /** Any remaining actions, shown behind a "more actions" overflow trigger. Empty/all-hidden = no trigger shown. */
  overflow?: RowAction[]
}

const SLOT_SIZE = 28

function Blank() {
  return <span style={{ display: "inline-block", width: SLOT_SIZE, height: SLOT_SIZE, flexShrink: 0 }} />
}

function Slot({ item }: { item?: ActionSlotItem | null }) {
  // undefined = this action type never applies on this page at all -> collapse, no reserved space
  if (item === undefined) return null
  // null = applies on this page, just not to this particular row -> reserve blank space for row alignment
  if (item === null) return <Blank />
  if (item.render) {
    return (
      <span style={{ display: "inline-flex", width: SLOT_SIZE, height: SLOT_SIZE, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {item.render()}
      </span>
    )
  }
  return (
    <button className="btn-icon" onClick={item.onClick} title={item.title} style={{ color: item.color, flexShrink: 0 }}>
      {item.icon}
    </button>
  )
}

/**
 * Standard action column for list-view pages: 3 fixed-width slots
 * (View / Edit / WhatsApp, by convention) that always occupy the same
 * position whether or not that action applies to a given row, plus an
 * overflow trigger for anything beyond the 3 - so rows stay aligned
 * column-to-column regardless of which actions are available per row.
 */
export default function ActionSlots({ slot1, slot2, slot3, overflow = [] }: ActionSlotsProps) {
  const visibleOverflow = overflow.filter(a => !a.hidden)
  return (
    <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
      <Slot item={slot1} />
      <Slot item={slot2} />
      <Slot item={slot3} />
      {visibleOverflow.length > 0 ? (
        <RowActionsMenu actions={visibleOverflow} variant="flat" triggerIcon={<ChevronRight size={14} />} />
      ) : (
        <Blank />
      )}
    </div>
  )
}
'@
[System.IO.File]::WriteAllText("$actionSlotsPath.new_$stamp", $actionSlotsContent, $utf8)

# ============ 2. RowActionsMenu.tsx - fix invisible overflow button ============
$ramPath = Join-Path $base "src\components\RowActionsMenu.tsx"
$ramContent = [System.IO.File]::ReadAllText($ramPath, [System.Text.Encoding]::UTF8)

$r1old = @'
        .row-actions-trigger-flat {
          width: 26px;
          height: 26px;
          background: transparent;
          border: 1.5px solid var(--border);
          color: var(--text-muted);
          box-shadow: none;
        }
'@
$r1new = @'
        .row-actions-trigger-flat {
          width: 26px;
          height: 26px;
          box-sizing: border-box;
          appearance: none;
          -webkit-appearance: none;
          background: transparent;
          border: 1.5px solid var(--border);
          color: var(--text-muted);
          box-shadow: none;
        }
'@
$ramContent = Apply-Edit $ramContent $r1old $r1new "RowActionsMenu: fix invisible flat trigger"

# ============ 3. Five one-line removals (page-level slots that should collapse) ============
$targets = @(
    @{ path = Join-Path $base "src\app\dashboard\invoices\page.tsx"; old = "                          slot2={null}`n"; label = "invoices" },
    @{ path = Join-Path $base "src\app\dashboard\bills\page.tsx"; old = "                          slot2={null}`n"; label = "bills" },
    @{ path = Join-Path $base "src\app\dashboard\banking\bank-accounts\page.tsx"; old = "                        slot1={null}`n"; label = "bank-accounts" },
    @{ path = Join-Path $base "src\app\dashboard\products\page.tsx"; old = "                          slot3={null}`n"; label = "products" },
    @{ path = Join-Path $base "src\app\dashboard\suppliers\page.tsx"; old = "                        slot3={null}`n"; label = "suppliers" }
)

$results = @{}
foreach ($t in $targets) {
    $c = [System.IO.File]::ReadAllText($t.path, [System.Text.Encoding]::UTF8)
    $results[$t.path] = Apply-Edit $c $t.old "" $t.label
}

# ============ ALL EDITS SUCCEEDED - BACKUP THEN WRITE ============
Copy-Item $ramPath "$ramPath.bak_$stamp"
foreach ($t in $targets) {
    Copy-Item $t.path "$($t.path).bak_$stamp"
}

Remove-Item $actionSlotsPath -ErrorAction SilentlyContinue
Rename-Item "$actionSlotsPath.new_$stamp" "ActionSlots.tsx"
[System.IO.File]::WriteAllText($ramPath, $ramContent, $utf8)
foreach ($t in $targets) {
    [System.IO.File]::WriteAllText($t.path, $results[$t.path], $utf8)
}

Write-Host "SUCCESS: overflow-button visibility fixed, page-level blank slots now collapse. Backups saved with suffix .bak_$stamp"