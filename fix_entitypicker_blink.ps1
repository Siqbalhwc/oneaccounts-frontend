$path = "src\components\entity-picker\EntityPicker.tsx"
$content = Get-Content $path -Raw

$old = "}, [isOpen, companyId, tableName, allRecords, entityType, config, allowedIds, clearCacheOnOpen, onRecordsRefreshed])"

$new = "}, [isOpen, companyId, tableName, entityType, config, allowedIds, clearCacheOnOpen, onRecordsRefreshed])"

$matchCount = ([regex]::Matches($content, [regex]::Escape($old))).Count

if ($matchCount -ne 1) {
    Write-Host "SAFETY CHECK FAILED: expected exactly 1 match, found $matchCount. No changes made." -ForegroundColor Red
} else {
    $updated = $content.Replace($old, $new)
    Set-Content -Path $path -Value $updated -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}