$filePath = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\api\general-ledger\route.ts"
$backupPath = "$filePath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

$rawContent = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($backupPath, $rawContent, [System.Text.Encoding]::UTF8)
$content = $rawContent -replace "`r`n", "`n"
function Norm($s) { return ($s -replace "`r`n", "`n").TrimEnd("`n") }

$old1 = Norm @'
    const { data: allLines, error: allErr } = await baseQuery(
      supabase.from('journal_lines')
        .select('id, debit, credit, journal_entries!inner(entry_no, date, description, id)')
    )
'@
$new1 = Norm @'
    const { data: allLines, error: allErr } = await baseQuery(
      supabase.from('journal_lines')
        .select('id, debit, credit, journal_entries!inner(entry_no, date, description, id, created_at)')
    )
'@

$old2 = Norm @'
    // 3. Sort and compute balances
    const sorted = [...allLines].sort((a: any, b: any) =>
      (a.journal_entries?.date || '').localeCompare(b.journal_entries?.date || '')
    )
'@
$new2 = Norm @'
    // 3. Sort and compute balances — date first, then real creation time as a
    // same-day tiebreaker so entries reflect true chronological order.
    const sorted = [...allLines].sort((a: any, b: any) => {
      const dateA = a.journal_entries?.date || ''
      const dateB = b.journal_entries?.date || ''
      const dateCompare = dateA.localeCompare(dateB)
      if (dateCompare !== 0) return dateCompare
      const createdA = a.journal_entries?.created_at || ''
      const createdB = b.journal_entries?.created_at || ''
      return createdA.localeCompare(createdB)
    })
'@

$blocks = @(
  @{old=$old1; new=$new1; label="1 of 2 (fetch created_at)"},
  @{old=$old2; new=$new2; label="2 of 2 (sort by date + created_at)"}
)

$allFound = $true
foreach ($b in $blocks) {
    if ($content.Contains($b.old)) {
        $content = $content.Replace($b.old, $b.new)
        Write-Host "Step $($b.label): OK"
    } else {
        Write-Host "Step $($b.label): NOT FOUND"
        $allFound = $false
    }
}

if ($allFound) {
    [System.IO.File]::WriteAllText($filePath, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: General ledger API now sorts by true creation order within each day. Backup saved at $backupPath"
} else {
    Write-Host "ERROR: One or more blocks not found. No changes were written."
}