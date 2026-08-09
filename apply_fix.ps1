$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$path = "src\app\api\customers\route.ts"

if (-not (Test-Path $path)) {
    Write-Host "ABORT: File not found: $path" -ForegroundColor Red
    return
}

$backupPath = "$path.bak_$(Get-Date -Format yyyyMMdd_HHmmss)"
Copy-Item -Path $path -Destination $backupPath
Write-Host "Backup created: $backupPath" -ForegroundColor Yellow

$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# ---------- Shared validation helper ----------
$importAnchor = "import { logDataChange } from '@/lib/audit'`r`nimport { generateNextCode } from '@/lib/generate-code'"

$importReplacement = @'
import { logDataChange } from '@/lib/audit'
import { generateNextCode } from '@/lib/generate-code'

const COUNTRY_CODES = ['+971', '+966', '+92', '+1', '+44', '+91', '+86', '+81', '+49', '+33', '+61', '+27']
const PHONE_LENGTHS: Record<string, number> = {
  '+92': 10, '+1': 10, '+44': 10, '+971': 9,
  '+966': 9, '+91': 10, '+86': 11, '+81': 10,
  '+49': 10, '+33': 9, '+61': 9, '+27': 9,
}

function validatePhone(phone: string | null | undefined): string | null {
  if (!phone) return 'Phone number is required'
  const matchedCode = COUNTRY_CODES.slice().sort((a, b) => b.length - a.length).find(c => phone.startsWith(c))
  if (!matchedCode) return 'Phone number must start with a recognized country code'
  const digits = phone.slice(matchedCode.length).replace(/\D/g, '')
  const expectedLength = PHONE_LENGTHS[matchedCode]
  if (expectedLength && digits.length !== expectedLength) {
    return `Phone must be ${expectedLength} digits for ${matchedCode}. Currently ${digits.length} digits.`
  }
  return null
}
'@

$countImport = ([regex]::Matches($content, [regex]::Escape($importAnchor))).Count
if ($countImport -ne 1) {
    Write-Host "ABORT: Import anchor found $countImport times (expected 1). No changes made." -ForegroundColor Red
    return
}
$content = $content.Replace($importAnchor, $importReplacement)

# ---------- POST: insert right after the destructure line ----------
$postAnchor = "  const { code, name, phone, email, address, country_code, payment_terms, opening_balance } = await request.json()"
$countPost = ([regex]::Matches($content, [regex]::Escape($postAnchor))).Count
if ($countPost -ne 1) {
    Write-Host "ABORT: POST anchor found $countPost times (expected 1). No changes made." -ForegroundColor Red
    return
}
$postReplacement = $postAnchor + "`r`n`r`n  const phoneError = validatePhone(phone)`r`n  if (phoneError) {`r`n    return NextResponse.json({ error: phoneError }, { status: 400 })`r`n  }"
$content = $content.Replace($postAnchor, $postReplacement)

# ---------- PUT: insert right after the destructure line ----------
$putAnchor = "  const { id, code, name, phone, email, address, country_code, payment_terms, opening_balance } = await request.json()"
$countPut = ([regex]::Matches($content, [regex]::Escape($putAnchor))).Count
if ($countPut -ne 1) {
    Write-Host "ABORT: PUT anchor found $countPut times (expected 1). No changes made." -ForegroundColor Red
    return
}
$putReplacement = $putAnchor + "`r`n`r`n  const phoneError = validatePhone(phone)`r`n  if (phoneError) {`r`n    return NextResponse.json({ error: phoneError }, { status: 400 })`r`n  }"
$content = $content.Replace($putAnchor, $putReplacement)

[System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
Write-Host "FIXED (encoding-safe): $path" -ForegroundColor Green