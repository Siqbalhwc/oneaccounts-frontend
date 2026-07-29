$path = "src\app\dashboard\payments\new\page.tsx"
$raw = Get-Content -Raw $path
$hadCRLF = $raw -match "`r`n"
$content = $raw -replace "`r`n", "`n"

# ── Edit A: icons ──
$oldA = 'import { ArrowLeft, Search, X, CheckCircle, RefreshCw } from "lucide-react"'
$newA = 'import { ArrowLeft, Search, X, CheckCircle, RefreshCw, Paperclip, ChevronDown, FileText, Upload } from "lucide-react"'

# ── Edit B: state ──
$oldB = @'
  const [supplierOpeningBalance, setSupplierOpeningBalance] = useState(0)
'@
$newB = @'
  const [supplierOpeningBalance, setSupplierOpeningBalance] = useState(0)
  const [attachments, setAttachments] = useState<any[]>([])
  const [attachPanelOpen, setAttachPanelOpen] = useState(false)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [tempAttachKey] = useState(() => `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
'@

# ── Edit C: attachment functions, inserted before handleSubmit ──
$oldC = @'
  const handleSubmit = async () => {
'@
$newC = @'
  const uploadAttachment = async (file: File) => {
    if (!companyId) return
    setUploadingAttachment(true)
    try {
      const path = `${companyId}/payments/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage.from('attachments').upload(path, file)
      if (uploadErr) { setError(uploadErr.message); setUploadingAttachment(false); return }
      const { data: publicData } = supabase.storage.from('attachments').getPublicUrl(path)
      const { data: inserted, error: insertErr } = await supabase.rpc('insert_payment_attachment', {
        p_company_id: companyId,
        p_payment_id: editId ? Number(editId) : null,
        p_temp_key: editId ? null : tempAttachKey,
        p_file_name: file.name,
        p_file_url: publicData.publicUrl,
        p_file_size: file.size,
        p_user_email: 'system',
      })
      if (!insertErr && inserted) setAttachments(prev => [...prev, inserted])
    } catch (e) {}
    setUploadingAttachment(false)
  }

  const handleAttachmentFiles = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach(f => uploadAttachment(f))
  }

  const removeAttachment = async (att: any) => {
    await supabase.rpc('delete_payment_attachment', { p_company_id: companyId, p_attachment_id: att.id })
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  useEffect(() => {
    if (!editId || !companyId) return
    supabase.rpc('get_payment_attachments', { p_company_id: companyId, p_payment_id: Number(editId) }).then(({ data }) => { if (data) setAttachments(data) })
  }, [editId, companyId])

  const handleSubmit = async () => {
'@

# ── Edit D: isolated attachment linking after successful create ──
$oldD = @'
        if (!result.success) {
          setError(result.error || "Failed")
          setLoading(false)
          return
        }
'@
$newD = @'
        if (!result.success) {
          setError(result.error || "Failed")
          setLoading(false)
          return
        }
        if (result.payment?.id) {
          try {
            await supabase.rpc('link_payment_attachments', { p_company_id: companyId, p_temp_key: tempAttachKey, p_payment_id: result.payment.id })
          } catch (linkErr) {
            console.error('Attachment linking failed (payment already saved successfully):', linkErr)
          }
        }
'@

# ── Edit E: Attachments UI card, inserted after the Save Payment button ──
$oldE = @'
              <button className="pay-btn pay-btn-primary" style={{ justifyContent: "center", padding: 10, width: "100%" }} onClick={handleSubmit} disabled={loading}>
                {loading ? "Posting..." : editId ? "ðŸ’¾ Update Payment" : "ðŸ’¾ Save Payment"}
              </button>
            </div>
'@
$newE = @'
              <button className="pay-btn pay-btn-primary" style={{ justifyContent: "center", padding: 10, width: "100%" }} onClick={handleSubmit} disabled={loading}>
                {loading ? "Posting..." : editId ? "ðŸ’¾ Update Payment" : "ðŸ’¾ Save Payment"}
              </button>
            </div>
            <div className="pay-card" style={{ padding: 0, overflow: "hidden" }}>
              <button
                onClick={() => setAttachPanelOpen(!attachPanelOpen)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: "var(--text)" }}
              >
                <Paperclip size={16} style={{ color: "var(--text-muted)" }} />
                <span style={{ fontSize: 13, flex: 1 }}>Attachments</span>
                {attachments.length > 0 && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--bg)", borderRadius: 10, padding: "1px 7px" }}>{attachments.length}</span>
                )}
                <ChevronDown size={16} style={{ color: "var(--text-muted)", transform: attachPanelOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
              </button>
              {attachPanelOpen && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "12px 14px" }}>
                  {attachments.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                      {attachments.map((att: any) => (
                        <div key={att.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, border: "1px solid var(--border)", borderRadius: 6 }}>
                          <FileText size={16} style={{ color: "var(--primary)", flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <a href={att.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--text)", textDecoration: "none", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{att.file_name}</a>
                          </div>
                          <button onClick={() => removeAttachment(att)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", flexShrink: 0 }}>
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: "1px dashed var(--border)", borderRadius: 6, padding: 10, cursor: "pointer" }}>
                    <Upload size={14} style={{ color: "var(--text-muted)" }} />
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{uploadingAttachment ? "Uploading..." : "Add file"}</span>
                    <input type="file" multiple style={{ display: "none" }} onChange={e => { handleAttachmentFiles(e.target.files); e.target.value = "" }} disabled={uploadingAttachment} />
                  </label>
                </div>
              )}
            </div>
'@

$edits = @(
  @{ Name = "A-icons"; Old = $oldA; New = $newA },
  @{ Name = "B-state"; Old = $oldB; New = $newB },
  @{ Name = "C-functions"; Old = $oldC; New = $newC },
  @{ Name = "D-link-on-create"; Old = $oldD; New = $newD },
  @{ Name = "E-ui-card"; Old = $oldE; New = $newE }
)

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
Write-Host "SUCCESS: all 5 edits applied to payments/new/page.tsx" -ForegroundColor Green