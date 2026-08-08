$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Restore-And-Fix {
    param(
        [string]$Path,
        [string]$BackupPath,
        [string]$OldSnippet,
        [string]$NewSnippet
    )

    if (-not (Test-Path $BackupPath)) {
        Write-Host "ABORT: Backup not found: $BackupPath" -ForegroundColor Red
        return
    }

    # Restore original (correctly-encoded) content from backup
    $content = [System.IO.File]::ReadAllText($BackupPath, [System.Text.Encoding]::UTF8)

    if ($content -notmatch [regex]::Escape($OldSnippet)) {
        Write-Host "ABORT: Original snippet not found in backup for $Path. No changes made." -ForegroundColor Red
        return
    }

    $countMatches = ([regex]::Matches($content, [regex]::Escape($OldSnippet))).Count
    if ($countMatches -gt 1) {
        Write-Host "ABORT: Snippet found $countMatches times in $BackupPath (expected 1). No changes made." -ForegroundColor Red
        return
    }

    $newContent = $content.Replace($OldSnippet, $NewSnippet)

    # Write back as proper UTF-8, no BOM corruption
    [System.IO.File]::WriteAllText($Path, $newContent, $utf8NoBom)

    Write-Host "FIXED (encoding-safe): $Path" -ForegroundColor Green
}

# ---------- Customer form ----------
$customerOld = @'
          const fullPhone = customer.phone || ""
          const match = fullPhone.match(/^(\+\d{1,3})(.*)$/)
          if (match) {
            setCountryCode(match[1])
            setPhoneNumber(match[2].trim())
          } else {
            setPhoneNumber(fullPhone)
          }
'@

$customerNew = @'
          const fullPhone = customer.phone || ""
          const matchedCode = COUNTRY_CODES.slice().sort((a, b) => b.code.length - a.code.length).find(c => fullPhone.startsWith(c.code))
          if (matchedCode) {
            setCountryCode(matchedCode.code)
            setPhoneNumber(fullPhone.slice(matchedCode.code.length).trim())
          } else {
            setPhoneNumber(fullPhone)
          }
'@

Restore-And-Fix -Path "src\app\dashboard\customers\new\page.tsx" `
    -BackupPath "src\app\dashboard\customers\new\page.tsx.bak_20260808_235715" `
    -OldSnippet $customerOld -NewSnippet $customerNew

# ---------- Supplier form ----------
$supplierOld = @'
          const phone = supData.phone || ""
          let cc = "+92"
          let ph = ""
          if (phone && phone.startsWith("+")) {
            const match = phone.match(/^(\+\d{1,3})(.*)/)
            if (match) {
              cc = match[1]
              ph = match[2].trim()
            }
          }
          setCountryCode(cc)
          setPhoneNumber(ph)
'@

$supplierNew = @'
          const phone = supData.phone || ""
          let cc = "+92"
          let ph = ""
          if (phone && phone.startsWith("+")) {
            const matchedCode = COUNTRY_CODES.slice().sort((a, b) => b.code.length - a.code.length).find(c => phone.startsWith(c.code))
            if (matchedCode) {
              cc = matchedCode.code
              ph = phone.slice(matchedCode.code.length).trim()
            }
          }
          setCountryCode(cc)
          setPhoneNumber(ph)
'@

Restore-And-Fix -Path "src\app\dashboard\suppliers\new\page.tsx" `
    -BackupPath "src\app\dashboard\suppliers\new\page.tsx.bak_20260808_235715" `
    -OldSnippet $supplierOld -NewSnippet $supplierNew

Write-Host ""
Write-Host "Done. Review FIXED/ABORT messages above." -ForegroundColor Cyan