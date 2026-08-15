$path = "src\app\dashboard\settings\budgets\page.tsx"
$backup = "$path.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
[System.IO.File]::Copy($path, $backup)
Write-Host "Backup created: $backup"

$content = [System.IO.File]::ReadAllText($path)

$old = @"
          const budget = data[activityId][locationId][accountId].budget
          if (budget <= 0) continue
"@

$new = @"
          const budget = data[activityId][locationId][accountId].budget
"@

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Removed the budget<=0 skip in handleSave"
} else {
    Write-Host "NOT FOUND: The expected code block was not found. No changes made."
}