$ts = Get-Date -Format "yyyyMMdd_HHmmss"

function Patch-File($path, $replacements) {
    if (-not (Test-Path -LiteralPath $path)) {
        Write-Host "FILE NOT FOUND: $path"
        return
    }
    Copy-Item -LiteralPath $path -Destination "$path.bak_$ts"
    $content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    foreach ($r in $replacements) {
        if (-not $content.Contains($r[0])) {
            Write-Host "ANCHOR NOT FOUND in $path -- STOPPING, no changes written for this file:"
            Write-Host $r[0]
            return
        }
        $content = $content.Replace($r[0], $r[1])
    }
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Patched: $path"
}

$r2 = @()
$r2 += ,@(
'        `Dear ${bill.supplier.name},\n\nYour purchase bill ${bill.invoice_no} for PKR ${bill.total?.toLocaleString()} is ready.\nDate: ${bill.date}\nDue: ${bill.due_date}\n\nThank you for your business.\n'
,
'        `Dear ${bill.supplier.name}, Your bill ${bill.invoice_no} of PKR ${bill.total?.toLocaleString()} has been recorded.\n📄 View Online: https://app.oneaccountsbysiqbal.com/bill/${bill.id}\n📅 Date: ${bill.date}   📆 Due: ${bill.due_date}\nThank you for your business.\n'
)
Patch-File "src\app\dashboard\bills\[id]\page.tsx" $r2

Write-Host "Done. Review the .bak_$ts backup before deploying if anything looks off."