$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$files = @(
  "src\app\dashboard\bills\page.tsx",
  "src\app\dashboard\bills\new\page.tsx",
  "src\app\dashboard\bills\[id]\page.tsx"
)

foreach ($path in $files) {
    if (-not (Test-Path -LiteralPath $path)) {
        Write-Host "FILE NOT FOUND: $path"
        continue
    }
    Copy-Item -LiteralPath $path -Destination "$path.bak_$ts"
    $content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    $before = $content

    $content = [regex]::Replace($content, '[^\x00-\x7F]+ View Online:', 'View Online:')
    $content = [regex]::Replace($content, '[^\x00-\x7F]+ Date: ', 'Date: ')
    $content = [regex]::Replace($content, '[^\x00-\x7F]+ Due: ', 'Due: ')
    $content = [regex]::Replace($content, '[^\x00-\x7F]+ OneAccounts', '- OneAccounts')

    if ($content -ne $before) {
        [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
        Write-Host "Cleaned: $path"
    } else {
        Write-Host "No corrupted characters found in: $path (nothing changed)"
    }
}
Write-Host "Done. Backups saved as .bak_$ts next to each file."