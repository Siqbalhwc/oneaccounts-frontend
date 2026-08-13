$filePath = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\globals.css"
$backupPath = "$filePath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

$rawContent = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($backupPath, $rawContent, [System.Text.Encoding]::UTF8)
$content = $rawContent -replace "`r`n", "`n"

function Norm($s) { return ($s -replace "`r`n", "`n").TrimEnd("`n") }

$oldRoot = Norm @'
:root {
  /* Light theme - expert recommended contrast improvements */
  color-scheme: light;
  --bg: #F7F9FC;
  --bg-soft: #F1F4F8;
  --card: #FFFFFF;
  --card-hover: #F9FAFB;
  --card-alt: #F8FAFC;
  --text: #0F172A;
  --text-muted: #475569;
  --text-soft: #94A3B8;
  --border: #E5E7EB;
  --border-strong: #D1D5DB;
  --primary: #2563EB;
  --primary-hover: #1D4ED8;
  --primary-text: #FFFFFF;
  --success: #16A34A;
  --warning: #F59E0B;
  --danger: #EF4444;
  --shell-bg: #F1F4F8;
  --sidebar-bg: #FFFFFF;
  --sidebar-border: #E5E7EB;
  --topbar-bg: #FFFFFF;
  --topbar-border: #E5E7EB;
  --main-bg: #F7F9FC;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow: 0 1px 3px rgba(0,0,0,0.06);
  --shadow-lg: 0 4px 12px rgba(0,0,0,0.08);
  --radius: 12px;
  --font-family: 'Inter', sans-serif;
}
'@

$newRoot = Norm @'
:root {
  /* Green SaaS theme */
  color-scheme: light;
  --bg: #F6FAF8;
  --bg-soft: #EEF5F1;
  --card: #FFFFFF;
  --card-hover: #F5FAF7;
  --card-alt: #F1F8F4;
  --text: #0F1F17;
  --text-muted: #4B6357;
  --text-soft: #8CA599;
  --border: #E1EBE5;
  --border-strong: #C9DBD0;
  --primary: #0F9D58;
  --primary-hover: #0B7C44;
  --primary-text: #FFFFFF;
  --success: #16A34A;
  --warning: #F59E0B;
  --danger: #EF4444;
  --shell-bg: #EEF5F1;
  --sidebar-bg: #FFFFFF;
  --sidebar-border: #E1EBE5;
  --topbar-bg: #FFFFFF;
  --topbar-border: #E1EBE5;
  --main-bg: #F6FAF8;
  --shadow-sm: 0 1px 2px rgba(15,157,88,0.05);
  --shadow: 0 1px 3px rgba(15,157,88,0.08);
  --shadow-lg: 0 4px 12px rgba(15,157,88,0.10);
  --radius: 12px;
  --font-family: 'Inter', sans-serif;
}
'@

$oldGradient1 = Norm @'
  --sidebar-bg: linear-gradient(155deg, #04092E 0%, #071352 18%, #0F2280 40%, #1740C8 72%, #1E55E8 100%);
  --sidebar-border: rgba(255,255,255,0.12);
  --topbar-bg: linear-gradient(155deg, #04092E 0%, #071352 18%, #0F2280 40%, #1740C8 72%, #1E55E8 100%);
'@
$newGradient1 = Norm @'
  --sidebar-bg: linear-gradient(155deg, #021B0E 0%, #04331A 22%, #085C30 50%, #0B7C44 78%, #0F9D58 100%);
  --sidebar-border: rgba(255,255,255,0.12);
  --topbar-bg: linear-gradient(155deg, #021B0E 0%, #04331A 22%, #085C30 50%, #0B7C44 78%, #0F9D58 100%);
'@

$oldPrimary = Norm @'
  --primary: #1740C8;
  --primary-hover: #0F2A8F;
'@
$newPrimary = Norm @'
  --primary: #0F9D58;
  --primary-hover: #0B7C44;
'@

$oldShadow = Norm @'
  --shadow-sm: 0 1px 2px rgba(23,64,200,0.06);
  --shadow: 0 1px 3px rgba(23,64,200,0.08);
  --shadow-lg: 0 4px 12px rgba(23,64,200,0.12);
'@
$newShadow = Norm @'
  --shadow-sm: 0 1px 2px rgba(15,157,88,0.06);
  --shadow: 0 1px 3px rgba(15,157,88,0.08);
  --shadow-lg: 0 4px 12px rgba(15,157,88,0.12);
'@

$oldHeading = Norm @'
[data-theme="oneaccounts"] .dl-main-content h1,
[data-theme="oneaccounts"] .dl-main-content h2,
[data-theme="oneaccounts"] .dl-main-content h3 {
  color: #1740C8;
}
'@
$newHeading = Norm @'
[data-theme="oneaccounts"] .dl-main-content h1,
[data-theme="oneaccounts"] .dl-main-content h2,
[data-theme="oneaccounts"] .dl-main-content h3 {
  color: #0F9D58;
}
'@

$blocks = @(
  @{old=$oldRoot; new=$newRoot; label="1 of 5 (root palette)"},
  @{old=$oldGradient1; new=$newGradient1; label="2 of 5 (sidebar/topbar gradient)"},
  @{old=$oldPrimary; new=$newPrimary; label="3 of 5 (oneaccounts primary)"},
  @{old=$oldShadow; new=$newShadow; label="4 of 5 (oneaccounts shadows)"},
  @{old=$oldHeading; new=$newHeading; label="5 of 5 (headings color)"}
)

$allFound = $true
foreach ($b in $blocks) {
    if ($content.Contains($b.old)) {
        $content = $content.Replace($b.old, $b.new)
        Write-Host "Step $($b.label): OK"
    } else {
        Write-Host "Step $($b.label): NOT FOUND"
        $allFound = $false
    }
}

if ($allFound) {
    [System.IO.File]::WriteAllText($filePath, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Green theme applied. Backup saved at $backupPath"
} else {
    Write-Host "ERROR: One or more blocks not found. No changes were written. Please tell Claude which steps said NOT FOUND."
}