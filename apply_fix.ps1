$path = "src\app\dashboard\invoices\new\page.tsx"
$raw = Get-Content -Raw $path
$hadCRLF = $raw -match "`r`n"
$content = $raw -replace "`r`n", "`n"

$edits = @()

$edits += @{
  Name = "A-icons"
  Old = "import {`n  ArrowLeft, Plus, Trash2, Send, Search, X, Download, CheckCircle,`n  Image as ImageIcon, RefreshCw, ExternalLink,`n} from ""lucide-react"""
  New = "import {`n  ArrowLeft, Plus, Trash2, Send, Search, X, Download, CheckCircle,`n  Image as ImageIcon, RefreshCw, ExternalLink, Paperclip, ChevronDown, FileText, Upload,`n} from ""lucide-react"""
}

$edits += @{
  Name = "B-state"
  Old = "const [bankAccounts, setBankAccounts] = useState<any[]>([])"
  New = "const [bankAccounts, setBankAccounts] = useState<any[]>([])`n  const [attachments, setAttachments] = useState<any[]>([])`n  const [attachPanelOpen, setAttachPanelOpen] = useState(false)`n  const [uploadingAttachment, setUploadingAttachment] = useState(false)`n  const [tempAttachKey] = useState(() => ``temp-`${Date.now()}-`${Math.random().toString(36).slice(2)}``)"
}

$edits += @{
  Name = "C-functions"
  Old = "const handleSubmit = async () => {"
  New = "const uploadAttachment = async (file: File) => {`n    if (!companyId) return`n    setUploadingAttachment(true)`n    try {`n      const path = ``${companyId}/invoices/`${Date.now()}-`${file.name}```n      const { error: uploadErr } = await supabase.storage.from('attachments').upload(path, file)`n      if (uploadErr) { setError(uploadErr.message); setUploadingAttachment(false); return }`n      const { data: publicData } = supabase.storage.from('attachments').getPublicUrl(path)`n      const { data: inserted, error: insertErr } = await supabase.rpc('insert_invoice_attachment', {`n        p_company_id: companyId,`n        p_invoice_id: editId ? Number(editId) : null,`n        p_temp_key: editId ? null : tempAttachKey,`n        p_file_name: file.name,`n        p_file_url: publicData.publicUrl,`n        p_file_size: file.size,`n        p_user_email: 'system',`n      })`n      if (!insertErr && inserted) setAttachments(prev => [...prev, inserted])`n    } catch (e) {}`n    setUploadingAttachment(false)`n  }`n`n  const handleAttachmentFiles = (files: FileList | null) => {`n    if (!files) return`n    Array.from(files).forEach(f => uploadAttachment(f))`n  }`n`n  const removeAttachment = async (att: any) => {`n    await supabase.rpc('delete_invoice_attachment', { p_company_id: companyId, p_attachment_id: att.id })`n    setAttachments(prev => prev.filter(a => a.id !== att.id))`n  }`n`n  useEffect(() => {`n    if (!editId || !companyId) return`n    supabase.rpc('get_invoice_attachments', { p_company_id: companyId, p_invoice_id: Number(editId) }).then(({ data }) => { if (data) setAttachments(data) })`n  }, [editId, companyId])`n`n  const handleSubmit = async () => {"
}

$edits += @{
  Name = "D-link-on-create"
  Old = "const newInvoiceId = data.invoice_id`n      setSavedInvoiceId(newInvoiceId || null)`n      setFlash(""Invoice saved successfully."")`n      setSaving(false)"
  New = "const newInvoiceId = data.invoice_id`n      if (newInvoiceId) {`n        try {`n          await supabase.rpc('link_invoice_attachments', { p_company_id: companyId, p_temp_key: tempAttachKey, p_invoice_id: newInvoiceId })`n        } catch (linkErr) {`n          console.error('Attachment linking failed (invoice already saved successfully):', linkErr)`n        }`n      }`n      setSavedInvoiceId(newInvoiceId || null)`n      setFlash(""Invoice saved successfully."")`n      setSaving(false)"
}

