# ============================================================
# OneAccounts - Dark theme visibility fix (v2 - CRLF-safe)
# Scope: [data-theme="dark"] tokens in globals.css, + NGO
# Management Dashboard KPI coloring in ManagementDashboard.tsx.
# Does NOT touch the "light" or "oneaccounts" themes, and does
# NOT touch --kpi-info/--kpi-warn/--kpi-positive/--kpi-negative
# /--kpi-link (those also drive the Trading & Accountant
# dashboards, out of scope for this fix).
#
# v2 fix: every anchor below is now a single line with no
# embedded line-break, so it can never be broken by CRLF vs LF
# differences (v1 failed because a 21-line block anchor didn't
# match this file's line endings on Windows).
# ============================================================

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

function Replace-OnceOrThrow {
  param($content, $old, $new, $label)
  $count = ([regex]::Matches($content, [regex]::Escape($old))).Count
  if ($count -eq 0) {
    throw "ANCHOR NOT FOUND ($label) - aborting before any write. Nothing has been changed."
  }
  if ($count -gt 1) {
    throw "ANCHOR MATCHED $count TIMES ($label) - expected exactly 1, aborting to avoid an ambiguous edit."
  }
  return $content.Replace($old, $new)
}

# ---------- FILE 1: src/app/globals.css ----------
$file1 = "src\app\globals.css"
$backup1 = "$file1.backup_$timestamp"
Copy-Item -LiteralPath $file1 -Destination $backup1
Write-Host "Backed up $file1 -> $backup1"

$c1 = Get-Content -LiteralPath $file1 -Raw -Encoding UTF8

$darkTokenPairs = @(
  @{ old = "  --bg: #0B1120;";              new = "  --bg: #0B0D12;" },
  @{ old = "  --bg-soft: #0F172A;";         new = "  --bg-soft: #0E1015;" },
  @{ old = "  --card: #111827;";            new = "  --card: #161A22;" },
  @{ old = "  --card-hover: #1E293B;";      new = "  --card-hover: #1D222C;" },
  @{ old = "  --text: #E2E8F0;";            new = "  --text: #F3F5F7;" },
  @{ old = "  --text-muted: #94A3B8;";      new = "  --text-muted: #98A2B3;" },
  @{ old = "  --text-soft: #64748B;";       new = "  --text-soft: #6B7386;" },
  @{ old = "  --border: #1E293B;";          new = "  --border: #262B36;" },
  @{ old = "  --border-strong: #334155;";   new = "  --border-strong: #343B49;" },
  @{ old = "  --primary: #3B82F6;";         new = "  --primary: #5B93FF;" },
  @{ old = "  --primary-hover: #60A5FA;";   new = "  --primary-hover: #7BA8FF;" },
  @{ old = "  --success: #34D399;";         new = "  --success: #3DDC84;" },
  @{ old = "  --warning: #FBBF24;";         new = "  --warning: #F6A93B;" },
  @{ old = "  --danger: #F87171;";          new = "  --danger: #FF6B6B;" },
  @{ old = "  --shell-bg: #0B1120;";        new = "  --shell-bg: #0B0D12;" },
  @{ old = "  --sidebar-bg: #0B1120;";      new = "  --sidebar-bg: #08090D;" },
  @{ old = "  --sidebar-border: #1E293B;";  new = "  --sidebar-border: #1E232E;" },
  @{ old = "  --topbar-bg: #0F172A;";       new = "  --topbar-bg: #101319;" },
  @{ old = "  --topbar-border: #1E293B;";   new = "  --topbar-border: #1E232E;" },
  @{ old = "  --main-bg: #0B1120;";         new = "  --main-bg: #0B0D12;" }
)

foreach ($pair in $darkTokenPairs) {
  $c1 = Replace-OnceOrThrow -content $c1 -old $pair.old -new $pair.new -label $pair.old
}
Set-Content -LiteralPath $file1 -Value $c1 -NoNewline -Encoding UTF8
Write-Host "Patched 20 dark-theme tokens in $file1"

