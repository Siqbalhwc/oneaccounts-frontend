$path = "src\app\dashboard\invoices\new\page.tsx"
$content = Get-Content $path -Raw

$old = '                          <div className="inv-cell inv-cell-total">PKR {item.total.toLocaleString()}</div>'

$new = '                          <input className="inv-input" style={{ height: 32, fontSize: 12, textAlign: "right", fontWeight: 600 }} type="number" value={item.total} onChange={e => updateItem(idx, "total", Number(e.target.value))} />'

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
if ($count -ne 1) {
    Write-Host "SAFETY CHECK FAILED: expected 1 match, found $count. No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old, $new)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}