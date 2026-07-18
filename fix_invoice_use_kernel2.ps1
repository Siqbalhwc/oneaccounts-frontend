$path = "src\app\dashboard\invoices\new\page.tsx"
$content = Get-Content $path -Raw

$old1 = @'
    setSaving(true); setError("")
    if (editId) {
      try {
        const url = `/api/invoices?id=${editId}`
        const res = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editId,
            party_id: customerId,
            invoice_date: invoiceDate,
            due_date: dueDate,
            items: items.map(i => ({
              product_id: i.product_id,
              description: i.description,
              qty: i.qty,
              unit_price: i.unit_price,
              cost_price: i.cost_price,
              project_id: i.project_id || null,
              donor_id: i.donor_id || null,
              tax_code_id: taxEnabled ? (i.tax_code_id || null) : undefined,
              tax_rate: taxEnabled ? (i.tax_rate || 0) : undefined,
              tax_amount: taxEnabled ? (i.tax_amount || 0) : undefined,
            })),
            reference,
            notes,
          }),
        })
        const result = await res.json()
        if (!result.success) {
          setError(result.error || "Failed to update invoice")
          setSaving(false)
          return
        }
        const newInvoiceId = result.invoice?.id
        setSavedInvoiceId(newInvoiceId || null)
'@

$new1 = @'
    setSaving(true); setError("")
    if (editId) {
      try {
        let automationConfig = {}
        let automationAllowed = false
        if (automationFeatureEnabled) {
          const { data: settings } = await supabase
            .from("company_settings")
            .select("invoice_automation_config")
            .eq("company_id", companyId)
            .maybeSingle()
          automationConfig = settings?.invoice_automation_config || {}
          automationAllowed = true
        }
        const payloadItems = items.map(i => ({
          product_id: i.product_id || null,
          description: i.description,
          qty: i.qty,
          unit_price: i.unit_price,
          cost_price: i.cost_price || 0,
          project_id: i.project_id || null,
          donor_id: i.donor_id || null,
          tax_code_id: taxEnabled ? (i.tax_code_id || null) : null,
          tax_rate: taxEnabled ? (i.tax_rate || 0) : 0,
          tax_amount: taxEnabled ? (i.tax_amount || 0) : 0,
        }))
        const { data, error: rpcError } = await supabase.rpc('update_invoice_transaction', {
          p_invoice_id: Number(editId),
          p_company_id: companyId,
          p_party_id: customerId,
          p_invoice_date: invoiceDate,
          p_due_date: dueDate,
          p_items: payloadItems,
          p_reference: reference || '',
          p_notes: notes || '',
          p_user_email: selectedCustomer?.email || 'system',
          p_tax_enabled: taxEnabled,
          p_automation_config: automationConfig,
          p_automation_allowed: automationAllowed,
          p_business_type: businessType,
        })
        if (rpcError) {
          setError(rpcError.message || "Failed to update invoice")
          setSaving(false)
          return
        }
        if (!data || !data.success) {
          setError(data?.error || "Failed to update invoice")
          setSaving(false)
          return
        }
        setSavedInvoiceId(Number(editId))
'@

$count1 = ([regex]::Matches($content, [regex]::Escape($old1))).Count
if ($count1 -ne 1) {
    Write-Host "SAFETY CHECK FAILED on block 1: expected 1 match, found $count1. No changes made." -ForegroundColor Red
    exit
}
$content = $content.Replace($old1, $new1)

$pattern2 = 'setFlash\(`.*Invoice updated successfully!`\)'
$count2 = ([regex]::Matches($content, $pattern2)).Count
if ($count2 -ne 1) {
    Write-Host "SAFETY CHECK FAILED on block 2: expected 1 match, found $count2. Block 1 WAS applied, saving anyway." -ForegroundColor Yellow
    Set-Content -Path $path -Value $content -NoNewline
    exit
}
$content = [regex]::Replace($content, $pattern2, 'setFlash("Invoice updated successfully.")')

Set-Content -Path $path -Value $content -NoNewline
Write-Host "SUCCESS: both fixes applied." -ForegroundColor Green