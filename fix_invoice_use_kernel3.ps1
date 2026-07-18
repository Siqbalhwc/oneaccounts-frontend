$path = "src\app\dashboard\invoices\new\page.tsx"
$lines = Get-Content $path

$startIdx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq "if (editId) {") { $startIdx = $i; break }
}

$autoConfigIdx = -1
if ($startIdx -ge 0) {
    for ($i = $startIdx + 1; $i -lt $lines.Count; $i++) {
        if ($lines[$i].Trim() -eq "let automationConfig = {}") { $autoConfigIdx = $i; break }
    }
}

if ($startIdx -lt 0 -or $autoConfigIdx -lt 0) {
    Write-Host "SAFETY CHECK FAILED: could not locate block boundaries. startIdx=$startIdx autoConfigIdx=$autoConfigIdx. No changes made." -ForegroundColor Red
} else {
    $endIdx = $autoConfigIdx - 1
    if ($lines[$endIdx].Trim() -ne "try {") {
        Write-Host "SAFETY CHECK FAILED: sanity check failed, line before automationConfig is not 'try {'. No changes made." -ForegroundColor Red
    } else {
        Write-Host "Found block: replacing lines $($startIdx+1) through $($endIdx+1)"

        $newBlock = @(
            '    if (editId) {',
            '      try {',
            '        let automationConfig = {}',
            '        let automationAllowed = false',
            '        if (automationFeatureEnabled) {',
            '          const { data: settings } = await supabase',
            '            .from("company_settings")',
            '            .select("invoice_automation_config")',
            '            .eq("company_id", companyId)',
            '            .maybeSingle()',
            '          automationConfig = settings?.invoice_automation_config || {}',
            '          automationAllowed = true',
            '        }',
            '        const payloadItems = items.map(i => ({',
            '          product_id: i.product_id || null,',
            '          description: i.description,',
            '          qty: i.qty,',
            '          unit_price: i.unit_price,',
            '          cost_price: i.cost_price || 0,',
            '          project_id: i.project_id || null,',
            '          donor_id: i.donor_id || null,',
            '          tax_code_id: taxEnabled ? (i.tax_code_id || null) : null,',
            '          tax_rate: taxEnabled ? (i.tax_rate || 0) : 0,',
            '          tax_amount: taxEnabled ? (i.tax_amount || 0) : 0,',
            '        }))',
            "        const { data, error: rpcError } = await supabase.rpc('update_invoice_transaction', {",
            '          p_invoice_id: Number(editId),',
            '          p_company_id: companyId,',
            '          p_party_id: customerId,',
            '          p_invoice_date: invoiceDate,',
            '          p_due_date: dueDate,',
            '          p_items: payloadItems,',
            "          p_reference: reference || '',",
            "          p_notes: notes || '',",
            "          p_user_email: selectedCustomer?.email || 'system',",
            '          p_tax_enabled: taxEnabled,',
            '          p_automation_config: automationConfig,',
            '          p_automation_allowed: automationAllowed,',
            '          p_business_type: businessType,',
            '        })',
            '        if (rpcError) {',
            '          setError(rpcError.message || "Failed to update invoice")',
            '          setSaving(false)',
            '          return',
            '        }',
            '        if (!data || !data.success) {',
            '          setError(data?.error || "Failed to update invoice")',
            '          setSaving(false)',
            '          return',
            '        }',
            '        setSavedInvoiceId(Number(editId))',
            '        setFlash("Invoice updated successfully.")',
            '        router.push(`/dashboard/invoices/${editId}`)',
            '      } catch (err: any) {',
            '        setError(err.message || "Network error")',
            '        setSaving(false)',
            '      }',
            '      return',
            '    }',
            '    try {'
        )

        $before = $lines[0..($startIdx - 1)]
        $after = $lines[($autoConfigIdx)..($lines.Count - 1)]
        $result = $before + $newBlock + $after
        Set-Content -Path $path -Value $result
        Write-Host "SUCCESS: file updated." -ForegroundColor Green
    }
}