# OneAccounts - Stage 1D: "spent" = Expense + Fixed Asset accounts (Asset 1400-1499) everywhere
# Touches 3 report pages (account lists / spending filter). Run the SQL file FIRST (database functions).
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

$FA = '.or("type.eq.Expense,and(type.eq.Asset,code.gte.1400,code.lte.1499)")'

# 1. Spending Detail report: include fixed-asset accounts in the spending list
Edit-File "app\dashboard\reports\spending-detail\client.tsx" @(
  ,@('.eq("company_id", cid).eq("type", "Expense")', ('.eq("company_id", cid)' + $FA), 1)
)

# 2. Budget vs Actual: show account code/name for fixed-asset budget lines too (screen, Excel and PDF)
Edit-File "app\dashboard\reports\budget-vs-actual\page.tsx" @(
  ,@('.eq("company_id", cid).eq("type","Expense").order("code")', ('.eq("company_id", cid)' + $FA + '.order("code")'), 1)
)

# 3. Budget Report: same account list
Edit-File "app\dashboard\reports\budgets\page.tsx" @(
  ,@('.eq("company_id", cid).eq("type","Expense").order("code")', ('.eq("company_id", cid)' + $FA + '.order("code")'), 1)
)

Write-Host ""
Write-Host "All done. Now deploy." -ForegroundColor Cyan