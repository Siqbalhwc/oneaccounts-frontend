$path = "src\app\dashboard\receipts\new\page.tsx"
$content = Get-Content $path -Raw

$old1 = @'
  const toggleOpeningAllocation = () => {
    setAllocations(prev => {
      const current = prev["opening"] || 0
      const newVal = current > 0 ? 0 : customerOpeningBalance
      return { ...prev, opening: newVal }
    })
  }
'@

$new1 = @'
  const toggleOpeningAllocation = () => {
    setAllocations(prev => {
      const current = prev["opening"] || 0
      const newVal = current > 0 ? 0 : customerOpeningBalance
      return { ...prev, opening: newVal }
    })
  }
  const updateOpeningAllocation = (value: number) => {
    const clamped = Math.min(Math.max(value, 0), customerOpeningBalance)
    setAllocations(prev => ({ ...prev, opening: clamped }))
  }
'@

$old2 = @'
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          PKR {customerOpeningBalance.toLocaleString()}
                        </td>
'@

$new2 = @'
                        <td style={{ textAlign: "right" }}>
                          <input className="alloc-input" type="number" min="0" max={customerOpeningBalance} value={allocations["opening"] || 0} onChange={e => updateOpeningAllocation(parseFloat(e.target.value) || 0)} />
                        </td>
'@

$count1 = ([regex]::Matches($content, [regex]::Escape($old1))).Count
$count2 = ([regex]::Matches($content, [regex]::Escape($old2))).Count

if ($count1 -ne 1 -or $count2 -ne 1) {
    Write-Host "SAFETY CHECK FAILED: block1 matches=$count1 block2 matches=$count2. No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old1, $new1).Replace($old2, $new2)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}