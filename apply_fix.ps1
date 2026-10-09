# OneAccounts - Stage 1F: NGO Dashboard - period filter, project total budget, budget shown even before spending
# Touches: ManagementDashboard.tsx, useDashboardData.ts, lib\budgetPeriod.ts  (NGO dashboard only)
# Safe: every change must match EXACTLY the expected number of times, otherwise that file is NOT written.
$ErrorActionPreference = "Stop"
$root = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src"
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Edit-File($relPath, $reps) {
  $path = Join-Path $root $relPath
  $raw = [System.IO.File]::ReadAllBytes($path)
  $hasBom = ($raw.Length -ge 3 -and $raw[0] -eq 0xEF -and $raw[1] -eq 0xBB -and $raw[2] -eq 0xBF)
  $text = [System.IO.File]::ReadAllText($path)
  $nl = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
  foreach ($r in $reps) {
    $old = $r[0]; $new = $r[1]; $want = $r[2]
    $new = $new -replace "`r?`n", $nl
    $count = ([regex]::Matches($text, [regex]::Escape($old))).Count
    if ($count -ne $want) { throw "STOP: in $relPath expected $want match(es) but found $count for: $($old.Substring(0,[Math]::Min(60,$old.Length)))" }
    $text = $text.Replace($old, $new)
  }
  $enc = if ($hasBom) { $utf8Bom } else { $utf8 }
  [System.IO.File]::WriteAllText($path, $text, $enc)
  Write-Host "OK: $relPath" -ForegroundColor Green
}

# ---------- lib/budgetPeriod.ts ----------
$reps = New-Object System.Collections.ArrayList
$n = @'
const PAGE_SIZE = 1000

// Same key the screens use to say "this is the same budget line".
export function budgetLineKey(r: any): string {
  return [r.project_id, r.activity_id, r.account_id, r.location_id, r.donor_id].join("|")
}
'@
[void]$reps.Add(@('const PAGE_SIZE = 1000', $n.TrimEnd("`r","`n"), 1))
[void]$reps.Add(@('export async function loadYearBudgetRows(query: any, supabase: any, companyId: string, year: number): Promise<{ data: any[]; error: any }> {', 'export async function loadYearBudgetRows(query: any, supabase: any, companyId: string, year: number): Promise<{ data: any[]; error: any; monthlyKeys?: Set<string> }> {', 1))
[void]$reps.Add(@('return { data: aggregateBudgetForYear(liveRows, startMap, year), error: null }', 'return { data: aggregateBudgetForYear(liveRows, startMap, year), error: null, monthlyKeys: new Set<string>(liveRows.map(budgetLineKey)) }', 1))
Edit-File "lib\budgetPeriod.ts" $reps.ToArray()

# ---------- hooks/useDashboardData.ts ----------
$reps = New-Object System.Collections.ArrayList
[void]$reps.Add(@('import { loadYearBudgetRows, fetchAllFromBuilder } from "@/lib/budgetPeriod"', 'import { loadYearBudgetRows, fetchAllFromBuilder, budgetLineKey } from "@/lib/budgetPeriod"', 1))
[void]$reps.Add(@('async function fetchDashboardData(companyId: string, fiscalYear: number) {', 'async function fetchDashboardData(companyId: string, fiscalYear: number, allPeriods: boolean) {', 1))
$n = @'
budgetsRes,
    lifetimeRes,
'@
[void]$reps.Add(@('budgetsRes,', $n.TrimEnd("`r","`n"), 1))
$n = @'
.not("activity_id", "is", null), supabase, companyId, fiscalYear),

    // Whole-project budget (annual lump sum rows) - used for "project total" and the "All periods" view
    fetchAllFromBuilder(supabase.from("budgets")
      .select("id, project_id, activity_id, account_id, donor_id, location_id, budgeted_amount")
      .eq("company_id", companyId)
      .is("month", null)
      .is("deleted_at", null)
      .not("activity_id", "is", null)),
'@
[void]$reps.Add(@('.not("activity_id", "is", null), supabase, companyId, fiscalYear),', $n.TrimEnd("`r","`n"), 1))
$n = @'
.select("debit, credit, project_id, donor_id, activity_id, account_id, location_id, journal_entries!inner(date)")
      .or("project_id.not.is.null,donor_id.not.is.null,activity_id.not.is.null")
