$path = "src\app\dashboard\reports\budget-vs-actual\page.tsx"
$backup = "$path.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
[System.IO.File]::Copy($path, $backup)
Write-Host "Backup created: $backup"

$lines = [System.IO.File]::ReadAllLines($path)

# Lines are 0-indexed in the array, so line 333 in findstr/Get-Content (1-indexed) = index 332
Write-Host "Current line 333: $($lines[332])"
Write-Host "Current line 334: $($lines[333])"

$lines[332] = '                          <td style={{ ...tdStyle, textAlign: "left", color: "var(--text-muted)" }}>{locName}</td>'
$lines[333] = '                          <td style={{ ...tdStyle, textAlign: "left", fontFamily: "monospace" }}>{acc?.code} - {acc?.name}</td>'

[System.IO.File]::WriteAllLines($path, $lines, [System.Text.Encoding]::UTF8)
Write-Host "SUCCESS: Replaced lines 333-334 by position"