# apply_fix.ps1
# Run from: C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend
#
# Your instinct about the scrollbar theme setting was a good lead - it
# pointed at the right CATEGORY of problem, even if not the exact
# mechanism. Native browser/OS theming (Windows High Contrast mode, or a
# browser's "force dark mode for web content" setting) overrides BOTH
# scrollbars AND native <button> elements at the same time, ignoring the
# page's own CSS for those controls. That's exactly the kind of setting
# you'd touch while tuning scrollbar colors, and it would explain why the
# background/color changes had no visible effect no matter what I set
# them to - the browser was never applying them in the first place.
#
# Fix: explicitly tell the browser "don't use your native styling on this
# button, use my CSS instead" via appearance: none. This is the standard,
# well-known fix for exactly this class of problem.

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
'@
$new = @'
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
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
        }
'@
Replace-Unique $path $old $new "RowActionsMenu: force CSS to override native button styling"

Write-Host ""
Write-Host "Applied. Next steps:"
Write-Host "  1. rmdir /s /q `".next`""
Write-Host "  2. npm run dev"
Write-Host "  3. Check the Customers list Actions button again."
Write-Host "  4. If it STILL looks unchanged even locally, that would tell us this is"
Write-Host "     coming from an OS/browser-level setting (Windows High Contrast mode,"
Write-Host "     or a Chrome accessibility/dark-mode override), not the app's own CSS"
Write-Host "     at all - worth checking Windows Settings > Ease of Access > High"
Write-Host "     Contrast, and Chrome's own site settings for this page."
Write-Host "  5. git add -A"
Write-Host "  6. git commit -m `"Fix: force appearance:none on Actions button`""
Write-Host "  7. git push"
Write-Host "  8. Paste the full Vercel build log back."
