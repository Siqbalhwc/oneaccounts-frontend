# apply_fix.ps1 - Payroll Stage 3: discard/regenerate runs, reliable reports, working Reject in Attendance Verification
# Run from: C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend
# SAFE: checks everything first. If ANY file does not match, NOTHING is changed.
$ErrorActionPreference = 'Stop'
$enc = New-Object System.Text.UTF8Encoding($false)
$root = (Get-Location).Path
$script:files = @{}
$script:failed = @()
$script:count = 0

function B64([string]$s) { return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($s -replace '\s',''))) }
function Sha([string]$t) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = $enc.GetBytes($t.Replace("`r`n","`n").TrimEnd())
  return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
}
function Load-File($rel) {
  if (-not $script:files.ContainsKey($rel)) {
    $full = Join-Path $root $rel
    if (-not (Test-Path -LiteralPath $full)) { return $false }
    $script:files[$rel] = [System.IO.File]::ReadAllText($full)
  }
  return $true
}

# New file (or full replacement). If $hash is given, the current file must be exactly the version this fix was built on.
function Add-File($rel, $b64, $hash) {
  if ($hash) {
    if (-not (Load-File $rel)) { $script:failed += "MISSING FILE: $rel"; return }
    if ((Sha $script:files[$rel]) -ne $hash) {
      $script:failed += "DIFFERENT FROM EXPECTED: $rel`n  This file on your computer is not the version this fix was written for. Send this file to Claude."
      return
    }
  }
  $script:files[$rel] = B64 $b64
  $script:count++
}

function Add-Patch($rel, $oldB64, $newB64) {
  $old = B64 $oldB64
  $new = B64 $newB64
  if (-not (Load-File $rel)) { $script:failed += "MISSING FILE: $rel"; return }
  $t = $script:files[$rel]
  $nl = if ($t.Contains("`r`n")) { "`r`n" } else { "`n" }
  $o = $old.Replace("`r`n","`n").Replace("`n",$nl)
  $n = $new.Replace("`r`n","`n").Replace("`n",$nl)
  $i = $t.IndexOf($o)
  if ($i -lt 0) {
    $first = (($old -split "`n") | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1).Trim()
    $msg = "NOT MATCHED in $rel`n  looking for: $first"
    $lines = $t -split "`r?`n"
    $hit = -1
    for ($k = 0; $k -lt $lines.Count; $k++) { if ($lines[$k].Contains($first)) { $hit = $k; break } }
    if ($hit -ge 0) {
      $msg += "`n  first line found at line $($hit+1); your file has this there:"
      $to = [Math]::Min($hit + 14, $lines.Count - 1)
      for ($k = $hit; $k -le $to; $k++) { $msg += "`n  | " + $lines[$k] }
    } else { $msg += "`n  (that first line does not exist in your file at all)" }
    $script:failed += $msg
    return
  }
  if ($t.IndexOf($o, $i + 1) -ge 0) { $script:failed += "FOUND TWICE in ${rel}: $($old.Substring(0, [Math]::Min(60,$old.Length)))"; return }
  $script:files[$rel] = $t.Substring(0,$i) + $n + $t.Substring($i + $o.Length)
  $script:count++
}

# Replace a block of lines: from the first line containing $startText to the first later line containing $endText
function Add-RangeReplace($rel, $startB64, $endB64, $newB64) {
  $startText = B64 $startB64
  $endText = B64 $endB64
  if (-not (Load-File $rel)) { $script:failed += "MISSING FILE: $rel"; return }
  $t = $script:files[$rel]
  $nl = if ($t.Contains("`r`n")) { "`r`n" } else { "`n" }
  $lines = [System.Collections.ArrayList]@($t -split "`r?`n")
  $s = -1
  for ($k = 0; $k -lt $lines.Count; $k++) { if ($lines[$k].Contains($startText)) { $s = $k; break } }
  if ($s -lt 0) { $script:failed += "NOT MATCHED in ${rel}: start line not found: $startText"; return }
  $e = -1
  for ($k = $s; $k -lt $lines.Count; $k++) { if ($lines[$k].Contains($endText)) { $e = $k; break } }
  if ($e -lt 0) { $script:failed += "NOT MATCHED in ${rel}: end line not found: $endText"; return }
  $newLines = ((B64 $newB64).TrimEnd("`r","`n") -split "`r?`n")
  $lines.RemoveRange($s, $e - $s + 1)
  $lines.InsertRange($s, $newLines)
  $script:files[$rel] = ($lines -join $nl)
  $script:count++
}


