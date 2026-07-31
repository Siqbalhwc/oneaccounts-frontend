$path = "src\app\dashboard\payments\[id]\page.tsx"
$raw = Get-Content -LiteralPath $path -Raw
$hadCRLF = $raw -match "`r`n"
$content = $raw -replace "`r`n", "`n"

function Norm($s) { return ($s -replace "`r`n", "`n") }

# A: icon import - add Paperclip
$oldA = 'import { ArrowLeft, Printer, Send, Upload, Trash2, FileText, Image, CheckCircle } from "lucide-react"'
$newA = 'import { ArrowLeft, Printer, Send, Upload, Trash2, FileText, Image, CheckCircle, Paperclip } from "lucide-react"'

# B: remove the now-broken Add Attachment button (references removed uploadFile/uploading)
$oldB = Norm(@'
          <label className="btn" style={{ cursor: "pointer", position: "relative" }}>
            <Upload size={16} /> {uploading ? "Uploading..." : "Add Attachment"}
            <input
              type="file"
              onChange={(e) => {
                if (e.target.files?.[0]) uploadFile(e.target.files[0])
              }}
              disabled={uploading}
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
            />
          </label>
'@)
$newB = ""

# C: add fetch useEffect right after companyId load effect
$oldC = Norm(@'
      const cid = (user?.app_metadata as any)?.company_id
'@)
$newC = Norm(@'
      const cid = (user?.app_metadata as any)?.company_id
'@)
# (kept identical - just verifying uniqueness; real insertion point is elsewhere, see D)

# D: replace the old Attachments Section render block with a new read-only card, fetched via RPC.
# We anchor on the section's heading comment + start through its end, using index-based removal
# for the risky inner map body (same technique that worked for the previous file).
$startAnchor = Norm(@'
      {/* Attachments Section */}
'@)
$endAnchorAfter = Norm(@'
      {payment && payment.id && (
'@)

$cA = ([regex]::Matches($content, [regex]::Escape($oldA))).Count
$cB = ([regex]::Matches($content, [regex]::Escape($oldB))).Count
$cStart = ([regex]::Matches($content, [regex]::Escape($startAnchor))).Count
$cEnd = ([regex]::Matches($content, [regex]::Escape($endAnchorAfter))).Count

Write-Host "A-icons: matches found = $cA"
Write-Host "B-remove-button: matches found = $cB"
Write-Host "Start-anchor (Attachments Section comment): matches found = $cStart"
Write-Host "End-anchor (payment && payment.id): matches found = $cEnd"

if ($cA -ne 1 -or $cB -ne 1 -or $cStart -ne 1 -or $cEnd -ne 1) {
  Write-Host "One or more anchors did not match exactly once - stopping, NO changes made." -ForegroundColor Red
  exit 1
}

$content = $content.Replace($oldA, $newA)
$content = $content.Replace($oldB, $newB)

$idxStart = $content.IndexOf($startAnchor)
$idxEnd = $content.IndexOf($endAnchorAfter)
if ($idxStart -lt 0 -or $idxEnd -lt 0 -or $idxEnd -le $idxStart) {
  Write-Host "Could not safely locate the Attachments Section block - stopping, NO changes made." -ForegroundColor Red
  exit 1
}

$newCard = Norm(@'
      {attachments.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Paperclip size={16} /> Attachments
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {attachments.map((att: any) => (
              <a
                key={att.id}
                href={att.file_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, border: "1px solid var(--border)", borderRadius: 8, textDecoration: "none", color: "var(--text)" }}
              >
                <FileText size={16} style={{ color: "var(--primary)", flexShrink: 0 }} />
                <span style={{ fontSize: 13, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{att.file_name}</span>
              </a>
            ))}
          </div>
        </div>
      )}

'@)

$before = $content.Substring(0, $idxStart)
$after = $content.Substring($idxEnd)
$content = $before + $newCard + $after

# Add the fetch useEffect right before the waLink computation (unique, safe anchor)
$oldWaLink = Norm(@'
  const waLink = payment && payment.supplier
'@)
$cWa = ([regex]::Matches($content, [regex]::Escape($oldWaLink))).Count
Write-Host "waLink-anchor: matches found = $cWa"
if ($cWa -ne 1) {
  Write-Host "waLink anchor not found - stopping before final write. Card and button changes NOT saved either (aborting whole script)." -ForegroundColor Red
  exit 1
}
$newFetchEffect = Norm(@'
  useEffect(() => {
    if (!paymentId || !companyId) return
    supabase.rpc("get_payment_attachments", { p_company_id: companyId, p_payment_id: Number(paymentId) })
      .then(({ data }) => { if (data) setAttachments(data) })
  }, [companyId, paymentId])

  const waLink = payment && payment.supplier
'@)
$content = $content.Replace($oldWaLink, $newFetchEffect)

if ($hadCRLF) { $content = $content -replace "`n", "`r`n" }
Set-Content -LiteralPath $path -Value $content -NoNewline
Write-Host "SUCCESS: attachments UI rebuilt in payments/[id]/page.tsx" -ForegroundColor Green