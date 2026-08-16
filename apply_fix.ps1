$path = "src\app\dashboard\settings\budgets\page.tsx"
$backup = "$path.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
[System.IO.File]::Copy($path, $backup)
Write-Host "Backup created: $backup"

$lines = [System.IO.File]::ReadAllLines($path)

Write-Host "--- BEFORE ---"
Write-Host "1164: $($lines[1163])"

$lines[1163] = '                        {m}{isMonthLocked(i) ? " (locked)" : ""}'

[System.IO.File]::WriteAllLines($path, $lines, [System.Text.Encoding]::UTF8)
Write-Host "--- SUCCESS: Fixed corrupted lock emoji on line 1164 ---"