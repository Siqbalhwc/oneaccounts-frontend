$path = "src\app\dashboard\payments\[id]\page.tsx"
$raw = Get-Content -LiteralPath $path -Raw
$hadCRLF = $raw -match "`r`n"
$content = $raw -replace "`r`n", "`n"

function Norm($s) { return ($s -replace "`r`n", "`n") }

$old = Norm(@'
      {uploadSuccess && (
        <div className="toast">
          <CheckCircle size={16} /> {uploadSuccess}
        </div>
      )}
'@)
$new = ""

$c = ([regex]::Matches($content, [regex]::Escape($old))).Count
Write-Host "uploadSuccess-toast: matches found = $c"

if ($c -ne 1) {
  Write-Host "Anchor did not match exactly once - stopping, NO changes made." -ForegroundColor Red
  exit 1
}

$content = $content.Replace($old, $new)

if ($hadCRLF) { $content = $content -replace "`n", "`r`n" }
Set-Content -LiteralPath $path -Value $content -NoNewline
Write-Host "SUCCESS: removed leftover uploadSuccess toast" -ForegroundColor Green