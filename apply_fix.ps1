$ErrorActionPreference = "Stop"

function Apply-Fix {
    param($FilePath, $Old, $New, $Label)
    $content = [System.IO.File]::ReadAllText((Resolve-Path $FilePath).Path, [System.Text.Encoding]::UTF8)
    $count = ([regex]::Matches($content, [regex]::Escape($Old))).Count
    if ($count -eq 0) {
        Write-Host "SKIPPED (not found -- may already be applied): $Label" -ForegroundColor Yellow
        return $content
    }
    if ($count -gt 1) {
        throw "ABORT: anchor for [$Label] found $count times in $FilePath -- expected exactly 1. Not safe to patch automatically."
    }
    $newContent = $content.Replace($Old, $New)
    [System.IO.File]::WriteAllText((Resolve-Path $FilePath).Path, $newContent, [System.Text.UTF8Encoding]::new($true))
    Write-Host "Applied: $Label" -ForegroundColor Green
    return $newContent
}

# ============ src\app\dashboard\products\page.tsx ============
$file = "src\app\dashboard\products\page.tsx"
$backup = "$file.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
Copy-Item $file $backup
Write-Host "Backup saved: $backup"

$p1Old1 = @'
    </th>
  )

  if (roleLoading || !role) {
'@
$p1New1 = @'
    </th>
  )

  // Shared "average cost working" panel content, used by both the desktop
  // table's expandable row and the mobile card's expandable section.
  const renderCostBreakdown = (prod: Product) => (
    <>
      {breakdownLoading[prod.id] ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading...</div>
      ) : (costBreakdown[prod.id] || []).length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No opening balance or purchases recorded yet.</div>
      ) : (
        <table style={{ width: "100%", minWidth: 460, fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--text-muted)" }}>Step</th>
              <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--text-muted)" }}>Date</th>
              <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--text-muted)" }}>Qty</th>
              <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--text-muted)" }}>Price</th>
              <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--text-muted)" }}>Running Qty</th>
              <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--text-muted)" }}>Running Avg Cost</th>
            </tr>
          </thead>
          <tbody>
            {(costBreakdown[prod.id] || []).map((row: any, idx: number) => (
              <tr key={idx}>
                <td style={{ padding: "4px 8px" }}>{row.step_label}</td>
                <td style={{ padding: "4px 8px" }}>{row.step_date ? new Date(row.step_date).toLocaleDateString() : "-"}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtQty(row.qty)}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtQty(row.unit_price)}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtQty(row.running_qty)}</td>
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
        const formula = rows.map((r: any) => "(" + fmtQty(r.qty) + " x " + Number(r.unit_price).toFixed(2) + ")").join(" + ")
        return (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)", fontSize: 12 }}>
            <div>{formula} = {totalValue.toFixed(2)}</div>
            <div>{totalValue.toFixed(2)} / {fmtQty(totalQty)} = <b>{finalAvg.toFixed(2)}</b></div>
            <div style={{ marginTop: 4, color: "var(--text-muted)" }}>Current Average Cost (as of last recorded event, {fmtQty(totalQty)} units): <b>{finalAvg.toFixed(2)}</b></div>
          </div>
        )
      })()}
    </>
  )

  if (roleLoading || !role) {
'@
Apply-Fix -FilePath $file -Old $p1Old1 -New $p1New1 -Label "H1: insert renderCostBreakdown helper function" | Out-Null

$p1Old2 = @'
          .filter-row .filter-group {
            width: 100%;
            justify-content: flex-end;
          }
        }
      `}</style>
'@
$p1New2 = @'
          .filter-row .filter-group {
            width: 100%;
            justify-content: flex-end;
          }
        }

        /* -- Mobile card list: hidden by default (desktop/tablet shows the table) -- */
        .prod-cards { display: none; flex-direction: column; gap: 10px; }
        .prod-card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 14px 16px; box-shadow: var(--shadow-sm);
        }
        .prod-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
        .prod-card-name { font-size: 15px; font-weight: 700; color: var(--text); line-height: 1.3; }
        .prod-card-code { font-size: 12px; font-weight: 600; color: var(--primary); margin-top: 2px; }
        .prod-card-closing { font-size: 15px; font-weight: 800; white-space: nowrap; text-align: right; }
        .prod-card-prices { display: flex; gap: 14px; font-size: 13px; color: var(--text-muted); margin-top: 8px; }
        .prod-card-prices b { color: var(--text); font-weight: 600; }
        .prod-card-flow { display: flex; gap: 14px; font-size: 12px; color: var(--text-muted); margin-top: 4px; }
        .prod-card-actions { display: flex; justify-content: flex-end; gap: 4px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
        .prod-card-empty { text-align: center; color: var(--text-muted); padding: 32px 16px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; }
        .prod-card-breakdown { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border); font-size: 12px; overflow-x: auto; }

        /* -- Below 640px: switch from horizontal-scroll table to stacked cards -- */
        @media (max-width: 640px) {
          .desktop-table { display: none; }
          .prod-cards { display: flex; }
        }
      `}</style>
