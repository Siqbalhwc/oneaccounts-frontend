# =====================================================================
# OneAccounts - apply_cash_sale_return.ps1
# Cash Sale return (Return button on the cash sale page + list, locked returned sales,
# journal links)
#
# RUN FROM:  C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend
# Changes 6 existing files and adds 1 new file. Nothing else is touched.
#
# SAFETY
#  - Nothing is written unless EVERY existing file on your PC is identical
#    to the version these changes were made against. If even one differs,
#    the script stops and writes nothing.
#  - Every existing file is backed up FIRST to a folder OUTSIDE the project
#    (one level up, named _backup_cash_sale_return) so git never picks it up.
#  - Afterwards each file is re-read and checked.
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
  @{ Path = 'src\app\dashboard\cash-sales\page.tsx'; OldHash = '84519a328b9f120689c146e972ac6106bc05f99e78ae1fb00b2642870b6661bc'; NewHash = 'e90083cef264e9d1f1fa0dff9a94d5199f837651d0cc32d44aa4a883ecf96037';
    Data = @(
      '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',
      '8ynGnGK0XAfyn8JRXK5tLf8fnf4KqZRLAAA='
    ) },
  @{ Path = 'src\app\dashboard\cash-sales\[id]\page.tsx'; OldHash = '0fc360fa4a5284993cb84288ed705bab6eea5ff89c31eea57549db4f33037eee'; NewHash = 'c16d6b0cb7221c4a3d8248cc1ad9e8f58fbe8efb98ca868ad748bb8d934177ad';
    Data = @(
      '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'
    ) },
  @{ Path = 'src\app\dashboard\cash-sales\new\page.tsx'; OldHash = '9f13ae63388352e8f8511e30eae8ac23be6803253678da470f0416e0d9b4411c'; NewHash = '13510d10c00f30db15f2ba0781bb38429d0ade50daf0ee58388b6e2493a9513a';
    Data = @(
      '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'
    ) },
  @{ Path = 'src\app\dashboard\journal\page.tsx'; OldHash = '9be2ec14eda157d00e105bb900921fcb6867bdb7fa1aff5ae314ec8521dd8702'; NewHash = 'a12604f1283ce90a4e5fd048075515ffb34c765e26d9777bc09d380644eef42b';
    Data = @(
      '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'
    ) },
  @{ Path = 'src\app\dashboard\journal\[id]\page.tsx'; OldHash = '5369c14715de00d4e3281725b7a7970b1d471eb98c5daa4e74cc0c3c33f92452'; NewHash = 'cb1f8b3448e9d1214493b031cd8af1f6e4a7a594391f75a03e13c69d4daed073';
    Data = @(
      'H4sIAAAAAAACA81a3XLbuBW+11PA3HaXTPXrOD/jWPbajt1113UzcdJtJ5NRIBKSsKZIloT8U0UzeYftbad3fbA8QR+h5wAgCVCUZG9ysb6QSODgnO/84gCy',
      'M8sY8UPOIuE0GnyaxKkgcwKjl4IK1sSnk9GI+YIsyCiNp8RJGfWB2KR9Hc8ESyXxK5rSaVYQR+xWdCJ6zcdU8DgylvnAR7CjNL7JWHosERSrvs9mCR3SjHWy',
      'LDXWHKZAfs5GoklObkFiRMNzHl0V68KZzwPWshG+jkP2xxlNg5x5x49hJgKBWaeYLMmZH6fBDzwTcXpXu8QkQKNFgGREfUb+FM80JEbmDUJ4sEui2XTIUnih',
      'vh/PIjGwBgM25MJ4B6ME1kAGLH02EHcJO9glmUh5NC6HeXCwLAGGwLpxwHL6FySi0+KNLBoLE/RJJEDPJbgMhwdRbAgNwF/mK8v8lCfoVmM0BOUzgGDY4t17',
      'lNjpkD/TxFSIiJhQkmLsNEazyEdOZMzEpSRBx7qK+g0Q5yKamsNZAdYrNEMlshsu/AkxVnpyHGwL8UScjIZgt+g65j5zdo0Je4yQlAnQgHzoBDSbDGMIkY4m',
      'yTq/m+cgFh8MFgmMTeBpMORhaDE3Bmo54/xmtmrhOj45aUvNrWQprbCZHZJlm3jB52SAlJbGxSiIuWYpPK2c3oQCaVsSyioIKfMZROI6JppktZHp3RSL4Drj',
      'KpKVLIY0uhqIlEbZiKVrvQ2EEK/yu5UvyD7YwQiSoL4MaPDzLBOboBX0nZJeMwzYiM5CUVnsOPAuKwG7lWVPk5EiEXUCv2SC8vAVHTNXJZIfR5lQWZuSfln9',
      'Xa+YTNQe0C/3A2NSFpazAGYV2UGbB4RmZQVRZPkOAHQ1O4UrtUnSGLIxa7Poun1x8rc3g1dvj87PjgeXb18dHh1engzevj7fat6P9PDiLxeDH0/+vgXkXqOA',
      '8U7ChaLDhCyU75VWcnPcU6XzI9ShMNx38bNU810Y00DVKybO1bO52BXpjBnkDLa2VMnBJ0uOLm+2IFha7M0u+Ka/r+scze4iv/Qj4pBA3bwQQqUfEXdLO8LT',
      'IaGn8s1A/Slwcyz9tEkkxl3lQUAJ226f0BvKS28VCwlp49bpOj+rMBrgIs4yxzNJMhYieueRPcz+4To8cJp5rNhrwBQhBGOjGERtCkwfP5ItROsZWpDCrK6j',
      'w1qxJlEMEQ+bZmABKD3mjmiYMXPOMhamUMOUIe0sxTdqbbir9sfClPLtoaaUi1YYspl3Abv6O3OxFWjKFsBrmttvs+wils2vtn/pBMQNOVoxeI58lZ1PoWqw',
      'ALd4DECyjPkLjZzAtoIxL78PwLztdhufm0qUNi2Gw7v3YN1dkqfneukLKMDYP8wbG1WSJnLuwbJh6GBkIxbgpi4wZ8F7aV9pWcUkz0uyF/BrqI53IevP51A0',
      'A5zdJds7TSKguz4M+RgaMMdn2NKBv/w4xNByrmnqtlpI0ppCgQ48mBtS/2qcYsAXBMMxTkx59APj4wn0nk6v272eOGSx2Nf6fP70370OoNjXCGXwfjG+b06P',
      'D58cPnk4qrmUv7AgqWr2W7DZiV1YNEqACQ3wKY8gfiaMjHgKNQFDFF6pINCzQSus8rHcAvM+GDdBqV9bddftEfBxQwz/sG021N9+Ww7wwFvmdAWcDLYHte02',
      'Tplst5pkeYIHWx5kFfQRhRQRC+wX4ERTxQunmpnPXBcKXyh3qoz8AZDK00+TdD1M067N51iehO7JSB2bSk6Nos9RjcJeeQakYRjfsAAHsv78nUMDcCM409H1',
      'kkKj9X6xr3N3TRw9ICyaEAqROKVTHt7B4HdnGHXfgVWh82tBT8NHtSHoyXgq6suexLE//2DWah91mltgFAOc8F6QIRxVGbDtJbfgxBBaLQ1VjhcErRQSfQZV',
      's7ed3L4wFO3i65SmYx7BGiHiKdA8xcFhfNvKJjSIb3KR6q2VTYHtwgQJnRvufzxLQgoGGIWshqmUhHZqZfyfcNzr7eAAxUxtccGmAE6la4V5SIcsBPY3PBAT',
      'VEAy0tZcymct4kY76Gm3awuV6kt61ZfHKWCbJQlLsTGviL6m4YzJw3ZFWFXMExRjLhV0GDIDdLf7+8IVwC2kSQZo8qfCWCJOcowWN9ivFGiqClvIRsLwItpW',
      'L6sPlNYkvpbRYKF+hqg3GFKbrbvBbCET4LlWllBfIuq2uztsWqhcBMGqKLW0xYCv1e2ezEzgj2uDpSox3ZUGUqI3mNCKkKGIrP6IlFnAI6xpLZUMtWE+puBt',
      'zDWLQaH5c1R8x1A8z+Hn1Ux6XAyYcW9x9WdphjZIYq6EF4Wj/WRl6TAMId0OBzqAXmG8Pn5GuijyaAJ1EIJWMuLqUglqNURK70lms5RcAryFo4ouiiNmklRd',
      'oL33YNe1kpRD5t3VrtRzXiV89HAeRmVOL5GsEbgGcM6/FnMqryZbE315Wbd+OG5l8Uh49VFjBpfJ+wN0W2r7KVtxe28s4trBiIb9TIb0mYrostGSMd3bbuqK',
      'dqRzFTdUXPdTivPODXzZmx+IG86ANiJ+SLPsAk4zfQcs5pA4Og65f9WfqzOwuphoJ7Ns4jrGDYk+PDmexRTYFnfKBLOlP+89XZCOJbijJFtjlu6IHLSqAAaq',
      'Sc8ggnC/lPm4va0agp90Mj7vduu3/9xKUC+Rd350VR2mupjZ60x6FaFJKXNdW1vi6T2uCJqrniu/AgbfJ7ZBdOOd/82N/hJaUNfGQ8kkZaO+QbSA/S+FzrPv',
      'DIYhja4c6NbCvhPFccIiiPsohgXQ5EPEVN1t6wrcrd8BtAd30IPkr5zdENXckpexP8M7MRtZh5rsvDLcy6bdcLeBBKuGsxQPBgGElLO/BwXRilfZqjj6hHAR',
      'Q0oBwTKZbCucGi8o8qr1HyT7Jd4nbZAbgd2QTl2qtPHa32uL+Dz2achw4lLeR7neV4JU/o5wP4sYPzxgu+98/vQvZwWUhzty8rhMH5UUb7Dp6loJ89RO4Geb',
      'Ejgvc71tearGswwk7mMrh4xzDiaR8doOWTSGHm8fsvOgml2yk1zKCjhj0qA6iuPp8qAk3z9Ux5+9DjzXk5R2MY/QKZpA1mp18nNf/fja+wIu+ty3hg2MLmmB',
      'lDUa74lhHNwtszCN3Z7SxJXXWXL/cGthp+SK3fXnSNXmwaJONyQL9hVJ/ktcG+/eFuTzp19IZQKv4yBmRbCS1TpDFdEmmcpjtI4O55vT5896z3oOqS37S1uU',
      'YZMlXuVAkf155iN30MpZ1KP/OnqpU32h2PbLlztHp79WMYuZMfKVVKsLSthSvEVdDtpNgVVFam4VjBZ1lZoYeW/w1mQlvHvavQwfbAPKC50lKy2+XFLuz0LS',
      'cb1DVohaUQaWEx4GqzUSnez+iq4JsV7E+mpZXu/BJxwLoeHWBbvSKq3pKeadR+R4QqMxI/k/GzzqLH5bO5Vlov/955d/VxBbTaG9ny21ANbRpNLH7dn/dCH9',
      'pZZVfz4iis9Z0J/r+FB254G31LbXdQJLL3vlv4Dsy5/+Fv8HjkAgsRMjAAA='
    ) },
  @{ Path = 'src\components\JournalEntryDrawer.tsx'; OldHash = '3942e08073f8635875779e9ff010bd421ae61fb64795a742ee48aa760019125d'; NewHash = '6ab449d4d36acf4223c36060a1d975a06803987a69ad5623fa7fac9328e379d2';
    Data = @(
      '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'
    ) },
  @{ Path = 'src\components\CashSaleReturnModal.tsx'; OldHash = ''; NewHash = '9a64561238ba90f1e2f64d0a3acce73077de20b11b82bd4f455a45cd55959ea5';
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

# Line-ending style used by this PC's copy of the project (used for the 3 new files)
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
$backupRoot = Join-Path (Split-Path $root -Parent) '_backup_cash_sale_return'
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
  Write-Host 'Some files did not verify. Restore from the _backup_cash_sale_return folder (one level up) and tell me.' -ForegroundColor Red
  exit 1
}
Write-Host 'DONE. 6 files changed, 1 file added. Originals are backed up in the folder above this one: _backup_cash_sale_return' -ForegroundColor Green
Write-Host ''
Write-Host 'Next (test locally first if you like):'
Write-Host '  Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue'
Write-Host '  npm run dev'
