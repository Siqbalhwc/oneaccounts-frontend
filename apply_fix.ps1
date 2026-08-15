$path = "src\app\api\budgets\save\route.ts"
$backup = "$path.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
[System.IO.File]::Copy($path, $backup)
Write-Host "Backup created: $backup"

$content = [System.IO.File]::ReadAllText($path)
$originalContent = $content

$old = "    })`n    return NextResponse.json({ success: true })"
$new = "    })`n    if (auditError) {`n      console.error('Failed to write budget audit log:', auditError.message)`n    }`n    return NextResponse.json({ success: true })"

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    Write-Host "Step 5b: SUCCESS"
} else {
    Write-Host "Step 5b: NOT FOUND"
}

if ($content -ne $originalContent) {
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "FILE UPDATED"
} else {
    Write-Host "NO CHANGES MADE"
}