'@
Apply-Fix -FilePath $file -Old $p1Old2 -New $p1New2 -Label "H2: mobile card CSS block" | Out-Null

$p1Old3 = @'
      {/* Table */}
      <div className="card" style={{ overflowX: "auto" }}>
'@
$p1New3 = @'
      {/* Table (desktop / tablet) */}
      <div className="card desktop-table" style={{ overflowX: "auto" }}>
'@
Apply-Fix -FilePath $file -Old $p1Old3 -New $p1New3 -Label "H3: mark table as desktop-only" | Out-Null

$p1Old4 = @'
                          {breakdownLoading[prod.id] ? (
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading...</div>
                          ) : (costBreakdown[prod.id] || []).length === 0 ? (
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No opening balance or purchases recorded yet.</div>
                          ) : (
                            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                              <thead>
                                <tr>
                                  <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--text-muted)" }}>Step</th>
                                  <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--text-muted)" }}>Date</th>
                                  <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--text-muted)" }}>Qty</th>
                                  <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--text-muted)" }}>Price</th>
                                  <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--text-muted)" }}>Running Qty</th>
                                  <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--text-muted)" }}>Running Avg Cost</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(costBreakdown[prod.id] || []).map((row: any, idx: number) => (
                                  <tr key={idx}>
                                    <td style={{ padding: "4px 8px" }}>{row.step_label}</td>
                                    <td style={{ padding: "4px 8px" }}>{row.step_date ? new Date(row.step_date).toLocaleDateString() : "-"}</td>
                                    <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtQty(row.qty)}</td>
                                    <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtQty(row.unit_price)}</td>
                                    <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtQty(row.running_qty)}</td>
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
                            const formula = rows.map((r: any) => "(" + fmtQty(r.qty) + " x " + Number(r.unit_price).toFixed(2) + ")").join(" + ")
                            return (
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)", fontSize: 12 }}>
                                <div>{formula} = {totalValue.toFixed(2)}</div>
                                <div>{totalValue.toFixed(2)} / {fmtQty(totalQty)} = <b>{finalAvg.toFixed(2)}</b></div>
                                <div style={{ marginTop: 4, color: "var(--text-muted)" }}>Current Average Cost (as of last recorded event, {fmtQty(totalQty)} units): <b>{finalAvg.toFixed(2)}</b></div>
                              </div>
                            )
                          })()}
'@
$p1New4 = @'
                          {renderCostBreakdown(prod)}
'@
Apply-Fix -FilePath $file -Old $p1Old4 -New $p1New4 -Label "H4: use shared renderCostBreakdown() in the table row" | Out-Null

