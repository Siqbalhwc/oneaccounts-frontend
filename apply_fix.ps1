# OneAccounts - Payments form: opening balance Total / Paid / Due (partial payments), edit support
# Run from the frontend folder. Changes ONE file. Nothing is written unless every check passes.
$ErrorActionPreference = "Stop"
$full = (Resolve-Path -LiteralPath "src\app\dashboard\payments\new\page.tsx").Path
$text = [System.IO.File]::ReadAllText($full)

if ($text.Contains("supplierOpeningTotal")) { Write-Host "Already applied - no change made"; exit 0 }

$nl = "`n"
if ($text.Contains("`r`n")) { $nl = "`r`n" }

function Rep([string]$old, [string]$new) {
  $first = $script:text.IndexOf($old, 0, [System.StringComparison]::Ordinal)
  if ($first -lt 0) { Write-Host "ANCHOR NOT FOUND - no change made: $old"; exit 1 }
  $second = $script:text.IndexOf($old, $first + 1, [System.StringComparison]::Ordinal)
  if ($second -ge 0) { Write-Host "ANCHOR NOT UNIQUE - no change made: $old"; exit 1 }
  $new = $new.Replace("`r`n", "`n").Replace("`n", $script:nl)
  $script:text = $script:text.Replace($old, $new)
}

# 1. New state (total / paid / own allocation when editing)
Rep 'const [supplierOpeningBalance, setSupplierOpeningBalance] = useState(0)' @'
const [supplierOpeningBalance, setSupplierOpeningBalance] = useState(0)
  const [supplierOpeningTotal, setSupplierOpeningTotal] = useState(0)
  const [supplierOpeningPaid, setSupplierOpeningPaid] = useState(0)
  const [ownOpeningAllocation, setOwnOpeningAllocation] = useState(0)
  const [ownOpeningLoaded, setOwnOpeningLoaded] = useState(false)
'@

# 2-4. Stop reading the raw suppliers.opening_balance column
Rep 'setSupplierOpeningBalance(updated.opening_balance || 0)' '/* opening balance now comes from the supplier opening RPC effect */'
Rep 'setSupplierOpeningBalance(supp.opening_balance || 0)' '/* opening balance now comes from the supplier opening RPC effect */'
Rep 'setSupplierOpeningBalance(s.opening_balance || 0)' '/* opening balance now comes from the supplier opening RPC effect */'

# 5. When editing, load this payment's own opening allocation
Rep '// Load allocations' @'
// Load this payment's own opening-balance allocation
      const { data: ownOpenData, error: ownOpenErr } = await supabase.rpc("get_payment_opening_allocation", { p_company_id: companyId, p_payment_id: Number(editId) })
      if (!ownOpenErr) {
        const ownOpenAmt = Number(ownOpenData || 0)
        setOwnOpeningAllocation(ownOpenAmt)
        setOwnOpeningLoaded(true)
        if (ownOpenAmt > 0) setNetAllocations(prev => ({ ...prev, opening: ownOpenAmt }))
      }

      // Load allocations
'@

# 6. Effect: opening Total / Paid / Due from the database functions
Rep 'const selectSupplier = (s: any) => {' @'
useEffect(() => {
    if (!companyId || !supplierId || isDonation) {
      setSupplierOpeningTotal(0)
      setSupplierOpeningPaid(0)
      setSupplierOpeningBalance(0)
      return
    }
    let cancelled = false
    Promise.all([
      supabase.rpc("get_supplier_opening_total", { p_company_id: companyId, p_supplier_id: supplierId }),
      supabase.rpc("get_supplier_opening_paid", { p_company_id: companyId, p_supplier_id: supplierId }),
    ]).then(([totalRes, paidRes]) => {
      if (cancelled) return
      const total = Number(totalRes.data || 0)
      const rawPaid = Number(paidRes.data || 0)
      const paid = editId ? Math.max(0, rawPaid - ownOpeningAllocation) : rawPaid
      setSupplierOpeningTotal(total)
      setSupplierOpeningPaid(paid)
      setSupplierOpeningBalance(Math.max(0, total - paid))
    })
    return () => { cancelled = true }
  }, [companyId, supplierId, isDonation, editId, ownOpeningAllocation])

  const selectSupplier = (s: any) => {
'@

# 7. Show Total / Paid / Due on the opening balance row
Rep '(no WHT applies)' '(no WHT applies) - Total {supplierOpeningTotal.toLocaleString()} / Paid {supplierOpeningPaid.toLocaleString()} / Due {supplierOpeningBalance.toLocaleString()}'

# 8. Send the opening allocation when updating a payment
Rep 'p_allocations: allocationsPayload,' @'
p_allocations: allocationsPayload,
          p_opening_allocation: ownOpeningLoaded ? (openingNet || 0) : null,
'@

[System.IO.File]::WriteAllText($full, $text, (New-Object System.Text.UTF8Encoding($true)))
Write-Host "Payments form updated (8 changes)."