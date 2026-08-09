$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$path = "src\app\api\suppliers\opening-entry\route.ts"

if (-not (Test-Path $path)) {
    Write-Host "ABORT: File not found: $path" -ForegroundColor Red
    return
}

$backupPath = "$path.bak_$(Get-Date -Format yyyyMMdd_HHmmss)"
Copy-Item -Path $path -Destination $backupPath
Write-Host "Backup created: $backupPath" -ForegroundColor Yellow

$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

$old = @'
  if (amount > 0) {
    await supabase.from('accounts').update({ balance: eqAcc.data.balance - absAmount }).eq('id', eqAcc.data.id)
    await supabase.from('accounts').update({ balance: apAcc.data.balance + absAmount }).eq('id', apAcc.data.id)
  } else {
    await supabase.from('accounts').update({ balance: apAcc.data.balance - absAmount }).eq('id', apAcc.data.id)
    await supabase.from('accounts').update({ balance: eqAcc.data.balance + absAmount }).eq('id', eqAcc.data.id)
  }
'@

$new = @'
  if (amount > 0) {
    await supabase.from('accounts').update({ balance: eqAcc.data.balance + absAmount }).eq('id', eqAcc.data.id)
    await supabase.from('accounts').update({ balance: apAcc.data.balance - absAmount }).eq('id', apAcc.data.id)
  } else {
    await supabase.from('accounts').update({ balance: apAcc.data.balance + absAmount }).eq('id', apAcc.data.id)
    await supabase.from('accounts').update({ balance: eqAcc.data.balance - absAmount }).eq('id', eqAcc.data.id)
  }
'@

if ($content -notmatch [regex]::Escape($old)) {
    Write-Host "ABORT: Original snippet not found. No changes made." -ForegroundColor Red
    return
}

$countMatches = ([regex]::Matches($content, [regex]::Escape($old))).Count
if ($countMatches -gt 1) {
    Write-Host "ABORT: Snippet found $countMatches times (expected 1). No changes made." -ForegroundColor Red
    return
}

$newContent = $content.Replace($old, $new)
[System.IO.File]::WriteAllText($path, $newContent, $utf8NoBom)

Write-Host "FIXED (encoding-safe): $path" -ForegroundColor Green