'@
[void]$reps.Add(@('.select("debit, credit, project_id, donor_id, activity_id, account_id, location_id, journal_entries!inner(date)")', $n.TrimEnd("`r","`n"), 1))
[void]$reps.Add(@('.gte("journal_entries.date", `${fiscalYear}-01-01`)', '.gte("journal_entries.date", allPeriods ? "1900-01-01" : `${fiscalYear}-01-01`)', 1))
[void]$reps.Add(@('.lte("journal_entries.date", `${fiscalYear}-12-31`)),', '.lte("journal_entries.date", allPeriods ? "2999-12-31" : `${fiscalYear}-12-31`)),', 1))
[void]$reps.Add(@('supabase.rpc("total_spent", { cid: companyId, fy: fiscalYear }),', 'supabase.rpc("get_period_spending", { cid: companyId, start_d: allPeriods ? "1900-01-01" : `${fiscalYear}-01-01`, end_d: allPeriods ? "2999-12-31" : `${fiscalYear}-12-31` }),', 1))
$n = @'
// Budget for the chosen period = monthly rows inside the year (or whole-project lump sum for "All periods")
  const liveProjectIds = new Set((projectsRes.data || []).map((p: any) => String(p.id)))
  const lifetimeRows = (lifetimeRes.data || []).filter((b: any) => liveProjectIds.has(String(b.project_id)))
  const budgetRows: any[] = allPeriods ? lifetimeRows : (budgetsRes.data || [])
  // Budget lines that exist as a lump sum but have no monthly split at all
  const monthlyKeys = (budgetsRes as any).monthlyKeys as Set<string> | undefined
  const monthlyMissingLines = monthlyKeys ? lifetimeRows.filter((b: any) => !monthlyKeys.has(budgetLineKey(b))).length : 0
  const totalBudget = budgetRows.reduce((s: number, b: any) => s + (b.budgeted_amount || 0), 0)
'@
[void]$reps.Add(@('const totalBudget = budgetsRes.data?.reduce((s: number, b: any) => s + (b.budgeted_amount || 0), 0) || 0', $n.TrimEnd("`r","`n"), 1))
[void]$reps.Add(@('const totalSpent = totalSpentRpc.data?.[0]?.total || 0', 'const totalSpent = Number(totalSpentRpc.data) || 0', 1))
[void]$reps.Add(@('budgetsRes.data?.forEach((b: any) => {', 'budgetRows.forEach((b: any) => {', 2))
$n = @'
allBudgets: budgetRows,
    allBudgetsLifetime: lifetimeRows,
    monthlyMissingLines,
'@
[void]$reps.Add(@('allBudgets: budgetsRes.data || [],', $n.TrimEnd("`r","`n"), 1))
[void]$reps.Add(@('export function useDashboardData(companyId: string | null, fiscalYear: number) {', 'export function useDashboardData(companyId: string | null, fiscalYear: number, allPeriods: boolean = false) {', 1))
[void]$reps.Add(@('queryKey: ["dashboard", companyId, fiscalYear],', 'queryKey: ["dashboard", companyId, fiscalYear, allPeriods],', 1))
[void]$reps.Add(@('queryFn: () => fetchDashboardData(companyId!, fiscalYear),', 'queryFn: () => fetchDashboardData(companyId!, fiscalYear, allPeriods),', 1))
Edit-File "hooks\useDashboardData.ts" $reps.ToArray()

# ---------- components/dashboard/ManagementDashboard.tsx ----------
$reps = New-Object System.Collections.ArrayList
$n = @'
const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [allPeriods, setAllPeriods] = useState(false)
  const [showAllDonors, setShowAllDonors] = useState(false)
'@
[void]$reps.Add(@('const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())', $n.TrimEnd("`r","`n"), 1))
[void]$reps.Add(@('useDashboardData(companyId, fiscalYear)', 'useDashboardData(companyId, fiscalYear, allPeriods)', 1))
$n = @'
const allActivities = dashData?.allActivities || []
  const allBudgetsLifetime = dashData?.allBudgetsLifetime || []
  const monthlyMissingLines = dashData?.monthlyMissingLines || 0
