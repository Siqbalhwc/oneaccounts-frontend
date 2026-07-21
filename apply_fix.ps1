$path = "src\app\dashboard\bills\[id]\page.tsx"
$content = Get-Content -LiteralPath $path -Raw

$old1 = 'import { ArrowLeft, Printer, Send, Package, Eye } from "lucide-react"'
$new1 = 'import { ArrowLeft, Printer, Send, Package, Eye, Paperclip, FileText } from "lucide-react"'

$old2 = @'
  const [bill, setBill] = useState<Bill | null>(null)
  const [whtData, setWhtData] = useState<WhtData | null>(null)
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")
'@

$new2 = @'
  const [bill, setBill] = useState<Bill | null>(null)
  const [whtData, setWhtData] = useState<WhtData | null>(null)
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")
  const [attachments, setAttachments] = useState<any[]>([])
'@

$old3 = @'
  const waLink = bill && bill.supplier
'@

$new3 = @'
  useEffect(() => {
    if (!companyId || !billId) return
    supabase.rpc("get_bill_attachments", { p_company_id: companyId, p_bill_id: Number(billId) })
      .then(({ data }) => { if (data) setAttachments(data) })
  }, [companyId, billId])

  const waLink = bill && bill.supplier
'@

$old4 = @'
      {bill && (
        <div className="card">
'@

$new4 = @'
      {attachments.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Paperclip size={16} /> Attachments
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {attachments.map((att: any) => (
              
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

      {bill && (
        <div className="card">
'@

$checks = @(
    @{old=$old1; label="icon import"},
    @{old=$old2; label="state"},
    @{old=$old3; label="load effect anchor"},
    @{old=$old4; label="panel insertion"}
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
    Set-Content -LiteralPath $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}