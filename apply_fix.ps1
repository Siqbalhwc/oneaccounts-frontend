$path = "src\app\dashboard\products\page.tsx"
$content = Get-Content $path -Raw

$old = '                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 600 }}>{closing}</td>'

$new = '                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 600 }}>{closing} {productUnit}</td>'

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
if ($count -ne 1) {
    Write-Host "SAFETY CHECK FAILED: expected 1 match, found $count. No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old, $new)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}