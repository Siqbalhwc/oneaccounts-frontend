$path = "src\app\dashboard\bills\new\page.tsx"
$lines = Get-Content $path

$anchorIdx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq '<Download size={14} /> PDF Preview') { $anchorIdx = $i; break }
}

if ($anchorIdx -lt 0) {
    Write-Host "SAFETY CHECK FAILED: anchor line not found. No changes made." -ForegroundColor Red
} else {
    $checkA = $lines[$anchorIdx + 1].Trim()
    $checkB = $lines[$anchorIdx + 2].Trim()
    if ($checkA -ne "</button>" -or $checkB -ne "</div>") {
        Write-Host "SAFETY CHECK FAILED: sanity check failed. Line+1='$checkA' Line+2='$checkB'. No changes made." -ForegroundColor Red
    } else {
        $insertAfter = $anchorIdx + 2
        Write-Host "Found anchor. Inserting attachments panel after line $($insertAfter+1)."

        $panel = @(
            '',
            '              <div className="inv-card" style={{ padding: 0, overflow: "hidden" }}>',
            '                <button',
            '                  onClick={() => setAttachPanelOpen(!attachPanelOpen)}',
            '                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: "var(--text)" }}',
            '                >',
            '                  <Paperclip size={16} style={{ color: "var(--text-muted)" }} />',
            '                  <span style={{ fontSize: 13, flex: 1 }}>Attachments</span>',
            '                  {attachments.length > 0 && (',
            '                    <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--bg)", borderRadius: 10, padding: "1px 7px" }}>{attachments.length}</span>',
            '                  )}',
            '                  <ChevronDown size={16} style={{ color: "var(--text-muted)", transform: attachPanelOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />',
            '                </button>',
            '                {attachPanelOpen && (',
            '                  <div style={{ borderTop: "1px solid var(--border)", padding: "12px 14px" }}>',
            '                    {attachments.length > 0 && (',
            '                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>',
            '                        {attachments.map((att: any) => (',
            '                          <div key={att.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, border: "1px solid var(--border)", borderRadius: 6 }}>',
            '                            <FileText size={16} style={{ color: "var(--primary)", flexShrink: 0 }} />',
            '                            <div style={{ flex: 1, minWidth: 0 }}>',
            '                              <a href={att.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--text)", textDecoration: "none", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{att.file_name}</a>',
            '                            </div>',
            '                            <button onClick={() => removeAttachment(att)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", flexShrink: 0 }}>',
            '                              <X size={14} />',
            '                            </button>',
            '                          </div>',
            '                        ))}',
            '                      </div>',
            '                    )}',
            '                    <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: "1px dashed var(--border)", borderRadius: 6, padding: 10, cursor: "pointer" }}>',
            '                      <Upload size={14} style={{ color: "var(--text-muted)" }} />',
            '                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{uploadingAttachment ? "Uploading..." : "Add file"}</span>',
            '                      <input type="file" multiple style={{ display: "none" }} onChange={e => { handleAttachmentFiles(e.target.files); e.target.value = "" }} disabled={uploadingAttachment} />',
            '                    </label>',
            '                  </div>',
            '                )}',
            '              </div>'
        )

        $before = $lines[0..$insertAfter]
        $after = $lines[($insertAfter + 1)..($lines.Count - 1)]
        $result = $before + $panel + $after
        Set-Content -Path $path -Value $result
        Write-Host "SUCCESS: file updated." -ForegroundColor Green
    }
}