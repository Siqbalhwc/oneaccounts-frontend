$path = "src\app\dashboard\products\page.tsx"
$lines = Get-Content $path

$anchorIdx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq "qty_on_hand: number") { $anchorIdx = $i; break }
}

if ($anchorIdx -lt 0) {
    Write-Host "SAFETY CHECK FAILED: anchor not found. No changes made." -ForegroundColor Red
} else {
    Write-Host "Found anchor at line $($anchorIdx+1), inserting 'unit: string' after it."
    $before = $lines[0..$anchorIdx]
    $after = $lines[($anchorIdx+1)..($lines.Count - 1)]
    $result = $before + "  unit: string" + $after
    Set-Content -Path $path -Value $result
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}