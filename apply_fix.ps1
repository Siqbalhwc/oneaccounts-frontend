$filePath = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\dashboard\receipts\new\page.tsx"
$backupPath = "$filePath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

$content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($backupPath, $content, [System.Text.Encoding]::UTF8)

$old1 = @'
  const [customerOpeningBalance, setCustomerOpeningBalance] = useState(0)
  const [customerOpeningTotal, setCustomerOpeningTotal] = useState(0)
  const [customerOpeningPaid, setCustomerOpeningPaid] = useState(0)
'@

$new1 = @'
  const [customerOpeningBalance, setCustomerOpeningBalance] = useState(0)
  const [customerOpeningTotal, setCustomerOpeningTotal] = useState(0)
  const [customerOpeningPaid, setCustomerOpeningPaid] = useState(0)
  const [ownOpeningAllocation, setOwnOpeningAllocation] = useState(0)
'@

$old2 = @'
        const allocs: Record<string, number> = {}
        data.receipt_allocations?.forEach((a: any) => {
          allocs[String(a.invoice_id)] = a.amount
        })
        setAllocations(allocs)
      })
  }, [editId, companyId])
'@

$new2 = @'
        const allocs: Record<string, number> = {}
        data.receipt_allocations?.forEach((a: any) => {
          allocs[String(a.invoice_id)] = a.amount
        })
        setAllocations(allocs)

        supabase.from("customer_opening_allocations")
          .select("amount")
          .eq("receipt_id", editId)
          .eq("company_id", companyId)
          .then(({ data: openingAllocs }) => {
            const amt = (openingAllocs || []).reduce((s: number, r: any) => s + (r.amount || 0), 0)
            if (amt > 0) {
              setOwnOpeningAllocation(amt)
              setAllocations(prev => ({ ...prev, opening: amt }))
            }
          })
      })
  }, [editId, companyId])
'@

$old3 = @'
    Promise.all([
      supabase.rpc("get_customer_opening_total", { p_company_id: companyId, p_customer_id: customerId }),
      supabase.rpc("get_customer_opening_paid", { p_company_id: companyId, p_customer_id: customerId }),
    ]).then(([totalRes, paidRes]) => {
      const total = totalRes.data || 0
      const paid = paidRes.data || 0
      setCustomerOpeningTotal(total)
      setCustomerOpeningPaid(paid)
      setCustomerOpeningBalance(Math.max(0, total - paid))
    })
  }, [companyId, customerId, isDonation])
'@

$new3 = @'
    Promise.all([
      supabase.rpc("get_customer_opening_total", { p_company_id: companyId, p_customer_id: customerId }),
      supabase.rpc("get_customer_opening_paid", { p_company_id: companyId, p_customer_id: customerId }),
    ]).then(([totalRes, paidRes]) => {
      const total = totalRes.data || 0
      const rawPaid = paidRes.data || 0
      const paid = editId ? Math.max(0, rawPaid - ownOpeningAllocation) : rawPaid
      setCustomerOpeningTotal(total)
      setCustomerOpeningPaid(paid)
      setCustomerOpeningBalance(Math.max(0, total - paid))
    })
  }, [companyId, customerId, isDonation, editId, ownOpeningAllocation])
'@

$allFound = $true

if ($content.Contains($old1)) {
    $content = $content.Replace($old1, $new1)
    Write-Host "Step 1 of 3: OK"
} else {
    Write-Host "Step 1 of 3: NOT FOUND"
    $allFound = $false
}

if ($content.Contains($old2)) {
    $content = $content.Replace($old2, $new2)
    Write-Host "Step 2 of 3: OK"
} else {
    Write-Host "Step 2 of 3: NOT FOUND"
    $allFound = $false
}

if ($content.Contains($old3)) {
    $content = $content.Replace($old3, $new3)
    Write-Host "Step 3 of 3: OK"
} else {
    Write-Host "Step 3 of 3: NOT FOUND"
    $allFound = $false
}

if ($allFound) {
    [System.IO.File]::WriteAllText($filePath, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Receipt opening balance edit fix applied. Backup saved at $backupPath"
} else {
    Write-Host "ERROR: One or more blocks not found. No changes were written to the real file. Please tell Claude which steps said NOT FOUND."
}