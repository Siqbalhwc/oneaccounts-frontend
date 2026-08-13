$filePath = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\globals.css"
$backupPath = "$filePath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

$rawContent = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($backupPath, $rawContent, [System.Text.Encoding]::UTF8)
$content = $rawContent -replace "`r`n", "`n"
function Norm($s) { return ($s -replace "`r`n", "`n").TrimEnd("`n") }

$oldPrimary = Norm @'
  --primary: #0F9D58;
  --primary-hover: #0B7C44;
'@
$newPrimary = Norm @'
  --primary: #1740C8;
  --primary-hover: #0F2A8F;
'@

$oldShadow = Norm @'
  --shadow-sm: 0 1px 2px rgba(15,157,88,0.06);
  --shadow: 0 1px 3px rgba(15,157,88,0.08);
  --shadow-lg: 0 4px 12px rgba(15,157,88,0.12);
'@
$newShadow = Norm @'
  --shadow-sm: 0 1px 2px rgba(23,64,200,0.06);
  --shadow: 0 1px 3px rgba(23,64,200,0.08);
  --shadow-lg: 0 4px 12px rgba(23,64,200,0.12);
'@

$oldHeading = Norm @'
[data-theme="oneaccounts"] .dl-main-content h1,
[data-theme="oneaccounts"] .dl-main-content h2,
[data-theme="oneaccounts"] .dl-main-content h3 {
  color: #0F9D58;
}
'@
$newHeading = Norm @'
[data-theme="oneaccounts"] .dl-main-content h1,
[data-theme="oneaccounts"] .dl-main-content h2,
[data-theme="oneaccounts"] .dl-main-content h3 {
  color: #1740C8;
}
'@

$blocks = @(
  @{old=$oldPrimary; new=$newPrimary; label="1 of 3 (oneaccounts primary revert)"},
  @{old=$oldShadow; new=$newShadow; label="2 of 3 (oneaccounts shadow revert)"},
  @{old=$oldHeading; new=$newHeading; label="3 of 3 (heading color revert)"}
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
    Write-Host "SUCCESS: oneaccounts theme reverted to blue. Backup saved at $backupPath"
} else {
    Write-Host "ERROR: One or more blocks not found. No changes were written."
}