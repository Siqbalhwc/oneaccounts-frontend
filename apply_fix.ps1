$path = "src\app\dashboard\invoices\new\page.tsx"
$raw = Get-Content -Raw $path
$hadCRLF = $raw -match "`r`n"
$content = $raw -replace "`r`n", "`n"

$edits = @()

$edits += @{
  Name = "A-select-query"
  Old = '.select("bank_name, account_title, account_number, show_on_invoice")'
  New = '.select("bank_name, account_number, show_on_invoice")'
}

$edits += @{
  Name = "B-mapping"
  Old = "accountTitle: b.account_title,"
  New = "accountTitle: b.bank_name,"
}

$allGood = $true
foreach ($e in $edits) {
  $c = ([regex]::Matches($content, [regex]::Escape($e.Old))).Count
  Write-Host "$($e.Name): matches found = $c"
  if ($e.Name -eq "B-mapping") {
    if ($c -lt 1) { $allGood = $false }
  } else {
    if ($c -ne 1) { $allGood = $false }
  }
}

if (-not $allGood) {
  Write-Host "One or more anchors did not match as expected - stopping, NO changes made." -ForegroundColor Red
  exit 1
}

foreach ($e in $edits) {
  $content = $content.Replace($e.Old, $e.New)
}

if ($hadCRLF) { $content = $content -replace "`n", "`r`n" }
Set-Content -Path $path -Value $content -NoNewline

$remaining = ([regex]::Matches($content, [regex]::Escape("account_title"))).Count
Write-Host "Remaining references to account_title in file: $remaining (should be 0)"
Write-Host "SUCCESS: bank account query fixed" -ForegroundColor Green