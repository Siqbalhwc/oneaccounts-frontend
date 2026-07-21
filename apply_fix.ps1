$path = "src\app\dashboard\bills\new\page.tsx"
$content = Get-Content $path -Raw

$old1 = @'
      const { data: publicData } = supabase.storage.from('attachments').getPublicUrl(path)
      const { data: inserted, error: insertErr } = await supabase.from('bill_attachments').insert({
        bill_id: editId ? Number(editId) : null,
        temp_key: editId ? null : tempAttachKey,
        company_id: companyId,
        file_name: file.name,
        file_url: publicData.publicUrl,
        file_size: file.size,
        uploaded_by: 'system',
      }).select('*').single()
      if (!insertErr && inserted) setAttachments(prev => [...prev, inserted])
'@

$new1 = @'
      const { data: publicData } = supabase.storage.from('attachments').getPublicUrl(path)
      const { data: inserted, error: insertErr } = await supabase.rpc('insert_bill_attachment', {
        p_company_id: companyId,
        p_bill_id: editId ? Number(editId) : null,
        p_temp_key: editId ? null : tempAttachKey,
        p_file_name: file.name,
        p_file_url: publicData.publicUrl,
        p_file_size: file.size,
        p_user_email: 'system',
      })
      if (!insertErr && inserted) setAttachments(prev => [...prev, inserted])
'@

$old2 = @'
  const removeAttachment = async (att: any) => {
    await supabase.from('bill_attachments').delete().eq('id', att.id)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }
'@

$new2 = @'
  const removeAttachment = async (att: any) => {
    await supabase.rpc('delete_bill_attachment', { p_company_id: companyId, p_attachment_id: att.id })
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }
'@

$old3 = @'
  useEffect(() => {
    if (!editId || !companyId) return
    supabase.from('bill_attachments').select('*').eq('bill_id', editId).order('uploaded_at').then(({ data }) => { if (data) setAttachments(data) })
  }, [editId, companyId])
'@

$new3 = @'
  useEffect(() => {
    if (!editId || !companyId) return
    supabase.rpc('get_bill_attachments', { p_company_id: companyId, p_bill_id: Number(editId) }).then(({ data }) => { if (data) setAttachments(data) })
  }, [editId, companyId])
'@

$old4 = "      await supabase.from('bill_attachments').update({ bill_id: newBillId, temp_key: null }).eq('temp_key', tempAttachKey).eq('company_id', companyId)"
$new4 = "      await supabase.rpc('link_bill_attachments', { p_company_id: companyId, p_temp_key: tempAttachKey, p_bill_id: newBillId })"

$checks = @(
    @{old=$old1; label="upload/insert"},
    @{old=$old2; label="remove/delete"},
    @{old=$old3; label="load/select"},
    @{old=$old4; label="link on save"}
)
$allGood = $true
foreach ($c in $checks) {
    $count = ([regex]::Matches($content, [regex]::Escape($c.old))).Count
    if ($count -ne 1) {
        Write-Host "SAFETY CHECK FAILED on $($c.label): expected 1 match, found $count." -ForegroundColor Red
        $allGood = $false
    }
}

if (-not $allGood) {
    Write-Host "No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old1, $new1).Replace($old2, $new2).Replace($old3, $new3).Replace($old4, $new4)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}