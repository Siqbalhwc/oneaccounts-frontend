$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$path = "src\app\dashboard\reports\customer-ledger\page.tsx"

if (-not (Test-Path $path)) {
    Write-Host "ABORT: File not found: $path" -ForegroundColor Red
    return
}

$backupPath = "$path.bak_$(Get-Date -Format yyyyMMdd_HHmmss)"
Copy-Item -Path $path -Destination $backupPath
Write-Host "Backup created: $backupPath" -ForegroundColor Yellow

$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

$old = '.eq("source_type", "customer_opening")'
$new = '.in("source_type", ["customer_opening", "opening_balance"])'

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
if ($count -ne 1) {
    Write-Host "ABORT: found $count times (expected 1)." -ForegroundColor Red
    return
}

$newContent = $content.Replace($old, $new)
[System.IO.File]::WriteAllText($path, $newContent, $utf8NoBom)

Write-Host "FIXED (encoding-safe): $path" -ForegroundColor Green