Add-File 'src\app\api\payroll\runs\[runId]\discard\route.ts' @'
aW1wb3J0IHsgTmV4dFJlcXVlc3QsIE5leHRSZXNwb25zZSB9IGZyb20gJ25leHQvc2VydmVyJwppbXBvcnQgewogIGNyZWF0ZVJv
dXRlQ2xpZW50LCByZXNvbHZlUGF5cm9sbEFjdG9yLCBsb2dQYXlyb2xsRXZlbnQsCn0gZnJvbSAnQC9saWIvcGF5cm9sbFNlcnZl
cicKCi8vIERpc2NhcmQgYSBwYXlyb2xsIHJ1biB0aGF0IGhhcyBOT1QgYmVlbiBwb3N0ZWQgKGRyYWZ0LCBzdWJtaXR0ZWQgb3Ig
YXBwcm92ZWQpLgovLyBBIHBvc3RlZCBydW4gbXVzdCBiZSByZXZlcnNlZCBpbnN0ZWFkLgpleHBvcnQgYXN5bmMgZnVuY3Rpb24g
UE9TVCgKICByZXF1ZXN0OiBOZXh0UmVxdWVzdCwKICB7IHBhcmFtcyB9OiB7IHBhcmFtczogUHJvbWlzZTx7IHJ1bklkOiBzdHJp
bmcgfT4gfQopIHsKICBjb25zdCB7IHJ1bklkOiBydW5JZFN0ciB9ID0gYXdhaXQgcGFyYW1zCiAgY29uc3Qgc3VwYWJhc2UgPSBh
d2FpdCBjcmVhdGVSb3V0ZUNsaWVudCgpCgogIGNvbnN0IHsgYWN0b3IsIHJlc3BvbnNlIH0gPSBhd2FpdCByZXNvbHZlUGF5cm9s
bEFjdG9yKHN1cGFiYXNlKQogIGlmICghYWN0b3IpIHJldHVybiByZXNwb25zZSEKICBjb25zdCBjb21wYW55SWQgPSBhY3Rvci5j
b21wYW55SWQKCiAgY29uc3QgcnVuSWQgPSBwYXJzZUludChydW5JZFN0ciwgMTApCiAgaWYgKGlzTmFOKHJ1bklkKSkgcmV0dXJu
IE5leHRSZXNwb25zZS5qc29uKHsgZXJyb3I6ICdJbnZhbGlkIHJ1biBJRCcgfSwgeyBzdGF0dXM6IDQwMCB9KQoKICBjb25zdCB7
IGRhdGE6IHJ1biB9ID0gYXdhaXQgc3VwYWJhc2UKICAgIC5mcm9tKCdwYXlyb2xsX3J1bnMnKQogICAgLnNlbGVjdCgnaWQsIHN0
YXR1cywgbW9udGgsIGRlcGFydG1lbnRfaWQnKQogICAgLmVxKCdpZCcsIHJ1bklkKQogICAgLmVxKCdjb21wYW55X2lkJywgY29t
cGFueUlkKQogICAgLm1heWJlU2luZ2xlKCkKCiAgaWYgKCFydW4pIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih7IGVycm9yOiAn
UnVuIG5vdCBmb3VuZCcgfSwgeyBzdGF0dXM6IDQwNCB9KQogIGlmICghWydkcmFmdCcsICdzdWJtaXR0ZWQnLCAnYXBwcm92ZWQn
XS5pbmNsdWRlcyhydW4uc3RhdHVzKSkgewogICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsKICAgICAgZXJyb3I6ICdPbmx5
IGEgcnVuIHRoYXQgaGFzIG5vdCBiZWVuIHBvc3RlZCBjYW4gYmUgZGlzY2FyZGVkLiBVc2UgUmV2ZXJzZSBmb3IgYSBwb3N0ZWQg
cnVuLicsCiAgICB9LCB7IHN0YXR1czogNDA5IH0pCiAgfQoKICBjb25zdCB7IGVycm9yOiBycGNFcnJvciB9ID0gYXdhaXQgc3Vw
YWJhc2UucnBjKCdkaXNjYXJkX3BheXJvbGxfcnVuJywgeyBwX3J1bl9pZDogcnVuSWQgfSkKICBpZiAocnBjRXJyb3IpIHJldHVy
biBOZXh0UmVzcG9uc2UuanNvbih7IGVycm9yOiBycGNFcnJvci5tZXNzYWdlIH0sIHsgc3RhdHVzOiA1MDAgfSkKCiAgYXdhaXQg
bG9nUGF5cm9sbEV2ZW50KHsKICAgIGNvbXBhbnlJZCwgdXNlcklkOiBhY3Rvci51c2VySWQsIHRhYmxlTmFtZTogJ3BheXJvbGxf
cnVucycsIHJlY29yZElkOiBTdHJpbmcocnVuSWQpLCBhY3Rpb246ICdERUxFVEUnLAogICAgb2xkVmFsdWVzOiB7IHN0YXR1czog
cnVuLnN0YXR1cywgbW9udGg6IHJ1bi5tb250aCwgZGVwYXJ0bWVudF9pZDogcnVuLmRlcGFydG1lbnRfaWQgfSwKICB9KQoKICBy
ZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oeyBzdWNjZXNzOiB0cnVlIH0pCn0K
'@ $null

