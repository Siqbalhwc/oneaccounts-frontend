$path = "src\app\dashboard\receipts\[id]\page.tsx"
$raw = Get-Content -LiteralPath $path -Raw
$hadCRLF = $raw -match "`r`n"
$content = $raw -replace "`r`n", "`n"

function Norm($s) { return ($s -replace "`r`n", "`n") }

$oldA = 'import { ArrowLeft, Printer, Send } from "lucide-react"'
$newA = 'import { ArrowLeft, Printer, Send, Paperclip, FileText } from "lucide-react"'

$oldB = Norm(@'
  const [loading, setLoading] = useState(true)
'@)
$newB = Norm(@'
  const [loading, setLoading] = useState(true)
  const [attachments, setAttachments] = useState<any[]>([])
'@)

$oldC = Norm(@'
      setLoading(false)
    }
    fetchData()
'@)
$newC = Norm(@'
      // 6. Attachments
      supabase.rpc("get_receipt_attachments", { p_company_id: rec.company_id, p_receipt_id: rec.id })
        .then(({ data }) => { if (data) setAttachments(data) })
      setLoading(false)
    }
    fetchData()
'@)

$oldD = Norm(@'
      {/* Change History */}
'@)
$newD = Norm(@'
      {attachments.length > 0 && (
        <div className="receipt-card">
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
      {/* Change History */}
'@)

$edits = @(
  @{ Name = "A-icons"; Old = $oldA; New = $newA },
  @{ Name = "B-state"; Old = $oldB; New = $newB },
  @{ Name = "C-fetch"; Old = $oldC; New = $newC },
  @{ Name = "D-ui-card"; Old = $oldD; New = $newD }
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
Set-Content -LiteralPath $path -Value $content -NoNewline
Write-Host "SUCCESS: all edits applied to receipts/[id]/page.tsx" -ForegroundColor Green