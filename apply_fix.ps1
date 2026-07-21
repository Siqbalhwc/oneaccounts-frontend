$path = "src\app\dashboard\bills\new\page.tsx"
$lines = Get-Content $path

$anchorIdx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq 'const newBillId = data.bill_id') { $anchorIdx = $i; break }
}

if ($anchorIdx -lt 0) {
    Write-Host "SAFETY CHECK FAILED: anchor not found. No changes made." -ForegroundColor Red
} else {
    Write-Host "Found anchor at line $($anchorIdx+1), inserting attachment-linking step after it."
    $newLine = "      await supabase.from('bill_attachments').update({ bill_id: newBillId, temp_key: null }).eq('temp_key', tempAttachKey).eq('company_id', companyId)"
    $before = $lines[0..$anchorIdx]
    $after = $lines[($anchorIdx + 1)..($lines.Count - 1)]
    $result = $before + $newLine + $after
    Set-Content -Path $path -Value $result
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}