Add-Patch 'src\app\dashboard\payroll\attendance\verify\page.tsx' @'
ICAgIGNvbnN0IHsgZGF0YTogeyB1c2VyIH0gfSA9IGF3YWl0IHN1cGFiYXNlLmF1dGguZ2V0VXNlcigpCiAgICBhd2FpdCBzdXBh
YmFzZQogICAgICAuZnJvbSgiYXR0ZW5kYW5jZV9yZWNvcmRzIikKICAgICAgLnVwZGF0ZSh7IHZlcmlmaWVkX3N0YXR1czogImFw
cHJvdmVkIiwgdmVyaWZpZWRfYnk6IHVzZXI/LmlkLCB2ZXJpZmllZF9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpIH0pCiAg
ICAgIC5pbigiaWQiLCBBcnJheS5mcm9tKHNlbGVjdGVkSWRzKSkKICAgICAgLmVxKCJjb21wYW55X2lkIiwgY29tcGFueUlkKQog
ICAgZmV0Y2hSZWNvcmRzKCkKICAgIHNldFByb2Nlc3NpbmcoZmFsc2UpCiAgICBzZXRGbGFzaChg4pyFICR7c2VsZWN0ZWRJZHMu
c2l6ZX0gcmVjb3JkcyBhcHByb3ZlZGApCiAgfQo=
'@ @'
ICAgIGNvbnN0IHsgZGF0YTogeyB1c2VyIH0gfSA9IGF3YWl0IHN1cGFiYXNlLmF1dGguZ2V0VXNlcigpCiAgICBjb25zdCB7IGVy
cm9yOiBhcHByRXJyIH0gPSBhd2FpdCBzdXBhYmFzZQogICAgICAuZnJvbSgiYXR0ZW5kYW5jZV9yZWNvcmRzIikKICAgICAgLnVw
ZGF0ZSh7IHZlcmlmaWVkX3N0YXR1czogImFwcHJvdmVkIiwgdmVyaWZpZWRfYnk6IHVzZXI/LmlkLCB2ZXJpZmllZF9hdDogbmV3
IERhdGUoKS50b0lTT1N0cmluZygpIH0pCiAgICAgIC5pbigiaWQiLCBBcnJheS5mcm9tKHNlbGVjdGVkSWRzKSkKICAgICAgLmVx
KCJjb21wYW55X2lkIiwgY29tcGFueUlkKQogICAgaWYgKGFwcHJFcnIpIHsgc2V0Rmxhc2goIkNvdWxkIG5vdCBhcHByb3ZlOiAi
ICsgYXBwckVyci5tZXNzYWdlKTsgc2V0UHJvY2Vzc2luZyhmYWxzZSk7IHJldHVybiB9CiAgICBmZXRjaFJlY29yZHMoKQogICAg
c2V0UHJvY2Vzc2luZyhmYWxzZSkKICAgIHNldEZsYXNoKGDinIUgJHtzZWxlY3RlZElkcy5zaXplfSByZWNvcmRzIGFwcHJvdmVk
YCkKICB9Cg==
'@