# Append the dark-only filter-pill visibility fix (new rule, additive, idempotent)
$appendMarker = '[data-theme="dark"] .mgmt .filter-pill'
if ($c1 -notmatch [regex]::Escape($appendMarker)) {
  $pillFix = @"

/* -- Dark theme: dashboard filter-pill visibility fix --
   Pills previously used var(--card) which reads as invisible against
   the dashboard card grid at the same tone. Dark-mode only; light and
   oneaccounts themes untouched. -- */
[data-theme="dark"] .mgmt .filter-pill {
  background: var(--bg-soft);
  border: 1px solid var(--border-strong);
}
"@
  Add-Content -LiteralPath $file1 -Value $pillFix -Encoding UTF8
  Write-Host "Appended dark-mode filter-pill fix to $file1"
} else {
  Write-Host "Filter-pill fix already present in $file1 - skipped"
}

# ---------- FILE 2: src/components/dashboard/ManagementDashboard.tsx ----------
$file2 = "src\components\dashboard\ManagementDashboard.tsx"
$backup2 = "$file2.backup_$timestamp"
Copy-Item -LiteralPath $file2 -Destination $backup2
Write-Host "Backed up $file2 -> $backup2"

$c2 = Get-Content -LiteralPath $file2 -Raw -Encoding UTF8

# 2a. Overdue banner - faint red tint in dark mode (single-line anchor now)
$c2 = Replace-OnceOrThrow -content $c2 `
  -old 'background: var(--card); border: 1px solid var(--border); border-left: 4px solid #EF4444;' `
  -new 'background: ${isDark ? "rgba(255,107,107,0.08)" : "var(--card)"}; border: 1px solid var(--border); border-left: 4px solid #EF4444;' `
  -label "overdue-banner background"

# 2b. Total Budget KPI - neutral value color
$c2 = Replace-OnceOrThrow -content $c2 `
  -old '{ label: "Total Budget",   value: fmtM(animBudget),   meta: `${projectRows.length} projects`, color: "var(--kpi-info)", link: "/dashboard/reports/budget-summary" },' `
  -new '{ label: "Total Budget",   value: fmtM(animBudget),   meta: `${projectRows.length} projects`, color: "var(--text)", link: "/dashboard/reports/budget-summary" },' `
  -label "Total Budget KPI color"

# 2c. Total Spent KPI - neutral value color
$c2 = Replace-OnceOrThrow -content $c2 `
  -old '{ label: "Total Spent",     value: fmtM(animSpent),    meta: `${spentPct}% of budget`, color: "var(--kpi-warn)", link: "/dashboard/reports/spending-detail" },' `
  -new '{ label: "Total Spent",     value: fmtM(animSpent),    meta: `${spentPct}% of budget`, color: "var(--text)", link: "/dashboard/reports/spending-detail" },' `
  -label "Total Spent KPI color"

# 2d. Remaining/Overspent KPI - neutral when healthy, still red when over
$c2 = Replace-OnceOrThrow -content $c2 `
  -old 'color: remainingFunds >= 0 ? "var(--kpi-positive)" : "var(--kpi-negative)", link: remainingFunds < 0 ? "/dashboard/reports/overspent" : null },' `
  -new 'color: remainingFunds >= 0 ? "var(--text)" : "var(--kpi-negative)", link: remainingFunds < 0 ? "/dashboard/reports/overspent" : null },' `
  -label "Remaining KPI color"

# 2e. Monthly Spending KPI - neutral value color
$c2 = Replace-OnceOrThrow -content $c2 `
  -old 'color: monthlySpending > 0 ? "var(--kpi-warn)" : "#94A3B8", link: "/dashboard/reports/spending-detail" },' `
  -new 'color: "var(--text)", link: "/dashboard/reports/spending-detail" },' `
  -label "Monthly Spending KPI color"

# 2f. Fix clipped highest/lowest-project meta line (let it wrap instead of ellipsis-cutting)
$c2 = Replace-OnceOrThrow -content $c2 `
  -old 'fontSize: "0.65rem", color: "var(--kpi-link)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }' `
  -new 'fontSize: "0.65rem", color: "var(--kpi-link)", marginTop: 4, whiteSpace: "normal", lineHeight: 1.4 }' `
  -label "highest/lowest project line wrap"

Set-Content -LiteralPath $file2 -Value $c2 -NoNewline -Encoding UTF8
Write-Host "Patched KPI colors + overdue banner + truncation fix in $file2"

Write-Host ""
Write-Host "Done. Backups saved as:"
Write-Host "  $backup1"
Write-Host "  $backup2"
Write-Host ""
Write-Host "Next: rmdir /s /q .next, then npm run dev to preview locally, or commit + push to deploy."