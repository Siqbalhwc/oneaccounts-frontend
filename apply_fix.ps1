$path = "src\app\dashboard\projects\page.tsx"
$backup = "$path.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
[System.IO.File]::Copy($path, $backup)
Write-Host "Backup created: $backup"

$content = [System.IO.File]::ReadAllText($path)
$originalContent = $content

$old = '                            : "No Budget"}'
$new = '                            : "Not Submitted"}'

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Renamed badge label to Not Submitted"
} else {
    Write-Host "NOT FOUND"
}