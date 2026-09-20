$full = (Resolve-Path -LiteralPath "src\app\dashboard\cash-sales\new\page.tsx").Path
$lines = [System.IO.File]::ReadAllLines($full)
$idx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i].Trim() -eq "{savedSaleNo && (") { $idx = $i; break }
}
if ($idx -lt 0) { Write-Host "ANCHOR NOT FOUND - no change made"; exit 1 }
$ok = ($lines[$idx + 2] -like "*>Done</button>*") -and ($lines[$idx + 4].Trim() -eq ")}")
if (-not $ok) { Write-Host "Block does not look as expected - no change made"; exit 1 }
$new = @()
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($i -lt $idx -or $i -gt ($idx + 4)) { $new += $lines[$i] }
}
[System.IO.File]::WriteAllLines($full, $new, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Removed Done button block."