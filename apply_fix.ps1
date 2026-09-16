# apply_fix.ps1
# Run from: C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend
#
# Fix: Customers list page "Actions" button (the kebab/dots menu trigger)
# was invisible because its background color (var(--card)) was the exact
# same color as the table row it sits inside, in every theme - so only a
# faint border and a small icon were ever going to show. Last commit fixed
# the icon size but never touched the colors, which is why it's still
# hard to see.
#
# This gives the button a background that's deliberately different from
# its row (var(--card-hover)), a stronger border, a subtle shadow, and a
# clear primary-colored hover state - so it reads as its own button
# instead of blending into the row. Pure CSS, one shared component
# (RowActionsMenu.tsx), no logic touched. Currently only used on the
# Customers page, so that's the only page affected today.

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

$old = @'
        .row-actions-trigger {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--card);
          color: var(--text);
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .row-actions-trigger:hover {
          background: var(--card-hover);
          border-color: var(--primary);
        }
'@
$new = @'
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
Replace-Unique $path $old $new "RowActionsMenu: fix invisible Actions button colors"

Write-Host ""
Write-Host "Applied. Next steps:"
Write-Host "  1. rmdir /s /q `".next`""
Write-Host "  2. npm run dev"
Write-Host "  3. Check the Customers list page Actions column in all your themes"
Write-Host "     (light, dark, oneaccounts) - button should now clearly stand out"
Write-Host "     from the row, and turn solid-color on hover."
Write-Host "  4. git add -A"
Write-Host "  5. git commit -m `"Fix: Actions button invisible against row background`""
Write-Host "  6. git push"
Write-Host "  7. Paste the full Vercel build log back before this is marked closed."
