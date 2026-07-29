$path = "src\app\dashboard\payments\[id]\page.tsx"
$raw = Get-Content -LiteralPath $path -Raw
$hadCRLF = $raw -match "`r`n"
$content = $raw -replace "`r`n", "`n"

function Norm($s) { return ($s -replace "`r`n", "`n") }

# Piece 1: state cleanup
$old1 = Norm(@'
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
'@)
$new1 = Norm(@'
  const [attachments, setAttachments] = useState<any[]>([])
'@)

# Piece 2: fetchAttachments + useEffect + uploadFile (start through the insert call)
$old2 = Norm(@'
  // Fetch attachments
  const fetchAttachments = async () => {
    if (!paymentId || !companyId) return
    const { data } = await supabase
      .from("attachments")
      .select("*")
      .eq("source_type", "payment")
      .eq("source_id", paymentId)
    setAttachments(data || [])
  }

  useEffect(() => {
    if (paymentId && companyId) {
      fetchAttachments()
    }
  }, [paymentId, companyId])

  const uploadFile = async (file: File) => {
    if (!paymentId || !companyId) return
    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const storagePath = `${companyId}/payment/${paymentId}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(storagePath, file)

    if (uploadError) {
      alert("Upload failed: " + uploadError.message)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from("attachments")
      .getPublicUrl(storagePath)

    const { error: dbError } = await supabase
      .from("attachments")
      .insert({
        company_id: companyId,
        source_type: "payment",
        source_id: parseInt(paymentId),
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: (await supabase.auth.getUser()).data.user?.email,
      })
'@)
$new2 = ""

# Piece 3: the small connecting tail - just this one short anchor line, remove it and let piece 2/4 boundaries handle the rest
$old3 = Norm(@'
    if (dbError) {
'@)

# Piece 4: deleteAttachment removal
$old4 = Norm(@'
  const deleteAttachment = async (id: number, fileUrl: string) => {
    const pathParts = fileUrl.split('/')
    const storagePath = pathParts.slice(-3).join('/')
    await supabase.storage.from("attachments").remove([storagePath])
    await supabase.from("attachments").delete().eq("id", id)
    await fetchAttachments()
  }
'@)
$new4 = ""

$checks = @(
  @{ Name = "1-state"; Old = $old1 },
  @{ Name = "2-functions-start"; Old = $old2 },
  @{ Name = "3-if-dbError-anchor"; Old = $old3 },
  @{ Name = "4-deleteAttachment"; Old = $old4 }
)
$allGood = $true
foreach ($chk in $checks) {
  $c = ([regex]::Matches($content, [regex]::Escape($chk.Old))).Count
  Write-Host "$($chk.Name): matches found = $c"
  if ($c -ne 1) { $allGood = $false }
}
if (-not $allGood) {
  Write-Host "Stopping - one or more anchors not exactly 1. NO changes made." -ForegroundColor Red
  exit 1
}

# Apply piece 1 and piece 2 removals (safe, fully bounded)
$content = $content.Replace($old1, $new1)
$content = $content.Replace($old2, $new2)

# Now find where "if (dbError) {" starts (piece 3 anchor) and where "const deleteAttachment" starts (piece 4 anchor),
# and remove everything BETWEEN and INCLUDING piece3's block through right before piece4, using indices for safety.
$idxStart = $content.IndexOf($old3)
$idxEnd = $content.IndexOf("  const deleteAttachment = async")
if ($idxStart -lt 0 -or $idxEnd -lt 0 -or $idxEnd -le $idxStart) {
  Write-Host "Could not safely locate the middle section to remove - stopping, NO changes made." -ForegroundColor Red
  exit 1
}
$before = $content.Substring(0, $idxStart)
$after = $content.Substring($idxEnd)
$content = $before + $after

# Apply piece 4 removal
$content = $content.Replace($old4, $new4)

if ($hadCRLF) { $content = $content -replace "`n", "`r`n" }
Set-Content -LiteralPath $path -Value $content -NoNewline
Write-Host "SUCCESS: all old attachment code removed from payments/[id]/page.tsx" -ForegroundColor Green