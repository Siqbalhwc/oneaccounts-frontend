$filePath = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\dashboard\reports\product-ledger\page.tsx"
$backupPath = "$filePath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

$rawContent = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($backupPath, $rawContent, [System.Text.Encoding]::UTF8)
$content = $rawContent -replace "`r`n", "`n"
function Norm($s) { return ($s -replace "`r`n", "`n").TrimEnd("`n") }

$old1 = Norm @'
    const allLines: any[] = []
    if (moves) {
      moves.forEach((move: any) => {
        const qty = move.qty || 0
        allLines.push({
          id: `move-${move.id}`,
          date: move.date,
          type: move.move_type || "Movement",
          ref: move.ref || move.reason || "",
          qty_in: qty > 0 ? qty : 0,
          qty_out: qty < 0 ? -qty : 0,
        })
      })
    }

    allLines.sort((a, b) => a.date.localeCompare(b.date))
'@
$new1 = Norm @'
    const allLines: any[] = []
    if (moves) {
      moves.forEach((move: any) => {
        const qty = move.qty || 0
        allLines.push({
          id: `move-${move.id}`,
          moveId: move.id,
          date: move.date,
          type: move.move_type || "Movement",
          ref: move.ref || move.reason || "",
          qty_in: qty > 0 ? qty : 0,
          qty_out: qty < 0 ? -qty : 0,
        })
      })
    }

    // Sort by date first, then by the move's own id as a same-day tiebreaker
    // (ids are auto-incrementing, so a higher id was created later).
    allLines.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date)
      if (dateCompare !== 0) return dateCompare
      return (a.moveId || 0) - (b.moveId || 0)
    })
'@

$blocks = @(
  @{old=$old1; new=$new1; label="1 of 1 (attach id + real sort)"}
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
    Write-Host "SUCCESS: Product ledger now sorts by true creation order within each day. Backup saved at $backupPath"
} else {
    Write-Host "ERROR: One or more blocks not found. No changes were written."
}