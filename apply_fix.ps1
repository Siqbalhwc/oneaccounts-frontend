$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

$file = "src\app\dashboard\reports\ap-aging\page.tsx"
$backup = "$file.backup_$timestamp"
Copy-Item -LiteralPath $file -Destination $backup
Write-Host "Backed up $file -> $backup"

$content = [System.IO.File]::ReadAllText((Resolve-Path $file), [System.Text.Encoding]::UTF8)

$oldLine = "          if (bal <= 0) return"
$newLine = "          if (bal === 0) return"

if ($content.Contains($oldLine)) {
    $content = $content.Replace($oldLine, $newLine)
    [System.IO.File]::WriteAllText((Resolve-Path $file), $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: $file updated (AP Aging now matches AR Aging's balance filter)"
} else {
    Write-Host "NOT FOUND: expected line not found in $file. No changes made. Please tell Claude."
}

Write-Host ""
Write-Host "Done. Next steps:"
Write-Host "1. rmdir /s /q .next"
Write-Host "2. git add -A"
Write-Host "3. git commit -m 'Fix AP Aging to include negative/credit balances, matching AR Aging'"
Write-Host "4. git push"
Write-Host "5. Paste back the full Vercel build log"