# EDIT E: short single-line anchor - insert Attachments card right after this line,
# without needing to match any of the following closing tags.
$edits += @{
  Name = "E-ui-card"
  Old = "onClick={handleWhatsAppWithPDF}><Send size={14} /> WhatsApp (PDF)</button>}"
  New = "onClick={handleWhatsAppWithPDF}><Send size={14} /> WhatsApp (PDF)</button>}`n              </div>`n              <div className=""inv-card"" style={{ padding: 0, overflow: ""hidden"" }}>`n                <button`n                  onClick={() => setAttachPanelOpen(!attachPanelOpen)}`n                  style={{ width: ""100%"", display: ""flex"", alignItems: ""center"", gap: 8, padding: ""10px 14px"", background: ""none"", border: ""none"", cursor: ""pointer"", textAlign: ""left"", color: ""var(--text)"" }}`n                >`n                  <Paperclip size={16} style={{ color: ""var(--text-muted)"" }} />`n                  <span style={{ fontSize: 13, flex: 1 }}>Attachments</span>`n                  {attachments.length > 0 && (`n                    <span style={{ fontSize: 11, color: ""var(--text-muted)"", background: ""var(--bg)"", borderRadius: 10, padding: ""1px 7px"" }}>{attachments.length}</span>`n                  )}`n                  <ChevronDown size={16} style={{ color: ""var(--text-muted)"", transform: attachPanelOpen ? ""rotate(180deg)"" : ""none"", transition: ""transform 0.15s"" }} />`n                </button>`n                {attachPanelOpen && (`n                  <div style={{ borderTop: ""1px solid var(--border)"", padding: ""12px 14px"" }}>`n                    {attachments.length > 0 && (`n                      <div style={{ display: ""flex"", flexDirection: ""column"", gap: 6, marginBottom: 10 }}>`n                        {attachments.map((att: any) => (`n                          <div key={att.id} style={{ display: ""flex"", alignItems: ""center"", gap: 8, padding: 8, border: ""1px solid var(--border)"", borderRadius: 6 }}>`n                            <FileText size={16} style={{ color: ""var(--primary)"", flexShrink: 0 }} />`n                            <div style={{ flex: 1, minWidth: 0 }}>`n                              <a href={att.file_url} target=""_blank"" rel=""noopener noreferrer"" style={{ fontSize: 12, color: ""var(--text)"", textDecoration: ""none"", display: ""block"", whiteSpace: ""nowrap"", overflow: ""hidden"", textOverflow: ""ellipsis"" }}>{att.file_name}</a>`n                            </div>`n                            <button onClick={() => removeAttachment(att)} style={{ background: ""none"", border: ""none"", cursor: ""pointer"", color: ""var(--text-muted)"", flexShrink: 0 }}>`n                              <X size={14} />`n                            </button>`n                          </div>`n                        ))}`n                      </div>`n                    )}`n                    <label style={{ display: ""flex"", alignItems: ""center"", justifyContent: ""center"", gap: 6, border: ""1px dashed var(--border)"", borderRadius: 6, padding: 10, cursor: ""pointer"" }}>`n                      <Upload size={14} style={{ color: ""var(--text-muted)"" }} />`n                      <span style={{ fontSize: 12, color: ""var(--text-muted)"" }}>{uploadingAttachment ? ""Uploading..."" : ""Add file""}</span>`n                      <input type=""file"" multiple style={{ display: ""none"" }} onChange={e => { handleAttachmentFiles(e.target.files); e.target.value = """" }} disabled={uploadingAttachment} />`n                    </label>`n                  </div>`n                )}"
}

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
Write-Host "SUCCESS: all 5 edits applied to invoices/new/page.tsx" -ForegroundColor Green