$path = "src\app\dashboard\receipts\new\page.tsx"
$raw = Get-Content -Raw $path
$hadCRLF = $raw -match "`r`n"
$content = $raw -replace "`r`n", "`n"

function Norm($s) { return ($s -replace "`r`n", "`n") }

# A: restore the opening allocation on edit-load (was never fetched before)
$oldA = Norm(@'
        const allocs: Record<string, number> = {}
        data.receipt_allocations?.forEach((a: any) => {
          allocs[String(a.invoice_id)] = a.amount
        })
        setAllocations(allocs)
'@)
$newA = Norm(@'
        const allocs: Record<string, number> = {}
        data.receipt_allocations?.forEach((a: any) => {
          allocs[String(a.invoice_id)] = a.amount
        })
        const { data: openingAlloc } = await supabase
          .from("customer_opening_allocations")
          .select("amount")
          .eq("receipt_id", editId)
          .eq("company_id", companyId)
          .maybeSingle()
        if (openingAlloc?.amount) {
          allocs["opening"] = openingAlloc.amount
        }
        setAllocations(allocs)
'@)

# B: make the edit-load effect callback async, so the await above is valid
$oldB = Norm(@'
      .single()
      .then(({ data }) => {
        if (!data) return
'@)
$newB = Norm(@'
      .single()
      .then(async ({ data }) => {
        if (!data) return
'@)

# C: widen the invoice status filter in edit mode, so an invoice this
# receipt itself fully paid stays in the base fetched list
$oldC = Norm(@'
        .in("status", ["Unpaid", "Partial"])
        .neq("status", "Returned")
        .order("date")
'@)
$newC = Norm(@'
        .in("status", editId ? ["Unpaid", "Partial", "Paid"] : ["Unpaid", "Partial"])
        .neq("status", "Returned")
        .order("date")
'@)

# D: exclude this receipt's own allocations from the "paid by others" sum,
# and stop letting the invoice's own stale .paid column (which already
# includes this receipt's contribution) override that in edit mode -
# otherwise the invoice would still compute as fully paid and get filtered out.
$oldD = Norm(@'
      const invoiceIds = invs.map(inv => inv.id)
      const { data: allocationsData } = await supabase
        .from("receipt_allocations")
        .select("invoice_id, amount")
        .in("invoice_id", invoiceIds)
      const paidMap: Record<number, number> = {}
      if (allocationsData) {
        allocationsData.forEach((a: any) => {
          paidMap[a.invoice_id] = (paidMap[a.invoice_id] || 0) + (a.amount || 0)
        })
      }
      const enriched = invs.map(inv => ({
        ...inv,
        paid: Math.max(inv.paid || 0, paidMap[inv.id] || 0),
      }))
'@)
$newD = Norm(@'
      const invoiceIds = invs.map(inv => inv.id)
      let allocQuery = supabase
        .from("receipt_allocations")
        .select("invoice_id, amount, receipt_id")
        .in("invoice_id", invoiceIds)
      if (editId) {
        allocQuery = allocQuery.neq("receipt_id", parseInt(editId))
      }
      const { data: allocationsData } = await allocQuery
      const paidMap: Record<number, number> = {}
      if (allocationsData) {
        allocationsData.forEach((a: any) => {
          paidMap[a.invoice_id] = (paidMap[a.invoice_id] || 0) + (a.amount || 0)
        })
      }
      const enriched = invs.map(inv => ({
        ...inv,
        paid: editId ? (paidMap[inv.id] || 0) : Math.max(inv.paid || 0, paidMap[inv.id] || 0),
      }))
'@)

$edits = @(
  @{ Name = "A-restore-opening-alloc"; Old = $oldA; New = $newA },
  @{ Name = "B-async-callback"; Old = $oldB; New = $newB },
  @{ Name = "C-widen-status-filter"; Old = $oldC; New = $newC },
  @{ Name = "D-exclude-own-allocation"; Old = $oldD; New = $newD }
)

$allGood = $true
foreach ($e in $edits) {
  $c = ([regex]::Matches($content, [regex]::Escape($e.Old))).Count
  Write-Host "$($e.Name): matches found = $c"
  if ($c -ne 1) { $allGood = $false }
}

if (-not $allGood) {
  Write-Host "One or more anchors did not match exactly once - stopping, NO changes made." -ForegroundColor Red
  exit 1
}

foreach ($e in $edits) {
  $content = $content.Replace($e.Old, $e.New)
}

if ($hadCRLF) { $content = $content -replace "`n", "`r`n" }
Set-Content -Path $path -Value $content -NoNewline
Write-Host "SUCCESS: receipt edit allocation restore fixed" -ForegroundColor Green