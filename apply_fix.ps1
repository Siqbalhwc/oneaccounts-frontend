$file = "src\app\api\payments\route.ts"
$backup = "src\app\api\payments\route.ts.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

# Backup first
Copy-Item $file $backup
Write-Host "Backup created: $backup"

$content = [System.IO.File]::ReadAllText($file)

$old = @"
  const hasBillAllocations = allocations && Array.isArray(allocations) && allocations.length > 0
  const hasOpeningAllocation = (opening_allocation || 0) > 0
  if (!hasBillAllocations && !hasOpeningAllocation) {
    return NextResponse.json({ error: 'Please allocate the payment to at least one bill or the opening balance' }, { status: 400 })
  }
"@

$new = @"
  // Pure advance payments (no bill allocation, no opening allocation) are allowed,
  // matching create_vendor_payment's supported behavior and the Receipts side.
"@

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Validation block removed."
} else {
    Write-Host "ERROR: Anchor text not found. No changes made. Please tell Claude - this needs re-checking before proceeding."
}