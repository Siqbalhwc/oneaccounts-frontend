$path = "src\app\dashboard\settings\budgets\page.tsx"
$backup = "$path.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
[System.IO.File]::Copy($path, $backup)
Write-Host "Backup created: $backup"

$content = [System.IO.File]::ReadAllText($path)
$originalContent = $content

# Fix state shape: needs account_id as a key too, not summed away
$s1old = '  const [savedMonthlyBudgets, setSavedMonthlyBudgets] = useState<Record<string, Record<string, Record<number, number>>>>({})'
$s1new = '  const [savedMonthlyBudgets, setSavedMonthlyBudgets] = useState<Record<string, Record<string, Record<string, Record<number, number>>>>>({})'
if ($content.Contains($s1old)) { $content = $content.Replace($s1old, $s1new); Write-Host "Step 1: SUCCESS" } else { Write-Host "Step 1: NOT FOUND" }

# Fix the fetch/build logic: keep account_id as its own key level, don't sum across accounts
$s2old = @'
              savedQuery.then(({ data: savedRows }) => {
                const saved: Record<string, Record<string, Record<number, number>>> = {}
                if (savedRows) {
                  savedRows.forEach((row: any) => {
                    const actId = String(row.activity_id)
                    const locId = String(row.location_id)
                    const monthNum = row.month
                    if (!saved[actId]) saved[actId] = {}
                    if (!saved[actId][locId]) saved[actId][locId] = {}
                    // Sum across GL accounts for this activity/location/month
                    saved[actId][locId][monthNum] = (saved[actId][locId][monthNum] || 0) + (Number(row.budgeted_amount) || 0)
                  })
                }
                setSavedMonthlyBudgets(saved)
                setLoading(false)
              })
'@
$s2new = @'
              savedQuery.then(({ data: savedRows }) => {
                // Kept separate per (activity, location, account) - each GL
                // line has its own independent monthly split, matching how
                // the GL view and validate_transaction_budget both work.
                const saved: Record<string, Record<string, Record<string, Record<number, number>>>> = {}
                if (savedRows) {
                  savedRows.forEach((row: any) => {
                    const actId = String(row.activity_id)
                    const locId = String(row.location_id)
                    const accId = String(row.account_id)
                    const monthNum = row.month
                    if (!saved[actId]) saved[actId] = {}
                    if (!saved[actId][locId]) saved[actId][locId] = {}
                    if (!saved[actId][locId][accId]) saved[actId][locId][accId] = {}
                    saved[actId][locId][accId][monthNum] = Number(row.budgeted_amount) || 0
                  })
                }
                setSavedMonthlyBudgets(saved)
                setLoading(false)
              })
'@
if ($content.Contains($s2old)) { $content = $content.Replace($s2old, $s2new); Write-Host "Step 2: SUCCESS" } else { Write-Host "Step 2: NOT FOUND" }

if ($content -ne $originalContent) {
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "FILE UPDATED"
} else {
    Write-Host "NO CHANGES MADE"
}