$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$path = "src\app\dashboard\suppliers\new\page.tsx"

if (-not (Test-Path $path)) {
    Write-Host "ABORT: File not found: $path" -ForegroundColor Red
    return
}

$backupPath = "$path.bak_$(Get-Date -Format yyyyMMdd_HHmmss)"
Copy-Item -Path $path -Destination $backupPath
Write-Host "Backup created: $backupPath" -ForegroundColor Yellow

$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$lines = $content -split "`r`n"

$targetLine = 'country_code: countryCode,'
$matchIndexes = @()
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq $targetLine) { $matchIndexes += $i }
}

if ($matchIndexes.Count -ne 1) {
    Write-Host "ABORT: found $($matchIndexes.Count) times (expected 1)." -ForegroundColor Red
    return
}

$idx = $matchIndexes[0]
$before = if ($idx -gt 0) { $lines[0..($idx - 1)] } else { @() }
$after = if ($idx -lt ($lines.Count - 1)) { $lines[($idx + 1)..($lines.Count - 1)] } else { @() }
$newLines = $before + $after

[System.IO.File]::WriteAllText($path, ($newLines -join "`r`n"), $utf8NoBom)
Write-Host "FIXED (encoding-safe): $path - removed line $($idx + 1)" -ForegroundColor Green