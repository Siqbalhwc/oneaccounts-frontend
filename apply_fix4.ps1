$ErrorActionPreference = "Stop"
$path = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\dashboard\settings\investor-capital\page.tsx"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = "$path.backup_$timestamp"
Copy-Item $path $backup
Write-Host "Backup saved: $backup"

$lines = [System.IO.File]::ReadAllLines($path)

$idx = 278  # 0-based, real line 279
$trimmed = $lines[$idx].Trim()

if ($trimmed -ne ".inv-shell { max-width: 900px; margin: 0 auto; }") {
    Write-Host "ABORT: Line 279 does not match expected content. Found: '$trimmed'" -ForegroundColor Red
    exit
}

$lines[$idx] = "        .inv-shell { max-width: 100%; margin: 0; }"

[System.IO.File]::WriteAllLines($path, $lines, [System.Text.Encoding]::UTF8)
Write-Host "SUCCESS: Investor Capital page expanded to full width." -ForegroundColor Green