$filePath = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\globals.css"
$backupPath = "$filePath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

$rawContent = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($backupPath, $rawContent, [System.Text.Encoding]::UTF8)
$content = $rawContent -replace "`r`n", "`n"

$addition = @"

/* ── Ledger sort-header fix: force flat/transparent buttons inside
   ledger column headers, overriding any global button chrome that
   was causing a rounded "pill" appearance on each column heading. ── */
.ledger-header button,
.ledger-header .sort-btn {
  background: none !important;
  background-color: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  padding: 0 !important;
  -webkit-appearance: none !important;
  appearance: none !important;
}
.ledger-header button:hover,
.ledger-header .sort-btn:hover {
  background: none !important;
  box-shadow: none !important;
}
"@

$content = $content.TrimEnd() + "`n" + $addition + "`n"
[System.IO.File]::WriteAllText($filePath, $content, [System.Text.Encoding]::UTF8)
Write-Host "SUCCESS: Ledger sort-header pill fix appended. Backup saved at $backupPath"