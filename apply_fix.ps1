$file = "src\app\dashboard\products\page.tsx"
$content = [System.IO.File]::ReadAllText($file)

$old = @"
                              <tbody>
                                {(costBreakdown[prod.id] || []).map((row: any, idx: number) => (
                                  <tr key={idx}>
                                    <td style={{ padding: "4px 8px" }}>{row.step_label}</td>
                                    <td style={{ padding: "4px 8px" }}>{row.step_date ? new Date(row.step_date).toLocaleDateString() : "-"}</td>
                                    <td style={{ padding: "4px 8px", textAlign: "right" }}>{row.qty}</td>
                                    <td style={{ padding: "4px 8px", textAlign: "right" }}>{row.unit_price}</td>
                                    <td style={{ padding: "4px 8px", textAlign: "right" }}>{row.running_qty}</td>
                                    <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600 }}>{row.running_avg_cost}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
"@

$new = @"
                              <tbody>
                                {(costBreakdown[prod.id] || []).map((row: any, idx: number) => (
                                  <tr key={idx}>
                                    <td style={{ padding: "4px 8px" }}>{row.step_label}</td>
                                    <td style={{ padding: "4px 8px" }}>{row.step_date ? new Date(row.step_date).toLocaleDateString() : "-"}</td>
                                    <td style={{ padding: "4px 8px", textAlign: "right" }}>{row.qty}</td>
                                    <td style={{ padding: "4px 8px", textAlign: "right" }}>{row.unit_price}</td>
                                    <td style={{ padding: "4px 8px", textAlign: "right" }}>{row.running_qty}</td>
                                    <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600 }}>{row.running_avg_cost}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {(costBreakdown[prod.id] || []).length > 0 && (() => {
                            const rows = costBreakdown[prod.id] || []
                            const totalQty = rows.reduce((s: number, r: any) => s + Number(r.qty || 0), 0)
                            const totalValue = rows.reduce((s: number, r: any) => s + Number(r.qty || 0) * Number(r.unit_price || 0), 0)
                            const finalAvg = totalQty > 0 ? totalValue / totalQty : 0
                            const formula = rows.map((r: any) => `(`+Number(r.qty)+` x `+Number(r.unit_price).toFixed(2)+`)`).join(' + ')
                            return (
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)", fontSize: 12 }}>
                                <div>{formula} = {totalValue.toFixed(2)}</div>
                                <div>{totalValue.toFixed(2)} / {totalQty} = <b>{finalAvg.toFixed(2)}</b></div>
                              </div>
                            )
                          })()}
"@

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    Write-Host "Formula summary added."
} else {
    Write-Host "Anchor NOT found - no change made."
}

[System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)