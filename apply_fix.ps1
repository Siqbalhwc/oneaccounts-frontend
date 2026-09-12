$ErrorActionPreference = "Stop"
$path = "src\app\dashboard\products\new\page.tsx"
$backup = "$path.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

Copy-Item $path $backup
Write-Host "Backup created: $backup"

$content = [System.IO.File]::ReadAllText($path)
$normalized = $content -replace "`r`n", "`n"

$old = @'
                <option value="Yard">Yard</option>
                <option value="Dozen">Dozen</option>
'@

$new = @'
                <option value="Yard">Yard</option>
                <option value="Feet">Feet</option>
                <option value="Dozen">Dozen</option>
'@

$oldN = $old -replace "`r`n", "`n"
$newN = $new -replace "`r`n", "`n"

if ($normalized.Contains($oldN)) {
    $normalized = $normalized.Replace($oldN, $newN)
    $final = $normalized -replace "`n", "`r`n"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, $final, $utf8NoBom)
    Write-Host "SUCCESS: Feet unit added."
} else {
    Write-Host "NOT FOUND: anchor block did not match. No changes made."
}