Add-Patch 'src\app\dashboard\payroll\attendance\verify\page.tsx' @'
ICAgIGNvbnN0IHsgZGF0YTogeyB1c2VyIH0gfSA9IGF3YWl0IHN1cGFiYXNlLmF1dGguZ2V0VXNlcigpCiAgICBhd2FpdCBzdXBh
YmFzZQogICAgICAuZnJvbSgiYXR0ZW5kYW5jZV9yZWNvcmRzIikKICAgICAgLnVwZGF0ZSh7IHZlcmlmaWVkX3N0YXR1czogImFw
cHJvdmVkIiwgdmVyaWZpZWRfYnk6IHVzZXI/LmlkLCB2ZXJpZmllZF9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpIH0pIC8v
IEZvciBub3csIHJlamVjdCA9IGFwcHJvdmUgKHdlJ2xsIGFkZCBhIHJlYWwgcmVqZWN0IHN0YXR1cyBsYXRlciBpZiBuZWVkZWQp
CiAgICAgIC5pbigiaWQiLCBBcnJheS5mcm9tKHNlbGVjdGVkSWRzKSkKICAgICAgLmVxKCJjb21wYW55X2lkIiwgY29tcGFueUlk
KQogICAgZmV0Y2hSZWNvcmRzKCkKICAgIHNldFByb2Nlc3NpbmcoZmFsc2UpCiAgICBzZXRGbGFzaChg4pyFICR7c2VsZWN0ZWRJ
ZHMuc2l6ZX0gcmVjb3JkcyBhcHByb3ZlZGApCg==
'@ @'
ICAgIGNvbnN0IHsgZGF0YTogeyB1c2VyIH0gfSA9IGF3YWl0IHN1cGFiYXNlLmF1dGguZ2V0VXNlcigpCiAgICBjb25zdCB7IGVy
cm9yOiByZWpFcnIgfSA9IGF3YWl0IHN1cGFiYXNlCiAgICAgIC5mcm9tKCJhdHRlbmRhbmNlX3JlY29yZHMiKQogICAgICAudXBk
YXRlKHsgdmVyaWZpZWRfc3RhdHVzOiAicmVqZWN0ZWQiLCB2ZXJpZmllZF9ieTogdXNlcj8uaWQsIHZlcmlmaWVkX2F0OiBuZXcg
RGF0ZSgpLnRvSVNPU3RyaW5nKCkgfSkKICAgICAgLmluKCJpZCIsIEFycmF5LmZyb20oc2VsZWN0ZWRJZHMpKQogICAgICAuZXEo
ImNvbXBhbnlfaWQiLCBjb21wYW55SWQpCiAgICBpZiAocmVqRXJyKSB7IHNldEZsYXNoKCJDb3VsZCBub3QgcmVqZWN0OiAiICsg
cmVqRXJyLm1lc3NhZ2UpOyBzZXRQcm9jZXNzaW5nKGZhbHNlKTsgcmV0dXJuIH0KICAgIGZldGNoUmVjb3JkcygpCiAgICBzZXRQ
cm9jZXNzaW5nKGZhbHNlKQogICAgc2V0Rmxhc2goYCR7c2VsZWN0ZWRJZHMuc2l6ZX0gcmVjb3JkcyByZWplY3RlZCAtIHRoZXkg
YXJlIGlnbm9yZWQgYnkgcGF5cm9sbCB1bnRpbCBjb3JyZWN0ZWQgYW5kIGFwcHJvdmVkYCkK
'@

Add-Patch 'src\app\dashboard\payroll\attendance\verify\page.tsx' @'
ICAgICAgICAgICAgICAgICAgICAgICkgOiAoCiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT0ic3RhdHVz
LWNoaXAiIHN0eWxlPXt7IGJhY2tncm91bmQ6ICIjRkVGM0M3IiwgY29sb3I6ICIjOTI0MDBFIiB9fT7ij7MgUGVuZGluZzwvc3Bh
bj4KICAgICAgICAgICAgICAgICAgICAgICl9
'@ @'
ICAgICAgICAgICAgICAgICAgICAgICkgOiByZWMudmVyaWZpZWRfc3RhdHVzID09PSAicmVqZWN0ZWQiID8gKAogICAgICAgICAg
ICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9InN0YXR1cy1jaGlwIiBzdHlsZT17eyBiYWNrZ3JvdW5kOiAiI0ZFRTJFMiIs
IGNvbG9yOiAiIzk5MUIxQiIgfX0+UmVqZWN0ZWQ8L3NwYW4+CiAgICAgICAgICAgICAgICAgICAgICApIDogKAogICAgICAgICAg
ICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9InN0YXR1cy1jaGlwIiBzdHlsZT17eyBiYWNrZ3JvdW5kOiAiI0ZFRjNDNyIs
IGNvbG9yOiAiIzkyNDAwRSIgfX0+4o+zIFBlbmRpbmc8L3NwYW4+CiAgICAgICAgICAgICAgICAgICAgICApfQ==
'@

