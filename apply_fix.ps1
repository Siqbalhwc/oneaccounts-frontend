# OneAccounts - Stage 1B: budget period logic (monthly budget rows -> selected year)
# Touches: NGO Dashboard, Budget Report, Budget Summary, Journal entry donor lookup
# Adds one new helper file: src\lib\budgetPeriod.ts
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

# ---------- 0. New helper file ----------
$libPath = Join-Path $root "lib\budgetPeriod.ts"
if (Test-Path -LiteralPath $libPath) { throw "STOP: lib\budgetPeriod.ts already exists - tell Claude." }
$lib = @'
// Budget period helpers (NGO / Construction).
//
// A project budget is saved as MONTHLY rows. In those rows `month` is the
// project month number (1 = the project's start month), NOT a calendar month.
// These helpers turn that into calendar periods, so a screen that shows
// "year 2027" gets the budget of the months that fall inside 2027.

const PAGE_SIZE = 1000

// Reads every page of a Supabase query (the API returns max 1000 rows per request).
export async function fetchAllFromBuilder(query: any): Promise<{ data: any[]; error: any }> {
  const all: any[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query.order("id").range(from, from + PAGE_SIZE - 1)
    if (error) return { data: [], error }
    all.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return { data: all, error: null }
}

// Calendar year that a monthly budget row falls in.
// Start month comes from the project's start date (YYYY-MM-DD). A project with no
// start date is counted from January of the year the budget was saved under.
export function monthlyRowCalendarYear(row: any, startDateByProject: Record<string, string | null>): number | null {
  const month = Number(row.month)
  if (!month || month < 1) return null
  const m = /^(\d{4})-(\d{2})/.exec(startDateByProject[String(row.project_id)] || "")
  let baseYear: number
  let baseMonth: number // 0-11
  if (m) {
    baseYear = Number(m[1])
    baseMonth = Number(m[2]) - 1
  } else if (row.fiscal_year) {
    baseYear = Number(row.fiscal_year)
    baseMonth = 0
  } else {
    return null
  }
  return baseYear + Math.floor((baseMonth + (month - 1)) / 12)
}

// Sums monthly rows that fall inside `year` into one row per
// project + activity + account + location + donor. Output rows keep the
// same shape as the old annual rows (budgeted_amount = total for that year).
export function aggregateBudgetForYear(rows: any[], startDateByProject: Record<string, string | null>, year: number): any[] {
  const out = new Map<string, any>()
  for (const r of rows) {
    if (monthlyRowCalendarYear(r, startDateByProject) !== year) continue
    const key = [r.project_id, r.activity_id, r.account_id, r.location_id, r.donor_id].join("|")
    let agg = out.get(key)
    if (!agg) {
      agg = { ...r, month: null, budgeted_amount: 0 }
      out.set(key, agg)
    }
    agg.budgeted_amount += Number(r.budgeted_amount) || 0
  }
  return Array.from(out.values())
}

// Takes a ready-made query on the budgets table that selects MONTHLY rows
// (month is not null, must include project_id, month, fiscal_year), reads all pages,
// drops rows of deleted projects, and returns the budget for the calendar `year`.
export async function loadYearBudgetRows(query: any, supabase: any, companyId: string, year: number): Promise<{ data: any[]; error: any }> {
  const [rows, projRes] = await Promise.all([
    fetchAllFromBuilder(query),
    supabase.from("projects").select("id, start_date").eq("company_id", companyId).is("deleted_at", null),
  ])
  if (rows.error) return { data: [], error: rows.error }
  const startMap: Record<string, string | null> = {}
  const live = new Set<string>()
  for (const p of projRes.data || []) {
    startMap[String(p.id)] = p.start_date
    live.add(String(p.id))
  }
  const liveRows = rows.data.filter((r: any) => live.has(String(r.project_id)))
  return { data: aggregateBudgetForYear(liveRows, startMap, year), error: null }
}
'@
$lib = $lib.TrimEnd("`r","`n") + "`n"

# ---------- strings reused ----------
$IMP = 'import { createBrowserClient } from "@supabase/ssr"'
$COMMENT = '// (no fiscal_year filter - monthly rows of the whole project; the year is sliced out by loadYearBudgetRows)'

# ---------- 1. Dashboard data hook ----------
Edit-File "hooks\useDashboardData.ts" @(
  ,@($IMP, ($IMP + "`n" + 'import { loadYearBudgetRows, fetchAllFromBuilder } from "@/lib/budgetPeriod"'), 1)
  ,@('supabase.from("budgets")', 'loadYearBudgetRows(supabase.from("budgets")', 1)
  ,@('.select("id, project_id, activity_id, account_id, donor_id, location_id, budgeted_amount")', '.select("id, project_id, activity_id, account_id, donor_id, location_id, budgeted_amount, month, fiscal_year")', 1)
  ,@('.eq("fiscal_year", fiscalYear)', $COMMENT, 1)
  ,@('.is("month", null)', '.not("month", "is", null)', 1)
  ,@('.not("activity_id", "is", null),', '.not("activity_id", "is", null), supabase, companyId, fiscalYear),', 1)
  ,@('supabase.from("journal_lines")', 'fetchAllFromBuilder(supabase.from("journal_lines")', 1)
  ,@('.lte("journal_entries.date", `${fiscalYear}-12-31`),', '.lte("journal_entries.date", `${fiscalYear}-12-31`)),', 1)
  ,@('supabase.from("donors").select("id, name").eq("company_id", companyId),', 'supabase.from("donors").select("id, name").eq("company_id", companyId).is("deleted_at", null),', 1)
  ,@('supabase.from("projects").select("id, name, donor_id, start_date, end_date").eq("company_id", companyId),', 'supabase.from("projects").select("id, name, donor_id, start_date, end_date").eq("company_id", companyId).is("deleted_at", null),', 1)
  ,@('supabase.from("activities").select("id, name").eq("company_id", companyId),', 'supabase.from("activities").select("id, name").eq("company_id", companyId).is("deleted_at", null),', 1)
)

# ---------- 2. Dashboard year list (no more hard-coded 2024-2027) ----------
Edit-File "components\dashboard\ManagementDashboard.tsx" @(
  ,@('{[2024,2025,2026,2027].map((y: number) =>', '{Array.from({ length: new Date().getFullYear() - 2023 + 1 }, (_, i) => 2024 + i).map((y: number) =>', 1)
)

# ---------- 3. Budget Summary report ----------
Edit-File "app\dashboard\reports\budget-summary\page.tsx" @(
  ,@($IMP, ($IMP + "`n" + 'import { loadYearBudgetRows } from "@/lib/budgetPeriod"'), 1)
  ,@('.select("id, account_id, project_id, activity_id, location_id, donor_id, budgeted_amount")', '.select("id, account_id, project_id, activity_id, location_id, donor_id, budgeted_amount, month, fiscal_year")', 1)
  ,@('.eq("fiscal_year", fiscalYear)', $COMMENT, 1)
  ,@('.is("month", null)', '.not("month", "is", null)', 1)
  ,@('query.then(async ({ data: budgetRows }) => {', 'loadYearBudgetRows(query, supabase, companyId, fiscalYear).then(async ({ data: budgetRows }) => {', 1)
)

# ---------- 4. Budget Report ----------
Edit-File "app\dashboard\reports\budgets\page.tsx" @(
  ,@($IMP, ($IMP + "`n" + 'import { loadYearBudgetRows } from "@/lib/budgetPeriod"'), 1)
  ,@('.eq("fiscal_year", fiscalYear)', $COMMENT, 1)
  ,@('.is("month", null)', '.not("month", "is", null)', 1)
  ,@('query.then(({ data }) => {', 'loadYearBudgetRows(query, supabase, companyId, fiscalYear).then(({ data }) => {', 1)
)

# ---------- 5. Journal entry: donor lookup without year filter ----------
Edit-File "app\dashboard\journal\new\page.tsx" @(
  ,@('.eq("fiscal_year", new Date().getFullYear())', '// (no fiscal_year filter - the budget covers the whole project period)', 1)
)

# ---------- 6. Write the new helper file last (only if everything above passed) ----------
[System.IO.File]::WriteAllText($libPath, $lib, $utf8)
Write-Host "OK: lib\budgetPeriod.ts (new)" -ForegroundColor Green
Write-Host ""
Write-Host "All done. Now deploy." -ForegroundColor Cyan