$filePath = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\dashboard\reports\vendor-ledger\page.tsx"
$backupPath = "$filePath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

$rawContent = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($backupPath, $rawContent, [System.Text.Encoding]::UTF8)
$content = $rawContent -replace "`r`n", "`n"
function Norm($s) { return ($s -replace "`r`n", "`n").TrimEnd("`n") }

$old = Norm @'
                <button className="sort-btn" onClick={() => handleSort("running_balance")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Balance {getSortIcon("running_balance")}</button>
'@
$new = Norm @'
                <span className="sort-btn" style={{ textAlign: "right", justifyContent: "flex-end", cursor: "default" }}>Balance</span>
'@

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($filePath, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Balance column sorting removed. Backup saved at $backupPath"
} else {
    Write-Host "ERROR: Block not found. No changes made."
}