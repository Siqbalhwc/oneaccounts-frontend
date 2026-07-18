$path = "src\app\dashboard\bills\new\page.tsx"
$content = Get-Content $path -Raw

$old = @"
                          label="Add Item"
                          allowCreate={false}
                        />
"@

$new = @"
                          label="Add Item"
                          allowCreate={false}
                          clearCacheOnOpen
                        />
"@

$matchCount = ([regex]::Matches($content, [regex]::Escape($old))).Count

if ($matchCount -ne 1) {
    Write-Host "SAFETY CHECK FAILED: expected exactly 1 match, found $matchCount. No changes made." -ForegroundColor Red
} else {
    $updated = $content.Replace($old, $new)
    Set-Content -Path $path -Value $updated -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}