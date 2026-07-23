$path = "src\app\dashboard\payments\new\page.tsx"
$content = Get-Content $path -Raw

$old = @'
                          <td style={{ textAlign: "right", fontWeight: 600 }}>
                            PKR {supplierOpeningBalance.toLocaleString()}
                          </td>
'@

$new = @'
                          <td style={{ textAlign: "right" }}>
                            <input className="alloc-input" type="number" min="0" max={supplierOpeningBalance} value={openingNet} onChange={e => updateOpeningAllocation(parseFloat(e.target.value) || 0)} />
                          </td>
'@

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
if ($count -ne 1) {
    Write-Host "SAFETY CHECK FAILED: expected 1 match, found $count. No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old, $new)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}