$filePath = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\api\general-ledger\route.ts"
$backupPath = "$filePath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

$rawContent = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($backupPath, $rawContent, [System.Text.Encoding]::UTF8)
$content = $rawContent -replace "`r`n", "`n"
function Norm($s) { return ($s -replace "`r`n", "`n").TrimEnd("`n") }

$old = Norm @'
    let running = openingBalance
    const finalLines: any[] = [
      {
        id: 'opening',
        entry_no: '',
        entry_id: null,
        date: startDate,
        description: 'Opening Balance',
        debit: openingBalance > 0 ? openingBalance : 0,
        credit: openingBalance < 0 ? -openingBalance : 0,
        running_balance: openingBalance,
        isOpening: true,
      },
    ]
'@
$new = Norm @'
    let running = openingBalance
    const finalLines: any[] = openingBalance !== 0 ? [
      {
        id: 'opening',
        entry_no: '',
        entry_id: null,
        date: startDate,
        description: 'Opening Balance',
        debit: openingBalance > 0 ? openingBalance : 0,
        credit: openingBalance < 0 ? -openingBalance : 0,
        running_balance: openingBalance,
        isOpening: true,
      },
    ] : []
'@

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($filePath, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: General ledger no longer shows a zero-balance opening line. Backup saved at $backupPath"
} else {
    Write-Host "ERROR: Block not found. No changes made."
}