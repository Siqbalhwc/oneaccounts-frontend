$path = "src\app\dashboard\payments\new\page.tsx"
$content = Get-Content $path -Raw

$old = @'
            allocations: allocationsPayload.map(a => ({
              bill_id: a.invoice_id,
              amount: a.allocated_amount,
            })),
          }),
        })
'@

$new = @'
            allocations: allocationsPayload.map(a => ({
              bill_id: a.invoice_id,
              amount: a.allocated_amount,
            })),
            opening_allocation: openingNet || 0,
          }),
        })
'@

$count = ([regex]::Matches($content, [regex]::Escape($old))).Count
if ($count -ne 1) {
    Write-Host "SAFETY CHECK FAILED: expected 1 match, found $count. No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old, $new)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}