$path = "src\app\dashboard\reports\profit-loss\page.tsx"
$content = Get-Content -LiteralPath $path -Raw

$old = '<div className="report-period" style={{ color: reportMutedColor }}>From {startDate} to {endDate}</div>'
$new = '<div className="report-period" style={{ color: reportMutedColor }}>From {startDate} to {endDate}{loading && hasLoadedOnce.current && <span style={{ marginLeft: 8, fontStyle: "italic" }}>Updating...</span>}</div>'

if ($content -notmatch [regex]::Escape($old)) { Write-Host "ANCHOR NOT FOUND - stopping, no changes made"; exit 1 }

$content = $content.Replace($old, $new)

Set-Content -LiteralPath $path -Value $content -NoNewline
Write-Host "Done - Updating indicator added"