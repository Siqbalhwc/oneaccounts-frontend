$path = "src\app\dashboard\receipts\new\page.tsx"
$raw = Get-Content -Raw $path
$hadCRLF = $raw -match "`r`n"
$content = $raw -replace "`r`n", "`n"

function Norm($s) { return ($s -replace "`r`n", "`n") }

$oldA = 'import { ArrowLeft, Search, X, CheckCircle, RefreshCw } from "lucide-react"'
$newA = 'import { ArrowLeft, Search, X, CheckCircle, RefreshCw, Paperclip, ChevronDown, FileText, Upload } from "lucide-react"'

$oldB = Norm(@'
  const [customerOpeningPaid, setCustomerOpeningPaid] = useState(0)
'@)
$newB = Norm(@'
  const [customerOpeningPaid, setCustomerOpeningPaid] = useState(0)
  const [attachments, setAttachments] = useState<any[]>([])
  const [attachPanelOpen, setAttachPanelOpen] = useState(false)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [tempAttachKey] = useState(() => `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
'@)

$oldC = Norm(@'
  const handleSubmit = async () => {
'@)
$newC = Norm(@'
  const uploadAttachment = async (file: File) => {
    if (!companyId) return
    setUploadingAttachment(true)
    try {
      const path = `${companyId}/receipts/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage.from('attachments').upload(path, file)
      if (uploadErr) { setError(uploadErr.message); setUploadingAttachment(false); return }
      const { data: publicData } = supabase.storage.from('attachments').getPublicUrl(path)
      const { data: inserted, error: insertErr } = await supabase.rpc('insert_receipt_attachment', {
        p_company_id: companyId,
        p_receipt_id: editId ? Number(editId) : null,
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
    await supabase.rpc('delete_receipt_attachment', { p_company_id: companyId, p_attachment_id: att.id })
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  useEffect(() => {
    if (!editId || !companyId) return
    supabase.rpc('get_receipt_attachments', { p_company_id: companyId, p_receipt_id: Number(editId) }).then(({ data }) => { if (data) setAttachments(data) })
  }, [editId, companyId])

  const handleSubmit = async () => {
'@)

$oldD = Norm(@'
        // Reset form
        setCustomerId(null); setSelectedCustomer(null); setCustomerSearch(""); setShowCustomerList(false)
'@)
$newD = Norm(@'
        if (data?.receipt_id) {
          try {
            await supabase.rpc('link_receipt_attachments', { p_company_id: companyId, p_temp_key: tempAttachKey, p_receipt_id: data.receipt_id })
          } catch (linkErr) {
            console.error('Attachment linking failed (receipt already saved successfully):', linkErr)
          }
        }
        // Reset form
        setCustomerId(null); setSelectedCustomer(null); setCustomerSearch(""); setShowCustomerList(false)
'@)

$oldE = Norm(@'
              </button>
            </div>
          </div>
        </div>
      </div>
'@)
$newE = Norm(@'
              </button>
            </div>
            <div className="inv-card" style={{ padding: 0, overflow: "hidden" }}>
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
          </div>
        </div>
      </div>
'@)

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
Write-Host "SUCCESS: all edits applied to receipts/new/page.tsx" -ForegroundColor Green