$path = "src\app\dashboard\receipts\new\page.tsx"
$lines = Get-Content $path

$idx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq 'setInvoices(stillDue)') { $idx = $i; break }
}

if ($idx -lt 0) {
    Write-Host "SAFETY CHECK FAILED: anchor 'setInvoices(stillDue)' not found. No changes made." -ForegroundColor Red
} else {
    Write-Host "Found anchor at line $($idx+1). Inserting calculation before it."
    $newLines = @(
        '      const dueFromInvoices = stillDue.reduce((s, inv) => s + Math.max(0, (inv.total || 0) - (inv.paid || 0)), 0)',
        '      setCustomerOpeningBalance(Math.max(0, (selectedCustomer?.balance || 0) - dueFromInvoices))'
    )
    $before = $lines[0..($idx - 1)]
    $after = $lines[$idx..($lines.Count - 1)]
    $result = $before + $newLines + $after
    Set-Content -Path $path -Value $result
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}