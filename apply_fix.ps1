$path = "src\app\dashboard\settings\budgets\page.tsx"
$backup = "$path.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
[System.IO.File]::Copy($path, $backup)
Write-Host "Backup created: $backup"

$content = [System.IO.File]::ReadAllText($path)
$originalContent = $content

$old = @'
    async function fetchStatus() {
      try {
        const { data } = await supabase
          .from("project_budget_status")
          .select("status")
          .eq("company_id", companyId)
          .eq("project_id", selectedProjectId)
          .eq("fiscal_year", fiscalYear)
          .maybeSingle()
        setBudgetStatus(data?.status || "draft")
      } catch { setBudgetStatus("draft") }
    }
'@

$new = @'
    async function fetchStatus() {
      try {
        // Fixed: selectedProjectId is a string from the dropdown, project_id
        // is an integer column - must convert or the match silently fails.
        // Also removed the fiscal_year filter: project_budget_status is one
        // row per project (matching the lump-sum budget model), not per
        // year, so filtering by "today's year" could miss the real row.
        const { data } = await supabase
          .from("project_budget_status")
          .select("status")
          .eq("company_id", companyId)
          .eq("project_id", Number(selectedProjectId))
          .maybeSingle()
        setBudgetStatus(data?.status || "draft")
      } catch { setBudgetStatus("draft") }
    }
'@

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Fixed project_budget_status fetch (type mismatch + removed fiscal_year filter)"
} else {
    Write-Host "NOT FOUND"
}