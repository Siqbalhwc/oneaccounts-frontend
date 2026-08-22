$ErrorActionPreference = "Stop"
$path = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\dashboard\receipts\new\page.tsx"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = "$path.backup_$timestamp"
Copy-Item $path $backup
Write-Host "Backup saved: $backup"

$lines = [System.IO.File]::ReadAllLines($path)

# ---- Sanity checks BEFORE touching anything ----
$startIdx = 621   # line 622, 0-based
$endIdx   = 696   # line 697, 0-based

$startLineTrim = $lines[$startIdx].Trim()
$endLineTrim   = $lines[$endIdx].Trim()

if ($startLineTrim -ne "{customerId && !isDonation && (") {
    Write-Host "ABORT: Line 622 does not match expected content. Found: '$startLineTrim'" -ForegroundColor Red
    Write-Host "No changes made. Please tell Claude this exact message." -ForegroundColor Yellow
    exit
}
if ($endLineTrim -ne ")}") {
    Write-Host "ABORT: Line 697 does not match expected content. Found: '$endLineTrim'" -ForegroundColor Red
    Write-Host "No changes made. Please tell Claude this exact message." -ForegroundColor Yellow
    exit
}

$last7 = $lines[($lines.Count-7)..($lines.Count-1)] | ForEach-Object { $_.Trim() }
$expectedLast7 = @("</div>","</div>","</div>","</div>","</div>",")","}")
$diffFound = $false
for ($i=0; $i -lt 7; $i++) {
    if ($last7[$i] -ne $expectedLast7[$i]) { $diffFound = $true }
}
if ($diffFound) {
    Write-Host "ABORT: File ending does not match expected closing-tag pattern." -ForegroundColor Red
    Write-Host "Last 7 lines found (trimmed): $($last7 -join ' | ')" -ForegroundColor Red
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
# Last 7 lines of file (unaffected by removal, since they're after the block):
# </div>(attach-card) </div>(sidebar-col) </div>(header-grid) </div>(inv-shell) </div>(wrapper) ) }
# We insert after the header-grid-closing </div>, which is 5th-from-last.
$n = $newLines.Count
$insertAfterIdx = $n - 5

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