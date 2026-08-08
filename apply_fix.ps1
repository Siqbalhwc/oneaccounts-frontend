$ErrorActionPreference = "Stop"

function Apply-BlockFix {
    param(
        [string]$Path,
        [string[]]$OldTrimmed,
        [string[]]$NewTrimmed
    )

    if (-not (Test-Path $Path)) {
        Write-Host "ABORT: File not found: $Path" -ForegroundColor Red
        return
    }

    $lines = Get-Content -Path $Path
    $blockLen = $OldTrimmed.Count
    $matchIndexes = @()

    for ($i = 0; $i -le ($lines.Count - $blockLen); $i++) {
        $isMatch = $true
        for ($k = 0; $k -lt $blockLen; $k++) {
            if ($lines[$i + $k].Trim() -ne $OldTrimmed[$k]) {
                $isMatch = $false
                break
            }
        }
        if ($isMatch) { $matchIndexes += $i }
    }

    if ($matchIndexes.Count -eq 0) {
        Write-Host "ABORT: Anchor block not found in $Path. No changes made." -ForegroundColor Red
        return
    }
    if ($matchIndexes.Count -gt 1) {
        Write-Host "ABORT: Anchor block found $($matchIndexes.Count) times in $Path (expected 1). No changes made." -ForegroundColor Red
        return
    }

    $startIdx = $matchIndexes[0]

    # Backup before touching anything
    $backupPath = "$Path.bak_$(Get-Date -Format yyyyMMdd_HHmmss)"
    Copy-Item -Path $Path -Destination $backupPath
    Write-Host "Backup created: $backupPath" -ForegroundColor Yellow

    $newBlockLines = @()
    for ($k = 0; $k -lt $blockLen; $k++) {
        $originalLine = $lines[$startIdx + $k]
        $indent = ($originalLine -replace '\S.*$', '')
        $newBlockLines += ($indent + $NewTrimmed[$k])
    }

    $before = if ($startIdx -gt 0) { $lines[0..($startIdx - 1)] } else { @() }
    $afterStart = $startIdx + $blockLen
    $after = if ($afterStart -le ($lines.Count - 1)) { $lines[$afterStart..($lines.Count - 1)] } else { @() }

    $result = $before + $newBlockLines + $after
    Set-Content -Path $Path -Value $result -Encoding UTF8

    Write-Host "FIXED: $Path (block replaced at line $($startIdx + 1))" -ForegroundColor Green
}

# ---------- Customer form ----------
$customerOld = @(
    'const fullPhone = customer.phone || ""',
    'const match = fullPhone.match(/^(\+\d{1,3})(.*)$/)',
    'if (match) {',
    'setCountryCode(match[1])',
    'setPhoneNumber(match[2].trim())',
    '} else {',
    'setPhoneNumber(fullPhone)',
    '}'
)
$customerNew = @(
    'const fullPhone = customer.phone || ""',
    'const matchedCode = COUNTRY_CODES.slice().sort((a, b) => b.code.length - a.code.length).find(c => fullPhone.startsWith(c.code))',
    'if (matchedCode) {',
    'setCountryCode(matchedCode.code)',
    'setPhoneNumber(fullPhone.slice(matchedCode.code.length).trim())',
    '} else {',
    'setPhoneNumber(fullPhone)',
    '}'
)
Apply-BlockFix -Path "src\app\dashboard\customers\new\page.tsx" -OldTrimmed $customerOld -NewTrimmed $customerNew

# ---------- Supplier form ----------
$supplierOld = @(
    'const phone = supData.phone || ""',
    'let cc = "+92"',
    'let ph = ""',
    'if (phone && phone.startsWith("+")) {',
    'const match = phone.match(/^(\+\d{1,3})(.*)/)',
    'if (match) {',
    'cc = match[1]',
    'ph = match[2].trim()',
    '}',
    '}',
    'setCountryCode(cc)',
    'setPhoneNumber(ph)'
)
$supplierNew = @(
    'const phone = supData.phone || ""',
    'let cc = "+92"',
    'let ph = ""',
    'if (phone && phone.startsWith("+")) {',
    'const matchedCode = COUNTRY_CODES.slice().sort((a, b) => b.code.length - a.code.length).find(c => phone.startsWith(c.code))',
    'if (matchedCode) {',
    'cc = matchedCode.code',
    'ph = phone.slice(matchedCode.code.length).trim()',
    '}',
    '}',
    'setCountryCode(cc)',
    'setPhoneNumber(ph)'
)
Apply-BlockFix -Path "src\app\dashboard\suppliers\new\page.tsx" -OldTrimmed $supplierOld -NewTrimmed $supplierNew

Write-Host ""
Write-Host "Done. Review the FIXED/ABORT messages above before deploying." -ForegroundColor Cyan