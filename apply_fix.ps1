$file = "src\app\dashboard\products\page.tsx"
$content = [System.IO.File]::ReadAllText($file)

$old = @"
                            const formula = rows.map((r: any) => `(`+Number(r.qty)+` x `+Number(r.unit_price).toFixed(2)+`)`).join(' + ')
"@

$new = @"
                            const formula = rows.map((r: any) => "(" + Number(r.qty) + " x " + Number(r.unit_price).toFixed(2) + ")").join(" + ")
"@

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    Write-Host "Formula line fixed."
} else {
    Write-Host "Anchor NOT found - checking file manually needed."
}

[System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)