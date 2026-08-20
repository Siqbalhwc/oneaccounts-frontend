$path = "src\app\dashboard\settings\projects\page.tsx"
$backup = "$path.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
[System.IO.File]::Copy($path, $backup)
Write-Host "Backup created: $backup"

$content = [System.IO.File]::ReadAllText($path)
$originalContent = $content

$old = @'
    } else if (importType === "activity") {
      await handleImportActivities(rows)
    } else {
      setImportErrors([`Import for ${importType} is not built yet.`])
    }
'@
$new = @'
    } else if (importType === "activity") {
      await handleImportActivities(rows)
    } else if (importType === "location") {
      await handleImportLocations(rows)
    } else {
      setImportErrors([`Import for ${importType} is not built yet.`])
    }
'@

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Wired handleImportLocations into dispatcher"
} else {
    Write-Host "NOT FOUND"
}