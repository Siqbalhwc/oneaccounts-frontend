$path = "src\app\dashboard\settings\projects\page.tsx"
$backup = "$path.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
[System.IO.File]::Copy($path, $backup)
Write-Host "Backup created: $backup"

$lines = [System.IO.File]::ReadAllLines($path)

Write-Host "--- BEFORE ---"
Write-Host "754: $($lines[753])"

$lines[753] = '                    <div key={i} style={{ fontSize: 11, color: "#B91C1C", marginBottom: 2 }}>- {err}</div>'

[System.IO.File]::WriteAllLines($path, $lines, [System.Text.Encoding]::UTF8)
Write-Host "--- SUCCESS: Fixed corrupted bullet character on line 754 ---"