Add-Patch 'src\app\dashboard\payroll\attendance\verify\page.tsx' @'
e2RyYXdlclJlY29yZC52ZXJpZmllZF9zdGF0dXMgPT09ICJhcHByb3ZlZCIgPyAi4pyTIEFwcHJvdmVkIiA6ICLij7MgUGVuZGlu
ZyJ9
'@ @'
e2RyYXdlclJlY29yZC52ZXJpZmllZF9zdGF0dXMgPT09ICJhcHByb3ZlZCIgPyAi4pyTIEFwcHJvdmVkIiA6IGRyYXdlclJlY29y
ZC52ZXJpZmllZF9zdGF0dXMgPT09ICJyZWplY3RlZCIgPyAiUmVqZWN0ZWQiIDogIuKPsyBQZW5kaW5nIn0=
'@

Add-Patch 'src\app\dashboard\payroll\runs\[id]\page.tsx' @'
ICBjb25zdCBbcmV2ZXJzZVJlYXNvbiwgc2V0UmV2ZXJzZVJlYXNvbl0gPSB1c2VTdGF0ZSgiIikK
'@ @'
ICBjb25zdCBbcmV2ZXJzZVJlYXNvbiwgc2V0UmV2ZXJzZVJlYXNvbl0gPSB1c2VTdGF0ZSgiIikKICBjb25zdCBbc2hvd0Rpc2Nh
cmRNb2RhbCwgc2V0U2hvd0Rpc2NhcmRNb2RhbF0gPSB1c2VTdGF0ZShmYWxzZSkK
'@

Add-Patch 'src\app\dashboard\payroll\runs\[id]\page.tsx' @'
ICAvLyAtLS0tLS0tLS0tIEVtcGxveWVlIHRhYmxlIHBhZ2luYXRpb24gLS0tLS0tLS0tLQo=
'@ @'
ICBjb25zdCBoYW5kbGVEaXNjYXJkID0gYXN5bmMgKCkgPT4gewogICAgc2V0QWN0aW9uTG9hZGluZygiZGlzY2FyZCIpCiAgICB0
cnkgewogICAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChgL2FwaS9wYXlyb2xsL3J1bnMvJHtydW5JZH0vZGlzY2FyZGAsIHsg
bWV0aG9kOiAiUE9TVCIgfSkKICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlcy5qc29uKCkuY2F0Y2goKCkgPT4gKHt9KSkKICAg
ICAgaWYgKCFyZXMub2spIHsKICAgICAgICBzZXRFcnJvcihkYXRhLmVycm9yIHx8ICJDb3VsZCBub3QgZGlzY2FyZCB0aGUgcnVu
IikKICAgICAgICBzZXRBY3Rpb25Mb2FkaW5nKCIiKQogICAgICAgIHNldFNob3dEaXNjYXJkTW9kYWwoZmFsc2UpCiAgICAgICAg
cmV0dXJuCiAgICAgIH0KICAgICAgcm91dGVyLnB1c2goIi9kYXNoYm9hcmQvcGF5cm9sbC9ydW5zIikKICAgICAgcmV0dXJuCiAg
ICB9IGNhdGNoIChlcnI6IGFueSkgeyBzZXRFcnJvcihlcnIubWVzc2FnZSkgfQogICAgc2V0QWN0aW9uTG9hZGluZygiIikKICB9
CgogIC8vIC0tLS0tLS0tLS0gRW1wbG95ZWUgdGFibGUgcGFnaW5hdGlvbiAtLS0tLS0tLS0tCg==
'@

