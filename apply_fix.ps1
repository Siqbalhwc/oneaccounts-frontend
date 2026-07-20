$path = "src\app\dashboard\bills\new\page.tsx"
$lines = Get-Content $path

$startIdx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq "if (editId) {") { $startIdx = $i; break }
}

$endIdx = -1
if ($startIdx -ge 0) {
    for ($i = $startIdx + 1; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -eq "    for (const item of items) {") { $endIdx = $i; break }
    }
}

if ($startIdx -lt 0 -or $endIdx -lt 0) {
    Write-Host "SAFETY CHECK FAILED: could not locate boundaries. startIdx=$startIdx endIdx=$endIdx. No changes made." -ForegroundColor Red
} else {
    Write-Host "Found block: replacing lines $($startIdx+1) through $($endIdx) (exclusive of end anchor)"

    $newBlock = @(
        '    if (editId) {',
        '      for (const item of items) {',
        '        if (!item.product_id) {',
        '          const showLoc = isNGO || locations.length > 0',
        '          const showAct = isNGO || activities.length > 0',
        '          if (showLoc && !item.location_id) { setError("Each manual line must have Location selected"); return }',
        '          if (showAct && !item.activity_id) { setError("Each manual line must have Activity selected"); return }',
        '          if (!item.account_id) { setError("Each manual line must have a GL Account selected"); return }',
        '          const key = `${item.location_id}_${item.activity_id}`',
        '          const combos = comboCache[key]',
        '          if (combos && combos.length > 1 && !item.project_id) {',
        '            setError("Please select a Project/Donor for each manual line with multiple options."); return',
        '          }',
        '        }',
        '      }',
        '',
        '      if (budgetError) { setError("Cannot save: some lines exceed the available budget."); return }',
        '      if (poId && poRemaining > 0 && grossTotal > poRemaining) {',
        '        setError(`Bill total exceeds remaining PO balance.`)',
        '        return',
        '      }',
        '',
        '      setSaving(true); setError("")',
        '',
        '      const payloadItems = items.map(i => ({',
        '        product_id: i.product_id || null,',
        '        description: i.description,',
        '        qty: i.qty,',
        '        unit_price: i.unit_price,',
        '        location_id: i.location_id || null,',
        '        activity_id: i.activity_id || null,',
        '        account_id: i.account_id || null,',
        '        project_id: i.project_id || null,',
        '        donor_id: i.donor_id || null,',
        '        tax_code_id: taxEnabled ? (i.tax_code_id || null) : null,',
        '        tax_rate: taxEnabled ? (i.tax_rate || 0) : 0,',
        '        tax_amount: taxEnabled ? (i.tax_amount || 0) : 0,',
        '        is_recoverable: true,',
        '      }))',
        '',
        '      try {',
        "        const { data, error: rpcError } = await supabase.rpc('update_bill_transaction', {",
        '          p_bill_id: Number(editId),',
        '          p_company_id: companyId,',
        '          p_party_id: supplierId,',
        '          p_bill_date: billDate,',
        '          p_due_date: dueDate,',
        '          p_items: payloadItems,',
        "          p_reference: reference || '',",
        "          p_notes: notes || '',",
        '          p_po_id: poId || null,',
        '          p_wht_tax_code_id: taxEnabled ? (selectedWhtTaxCodeId || null) : null,',
        '          p_wht_rate: taxEnabled ? whtRate : 0,',
        '          p_wht_amount: taxEnabled ? whtAmount : 0,',
        '          p_business_type: businessType,',
        '          p_tax_enabled: taxEnabled,',
        '        })',
        '        if (rpcError) { setError(rpcError.message || "Failed to update bill"); setSaving(false); return }',
        '        if (!data || !data.success) { setError(data?.error || "Failed to update bill"); setSaving(false); return }',
        '        setFlash("Bill updated successfully.")',
        '        loadSuppliers()',
        '        setSaving(false)',
        '        setTimeout(() => router.push(`/dashboard/bills/${editId}`), 800)',
        '        return',
        '      } catch (err: any) {',
        '        setError(err.message || "Network error")',
        '        setSaving(false)',
        '        return',
        '      }',
        '    }',
        ''
    )

    $before = $lines[0..($startIdx - 1)]
    $after = $lines[$endIdx..($lines.Count - 1)]
    $result = $before + $newBlock + $after
    Set-Content -Path $path -Value $result
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}