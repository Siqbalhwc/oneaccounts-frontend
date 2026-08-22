$ErrorActionPreference = "Stop"
$path = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\dashboard\settings\projects\page.tsx"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = "$path.backup_$timestamp"
Copy-Item $path $backup
Write-Host "Backup saved: $backup"

$lines = [System.IO.File]::ReadAllLines($path)

$startIdx = 925  # 0-based, real line 926: <div>
$endIdx   = 931  # 0-based, real line 932: </div>

$startTrim = $lines[$startIdx].Trim()
$labelTrim = $lines[$startIdx+1].Trim()
$endTrim   = $lines[$endIdx].Trim()

if ($startTrim -ne "<div>") {
    Write-Host "ABORT: Line $($startIdx+1) is not '<div>'. Found: '$startTrim'" -ForegroundColor Red
    exit
}
if ($labelTrim -ne '<label className="pr-field-label">{labels.donor}</label>') {
    Write-Host "ABORT: Line $($startIdx+2) does not match expected label line. Found: '$labelTrim'" -ForegroundColor Red
    exit
}
if ($endTrim -ne "</div>") {
    Write-Host "ABORT: Line $($endIdx+1) is not '</div>'. Found: '$endTrim'" -ForegroundColor Red
    exit
}

Write-Host "All sanity checks passed." -ForegroundColor Green

$block = $lines[$startIdx..$endIdx]
$indentedBlock = $block | ForEach-Object { "  " + $_ }

$newBlock = @("                  {businessType !== 'construction' && (") + $indentedBlock + @("                  )}")

$before = $lines[0..($startIdx-1)]
$after  = $lines[($endIdx+1)..($lines.Count-1)]
$finalLines = $before + $newBlock + $after

[System.IO.File]::WriteAllLines($path, $finalLines, [System.Text.Encoding]::UTF8)
Write-Host "SUCCESS: Donor field wrapped for Construction-only hide. NGO path untouched." -ForegroundColor Green
Write-Host "Line count before: $($lines.Count)  |  after: $($finalLines.Count)" -ForegroundColor Cyan