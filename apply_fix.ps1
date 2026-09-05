$file = "src\app\dashboard\bills\new\page.tsx"
$backup = "src\app\dashboard\bills\new\page.tsx.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

Copy-Item $file $backup
Write-Host "Backup created: $backup"

$lines = Get-Content $file

# Find the two target lines by trimmed match
$showProductsIdx = -1
$businessTypeIdx = -1

for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq 'const showProducts = hasFeature("inventory") && businessType !== "construction"') {
        $showProductsIdx = $i
    }
    if ($lines[$i].Trim() -eq 'const [businessType, setBusinessType] = useState("")') {
        $businessTypeIdx = $i
    }
}

if ($showProductsIdx -eq -1 -or $businessTypeIdx -eq -1) {
    Write-Host "ERROR: Could not find one or both target lines. showProductsIdx=$showProductsIdx businessTypeIdx=$businessTypeIdx. No changes made."
} elseif ($showProductsIdx -gt $businessTypeIdx) {
    Write-Host "INFO: Order is already correct (showProducts at $showProductsIdx is after businessType at $businessTypeIdx). No changes made."
} else {
    $showProductsLine = $lines[$showProductsIdx]
    # Remove the showProducts line
    $newLines = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($i -eq $showProductsIdx) { continue }
        $newLines.Add($lines[$i])
        # businessTypeIdx shifts down by 1 since we removed a line before it
        if ($i -eq $businessTypeIdx) {
            $newLines.Add($showProductsLine)
        }
    }
    [System.IO.File]::WriteAllLines($file, $newLines, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: showProducts line moved after businessType declaration."
}