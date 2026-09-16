# apply_fix.ps1
# Run from: C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend
#
# Fix: the Actions dropdown menu looked unprofessional because its card
# background color (var(--card)) is literally the same color as the table
# behind it (the Customers table wrapper also uses var(--card)) - so there
# was no visible card at all, just text floating on top of the table rows.
# Same root-cause pattern as the earlier button issue, just in a
# different component this time - confirmed by reading the actual color
# values, not a guess.
#
# Fix: give the dropdown a background one step lighter than the table
# (var(--card-hover)), a stronger visible border, and a deeper shadow so
# it reads as a proper floating card. Since the menu itself now uses
# var(--card-hover), the individual item hover-highlight is bumped to
# var(--border) so hovering a menu item is still visibly different from
# the menu's own background.

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

# 1. Make the dropdown card visibly distinct from the table behind it
$old1 = @'
        .row-actions-menu {
          z-index: 1000;
          min-width: 170px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
          padding: 4px;
          display: flex;
          flex-direction: column;
        }
'@
$new1 = @'
        .row-actions-menu {
          z-index: 1000;
          min-width: 180px;
          background: var(--card-hover);
          border: 1px solid var(--border-strong);
          border-radius: 10px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
'@
Replace-Unique $path $old1 $new1 "RowActionsMenu: dropdown card now visibly distinct from table"

# 2. Bump item hover highlight since the menu's own background moved up
$old2 = @'
        .row-actions-menu-item:hover:not(:disabled) {
          background: var(--card-hover);
        }
'@
$new2 = @'
        .row-actions-menu-item:hover:not(:disabled) {
          background: var(--border);
        }
'@
Replace-Unique $path $old2 $new2 "RowActionsMenu: item hover highlight kept visible against new menu background"

Write-Host ""
Write-Host "Applied. Next steps:"
Write-Host "  1. rmdir /s /q `".next`""
Write-Host "  2. npm run dev"
Write-Host "  3. Open the Actions menu on Customers - it should now look like a proper"
Write-Host "     floating card (visible border, deep shadow, lighter than the table),"
Write-Host "     with a clearly visible hover highlight per item."
Write-Host "  4. git add -A"
Write-Host "  5. git commit -m `"Fix: Actions dropdown menu looked unprofessional, blended into table`""
Write-Host "  6. git push"
Write-Host "  7. Paste the full Vercel build log back."