Add-Patch 'src\app\dashboard\payroll\runs\[id]\page.tsx' @'
ICBjb25zdCBjYW5SZXZlcnNlID0gcnVuICYmIChydW4uc3RhdHVzID09PSAicG9zdGVkIiB8fCBydW4uc3RhdHVzID09PSAibG9j
a2VkIikgJiYgcG9zdFJvbGVzLmluY2x1ZGVzKHJvbGUgPz8gIiIpCg==
'@ @'
ICBjb25zdCBjYW5SZXZlcnNlID0gcnVuICYmIChydW4uc3RhdHVzID09PSAicG9zdGVkIiB8fCBydW4uc3RhdHVzID09PSAibG9j
a2VkIikgJiYgcG9zdFJvbGVzLmluY2x1ZGVzKHJvbGUgPz8gIiIpCiAgY29uc3QgY2FuRGlzY2FyZCA9IHJ1biAmJiAocnVuLnN0
YXR1cyA9PT0gImRyYWZ0IiB8fCBydW4uc3RhdHVzID09PSAic3VibWl0dGVkIiB8fCBydW4uc3RhdHVzID09PSAiYXBwcm92ZWQi
KSAmJiAocm9sZSA9PT0gImFkbWluIiB8fCByb2xlID09PSAiYWNjb3VudGFudCIpCg==
'@

Add-Patch 'src\app\dashboard\payroll\runs\[id]\page.tsx' @'
ICAgICAgICAgIHtjYW5SZXZlcnNlICYmICgK
'@ @'
ICAgICAgICAgIHtjYW5EaXNjYXJkICYmICgKICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9ImJ0biIgb25DbGljaz17KCkg
PT4gc2V0U2hvd0Rpc2NhcmRNb2RhbCh0cnVlKX0gZGlzYWJsZWQ9e2FjdGlvbkxvYWRpbmcgIT09ICIifT4KICAgICAgICAgICAg
ICBEaXNjYXJkIFJ1bgogICAgICAgICAgICA8L2J1dHRvbj4KICAgICAgICAgICl9CiAgICAgICAgICB7Y2FuUmV2ZXJzZSAmJiAo
Cg==
'@

Add-Patch 'src\app\dashboard\payroll\runs\[id]\page.tsx' @'
ICAgICAgey8qIFJldmVyc2UgTW9kYWwgKi99Cg==
'@ @'
ICAgICAgey8qIERpc2NhcmQgTW9kYWwgKi99CiAgICAgIHtzaG93RGlzY2FyZE1vZGFsICYmICgKICAgICAgICA8ZGl2IGNsYXNz
TmFtZT0ibW9kYWwtb3ZlcmxheSIgb25DbGljaz17KCkgPT4gc2V0U2hvd0Rpc2NhcmRNb2RhbChmYWxzZSl9PgogICAgICAgICAg
PGRpdiBjbGFzc05hbWU9Im1vZGFsLWNvbnRlbnQiIG9uQ2xpY2s9e2UgPT4gZS5zdG9wUHJvcGFnYXRpb24oKX0+CiAgICAgICAg
ICAgIDxoMyBzdHlsZT17eyBtYXJnaW46IDAsIGZvbnRTaXplOiAxOCwgZm9udFdlaWdodDogNzAwIH19PkRpc2NhcmQgdGhpcyBw
YXlyb2xsIHJ1bj88L2gzPgogICAgICAgICAgICA8cCBzdHlsZT17eyBtYXJnaW46ICIxMnB4IDAiLCBjb2xvcjogInZhcigtLXRl
eHQtbXV0ZWQpIiB9fT4KICAgICAgICAgICAgICBUaGUgcnVuIGhhcyBub3QgYmVlbiBwb3N0ZWQsIHNvIG5vdGhpbmcgaXMgYm9v
a2VkIGluIHRoZSBhY2NvdW50cy4gSXQgd2lsbCBiZSBkZWxldGVkIGFuZCB5b3UgY2FuIGdlbmVyYXRlIHRoZSBtb250aCBhZ2Fp
bi4KICAgICAgICAgICAgICBBdHRlbmRhbmNlLCBsZWF2ZSwgbG9hbnMgYW5kIGFkdmFuY2VzIGFyZSBub3QgY2hhbmdlZC4KICAg
ICAgICAgICAgPC9wPgogICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IGRpc3BsYXk6ICJmbGV4IiwgZ2FwOiA4LCBqdXN0aWZ5Q29u
dGVudDogImZsZXgtZW5kIiB9fT4KICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzTmFtZT0iYnRuIiBvbkNsaWNrPXsoKSA9PiBz
ZXRTaG93RGlzY2FyZE1vZGFsKGZhbHNlKX0+Q2FuY2VsPC9idXR0b24+CiAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9
ImJ0biBidG4tZGFuZ2VyIiBvbkNsaWNrPXtoYW5kbGVEaXNjYXJkfSBkaXNhYmxlZD17YWN0aW9uTG9hZGluZyAhPT0gIiJ9Pgog
ICAgICAgICAgICAgICAge2FjdGlvbkxvYWRpbmcgPT09ICJkaXNjYXJkIiA/ICJEaXNjYXJkaW5nLi4uIiA6ICJEaXNjYXJkIFJ1
biJ9CiAgICAgICAgICAgICAgPC9idXR0b24+CiAgICAgICAgICAgIDwvZGl2PgogICAgICAgICAgPC9kaXY+CiAgICAgICAgPC9k
aXY+CiAgICAgICl9CgogICAgICB7LyogUmV2ZXJzZSBNb2RhbCAqL30K
'@

