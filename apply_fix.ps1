$ErrorActionPreference = "Stop"
$path = "src\app\dashboard\products\page.tsx"
$backup = "$path.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

Copy-Item $path $backup
Write-Host "Backup created: $backup"

$content = [System.IO.File]::ReadAllText($path)
$normalized = $content -replace "`r`n", "`n"

$old = @'
                          {(costBreakdown[prod.id] || []).length > 0 && (() => {
                            const rows = costBreakdown[prod.id] || []
                            const totalQty = rows.reduce((s: number, r: any) => s + Number(r.qty || 0), 0)
                            const totalValue = rows.reduce((s: number, r: any) => s + Number(r.qty || 0) * Number(r.unit_price || 0), 0)
                            const finalAvg = totalQty > 0 ? totalValue / totalQty : 0
                            const formula = rows.map((r: any) => "(" + Number(r.qty) + " x " + Number(r.unit_price).toFixed(2) + ")").join(" + ")
                            return (
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)", fontSize: 12 }}>
                                <div>{formula} = {totalValue.toFixed(2)}</div>
                                <div>{totalValue.toFixed(2)} / {totalQty} = <b>{finalAvg.toFixed(2)}</b></div>
                              </div>
                            )
                          })()}
'@

$new = @'
                          {(costBreakdown[prod.id] || []).length > 0 && (() => {
                            const rows = costBreakdown[prod.id] || []
                            const lastRow = rows[rows.length - 1]
                            const finalAvg = Number(lastRow?.running_avg_cost || 0)
                            const finalQty = Number(lastRow?.running_qty || 0)
                            return (
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)", fontSize: 12 }}>
                                <div>Current Average Cost (as of last recorded event, {finalQty} units): <b>{finalAvg.toFixed(2)}</b></div>
                              </div>
                            )
                          })()}
'@

$oldN = $old -replace "`r`n", "`n"
$newN = $new -replace "`r`n", "`n"

if ($normalized.Contains($oldN)) {
    $normalized = $normalized.Replace($oldN, $newN)
    $final = $normalized -replace "`n", "`r`n"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, $final, $utf8NoBom)
    Write-Host "SUCCESS: Average cost display block updated."
} else {
    Write-Host "NOT FOUND: anchor block did not match. No changes made. Check backup, nothing was altered."
}