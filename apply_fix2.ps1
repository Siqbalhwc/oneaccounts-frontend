$path = "src\app\dashboard\invoices\[id]\page.tsx"
$raw = Get-Content -LiteralPath $path -Raw
$hadCRLF = $raw -match "`r`n"
$content = $raw -replace "`r`n", "`n"

$edits = @()

$edits += @{
  Name = "A-icons"
  Old = "import { ArrowLeft, Printer, Send } from ""lucide-react"""
  New = "import { ArrowLeft, Printer, Send, Paperclip, FileText } from ""lucide-react"""
}

$edits += @{
  Name = "B-state"
  Old = "const [journalLines, setJournalLines] = useState<JournalLine[]>([])"
  New = "const [journalLines, setJournalLines] = useState<JournalLine[]>([])`n  const [attachments, setAttachments] = useState<any[]>([])"
}

$edits += @{
  Name = "C-fetch-effect"
  Old = "const waLink = invoice && invoice.customer"
  New = "useEffect(() => {`n    if (!companyId || !invoiceId) return`n    supabase.rpc(""get_invoice_attachments"", { p_company_id: companyId, p_invoice_id: Number(invoiceId) })`n      .then(({ data }) => { if (data) setAttachments(data) })`n  }, [companyId, invoiceId])`n`n  const waLink = invoice && invoice.customer"
}

$edits += @{
  Name = "D-ui-card"
  Old = "{invoice && ("
  New = "{attachments.length > 0 && (`n        <div className=""card"">`n          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, color: ""var(--text)"", marginBottom: 12, display: ""flex"", alignItems: ""center"", gap: 8 }}>`n            <Paperclip size={16} /> Attachments`n          </h3>`n          <div style={{ display: ""flex"", flexDirection: ""column"", gap: 8 }}>`n            {attachments.map((att: any) => (`n              <a`n                key={att.id}`n                href={att.file_url}`n                target=""_blank""`n                rel=""noopener noreferrer""`n                style={{ display: ""flex"", alignItems: ""center"", gap: 8, padding: 10, border: ""1px solid var(--border)"", borderRadius: 8, textDecoration: ""none"", color: ""var(--text)"" }}`n              >`n                <FileText size={16} style={{ color: ""var(--primary)"", flexShrink: 0 }} />`n                <span style={{ fontSize: 13, flex: 1, whiteSpace: ""nowrap"", overflow: ""hidden"", textOverflow: ""ellipsis"" }}>{att.file_name}</span>`n              </a>`n            ))}`n          </div>`n        </div>`n      )}`n`n      {invoice && ("
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
Set-Content -LiteralPath $path -Value $content -NoNewline
Write-Host "SUCCESS: all 4 edits applied to invoices/[id]/page.tsx" -ForegroundColor Green