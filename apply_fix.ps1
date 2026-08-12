$filePath = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\dashboard\bills\[id]\page.tsx"
$backupPath = "$filePath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

$content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($backupPath, $content, [System.Text.Encoding]::UTF8)

$old = @'
  useEffect(() => {
    if (!companyId || !billId) return
    setLoading(true)

    supabase
      .from("invoices")
      .select("*")
      .eq("id", billId)
      .eq("type", "purchase")
      .single()
      .then(({ data }) => {
        if (!data) {
          setLoading(false)
          return
        }
        const b: Bill = data

        if (b.party_id) {
          supabase
            .from("suppliers")
            .select("name, code, phone, address, email, payment_terms")
            .eq("id", b.party_id)
            .single()
            .then(({ data: supp }) => {
              b.supplier = supp || undefined
            })
            .then(() => {
              supabase
                .from("invoice_items")
                .select("*")
                .eq("invoice_id", b.id)
                .eq("company_id", companyId)
                .then(({ data: items }) => {
                  b.items = (items || []).map(item => ({
                    ...item,
                    asset_id: item.asset_id ?? null,
                  }))
                  setBill(b)
                })
            })

          if (taxEnabled) {
            supabase
              .from("bill_withholding")
              .select("*")
              .eq("bill_id", b.id)
              .maybeSingle()
              .then(({ data: wht }) => {
                if (wht) {
                  setWhtData({
                    wht_tax_code_id: wht.wht_tax_code_id,
                    wht_rate: wht.wht_rate,
                    wht_amount: wht.wht_amount,
                  })
                }
              })
          }
        } else {
          supabase
            .from("invoice_items")
            .select("*")
            .eq("invoice_id", b.id)
            .eq("company_id", companyId)
            .then(({ data: items }) => {
              b.items = (items || []).map(item => ({
                ...item,
                asset_id: item.asset_id ?? null,
              }))
              setBill(b)
            })
        }
        setLoading(false)
      })
  }, [companyId, billId, taxEnabled])
'@

$new = @'
  useEffect(() => {
    if (!companyId || !billId) return
    let cancelled = false

    const loadBill = async () => {
      setLoading(true)

      const { data } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", billId)
        .eq("type", "purchase")
        .single()

      if (!data) {
        if (!cancelled) setLoading(false)
        return
      }

      const b: Bill = data

      if (b.party_id) {
        const { data: supp } = await supabase
          .from("suppliers")
          .select("name, code, phone, address, email, payment_terms")
          .eq("id", b.party_id)
          .single()
        b.supplier = supp || undefined

        if (taxEnabled) {
          const { data: wht } = await supabase
            .from("bill_withholding")
            .select("*")
            .eq("bill_id", b.id)
            .maybeSingle()
          if (wht) {
            setWhtData({
              wht_tax_code_id: wht.wht_tax_code_id,
              wht_rate: wht.wht_rate,
              wht_amount: wht.wht_amount,
            })
          }
        }
      }

      const { data: items } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", b.id)
        .eq("company_id", companyId)

      b.items = (items || []).map(item => ({
        ...item,
        asset_id: item.asset_id ?? null,
      }))

      if (!cancelled) {
        setBill(b)
        setLoading(false)
      }
    }

    loadBill()
    return () => { cancelled = true }
  }, [companyId, billId, taxEnabled])
'@

if ($content.Contains($old)) {
    $updated = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($filePath, $updated, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Bill detail loading race condition fixed. Backup saved at $backupPath"
} else {
    Write-Host "ERROR: Exact block not found. No changes made. Please tell Claude so the file can be re-checked."
}