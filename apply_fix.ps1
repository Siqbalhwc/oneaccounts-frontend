# =====================================================================
# OneAccounts - apply_fix.ps1  (Receipts & Payments: block allocation above the bank amount)
# RUN FROM:  C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend
# Changes 2 existing files. Nothing else is touched.
# Nothing is written unless EVERY file on your PC is identical to the version
# these changes were made against. Backups go OUTSIDE the project.
# =====================================================================
$ErrorActionPreference = 'Stop'
try { Add-Type -AssemblyName System.IO.Compression } catch {}

$root = (Get-Location).Path
if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json')) -or
    -not (Test-Path -LiteralPath (Join-Path $root 'src\app\dashboard'))) {
  Write-Host 'ERROR: run this from the frontend folder (the folder that contains package.json).' -ForegroundColor Red
  exit 1
}

$files = @(
  @{ Path = 'src\app\dashboard\receipts\new\page.tsx'; OldHash = 'b9d6866e53774a552f2dd7f256d8ca3d74551e54f4aca1438c121976eda533ae'; NewHash = 'ea84297ee5d2b1e8f9989796f477dee146e758b3e7dc4957d3995ce55481419e';
    Data = @(
      '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'
    ) },
  @{ Path = 'src\app\dashboard\payments\new\page.tsx'; OldHash = '8df37dfb87a24048cf79a4eac8837e85647eab8495174a16b77735ce9491213a'; NewHash = '80f860181329f3a98eff1112d37d792485c9f489f651c5ecce0bcc8a6b36315e';
    Data = @(
      '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'
    ) }
)

function Get-Sha256Lf([byte[]]$bytes) {
  # hash ignoring carriage returns, so Windows (CRLF) and Linux (LF) copies compare equal
  $list = New-Object 'System.Collections.Generic.List[byte]'
  foreach ($b in $bytes) { if ($b -ne 13) { $list.Add($b) } }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $h = $sha.ComputeHash($list.ToArray())
  return ([BitConverter]::ToString($h) -replace '-', '').ToLower()
}

function Expand-Payload([string[]]$parts) {
  $raw = [Convert]::FromBase64String(($parts -join ''))
  $ms  = New-Object System.IO.MemoryStream(, $raw)
  $gz  = New-Object System.IO.Compression.GZipStream($ms, [System.IO.Compression.CompressionMode]::Decompress)
  $out = New-Object System.IO.MemoryStream
  $gz.CopyTo($out)
  $gz.Close()
  return , $out.ToArray()
}

function Test-HasCr([byte[]]$bytes) {
  foreach ($b in $bytes) { if ($b -eq 13) { return $true } }
  return $false
}

function ConvertTo-Crlf([byte[]]$bytes) {
  $list = New-Object 'System.Collections.Generic.List[byte]'
  $prev = 0
  foreach ($b in $bytes) {
    if ($b -eq 10 -and $prev -ne 13) { $list.Add(13) }
    $list.Add($b)
    $prev = $b
  }
  return , $list.ToArray()
}

# Line-ending style used by this PC's copy of the project (used for new files, none in this run)
$refPath  = Join-Path $root 'src\app\dashboard\bills\page.tsx'
$useCrlfForNew = $false
if (Test-Path -LiteralPath $refPath) {
  $useCrlfForNew = Test-HasCr ([System.IO.File]::ReadAllBytes($refPath))
}

# ---------------- PHASE 1: verify everything, write nothing ----------------
Write-Host ''
Write-Host 'Phase 1: checking your files...' -ForegroundColor Cyan
$problems = @()
$plan = @()
foreach ($f in $files) {
  $full = Join-Path $root $f.Path
  $newBytes = Expand-Payload $f.Data
  if ((Get-Sha256Lf $newBytes) -ne $f.NewHash) { $problems += ('Internal check failed for ' + $f.Path); continue }
  if ($f.OldHash -eq '') {
    if (Test-Path -LiteralPath $full) { $problems += ('Already exists (expected a new file): ' + $f.Path); continue }
    Write-Host ('  NEW      ' + $f.Path)
    $plan += @{ Full = $full; Path = $f.Path; Bytes = $newBytes; IsNew = $true; Crlf = $useCrlfForNew; NewHash = $f.NewHash }
  } else {
    if (-not (Test-Path -LiteralPath $full)) { $problems += ('Missing file: ' + $f.Path); continue }
    $cur = [System.IO.File]::ReadAllBytes($full)
    if ((Get-Sha256Lf $cur) -ne $f.OldHash) { $problems += ('Your file is different from the expected version: ' + $f.Path); continue }
    Write-Host ('  CHANGE   ' + $f.Path)
    $plan += @{ Full = $full; Path = $f.Path; Bytes = $newBytes; IsNew = $false; Crlf = (Test-HasCr $cur); NewHash = $f.NewHash }
  }
}
if ($problems.Count -gt 0) {
  Write-Host ''
  Write-Host 'STOPPED - nothing was changed.' -ForegroundColor Red
  foreach ($p in $problems) { Write-Host ('  - ' + $p) -ForegroundColor Red }
  Write-Host ''
  Write-Host 'Please send me this list. Tip: run "git status" and tell me the result.'
  exit 1
}

# ---------------- PHASE 2: backup, then write ----------------
Write-Host ''
Write-Host 'Phase 2: backing up and writing...' -ForegroundColor Cyan
$backupRoot = Join-Path (Split-Path $root -Parent) '_backup_overallocation'
if (Test-Path -LiteralPath $backupRoot) { $backupRoot = $backupRoot + '_' + (Get-Date -Format 'yyyyMMdd_HHmmss') }
foreach ($p in $plan) {
  if (-not $p.IsNew) {
    $dest = Join-Path $backupRoot $p.Path
    New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
    Copy-Item -LiteralPath $p.Full -Destination $dest -Force
  }
}
foreach ($p in $plan) {
  $bytes = $p.Bytes
  if ($p.Crlf) { $bytes = ConvertTo-Crlf $bytes }
  New-Item -ItemType Directory -Force -Path (Split-Path $p.Full -Parent) | Out-Null
  [System.IO.File]::WriteAllBytes($p.Full, $bytes)
}

# ---------------- verify what was written ----------------
$bad = 0
foreach ($p in $plan) {
  $now = [System.IO.File]::ReadAllBytes($p.Full)
  if ((Get-Sha256Lf $now) -eq $p.NewHash) { Write-Host ('  OK       ' + $p.Path) -ForegroundColor Green }
  else { Write-Host ('  MISMATCH ' + $p.Path) -ForegroundColor Red; $bad++ }
}
Write-Host ''
if ($bad -gt 0) {
  Write-Host 'Some files did not verify. Restore from the _backup_overallocation folder (one level up) and tell me.' -ForegroundColor Red
  exit 1
}
Write-Host 'DONE. 2 files changed. Originals are backed up in the folder above this one: _backup_overallocation' -ForegroundColor Green
Write-Host ''
Write-Host 'Next (test locally first if you like):'
Write-Host '  Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue'
Write-Host '  npm run dev'