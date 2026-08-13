$files = @(
  "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\components\dashboard\ManagementDashboard.tsx",
  "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\components\dashboard\TradingServiceDashboard.tsx",
  "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\components\dashboard\AccountantDashboard.tsx"
)
foreach ($f in $files) {
    $c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
    $name = Split-Path $f -Leaf
    Write-Host "$name :"
    Write-Host "  #A78BFA still present: $($c.Contains('#A78BFA'))"
    Write-Host "  var(--kpi-info) present: $($c.Contains('var(--kpi-info)'))"
}