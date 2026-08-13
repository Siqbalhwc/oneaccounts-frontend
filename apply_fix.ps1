$filePath = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\dashboard\invoices\new\page.tsx"
$backupPath = "$filePath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

$content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($backupPath, $content, [System.Text.Encoding]::UTF8)

$old = 'const isDark = themeMode === "dark" || themeMode === "oneaccounts"'
$new = 'const isDark = themeMode === "dark"'

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($filePath, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Theme detection corrected. Backup saved at $backupPath"
} else {
    Write-Host "ERROR: Block not found. No changes made."
}