$path = "src\app\dashboard\bills\new\page.tsx"
$raw = Get-Content -Raw $path

# Normalize to LF for reliable matching, remember if original was CRLF
$hadCRLF = $raw -match "`r`n"
$content = $raw -replace "`r`n", "`n"

$old1 = "let spentQuery = supabase.from(""journal_lines"")`n        .select(""debit, credit"")"
$new1 = "let spentQuery = supabase.from(""journal_lines"")`n        .select(""debit, credit, source_type, source_id"")"

$old2 = "const { data: spentRows } = await spentQuery`n      const actualSpent = (spentRows || []).reduce(`n        (sum: number, line: any) => sum + (line.debit || 0) - (line.credit || 0),`n        0`n      )"
$new2 = "const { data: spentRows } = await spentQuery`n      // Exclude this bill's own existing journal lines when editing, so the live`n      // budget preview matches what the backend will show after save (the backend`n      // releases this bill's old budget usage at submit time, before re-validating).`n      const currentBillId = editId ? Number(editId) : null`n      const actualSpent = (spentRows || [])`n        .filter((line: any) => !(currentBillId && line.source_type === 'purchase_bill' && line.source_id === currentBillId))`n        .reduce(`n          (sum: number, line: any) => sum + (line.debit || 0) - (line.credit || 0),`n          0`n        )"

$count1 = ([regex]::Matches($content, [regex]::Escape($old1))).Count
$count2 = ([regex]::Matches($content, [regex]::Escape($old2))).Count

Write-Host "Anchor 1 matches found: $count1"
Write-Host "Anchor 2 matches found: $count2"

if ($count1 -ne 1) {
    Write-Host "ANCHOR 1 must match exactly once - stopping, no changes made." -ForegroundColor Red
    exit 1
}
if ($count2 -ne 1) {
    Write-Host "ANCHOR 2 must match exactly once - stopping, no changes made." -ForegroundColor Red
    exit 1
}

$content = $content.Replace($old1, $new1)
$content = $content.Replace($old2, $new2)

if ($hadCRLF) { $content = $content -replace "`n", "`r`n" }

Set-Content -Path $path -Value $content -NoNewline
Write-Host "SUCCESS: both edits applied" -ForegroundColor Green