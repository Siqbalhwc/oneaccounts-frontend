$path = "src\app\dashboard\reports\product-ledger\page.tsx"
$content = Get-Content $path -Raw

$old = @'
      totalInflow, totalOutflow, closingBalance,
      ledgerLines: sortedLines,
    }
'@

$new = @'
      totalInflow, totalOutflow, closingBalance,
      unit: product?.unit || "PCS",
      ledgerLines: sortedLines,
    }
'@

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
if ($count -ne 1) {
    Write-Host "SAFETY CHECK FAILED: expected 1 match, found $count. No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old, $new)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}