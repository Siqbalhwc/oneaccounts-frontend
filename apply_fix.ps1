$files = @(
  "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\components\dashboard\ManagementDashboard.tsx",
  "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\components\dashboard\TradingServiceDashboard.tsx",
  "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\components\dashboard\AccountantDashboard.tsx"
)

$map = @(
  @{hex="#A78BFA"; var="var(--kpi-info)"},
  @{hex="#F97316"; var="var(--kpi-warn)"},
  @{hex="#2DD4BF"; var="var(--kpi-positive)"},
  @{hex="#F87171"; var="var(--kpi-negative)"},
  @{hex="#93C5FD"; var="var(--kpi-link)"}
)

foreach ($filePath in $files) {
    $fileName = Split-Path $filePath -Leaf
    if (-not (Test-Path $filePath)) {
        Write-Host "$fileName : FILE NOT FOUND"
        continue
    }
    $content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
    $original = $content

    $totalReplaced = 0
    foreach ($m in $map) {
        $before = $content
        $content = $content.Replace($m.hex, $m.var)
        if ($content -ne $before) {
            $count = ([regex]::Matches($before, [regex]::Escape($m.hex))).Count
            Write-Host "$fileName : replaced $count occurrence(s) of $($m.hex) -> $($m.var)"
            $totalReplaced += $count
        }
    }

    if ($totalReplaced -gt 0) {
        $backupPath = "$filePath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        [System.IO.File]::WriteAllText($backupPath, $original, [System.Text.Encoding]::UTF8)
        [System.IO.File]::WriteAllText($filePath, $content, [System.Text.Encoding]::UTF8)
        Write-Host "$fileName : SUCCESS, $totalReplaced total replacement(s). Backup saved at $backupPath"
    } else {
        Write-Host "$fileName : no matching hex colors found, no changes made"
    }
    Write-Host "---"
}