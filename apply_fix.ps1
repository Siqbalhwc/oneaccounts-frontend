# apply_fix.ps1
# Run from: C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend
#
# Fix: clicking "Link" in the Customers Actions menu did nothing.
#
# Root cause (confirmed by reading the code, not a guess): the dropdown
# menu was built to auto-close itself the instant anything inside it is
# clicked. "Link" needs to open its own popup instead of just completing
# an action - but that popup lives inside the same dropdown, so the
# auto-close tore the whole dropdown down (popup included) in the same
# instant it tried to open. This is a pre-existing bug in the shared menu
# component, unrelated to the recent button-color changes.
#
# Fix: stop auto-closing specifically for actions that render their own
# popup (like Link). Plain actions (View Ledger, Edit, Archive, etc.)
# still close the menu on click exactly as before - only this one
# category changes.

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

$old = '                <div key={a.key} className="row-actions-menu-custom" onClick={() => setOpen(false)}>'
$new = '                <div key={a.key} className="row-actions-menu-custom">'
Replace-Unique $path $old $new "RowActionsMenu: stop auto-closing on Link/render-type actions"

Write-Host ""
Write-Host "Applied. Next steps:"
Write-Host "  1. rmdir /s /q `".next`""
Write-Host "  2. npm run dev"
Write-Host "  3. On Customers list, click the Actions button on a row, then click Link -"
Write-Host "     the possible-match popup should now open correctly."
Write-Host "  4. git add -A"
Write-Host "  5. git commit -m `"Fix: Link popup not opening from Actions menu`""
Write-Host "  6. git push"
Write-Host "  7. Paste the full Vercel build log back."
Write-Host ""
Write-Host "One more thing - I have NOT yet seen a Vercel build log for the last"
Write-Host "few fixes (button color, chevron redesign). Please paste those in too"
Write-Host "if you have them, or let me know if any of those deploys actually failed -"
Write-Host "that would also explain why the button itself still looked unchanged."
