$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$path = "src\app\dashboard\reports\vendor-ledger\page.tsx"

if (-not (Test-Path $path)) {
    Write-Host "ABORT: File not found: $path" -ForegroundColor Red
    return
}

$backupPath = "$path.bak_$(Get-Date -Format yyyyMMdd_HHmmss)"
Copy-Item -Path $path -Destination $backupPath
Write-Host "Backup created: $backupPath" -ForegroundColor Yellow

$lines = Get-Content -Path $path -Encoding UTF8

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
    $baseIndent = ($Lines[$startIdx] -replace '\S.*$', '')
    $newBlockLines = @()
    foreach ($t in $NewTrimmed) {
        if ($t -eq "") { $newBlockLines += "" } else { $newBlockLines += ($baseIndent + $t) }
    }
    $before = if ($startIdx -gt 0) { $Lines[0..($startIdx - 1)] } else { @() }
    $afterStart = $startIdx + $blockLen
    $after = if ($afterStart -le ($Lines.Count - 1)) { $Lines[$afterStart..($Lines.Count - 1)] } else { @() }
    Write-Host "OK ($Label): matched at line $($startIdx + 1)" -ForegroundColor Green
    return ($before + $newBlockLines + $after)
}

# ---------- Insertion 1: fetch supplier_opening journal lines ----------
$old0 = @('// 5. Build ledger lines')
$new0 = @(
    '// 4b. Opening balance journal lines tagged directly to this supplier',
    'const { data: openingBalanceLines } = apAccount',
    '? await supabase',
    '.from("journal_lines")',
    '.select(`',
    'id, debit, credit, entry_id, source_type, source_id,',
    'journal_entries ( date, description, entry_no )',
    '`)',
    '.eq("company_id", companyId)',
    '.eq("account_id", apAccount.id)',
    '.eq("source_type", "supplier_opening")',
    '.eq("source_id", selectedSupplierId)',
    ': { data: [] as any[] }',
    '',
    '// 5. Build ledger lines'
)
$lines = Apply-BlockFix -Lines $lines -OldTrimmed $old0 -NewTrimmed $new0 -Label "fetch opening lines"
if ($null -eq $lines) { return }

# ---------- Insertion 2: bucket supplier_opening lines into periodLines/opening totals ----------
$old1 = @('periodLines.sort((a, b) => a.date.localeCompare(b.date))')
$new1 = @(
    'for (const line of openingBalanceLines || []) {',
    'const je = (line as any).journal_entries',
    'const lineDate: string | undefined = je?.date',
    'if (!lineDate) continue',
    'const debit = line.debit || 0',
    'const credit = line.credit || 0',
    'if (lineDate < startDate) {',
    'openingDebit += debit',
    'openingCredit += credit',
    'continue',
    '}',
    'if (lineDate > endDate) continue',
    'periodLines.push({',
    'id: `ob-${line.id}`,',
    'entry_no: je?.entry_no || "OB",',
    'date: lineDate,',
    'description: je?.description || "Opening Balance Entry",',
    'debit,',
    'credit,',
    'running_balance: 0,',
    '})',
    '}',
    '',
    'periodLines.sort((a, b) => a.date.localeCompare(b.date))'
)
$lines = Apply-BlockFix -Lines $lines -OldTrimmed $old1 -NewTrimmed $new1 -Label "bucket opening lines"
if ($null -eq $lines) { return }

# ---------- Edit 3: only fall back to supplier.opening_balance field if no tagged entries exist ----------
$old2 = @('const openingNet = openingDebit - openingCredit - (supplier.opening_balance || 0)')
$new2 = @(
    'const hasTaggedOpeningEntry = (openingBalanceLines || []).length > 0',
    'const openingNet = openingDebit - openingCredit - (hasTaggedOpeningEntry ? 0 : (supplier.opening_balance || 0))'
)
$lines = Apply-BlockFix -Lines $lines -OldTrimmed $old2 -NewTrimmed $new2 -Label "fallback condition"
if ($null -eq $lines) { return }

[System.IO.File]::WriteAllText($path, ($lines -join "`r`n"), $utf8NoBom)
Write-Host "FIXED (encoding-safe): $path" -ForegroundColor Green