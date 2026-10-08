# OneAccounts - Stage 1A: budget year follows the project (fixes the Jan-2027 problem)
# Files: bills\new\page.tsx and settings\budgets\page.tsx  (NGO / Construction budget screens)
# Safe: every change is checked to match EXACTLY the expected number of times, otherwise NOTHING is written.
$ErrorActionPreference = "Stop"
$base = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\dashboard"
$utf8Bom = New-Object System.Text.UTF8Encoding($true)

function Edit-File($relPath, $reps) {
  $path = Join-Path $base $relPath
  $text = [System.IO.File]::ReadAllText($path)
  $nl = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
  foreach ($r in $reps) {
    $old = $r[0]; $new = $r[1]; $want = $r[2]
    $new = $new -replace "`r?`n", $nl
    $count = ([regex]::Matches($text, [regex]::Escape($old))).Count
    if ($count -ne $want) { throw "STOP: in $relPath expected $want match(es) but found $count for: $($old.Substring(0,[Math]::Min(60,$old.Length)))" }
    $text = $text.Replace($old, $new)
  }
  [System.IO.File]::WriteAllText($path, $text, $utf8Bom)
  Write-Host "OK: $relPath" -ForegroundColor Green
}

# ---------- 1. Bill form: no fiscal-year filter, sum rows like the database ----------
Edit-File "bills\new\page.tsx" @(
  ,@('const fiscalYear = new Date().getFullYear()', '// Budget lookups are project-period based (no fiscal-year filter), same as the database check.', 1)
  ,@('.eq("fiscal_year", fiscalYear)', '// (no fiscal_year filter - budget covers the whole project period)', 3)
  ,@('}, [companyId, budgetInfo, fiscalYear, supabase])', '}, [companyId, budgetInfo, supabase])', 1)
  ,@('const { data: budgetRow } = await budgetQuery.maybeSingle()', 'const { data: budgetRows } = await budgetQuery', 1)
  ,@('const budget = budgetRow?.budgeted_amount || 0', 'const budget = (budgetRows || []).reduce((s: number, r: any) => s + (Number(r.budgeted_amount) || 0), 0)', 1)
  ,@('hasBudget: budgetRow !== null }', 'hasBudget: !!budgetRows && budgetRows.length > 0 }', 1)
)

# ---------- 2. Budgets settings page: budget year follows the project ----------
$newEffect = @'
  // -- Budget year follows the project (project-period budgeting) --
  // A project's budget is saved under ONE year tag. Always load and save under
  // that year, so a new calendar year never shows an empty budget or creates
  // a second set of rows that the database check would add up (double count).
  useEffect(() => {
    if (!companyId || !selectedProjectId) return
    let cancelled = false
    async function pickBudgetYear() {
      const { data: rows } = await supabase
        .from("budgets")
        .select("fiscal_year")
        .eq("company_id", companyId)
        .eq("project_id", Number(selectedProjectId))
        .is("month", null)
        .order("fiscal_year", { ascending: true })
        .limit(1)
      if (cancelled) return
      if (rows && rows.length > 0 && rows[0].fiscal_year) {
        setFiscalYear(Number(rows[0].fiscal_year))
        return
      }
      const project = projects.find(p => p.id == selectedProjectId)
      if (project?.start_date) {
        const y = new Date(project.start_date).getFullYear()
        if (!isNaN(y)) setFiscalYear(y)
      }
    }
    pickBudgetYear()
    return () => { cancelled = true }
  }, [companyId, selectedProjectId, projects])

  // -- Reset overrides --
'@.TrimEnd("`r","`n")

Edit-File "settings\budgets\page.tsx" @(
  ,@('  // -- Reset overrides --', $newEffect, 1)
  ,@('value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}>', 'value={fiscalYear} disabled title="A project''s budget year is fixed when its budget is first saved" onChange={() => {}}>', 1)
  ,@('{[2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}', '<option value={fiscalYear}>Budget year {fiscalYear}</option>', 1)
)

Write-Host ""
Write-Host "Both files patched. Now deploy (see steps)." -ForegroundColor Cyan