$path = "src\app\dashboard\settings\budgets\page.tsx"
$backup = "$path.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
[System.IO.File]::Copy($path, $backup)
Write-Host "Backup created: $backup"

$lines = [System.IO.File]::ReadAllLines($path)

Write-Host "--- BEFORE (lines 439-452) ---"
for ($i = 438; $i -le 451; $i++) { Write-Host "$($i+1): $($lines[$i])" }

$newFunc = @(
'  const setMonthBudget = (actId: string, locId: string, accId: string, monthIdx: number, value: number) => {',
'    const monthNum = monthIdx + 1',
'    setMonthBudgetOverrides(prev => {',
'      const existingAct = prev[actId] || {}',
'      const existingLoc = existingAct[locId] || {}',
'      const existingAcc = existingLoc[accId] || {}',
'      return {',
'        ...prev,',
'        [actId]: {',
'          ...existingAct,',
'          [locId]: {',
'            ...existingLoc,',
'            [accId]: {',
'              ...existingAcc,',
'              [monthNum]: value,',
'            },',
'          },',
'        },',
'      }',
'    })',
'  }'
)

# Lines 439-452 (index 438-451) is the old function
$before = $lines[0..437]
$after = $lines[452..($lines.Length - 1)]
$result = $before + $newFunc + $after

[System.IO.File]::WriteAllLines($path, $result, [System.Text.Encoding]::UTF8)
Write-Host "--- SUCCESS: Replaced setMonthBudget with valid TypeScript ---"