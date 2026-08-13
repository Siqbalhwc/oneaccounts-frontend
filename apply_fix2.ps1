$filePath = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\globals.css"
$backupPath = "$filePath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

$rawContent = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($backupPath, $rawContent, [System.Text.Encoding]::UTF8)
$content = $rawContent -replace "`r`n", "`n"
function Norm($s) { return ($s -replace "`r`n", "`n").TrimEnd("`n") }

$old = Norm @'
[data-theme="oneaccounts"] .dl-main-content h1,
[data-theme="oneaccounts"] .dl-main-content h2,
[data-theme="oneaccounts"] .dl-main-content h3 {
  color: #1740C8;
}
'@

$new = Norm @'
[data-theme="oneaccounts"] .dl-main-content h1,
[data-theme="oneaccounts"] .dl-main-content h2,
[data-theme="oneaccounts"] .dl-main-content h3 {
  color: #1740C8;
}

/* ── Light (green) theme — mirrors oneaccounts overrides above ── */
[data-theme="light"] .mgmt .hero {
  background: linear-gradient(155deg, #021B0E 0%, #04331A 22%, #085C30 50%, #0B7C44 78%, #0F9D58 100%) !important;
  color: white !important; border-radius: 16px; border: none;
}
[data-theme="light"] .mgmt .hero-greeting h2,
[data-theme="light"] .mgmt .hero-greeting p { color: white !important; }
[data-theme="light"] .mgmt .hero .filter-label,
[data-theme="light"] .mgmt .hero .filter-pill { color: rgba(255,255,255,0.9) !important; }
[data-theme="light"] .mgmt .hero .filter-pill {
  background: rgba(255,255,255,0.15) !important;
  border: 1px solid rgba(255,255,255,0.3) !important; color: white !important;
}
[data-theme="light"] .mgmt .hero .filter-pill:focus { border-color: white !important; }

[data-theme="light"] .mgmt .kpi-card {
  border-color: #A7D9BE; box-shadow: 0 1px 3px rgba(15,157,88,0.08);
}

[data-theme="light"] .dl-main-content > div[style*="justify-content: space-between"] {
  background: linear-gradient(155deg, #021B0E 0%, #04331A 22%, #085C30 50%, #0B7C44 78%, #0F9D58 100%) !important;
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 20px;
}
[data-theme="light"] .dl-main-content > div[style*="justify-content: space-between"] h1,
[data-theme="light"] .dl-main-content > div[style*="justify-content: space-between"] p {
  color: white !important;
}

[data-theme="light"] .dl-main-content h1,
[data-theme="light"] .dl-main-content h2,
[data-theme="light"] .dl-main-content h3 {
  color: #0F9D58;
}
'@

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($filePath, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Light theme banner/header CSS added. Backup saved at $backupPath"
} else {
    Write-Host "ERROR: Block not found. No changes made."
}