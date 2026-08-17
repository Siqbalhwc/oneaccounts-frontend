$path = "src\app\dashboard\settings\projects\page.tsx"
$backup = "$path.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
[System.IO.File]::Copy($path, $backup)
Write-Host "Backup created: $backup"

$content = [System.IO.File]::ReadAllText($path)
$originalContent = $content

# Step 1: Projects fetch
$s1old = @'
      const { data } = await supabase
        .from("projects")
        .select("*, donors(name)")
        .eq("company_id", companyId)
        .order("name")
'@
$s1new = @'
      const { data } = await supabase
        .from("projects")
        .select("*, donors(name)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name")
'@
if ($content.Contains($s1old)) { $content = $content.Replace($s1old, $s1new); Write-Host "Step 1: SUCCESS" } else { Write-Host "Step 1: NOT FOUND" }

# Step 2: Locations fetch
$s2old = @'
      let query = supabase
        .from("locations")
        .select("*, projects(name)")
        .eq("company_id", companyId)
      if (locationProjectFilter) {
'@
$s2new = @'
      let query = supabase
        .from("locations")
        .select("*, projects(name)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
      if (locationProjectFilter) {
'@
if ($content.Contains($s2old)) { $content = $content.Replace($s2old, $s2new); Write-Host "Step 2: SUCCESS" } else { Write-Host "Step 2: NOT FOUND" }

# Step 3: Donors fetch
$s3old = '      const { data } = await supabase.from("donors").select("*").eq("company_id", companyId).order("name")'
$s3new = '      const { data } = await supabase.from("donors").select("*").eq("company_id", companyId).is("deleted_at", null).order("name")'
if ($content.Contains($s3old)) { $content = $content.Replace($s3old, $s3new); Write-Host "Step 3: SUCCESS" } else { Write-Host "Step 3: NOT FOUND" }

if ($content -ne $originalContent) {
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "FILE UPDATED"
} else {
    Write-Host "NO CHANGES MADE"
}