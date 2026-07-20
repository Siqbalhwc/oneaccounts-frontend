$path = "src\app\dashboard\bills\new\page.tsx"
$lines = Get-Content $path

$stateAnchor = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq 'const [whtAmount, setWhtAmount] = useState<number>(0)') { $stateAnchor = $i; break }
}

$funcAnchor = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq 'const handleSubmit = async () => {') { $funcAnchor = $i; break }
}

if ($stateAnchor -lt 0 -or $funcAnchor -lt 0) {
    Write-Host "SAFETY CHECK FAILED: anchors not found. stateAnchor=$stateAnchor funcAnchor=$funcAnchor. No changes made." -ForegroundColor Red
} else {
    $stateBlock = @(
        '',
        '  const [attachments, setAttachments] = useState<any[]>([])',
        '  const [attachPanelOpen, setAttachPanelOpen] = useState(false)',
        '  const [uploadingAttachment, setUploadingAttachment] = useState(false)',
        '  const [tempAttachKey] = useState(() => `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`)'
    )

    $funcBlock = @(
        '  const uploadAttachment = async (file: File) => {',
        '    if (!companyId) return',
        '    setUploadingAttachment(true)',
        '    try {',
        '      const path = `bills/${companyId}/${Date.now()}-${file.name}`',
        "      const { error: uploadErr } = await supabase.storage.from('attachments').upload(path, file)",
        '      if (uploadErr) { setError(uploadErr.message); setUploadingAttachment(false); return }',
        "      const { data: publicData } = supabase.storage.from('attachments').getPublicUrl(path)",
        "      const { data: inserted, error: insertErr } = await supabase.from('bill_attachments').insert({",
        '        bill_id: editId ? Number(editId) : null,',
        '        temp_key: editId ? null : tempAttachKey,',
        '        company_id: companyId,',
        '        file_name: file.name,',
        '        file_url: publicData.publicUrl,',
        '        file_size: file.size,',
        "        uploaded_by: 'system',",
        "      }).select('*').single()",
        '      if (!insertErr && inserted) setAttachments(prev => [...prev, inserted])',
        '    } catch (e) {}',
        '    setUploadingAttachment(false)',
        '  }',
        '',
        '  const handleAttachmentFiles = (files: FileList | null) => {',
        '    if (!files) return',
        '    Array.from(files).forEach(f => uploadAttachment(f))',
        '  }',
        '',
        '  const removeAttachment = async (att: any) => {',
        "    await supabase.from('bill_attachments').delete().eq('id', att.id)",
        '    setAttachments(prev => prev.filter(a => a.id !== att.id))',
        '  }',
        '',
        '  useEffect(() => {',
        '    if (!editId || !companyId) return',
        "    supabase.from('bill_attachments').select('*').eq('bill_id', editId).order('uploaded_at').then(({ data }) => { if (data) setAttachments(data) })",
        '  }, [editId, companyId])',
        ''
    )

    $before = $lines[0..$stateAnchor]
    $middle = $lines[($stateAnchor + 1)..($funcAnchor - 1)]
    $after = $lines[$funcAnchor..($lines.Count - 1)]
    $result = $before + $stateBlock + $middle + $funcBlock + $after
    Set-Content -Path $path -Value $result
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}