$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$path = "src\app\dashboard\suppliers\new\page.tsx"

if (-not (Test-Path $path)) {
    Write-Host "ABORT: File not found: $path" -ForegroundColor Red
    return
}

$backupPath = "$path.bak_$(Get-Date -Format yyyyMMdd_HHmmss)"
Copy-Item -Path $path -Destination $backupPath
Write-Host "Backup created: $backupPath" -ForegroundColor Yellow

$lines = Get-Content -Path $path

function Apply-BlockFix {
    param([string[]]$Lines, [string[]]$OldTrimmed, [string[]]$NewTrimmed, [string]$Label)

    $blockLen = $OldTrimmed.Count
    $matchIndexes = @()
    for ($i = 0; $i -le ($Lines.Count - $blockLen); $i++) {
        $isMatch = $true
        for ($k = 0; $k -lt $blockLen; $k++) {
            if ($Lines[$i + $k].Trim() -ne $OldTrimmed[$k]) { $isMatch = $false; break }
        }
        if ($isMatch) { $matchIndexes += $i }
    }

    if ($matchIndexes.Count -ne 1) {
        Write-Host "ABORT ($Label): found $($matchIndexes.Count) times (expected 1)." -ForegroundColor Red
        return $null
    }

    $startIdx = $matchIndexes[0]
    $newBlockLines = @()
    $baseIndent = ($Lines[$startIdx] -replace '\S.*$', '')
    foreach ($t in $NewTrimmed) {
        $newBlockLines += ($baseIndent + $t)
    }

    $before = if ($startIdx -gt 0) { $Lines[0..($startIdx - 1)] } else { @() }
    $afterStart = $startIdx + $blockLen
    $after = if ($afterStart -le ($Lines.Count - 1)) { $Lines[$afterStart..($Lines.Count - 1)] } else { @() }

    Write-Host "OK ($Label): matched at line $($startIdx + 1)" -ForegroundColor Green
    return ($before + $newBlockLines + $after)
}

# ---------- Edit 1: add country_code to payload ----------
$old0 = @("opening_balance: isNaN(balance) ? 0 : balance,", "balance: isNaN(balance) ? 0 : balance,", "payment_terms: paymentTerms,")
$new0 = @("opening_balance: isNaN(balance) ? 0 : balance,", "balance: isNaN(balance) ? 0 : balance,", "payment_terms: paymentTerms,", "country_code: countryCode,")
$lines = Apply-BlockFix -Lines $lines -OldTrimmed $old0 -NewTrimmed $new0 -Label "add country_code"
if ($null -eq $lines) { return }

# ---------- Edit 2: update path (stop before setFlash - leave that line untouched) ----------
$old1 = @(
    "// Update",
    "const { error: updateErr } = await supabase",
    ".from(`"suppliers`")",
    ".update(payload)",
    '.eq("id", Number(editId))',
    '.eq("company_id", companyId)',
    "if (updateErr) {",
    "setError(updateErr.message)",
    "setLoading(false)",
    "return",
    "}"
)
$new1 = @(
    "// Update - routed through /api/suppliers PUT",
    'const putRes = await fetch("/api/suppliers", {',
    'method: "PUT",',
    'headers: { "Content-Type": "application/json" },',
    "body: JSON.stringify({ id: Number(editId), ...payload }),",
    "})",
    "const putData = await putRes.json()",
    "if (!putRes.ok || !putData.success) {",
    'setError(putData.error || "Update failed")',
    "setLoading(false)",
    "return",
    "}"
)
$lines = Apply-BlockFix -Lines $lines -OldTrimmed $old1 -NewTrimmed $new1 -Label "update path"
if ($null -eq $lines) { return }

# ---------- Edit 3: insert path (stop before setFlash - leave that line untouched) ----------
$old2 = @(
    "// Insert",
    "const { data, error: insertErr } = await supabase",
    ".from(`"suppliers`")",
    '.insert({ ...payload, created_by: userEmail })',
    '.select("id, code, name")',
    ".single()",
    "if (insertErr) {",
    'if (insertErr.message?.includes("duplicate key")) {',
    'setError("This code already exists. Please refresh to regenerate.")',
    "} else {",
    "setError(insertErr.message)",
    "}",
    "setLoading(false)",
    "return",
    "}",
    "if (balance !== 0 && data) {",
    "try {",
    'await fetch("/api/suppliers/opening-entry", {',
    'method: "POST",',
    'headers: { "Content-Type": "application/json" },',
    "body: JSON.stringify({ supplierId: data.id, supplierName: data.name, amount: balance }),",
    "})",
    "} catch (err) {",
    'console.error("Opening entry failed:", err)',
    "}",
    "}"
)
$new2 = @(
    "// Insert - routed through /api/suppliers POST",
    'const postRes = await fetch("/api/suppliers", {',
    'method: "POST",',
    'headers: { "Content-Type": "application/json" },',
    "body: JSON.stringify(payload),",
    "})",
    "const postResult = await postRes.json()",
    "if (!postRes.ok || !postResult.success) {",
    'setError(postResult.error || "Insert failed")',
    "setLoading(false)",
    "return",
    "}",
    "const data = postResult.supplier"
)
$lines = Apply-BlockFix -Lines $lines -OldTrimmed $old2 -NewTrimmed $new2 -Label "insert path"
if ($null -eq $lines) { return }

[System.IO.File]::WriteAllText($path, ($lines -join "`r`n"), $utf8NoBom)
Write-Host "FIXED (encoding-safe): $path" -ForegroundColor Green