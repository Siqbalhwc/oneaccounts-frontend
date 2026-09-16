# apply_fix.ps1
# Run from: C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend
#
# The previous fix (var(--card-hover) background) WAS correctly deployed
# (confirmed via git log) but still wasn't visible enough per your
# screenshot - the subtle-contrast approach just isn't reliable here.
#
# This one stops depending on subtle contrast entirely: solid brand
# primary-color background (always a bold, distinct color, can't blend
# into any row in any theme), white icon on top, and the three-dot icon
# is replaced with a down-arrow (chevron) - clearer "tap for actions"
# affordance, per your suggestion.

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

$path = "src\components\RowActionsMenu.tsx"
Backup-File $path

# 1. Swap the icon import: three dots -> down-chevron
$old1 = 'import { MoreVertical } from "lucide-react"'
$new1 = 'import { ChevronDown } from "lucide-react"'
Replace-Unique $path $old1 $new1 "RowActionsMenu: import ChevronDown instead of MoreVertical"

# 2. Swap the icon usage
$old2 = '        <MoreVertical size={18} strokeWidth={2.5} />'
$new2 = '        <ChevronDown size={18} strokeWidth={2.5} />'
Replace-Unique $path $old2 $new2 "RowActionsMenu: use ChevronDown icon"

# 3. Solid, unmistakable button styling
$old3 = @'
        .row-actions-trigger {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          padding: 0;
          border: 1px solid var(--border-strong);
          border-radius: 6px;
          background: var(--card-hover);
          color: var(--text);
          box-shadow: 0 1px 2px rgba(0,0,0,0.08);
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .row-actions-trigger:hover {
          background: var(--primary);
          border-color: var(--primary);
          color: var(--primary-text);
        }
'@
$new3 = @'
        .row-actions-trigger {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          padding: 0;
          border: none;
          border-radius: 6px;
          background: var(--primary);
          color: var(--primary-text);
          box-shadow: 0 1px 3px rgba(0,0,0,0.25);
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
        }
        .row-actions-trigger:hover {
          background: var(--primary-hover);
          transform: translateY(-1px);
        }
        .row-actions-trigger:active {
          transform: translateY(0);
        }
'@
Replace-Unique $path $old3 $new3 "RowActionsMenu: solid primary-color button, no subtle contrast"

Write-Host ""
Write-Host "Applied. Next steps:"
Write-Host "  1. rmdir /s /q `".next`""
Write-Host "  2. npm run dev"
Write-Host "  3. Check the Customers list page Actions column - should now be a solid"
Write-Host "     colored button with a clear white down-arrow, unmistakable in any theme."
Write-Host "  4. git add -A"
Write-Host "  5. git commit -m `"Redesign: Actions button as solid-color chevron, not subtle box`""
Write-Host "  6. git push"
Write-Host "  7. Paste the full Vercel build log back, AND do a hard refresh"
Write-Host "     (Ctrl+Shift+R) on the live site before checking - to rule out any"
Write-Host "     stale browser cache on the previous attempt."