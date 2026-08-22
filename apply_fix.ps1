$ErrorActionPreference = "Stop"
$path = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\dashboard\payments\new\page.tsx"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = "$path.backup_$timestamp"
Copy-Item $path $backup
Write-Host "Backup saved: $backup"

$lines = [System.IO.File]::ReadAllLines($path)

# ---- Sanity checks BEFORE touching anything ----
$startIdx = 640   # line 641, 0-based
$endIdx   = 749   # line 750, 0-based

$startLineTrim = $lines[$startIdx].Trim()
$endLineTrim   = $lines[$endIdx].Trim()

if ($startLineTrim -ne "{supplierId && !isDonation && (") {
    Write-Host "ABORT: Line 641 does not match expected content. Found: '$startLineTrim'" -ForegroundColor Red
    Write-Host "No changes made. Please tell Claude this exact message." -ForegroundColor Yellow
    exit
}
if ($endLineTrim -ne ")}") {
    Write-Host "ABORT: Line 750 does not match expected content. Found: '$endLineTrim'" -ForegroundColor Red
    Write-Host "No changes made. Please tell Claude this exact message." -ForegroundColor Yellow
    exit
}

$last6 = $lines[($lines.Count-6)..($lines.Count-1)] | ForEach-Object { $_.Trim() }
$expectedLast6 = @("</div>","</div>","</div>","</div>",")","}")
$diffFound = $false
for ($i=0; $i -lt 6; $i++) {
    if ($last6[$i] -ne $expectedLast6[$i]) { $diffFound = $true }
}
if ($diffFound) {
    Write-Host "ABORT: File ending does not match expected closing-tag pattern." -ForegroundColor Red
    Write-Host "Last 6 lines found (trimmed): $($last6 -join ' | ')" -ForegroundColor Red
    Write-Host "No changes made. Please tell Claude this exact message." -ForegroundColor Yellow
    exit
}

Write-Host "All sanity checks passed. Proceeding with cut and reinsert." -ForegroundColor Green

# ---- Extract the block ----
$block = $lines[$startIdx..$endIdx]

# ---- Build new array with block removed ----
$before = $lines[0..($startIdx-1)]
$after  = $lines[($endIdx+1)..($lines.Count-1)]
$newLines = $before + $after

# ---- Find insertion point: right after the line that closes header-grid ----
# This is now the 5th-from-last line (index Count-5) in $newLines,
# since the block removal shifted everything after it up, but the
# LAST 6 lines of the file are untouched by the removal (they were after it).
$n = $newLines.Count
$insertAfterIdx = $n - 5   # the "</div>" that closes header-grid

$checkLine = $newLines[$insertAfterIdx].Trim()
if ($checkLine -ne "</div>") {
    Write-Host "ABORT: Insertion anchor line is not '</div>' as expected. Found: '$checkLine'" -ForegroundColor Red
    Write-Host "No changes made (in-memory only, original file untouched). Please tell Claude." -ForegroundColor Yellow
    exit
}

$finalLines = $newLines[0..$insertAfterIdx] + $block + $newLines[($insertAfterIdx+1)..($newLines.Count-1)]

[System.IO.File]::WriteAllLines($path, $finalLines, [System.Text.Encoding]::UTF8)

Write-Host "SUCCESS: Block moved. File written." -ForegroundColor Green
Write-Host "Line count before: $($lines.Count)  |  after: $($finalLines.Count)" -ForegroundColor Cyan