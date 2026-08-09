$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$path = "src\app\api\customers\route.ts"

if (-not (Test-Path $path)) {
    Write-Host "ABORT: File not found: $path" -ForegroundColor Red
    return
}

$backupPath = "$path.bak_$(Get-Date -Format yyyyMMdd_HHmmss)"
Copy-Item -Path $path -Destination $backupPath
Write-Host "Backup created: $backupPath" -ForegroundColor Yellow

$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

$old = @'
      // 1. Find the old opening balance journal entry (if any)
      const { data: oldEntry } = await serviceSupabase
        .from('journal_entries')
        .select('id, entry_no, date, description')
        .eq('company_id', companyId)
        .ilike('description', `%Opening balance for customer ${id}%`)
        .maybeSingle()
'@

$new = @'
      // 1. Find the old opening balance journal entry (if any)
      // RELIABLE LOOKUP (fixed): find the MOST RECENT opening-balance journal entry
      // via source_type/source_id instead of matching journal_entries.description text.
      // The old ILIKE match broke after the first edit, since both the reversal entry
      // ("Reversal of old opening balance for customer X") and the new entry
      // ("Opening balance for customer X") contain the same substring, and unpadded
      // customer IDs could also cross-match (e.g. "customer 1" matching "customer 15").
      // Same root pattern as the B4 vendor-payment fix.
      const { data: latestOpeningLine } = await serviceSupabase
        .from('journal_lines')
        .select('entry_id')
        .eq('company_id', companyId)
        .eq('source_type', 'opening_balance')
        .eq('source_id', id)
        .order('entry_id', { ascending: false })
        .limit(1)
        .maybeSingle()

      const oldEntry = latestOpeningLine ? { id: latestOpeningLine.entry_id } : null
'@

if ($content -notmatch [regex]::Escape($old)) {
    Write-Host "ABORT: Original snippet not found. No changes made." -ForegroundColor Red
    return
}

$countMatches = ([regex]::Matches($content, [regex]::Escape($old))).Count
if ($countMatches -gt 1) {
    Write-Host "ABORT: Snippet found $countMatches times (expected 1). No changes made." -ForegroundColor Red
    return
}

$newContent = $content.Replace($old, $new)
[System.IO.File]::WriteAllText($path, $newContent, $utf8NoBom)

Write-Host "FIXED (encoding-safe): $path" -ForegroundColor Greens