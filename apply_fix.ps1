$path = "src\app\dashboard\settings\projects\page.tsx"
$backup = "$path.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
[System.IO.File]::Copy($path, $backup)
Write-Host "Backup created: $backup"

$content = [System.IO.File]::ReadAllText($path)
$originalContent = $content

$old = "    setSaving(false)`n    setShowModal(false)`n    fetchData()`n    setTimeout(() => setFlash(""), 3000)`n  }"
$new = "    setSaving(false)`n    setShowModal(false)`n    fetchData()`n    // Also refresh the dropdown lookup lists (projects/locations/donors) so a`n    // newly created record shows up immediately in other tabs' Add/Edit pickers`n    // without needing a hard refresh.`n    supabase.from(""projects"").select(""id,name"").eq(""company_id"", companyId).order(""name"")`n      .then(r => r.data && setProjects(r.data))`n    supabase.from(""locations"").select(""id,name"").eq(""company_id"", companyId).order(""name"")`n      .then(r => r.data && setLocations(r.data))`n    supabase.from(""donors"").select(""id,name"").eq(""company_id"", companyId).order(""name"")`n      .then(r => r.data && setDonors(r.data))`n    setTimeout(() => setFlash(""), 3000)`n  }"

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Added dropdown lookup refresh after save"
} else {
    Write-Host "NOT FOUND: The expected code block was not found. No changes made."
}