$p1Old5 = @'
          </table>
        </div>
      </div>

      {total > pageSize && (
'@
$p1New5 = @'
          </table>
        </div>
      </div>

      {/* -- MOBILE: card list, shown instead of the table below 640px -- */}
      <div className="prod-cards">
        {loading ? (
          [1, 2, 3, 4].map(i => (
            <div className="prod-card" key={i}>
              <div style={{ width: "55%", height: 14, background: "var(--bg-soft)", borderRadius: 4, animation: "shimmer 1.5s ease-in-out infinite", marginBottom: 8 }} />
              <div style={{ width: "35%", height: 12, background: "var(--bg-soft)", borderRadius: 4, animation: "shimmer 1.5s ease-in-out infinite" }} />
            </div>
          ))
        ) : products.length === 0 ? (
          <div className="prod-card-empty">
            {isConstruction ? "No units/plots found. " : "No products found. "}
            {canEdit && (isConstruction ? "Add a unit/plot to get started." : "Add a product to get started.")}
          </div>
        ) : (
          products.map((prod) => {
            const closing = prod.qty_on_hand
            const productUnit = prod.unit || "PCS"
            return (
              <div key={prod.id} className="prod-card">
                <div className="prod-card-top">
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    {prod.image_path && (
                      <img src={prod.image_path} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                    )}
                    <div>
                      <div className="prod-card-name">{prod.name}</div>
                      <div className="prod-card-code">{prod.code}</div>
                    </div>
                  </div>
                  <div className="prod-card-closing">{fmtQty(closing)} {productUnit}</div>
                </div>
                <div className="prod-card-prices">
                  <span onClick={() => toggleCostBreakdown(prod.id)} style={{ cursor: "pointer", borderBottom: "1px dashed var(--text-muted)" }} title="Tap to see average cost working">
                    Cost: <b>PKR {prod.cost_price?.toLocaleString()}</b>
                  </span>
                  <span>Sale: <b>PKR {prod.sale_price?.toLocaleString()}</b></span>
                </div>
                {!isConstruction && (
                  <div className="prod-card-flow">
                    <span>Opening: {fmtQty(prod.opening_qty)}</span>
                    <span style={{ color: "#10B981" }}>In: {fmtQty(prod.total_inflow)}</span>
                    <span style={{ color: "#EF4444" }}>Out: {fmtQty(prod.total_outflow)}</span>
                  </div>
                )}
                {expandedCostId === prod.id && (
                  <div className="prod-card-breakdown">
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Average Cost Working</div>
                    {renderCostBreakdown(prod)}
                  </div>
                )}
                <div className="prod-card-actions">
                  <ActionSlots
                    slot1={{
                      icon: <Eye size={13} />,
                      title: "View Ledger",
                      onClick: () => router.push(`/dashboard/reports/product-ledger?productId=${prod.id}`),
                    }}
                    slot2={{
                      icon: <Edit size={13} />,
                      title: "Edit",
                      onClick: () => router.push(`/dashboard/products/new?id=${prod.id}`),
                    }}
                    overflow={[
                      {
                        key: "delete",
                        label: "Delete",
                        icon: <Trash2 size={14} />,
                        color: "#EF4444",
                        onClick: () => handleDelete(prod.id),
                      },
                    ]}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>

      {total > pageSize && (
'@
Apply-Fix -FilePath $file -Old $p1Old5 -New $p1New5 -Label "H5: insert mobile card list" | Out-Null

Write-Host "Done: src\app\dashboard\products\page.tsx" -ForegroundColor Cyan

# ============ src\app\dashboard\products\new\page.tsx ============
$file = "src\app\dashboard\products\new\page.tsx"
$backup = "$file.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
Copy-Item $file $backup
Write-Host "Backup saved: $backup"

$p2Old1 = @'
  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
'@
$p2New1 = @'
  return (
    <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
'@
Apply-Fix -FilePath $file -Old $p2Old1 -New $p2New1 -Label "H1: page-wrap class on outer div" | Out-Null

$p2Old2 = @'
        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }

        /* Summary side will jump above form on mobile */
        @media (max-width: 900px) {
          .header-grid { grid-template-columns: 1fr; }
          .summary-side { order: -1; }
        }
        @media (max-width: 600px) {
          .inline-group { grid-template-columns: 1fr; }
          .page-wrap { padding: 12px !important; }
        }
      `}</style>
'@
$p2New2 = @'
        .header-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }

        /* Mobile save bar: hidden on desktop, shown + sticky to bottom on mobile */
        .mobile-save-bar { display: none; }

        /* -- Mobile (<=900px): single column, form first, Save button moves to a
           sticky bottom bar instead of sitting above the form (previously used
           order: -1, which put Save before any fields were even visible) -- */
        @media (max-width: 900px) {
          .header-grid { grid-template-columns: 1fr; }
          .summary-side .desktop-save { display: none; }
          .mobile-save-bar {
            display: flex;
            position: sticky;
            bottom: 0;
            background: var(--card);
            border-top: 1px solid var(--border);
            padding: 10px 0;
            margin-top: 16px;
            z-index: 50;
          }
        }
        @media (max-width: 600px) {
          .inline-group { grid-template-columns: 1fr; }
          .page-wrap { padding: 12px !important; }
          .mobile-save-bar { margin-left: -12px; margin-right: -12px; padding: 10px 12px; }
          /* 16px stops iOS Safari auto-zooming the page when a field is tapped */
          .input, .select { font-size: 16px; }
        }
      `}</style>
'@
Apply-Fix -FilePath $file -Old $p2Old2 -New $p2New2 -Label "H2: mobile save-bar CSS" | Out-Null

$p2Old3 = @'
            <div className="card" style={{ padding: "16px" }}>
              <button className="btn btn-submit" type="submit" disabled={loading}>
                {loading ? "Saving..." : editId ? <><Save size={16} /> Update Product</> : <><Plus size={16} /> Create Product</>}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
'@
$p2New3 = @'
            <div className="card desktop-save" style={{ padding: "16px" }}>
              <button className="btn btn-submit" type="submit" disabled={loading}>
                {loading ? "Saving..." : editId ? <><Save size={16} /> Update Product</> : <><Plus size={16} /> Create Product</>}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile-only: Save stays reachable at the bottom of the screen while
            scrolling through the form, instead of sitting above the fields. */}
        <div className="mobile-save-bar">
          <button className="btn btn-submit" type="submit" disabled={loading}>
            {loading ? "Saving..." : editId ? <><Save size={16} /> Update Product</> : <><Plus size={16} /> Create Product</>}
          </button>
        </div>
      </form>
    </div>
  )
}
'@
Apply-Fix -FilePath $file -Old $p2Old3 -New $p2New3 -Label "H3: save button -> desktop-save + mobile sticky bar" | Out-Null

Write-Host "Done: src\app\dashboard\products\new\page.tsx" -ForegroundColor Cyan