Add-Patch 'src\app\dashboard\payroll\runs\[id]\page.tsx' @'
Y29sb3I6ICIjRkNBNUE1IiwgcGFkZGluZzogIjEwcHggMTRweCIsIGJvcmRlclJhZGl1czogOCwgbWFyZ2luQm90dG9tOiAxMiwg
Zm9udFNpemU6IDEzLCBib3JkZXI6ICIxcHggc29saWQgI0ZFQ0FDQSIgfX0+e2Vycm9yfQ==
'@ @'
Y29sb3I6ICJ2YXIoLS10ZXh0KSIsIHBhZGRpbmc6ICIxMHB4IDE0cHgiLCBib3JkZXJSYWRpdXM6IDgsIG1hcmdpbkJvdHRvbTog
MTIsIGZvbnRTaXplOiAxMywgYm9yZGVyOiAiMXB4IHNvbGlkICNkYzI2MjYiIH19PntlcnJvcn0=
'@

Add-Patch 'src\app\api\payroll\runs\generate\route.ts' @'
ICAgIC5lcSgnbW9udGgnLCBtb250aCkKICBzYW1lUXVlcnkgPSBkZXBhcnRtZW50X2lk
'@ @'
ICAgIC5lcSgnbW9udGgnLCBtb250aCkKICAgIC5uZXEoJ3N0YXR1cycsICdyZXZlcnNlZCcpCiAgc2FtZVF1ZXJ5ID0gZGVwYXJ0
bWVudF9pZA==
'@

Add-Patch 'src\app\dashboard\payroll\reports\bank-transfer\page.tsx' @'
ICAgICAgLnNlbGVjdCgiaWQsIG1vbnRoIikKICAgICAgLmVxKCJjb21wYW55X2lkIiwgY29tcGFueUlkKQogICAgICAuZXEoIm1v
bnRoIiwgbW9udGgpCiAgICAgIC5tYXliZVNpbmdsZSgpCg==
'@ @'
ICAgICAgLnNlbGVjdCgiaWQsIG1vbnRoIikKICAgICAgLmVxKCJjb21wYW55X2lkIiwgY29tcGFueUlkKQogICAgICAuZXEoIm1v
bnRoIiwgbW9udGgpCiAgICAgIC5uZXEoInN0YXR1cyIsICJyZXZlcnNlZCIpCiAgICAgIC5vcmRlcigiaWQiLCB7IGFzY2VuZGlu
ZzogZmFsc2UgfSkKICAgICAgLmxpbWl0KDEpCiAgICAgIC5tYXliZVNpbmdsZSgpCg==
'@

Add-Patch 'src\app\dashboard\payroll\reports\payroll-register\page.tsx' @'
ICAgICAgLnNlbGVjdCgiaWQsIG1vbnRoIikKICAgICAgLmVxKCJjb21wYW55X2lkIiwgY29tcGFueUlkKQogICAgICAuZXEoIm1v
bnRoIiwgbW9udGgpCiAgICAgIC5tYXliZVNpbmdsZSgpCg==
'@ @'
ICAgICAgLnNlbGVjdCgiaWQsIG1vbnRoIikKICAgICAgLmVxKCJjb21wYW55X2lkIiwgY29tcGFueUlkKQogICAgICAuZXEoIm1v
bnRoIiwgbW9udGgpCiAgICAgIC5uZXEoInN0YXR1cyIsICJyZXZlcnNlZCIpCiAgICAgIC5vcmRlcigiaWQiLCB7IGFzY2VuZGlu
ZzogZmFsc2UgfSkKICAgICAgLmxpbWl0KDEpCiAgICAgIC5tYXliZVNpbmdsZSgpCg==
'@

