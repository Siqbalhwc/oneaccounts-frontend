$path = "src\app\dashboard\receipts\new\page.tsx"
$raw = Get-Content -Raw $path
$hadCRLF = $raw -match "`r`n"
$content = $raw -replace "`r`n", "`n"

function Norm($s) { return ($s -replace "`r`n", "`n") }

$oldA = Norm(@'
  const [tempAttachKey] = useState(() => `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
'@)
$newA = Norm(@'
  const [tempAttachKey, setTempAttachKey] = useState(() => `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
'@)

$oldB = Norm(@'
  useEffect(() => {
    if (!editId || !companyId) return
    supabase.rpc('get_receipt_attachments', { p_company_id: companyId, p_receipt_id: Number(editId) }).then(({ data }) => { if (data) setAttachments(data) })
  }, [editId, companyId])
'@)
$newB = Norm(@'
  useEffect(() => {
    if (!editId || !companyId) return
    supabase.rpc('get_receipt_attachments', { p_company_id: companyId, p_receipt_id: Number(editId) }).then(({ data }) => { if (data) setAttachments(data) })
  }, [editId, companyId])

  useEffect(() => {
    if (editId) return
    setAttachments([])
    setTempAttachKey(`temp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  }, [editId])
'@)

$oldC = Norm(@'
        if (data?.receipt_id) {
          try {
            await supabase.rpc('link_receipt_attachments', { p_company_id: companyId, p_temp_key: tempAttachKey, p_receipt_id: data.receipt_id })
          } catch (linkErr) {
            console.error('Attachment linking failed (receipt already saved successfully):', linkErr)
          }
        }
'@)
$newC = Norm(@'
        if (data?.receipt_id) {
          try {
            await supabase.rpc('link_receipt_attachments', { p_company_id: companyId, p_temp_key: tempAttachKey, p_receipt_id: data.receipt_id })
          } catch (linkErr) {
            console.error('Attachment linking failed (receipt already saved successfully):', linkErr)
          }
        }
        setAttachments([])
        setTempAttachKey(`temp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
'@)

$edits = @(
  @{ Name = "A-setter"; Old = $oldA; New = $newA },
  @{ Name = "B-reset-on-editId-change"; Old = $oldB; New = $newB },
  @{ Name = "C-reset-after-create"; Old = $oldC; New = $newC }
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
Write-Host "SUCCESS: attachment reset fixed in receipts/new/page.tsx" -ForegroundColor Green