'@
[void]$reps.Add(@('const allActivities = dashData?.allActivities || []', $n.TrimEnd("`r","`n"), 1))
$n = @'
  // Project total budget (whole project life, the lump sum) - same filters as the cards
  const filteredBudgetsLifetime = useMemo(() => {
    if (!isFiltered) return allBudgetsLifetime
    return allBudgetsLifetime.filter((b: any) => {
      if (selectedProjectId && String(b.project_id) !== selectedProjectId) return false
      if (selectedDonorId && String(b.donor_id) !== selectedDonorId) return false
      return true
    })
  }, [allBudgetsLifetime, selectedProjectId, selectedDonorId, isFiltered])
  const projectTotalBudget = filteredBudgetsLifetime.reduce((s: number, b: any) => s + (b.budgeted_amount || 0), 0)

  const filteredJournalLines = useMemo(() => {
'@
[void]$reps.Add(@('  const filteredJournalLines = useMemo(() => {', $n.TrimEnd("`r","`n"), 1))
[void]$reps.Add(@('return Object.keys(budgetByDonor).map((donorId) => {', 'return Array.from(new Set([...Object.keys(budgetByDonor), ...Object.keys(actualByDonor)])).filter((donorId) => !!donorNameMap[donorId]).map((donorId) => {', 1))
[void]$reps.Add(@('return Object.keys(budgetByProject).map((pid) => {', 'return Array.from(new Set([...Object.keys(budgetByProject), ...Object.keys(actualByProject)])).filter((pid) => !!projectNameMap[pid]).map((pid) => {', 1))
[void]$reps.Add(@('status: p.pct > 100 ? "Overspent" : p.pct > 80 ? "Review"', 'status: (p.budget === 0 && p.actual > 0) ? "No Budget" : p.pct > 100 ? "Overspent" : p.pct > 80 ? "Review"', 1))
[void]$reps.Add(@('p.status === "Review" ?', '(p.status === "Review" || p.status === "No Budget") ?', 3))
[void]$reps.Add(@('No activities with remaining budget this month.', 'No activities with remaining budget in this period.', 1))
[void]$reps.Add(@('<select className="filter-pill" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>', '<select className="filter-pill" value={allPeriods ? "all" : String(fiscalYear)} onChange={e => { if (e.target.value === "all") { setAllPeriods(true) } else { setAllPeriods(false); setFiscalYear(Number(e.target.value)) } }}>', 1))
[void]$reps.Add(@('{Array.from({ length: new Date().getFullYear() - 2023 + 1 }, (_, i) => 2024 + i).map(', '<option value="all">All periods</option>{Array.from({ length: new Date().getFullYear() - 2023 + 2 }, (_, i) => 2024 + i).map(', 1))
$n = @'
        {!allPeriods && monthlyMissingLines > 0 && (
          <div style={{ background: "var(--card)", border: "1px solid var(--kpi-warn)", borderRadius: 12, padding: "0.5rem 1rem", marginBottom: "0.8rem", fontSize: "0.78rem", color: "var(--text)", display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <span>{monthlyMissingLines} budget {monthlyMissingLines === 1 ? "line has" : "lines have"} no monthly split, so {monthlyMissingLines === 1 ? "it is" : "they are"} not in the FY {fiscalYear} figures. Choose "All periods" to see the full project budget.</span>
            <button className="warning-btn" style={{ background: "transparent", color: "var(--kpi-link)", border: "1px solid var(--border)", padding: "2px 10px" }} onClick={() => router.push("/dashboard/settings/budgets")}>Complete monthly budget</button>
          </div>
        )}
        {/* KPI cards */}
'@
[void]$reps.Add(@('{/* KPI cards */}', $n.TrimEnd("`r","`n"), 1))
[void]$reps.Add(@('meta: `${projectRows.length} projects`, color: "var(--text)", link: "/dashboard/reports/budget-summary"', 'meta: allPeriods ? `All periods - ${projectRows.length} projects` : `FY ${fiscalYear} (project total ${formatPKR(projectTotalBudget)})`, color: "var(--text)", link: "/dashboard/reports/budget-summary"', 1))
[void]$reps.Add(@('meta: monthlySpending === 0 ? "No transactions this month" :', 'meta: monthlySpending === 0 ? (lastMonthSpending > 0 ? `None this month - last month PKR ${formatPKR(lastMonthSpending)}` : "No transactions this month") :', 1))
[void]$reps.Add(@('Donor Balances <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)" }}>(PKR)</span></div>', 'Donor Balances <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)" }}>(PKR)</span>{donorBalances.length > 5 && (<button onClick={() => setShowAllDonors((v: boolean) => !v)} style={{ float: "right", background: "transparent", border: "none", color: "var(--kpi-link)", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}>{showAllDonors ? "Show top 5" : `View all (${donorBalances.length})`}</button>)}</div>', 1))
[void]$reps.Add(@('{donorBalances.map((d: any, idx: number) => (', '{(showAllDonors ? donorBalances : donorBalances.slice(0, 5)).map((d: any, idx: number) => (', 1))
Edit-File "components\dashboard\ManagementDashboard.tsx" $reps.ToArray()

Write-Host ""
Write-Host "All done. Now deploy." -ForegroundColor Cyan