Add-Patch 'src\app\dashboard\payroll\reports\payslip\page.tsx' @'
ICAgICAgLnNlbGVjdCgiaWQsIG1vbnRoIikKICAgICAgLmVxKCJjb21wYW55X2lkIiwgY29tcGFueUlkKQogICAgICAuZXEoIm1v
bnRoIiwgbW9udGgpCiAgICAgIC5tYXliZVNpbmdsZSgpCg==
'@ @'
ICAgICAgLnNlbGVjdCgiaWQsIG1vbnRoIikKICAgICAgLmVxKCJjb21wYW55X2lkIiwgY29tcGFueUlkKQogICAgICAuZXEoIm1v
bnRoIiwgbW9udGgpCiAgICAgIC5uZXEoInN0YXR1cyIsICJyZXZlcnNlZCIpCiAgICAgIC5vcmRlcigiaWQiLCB7IGFzY2VuZGlu
ZzogZmFsc2UgfSkKICAgICAgLmxpbWl0KDEpCiAgICAgIC5tYXliZVNpbmdsZSgpCg==
'@

Add-Patch 'src\app\dashboard\payroll\reports\salary-summary\page.tsx' @'
ICAgICAgLnNlbGVjdCgiaWQsIG1vbnRoIikKICAgICAgLmVxKCJjb21wYW55X2lkIiwgY29tcGFueUlkKQogICAgICAuZXEoIm1v
bnRoIiwgbW9udGgpCiAgICAgIC5tYXliZVNpbmdsZSgpCg==
'@ @'
ICAgICAgLnNlbGVjdCgiaWQsIG1vbnRoIikKICAgICAgLmVxKCJjb21wYW55X2lkIiwgY29tcGFueUlkKQogICAgICAuZXEoIm1v
bnRoIiwgbW9udGgpCiAgICAgIC5uZXEoInN0YXR1cyIsICJyZXZlcnNlZCIpCiAgICAgIC5vcmRlcigiaWQiLCB7IGFzY2VuZGlu
ZzogZmFsc2UgfSkKICAgICAgLmxpbWl0KDEpCiAgICAgIC5tYXliZVNpbmdsZSgpCg==
'@

Add-Patch 'src\app\dashboard\payroll\reports\tax-deduction\page.tsx' @'
ICAgICAgLnNlbGVjdCgiaWQsIG1vbnRoIikKICAgICAgLmVxKCJjb21wYW55X2lkIiwgY29tcGFueUlkKQogICAgICAuZXEoIm1v
bnRoIiwgbW9udGgpCiAgICAgIC5tYXliZVNpbmdsZSgpCg==
'@ @'
ICAgICAgLnNlbGVjdCgiaWQsIG1vbnRoIikKICAgICAgLmVxKCJjb21wYW55X2lkIiwgY29tcGFueUlkKQogICAgICAuZXEoIm1v
bnRoIiwgbW9udGgpCiAgICAgIC5uZXEoInN0YXR1cyIsICJyZXZlcnNlZCIpCiAgICAgIC5vcmRlcigiaWQiLCB7IGFzY2VuZGlu
ZzogZmFsc2UgfSkKICAgICAgLmxpbWl0KDEpCiAgICAgIC5tYXliZVNpbmdsZSgpCg==
'@


if ($script:failed.Count -gt 0) {
  Write-Host ''
  Write-Host "NOTHING WAS CHANGED. $($script:failed.Count) problem(s):" -ForegroundColor Red
  foreach ($f in $script:failed) { Write-Host ''; Write-Host $f -ForegroundColor Yellow }
  Write-Host ''
  Write-Host 'Copy everything above and send it to Claude.' -ForegroundColor Red
  exit 1
}
foreach ($rel in $script:files.Keys) {
  $full = Join-Path $root $rel
  $dir = Split-Path $full -Parent
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  [System.IO.File]::WriteAllText($full, $script:files[$rel], $enc)
  Write-Host ("WROTE   " + $rel)
}
Write-Host ''
Write-Host ("Stage 3 applied: " + $script:count + " changes in " + $script:files.Count + " files.") -ForegroundColor Green
Write-Host 'REMINDER: run payroll_runs_fix.sql AND attendance_rejected_status.sql in Supabase BEFORE deploying (both safe to run again). Then: npm run build' -ForegroundColor Green