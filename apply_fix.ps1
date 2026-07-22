$path = "src\app\dashboard\receipts\new\page.tsx"
$content = Get-Content $path -Raw

$old = @'
                    {customerOpeningBalance > 0 && (
                      <tr style={{ background: "var(--bg-soft)" }}>
                        <td>
                          <input className="chk-box" type="checkbox"
                            checked={(allocations["opening"] || 0) > 0}
                            onChange={toggleOpeningAllocation}
                          />
                        </td>
                        <td colSpan={4}>
                          <span style={{ fontWeight: 600 }}>Opening Balance</span>
                          <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)" }}>
                            (PKR {customerOpeningBalance.toLocaleString()})
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <input className="alloc-input" type="number" min="0" max={customerOpeningBalance} value={allocations["opening"] || 0} onChange={e => updateOpeningAllocation(parseFloat(e.target.value) || 0)} />
                        </td>
                      </tr>
                    )}
'@

$new = @'
    {customerOpeningBalance > 0 && (
                      <tr style={{ background: "var(--bg-soft)" }}>
                        <td>
                          <input className="chk-box" type="checkbox"
                            checked={(allocations["opening"] || 0) > 0}
                            onChange={toggleOpeningAllocation}
                          />
                        </td>
                        <td>Opening Balance</td>
                        <td>{customerOpeningTotal.toLocaleString()}</td>
                        <td>{customerOpeningPaid.toLocaleString()}</td>
                        <td style={{ fontWeight: 600 }}>{customerOpeningBalance.toLocaleString()}</td>
                        <td style={{ textAlign: "right" }}>
                          <input className="alloc-input" type="number" min="0" max={customerOpeningBalance} value={allocations["opening"] || 0} onChange={e => updateOpeningAllocation(parseFloat(e.target.value) || 0)} />
                        </td>
                      </tr>
                    )}
'@

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
if ($count -ne 1) {
    Write-Host "SAFETY CHECK FAILED: expected 1 match, found $count. No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old, $new)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}