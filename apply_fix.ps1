$path = "src\app\dashboard\bills\[id]\page.tsx"
$lines = Get-Content -LiteralPath $path

$idx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq 'key={att.id}') { $idx = $i; break }
}

if ($idx -lt 1) {
    Write-Host "SAFETY CHECK FAILED: anchor line not found. No changes made." -ForegroundColor Red
} else {
    $prevTrim = $lines[$idx - 1].Trim()
    if ($prevTrim -ne "") {
        Write-Host "SAFETY CHECK FAILED: expected an empty line before 'key={att.id}', found: '$prevTrim'. No changes made." -ForegroundColor Red
    } else {
        Write-Host "Found the gap at line $($idx). Inserting the missing opening tag."
        $lines[$idx - 1] = '              <a'
        Set-Content -LiteralPath $path -Value $lines
        Write-Host "SUCCESS: file updated." -ForegroundColor Green
    }
}