$path = "src\app\dashboard\settings\budgets\page.tsx"
$content = [System.IO.File]::ReadAllText($path)
$originalContent = $content

$old = '        {flash && ('
$new = '        {showHistory && selectedProjectId && (
          <div style={{
            background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
            padding: "12px 16px", marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
              Budget Change History
            </div>
            <BudgetHistory
              recordId={`${selectedProjectId}_${fiscalYear}`}
              activities={allActivities}
              locations={locations}
              accounts={accounts}
            />
          </div>
        )}

        {flash && ('

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Added history panel"
} else {
    Write-Host "NOT FOUND"
}