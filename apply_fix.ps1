# apply_fix.ps1 - Payroll Stage 2: leave (yearly balance, overlap check, attendance marking, unpaid-leave deduction)
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


Add-Patch 'src\lib\payrollCalc.ts' @'
Ly8gUGFyc2UgYSBzZXR0aW5ncyByb3cgY29taW5nIGZyb20gdGhlIGRhdGFiYXNlLgo=
'@ @'
Ly8gV29ya2luZyBkYXlzICh3ZWVrbHkgb2ZmcyBleGNsdWRlZCkgYmV0d2VlbiB0d28gZGF0ZXMsIGluY2x1c2l2ZS4gRGF0ZXMg
YXJlICdZWVlZLU1NLUREJy4KZXhwb3J0IGZ1bmN0aW9uIGNvdW50V29ya2luZ0RheXMoZnJvbTogc3RyaW5nLCB0bzogc3RyaW5n
LCBzOiBQYXlyb2xsU2V0dGluZ3MpOiBudW1iZXIgewogIGNvbnN0IG9mZiA9IHdlZWtseU9mZkRheXMocykKICBjb25zdCBmID0g
bmV3IERhdGUoZnJvbSArICdUMDA6MDA6MDBaJykKICBjb25zdCB0ID0gbmV3IERhdGUodG8gKyAnVDAwOjAwOjAwWicpCiAgaWYg
KGlzTmFOKGYuZ2V0VGltZSgpKSB8fCBpc05hTih0LmdldFRpbWUoKSkgfHwgZiA+IHQpIHJldHVybiAwCiAgbGV0IG4gPSAwCiAg
Zm9yIChjb25zdCBkID0gbmV3IERhdGUoZik7IGQgPD0gdDsgZC5zZXRVVENEYXRlKGQuZ2V0VVRDRGF0ZSgpICsgMSkpIHsKICAg
IGlmICghb2ZmLmluY2x1ZGVzKGQuZ2V0VVRDRGF5KCkpKSBuKysKICB9CiAgcmV0dXJuIG4KfQoKLy8gUGFyc2UgYSBzZXR0aW5n
cyByb3cgY29taW5nIGZyb20gdGhlIGRhdGFiYXNlLgo=
'@

Add-Patch 'src\app\api\payroll\runs\generate\route.ts' @'
aW1wb3J0IHsgY29tcHV0ZVNhbGFyeSwgZGFpbHlSYXRlLCBzZXR0aW5nc0Zyb21Sb3csIHR5cGUgU3RydWN0dXJlTGluZSB9IGZy
b20gJ0AvbGliL3BheXJvbGxDYWxjJwo=
'@ @'
aW1wb3J0IHsgY29tcHV0ZVNhbGFyeSwgZGFpbHlSYXRlLCBzZXR0aW5nc0Zyb21Sb3csIGNvdW50V29ya2luZ0RheXMsIHR5cGUg
U3RydWN0dXJlTGluZSB9IGZyb20gJ0AvbGliL3BheXJvbGxDYWxjJwo=
'@

Add-Patch 'src\app\api\payroll\runs\generate\route.ts' @'
ICAgIGlmIChvdmVydGltZVRvdGFsID4gMCkgewo=
'@ @'
ICAgIC8vIFVucGFpZCBsZWF2ZTogYXBwcm92ZWQgbGVhdmUgb2YgYW4gdW5wYWlkIGxlYXZlIHR5cGUgdGhhdCBmYWxscyBpbnNp
ZGUgdGhpcyBtb250aAogICAgY29uc3QgeyBkYXRhOiBsZWF2ZUFwcHMgfSA9IGF3YWl0IHN1cGFiYXNlCiAgICAgIC5mcm9tKCds
ZWF2ZV9hcHBsaWNhdGlvbnMnKQogICAgICAuc2VsZWN0KCdmcm9tX2RhdGUsIHRvX2RhdGUsIGxlYXZlX3R5cGVzIWlubmVyKGlz
X3BhaWQpJykKICAgICAgLmVxKCdlbXBsb3llZV9pZCcsIGVtcC5pZCkKICAgICAgLmVxKCdzdGF0dXMnLCAnYXBwcm92ZWQnKQog
ICAgICAubHRlKCdmcm9tX2RhdGUnLCBlbmREYXRlKQogICAgICAuZ3RlKCd0b19kYXRlJywgc3RhcnREYXRlKQogICAgbGV0IHVu
cGFpZExlYXZlRGF5cyA9IDAKICAgIGZvciAoY29uc3QgbGEgb2YgKGxlYXZlQXBwcyB8fCBbXSkgYXMgYW55W10pIHsKICAgICAg
aWYgKGxhLmxlYXZlX3R5cGVzPy5pc19wYWlkID09PSBmYWxzZSkgewogICAgICAgIGNvbnN0IGxmID0gbGEuZnJvbV9kYXRlID4g
c3RhcnREYXRlID8gbGEuZnJvbV9kYXRlIDogc3RhcnREYXRlCiAgICAgICAgY29uc3QgbHQgPSBsYS50b19kYXRlIDwgZW5kRGF0
ZSA/IGxhLnRvX2RhdGUgOiBlbmREYXRlCiAgICAgICAgdW5wYWlkTGVhdmVEYXlzICs9IGNvdW50V29ya2luZ0RheXMobGYsIGx0
LCBwYXlyb2xsU2V0dGluZ3MpCiAgICAgIH0KICAgIH0KICAgIGNvbnN0IHVucGFpZExlYXZlRGVkdWN0aW9uID0gTWF0aC5yb3Vu
ZChvbmVEYXkgKiB1bnBhaWRMZWF2ZURheXMgKiAxMDApIC8gMTAwCiAgICBpZiAodW5wYWlkTGVhdmVEZWR1Y3Rpb24gPiAwKSB7
CiAgICAgIGxpbmVDb21wb25lbnRzLnB1c2goewogICAgICAgIHNhbGFyeV9jb21wb25lbnRfaWQ6IG51bGwsCiAgICAgICAgY29t
cG9uZW50X25hbWU6ICdVbnBhaWQgTGVhdmUgRGVkdWN0aW9uJywKICAgICAgICBhbW91bnQ6IHVucGFpZExlYXZlRGVkdWN0aW9u
LAogICAgICAgIHR5cGU6ICdkZWR1Y3Rpb24nLAogICAgICAgIGdsX2FjY291bnRfaWQ6IG51bGwsCiAgICAgICAgc291cmNlX3R5
cGU6ICdhYnNlbmNlJywKICAgICAgICBzb3VyY2VfaWQ6IG51bGwsCiAgICAgIH0pCiAgICAgIGRlZHVjdGlvbnMgKz0gdW5wYWlk
TGVhdmVEZWR1Y3Rpb24KICAgIH0KCiAgICBpZiAob3ZlcnRpbWVUb3RhbCA+IDApIHsK
'@

Add-Patch 'src\app\dashboard\payroll\leave-types\page.tsx' @'
ICBjb25zdCBbZWRpdElzUGFpZCwgc2V0RWRpdElzUGFpZF0gPSB1c2VTdGF0ZSh0cnVlKQo=
'@ @'
ICBjb25zdCBbZWRpdElzUGFpZCwgc2V0RWRpdElzUGFpZF0gPSB1c2VTdGF0ZSh0cnVlKQogIGNvbnN0IFtlZGl0RGF5cywgc2V0
RWRpdERheXNdID0gdXNlU3RhdGUoIiIpCg==
'@

Add-Patch 'src\app\dashboard\payroll\leave-types\page.tsx' @'
ICAgIHNldEVkaXROYW1lKCIiKQogICAgc2V0RWRpdElzUGFpZCh0cnVlKQo=
'@ @'
ICAgIHNldEVkaXROYW1lKCIiKQogICAgc2V0RWRpdERheXMoIiIpCiAgICBzZXRFZGl0SXNQYWlkKHRydWUpCg==
'@

Add-Patch 'src\app\dashboard\payroll\leave-types\page.tsx' @'
ICAgIHNldEVkaXRJc1BhaWQobHQuaXNfcGFpZCkK
'@ @'
ICAgIHNldEVkaXRJc1BhaWQobHQuaXNfcGFpZCkKICAgIHNldEVkaXREYXlzKGx0LmRheXNfcGVyX3llYXIgJiYgTnVtYmVyKGx0
LmRheXNfcGVyX3llYXIpID4gMCA/IFN0cmluZyhsdC5kYXlzX3Blcl95ZWFyKSA6ICIiKQo=
'@

Add-Patch 'src\app\dashboard\payroll\leave-types\page.tsx' @'
ICAgIGlmICghZWRpdE5hbWUudHJpbSgpKSB7IHNldEVycm9yKCJOYW1lIGlzIHJlcXVpcmVkIik7IHJldHVybiB9Cg==
'@ @'
ICAgIGlmICghZWRpdE5hbWUudHJpbSgpKSB7IHNldEVycm9yKCJOYW1lIGlzIHJlcXVpcmVkIik7IHJldHVybiB9CiAgICBpZiAo
ZWRpdERheXMudHJpbSgpICYmIChpc05hTihOdW1iZXIoZWRpdERheXMpKSB8fCBOdW1iZXIoZWRpdERheXMpIDwgMCB8fCBOdW1i
ZXIoZWRpdERheXMpID4gMzY2KSkgeyBzZXRFcnJvcigiRGF5cyBwZXIgeWVhciBtdXN0IGJlIGEgbnVtYmVyIGJldHdlZW4gMCBh
bmQgMzY2Iik7IHJldHVybiB9Cg==
'@

Add-Patch 'src\app\dashboard\payroll\leave-types\page.tsx' @'
LnVwZGF0ZSh7IG5hbWU6IGVkaXROYW1lLnRyaW0oKSwgaXNfcGFpZDogZWRpdElzUGFpZCwgaXNfYWN0aXZlOiBlZGl0SXNBY3Rp
dmUgfSk=
'@ @'
LnVwZGF0ZSh7IG5hbWU6IGVkaXROYW1lLnRyaW0oKSwgaXNfcGFpZDogZWRpdElzUGFpZCwgaXNfYWN0aXZlOiBlZGl0SXNBY3Rp
dmUsIGRheXNfcGVyX3llYXI6IE51bWJlcihlZGl0RGF5cykgfHwgMCB9KQ==
'@

Add-Patch 'src\app\dashboard\payroll\leave-types\page.tsx' @'
Lmluc2VydCh7IGNvbXBhbnlfaWQ6IGNvbXBhbnlJZCwgbmFtZTogZWRpdE5hbWUudHJpbSgpLCBpc19wYWlkOiBlZGl0SXNQYWlk
LCBpc19hY3RpdmU6IGVkaXRJc0FjdGl2ZSB9KQ==
'@ @'
Lmluc2VydCh7IGNvbXBhbnlfaWQ6IGNvbXBhbnlJZCwgbmFtZTogZWRpdE5hbWUudHJpbSgpLCBpc19wYWlkOiBlZGl0SXNQYWlk
LCBpc19hY3RpdmU6IGVkaXRJc0FjdGl2ZSwgZGF5c19wZXJfeWVhcjogTnVtYmVyKGVkaXREYXlzKSB8fCAwIH0p
'@

Add-Patch 'src\app\dashboard\payroll\leave-types\page.tsx' @'
ICAgICAgICAgICAgey8qIFNldHRpbmdzIFNlY3Rpb24gKi99Cg==
'@ @'
ICAgICAgICAgICAgPGRpdiBzdHlsZT17eyBtYXJnaW5Cb3R0b206IDIwIH19PgogICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05h
bWU9ImtwaS1sYWJlbCIgc3R5bGU9e3sgbWFyZ2luQm90dG9tOiA0LCBkaXNwbGF5OiAiYmxvY2siIH19PkRheXMgYWxsb3dlZCBw
ZXIgeWVhcjwvbGFiZWw+CiAgICAgICAgICAgICAgPGlucHV0IGNsYXNzTmFtZT0iaW5wdXQiIHR5cGU9Im51bWJlciIgbWluPSIw
IiB2YWx1ZT17ZWRpdERheXN9IG9uQ2hhbmdlPXtlID0+IHNldEVkaXREYXlzKGUudGFyZ2V0LnZhbHVlKX0gcGxhY2Vob2xkZXI9
ImUuZy4gMTQgKGxlYXZlIGVtcHR5IGZvciBubyBsaW1pdCkiIC8+CiAgICAgICAgICAgICAgPGRpdiBzdHlsZT17eyBmb250U2l6
ZTogMTIsIGNvbG9yOiAidmFyKC0tdGV4dC1tdXRlZCkiLCBtYXJnaW5Ub3A6IDQgfX0+CiAgICAgICAgICAgICAgICBUaGUgeWVh
cmx5IGVudGl0bGVtZW50IGZvciBlYWNoIGVtcGxveWVlLiBBcHBsaWNhdGlvbnMgYWJvdmUgdGhlIGJhbGFuY2UgYXJlIHJlZnVz
ZWQuIExlYXZlIGVtcHR5IG9yIDAgZm9yIG5vIGxpbWl0IChmb3IgZXhhbXBsZSBVbnBhaWQgbGVhdmUpLgogICAgICAgICAgICAg
IDwvZGl2PgogICAgICAgICAgICA8L2Rpdj4KCiAgICAgICAgICAgIHsvKiBTZXR0aW5ncyBTZWN0aW9uICovfQo=
'@

Add-Patch 'src\app\dashboard\payroll\leave-types\page.tsx' @'
e2x0LmlzX3BhaWQgPyAiUGFpZCIgOiAiVW5wYWlkIn0=
'@ @'
e2x0LmlzX3BhaWQgPyAiUGFpZCIgOiAiVW5wYWlkIn17TnVtYmVyKGx0LmRheXNfcGVyX3llYXIpID4gMCA/IGAgLSAke2x0LmRh
eXNfcGVyX3llYXJ9IGRheXMveWVhcmAgOiAiIn0=
'@

Add-Patch 'src\app\dashboard\payroll\leave-applications\page.tsx' @'
aW1wb3J0IHsgdXNlUGxhbiB9IGZyb20gIkAvY29udGV4dHMvUGxhbkNvbnRleHQiCg==
'@ @'
aW1wb3J0IHsgdXNlUGxhbiB9IGZyb20gIkAvY29udGV4dHMvUGxhbkNvbnRleHQiCmltcG9ydCB7IGNvdW50V29ya2luZ0RheXMs
IERFRkFVTFRfU0VUVElOR1MsIHR5cGUgUGF5cm9sbFNldHRpbmdzIH0gZnJvbSAiQC9saWIvcGF5cm9sbENhbGMiCg==
'@

Add-Patch 'src\app\dashboard\payroll\leave-applications\page.tsx' @'
ICBjb25zdCBbbGVhdmVCYWxhbmNlcywgc2V0TGVhdmVCYWxhbmNlc10gPSB1c2VTdGF0ZTxSZWNvcmQ8c3RyaW5nLCB7IHVzZWQ6
IG51bWJlcjsgdG90YWw6IG51bWJlciB9Pj4oe30pCg==
'@ @'
ICAvLyBXZWVrbHktb2ZmIHJ1bGVzIChmcm9tIFBheXJvbGwgU2V0dGluZ3MpIGFuZCB0aGUgcmVhbCBsZWF2ZSBiYWxhbmNlcyBv
ZiB0aGUgZW1wbG95ZWUgaW4gdGhlIGZvcm0KICBjb25zdCBbbGVhdmVTZXR0aW5ncywgc2V0TGVhdmVTZXR0aW5nc10gPSB1c2VT
dGF0ZTxQYXlyb2xsU2V0dGluZ3M+KERFRkFVTFRfU0VUVElOR1MpCiAgY29uc3QgW2JhbGFuY2VSb3dzLCBzZXRCYWxhbmNlUm93
c10gPSB1c2VTdGF0ZTxhbnlbXT4oW10pCg==
'@

Add-Patch 'src\app\dashboard\payroll\leave-applications\page.tsx' @'
ICAgICAgICAgIC5mcm9tKCJsZWF2ZV90eXBlcyIpCiAgICAgICAgICAuc2VsZWN0KCJpZCwgbmFtZSIpCg==
'@ @'
ICAgICAgICAgIC5mcm9tKCJsZWF2ZV90eXBlcyIpCiAgICAgICAgICAuc2VsZWN0KCJpZCwgbmFtZSwgaXNfcGFpZCwgZGF5c19w
ZXJfeWVhciIpCg==
'@

Add-Patch 'src\app\dashboard\payroll\leave-applications\page.tsx' @'
ICAvLyBGZXRjaCBsZWF2ZSBiYWxhbmNlcyAoc2ltcGxpZmllZDogZm9yIGVhY2ggZW1wbG95ZWUgYW5kIGxlYXZlIHR5cGUsIGNv
dW50IGFwcHJvdmVkIGRheXMpCiAgdXNlRWZmZWN0KCgpID0+IHsKICAgIGlmICghY29tcGFueUlkIHx8IGVtcGxveWVlcy5sZW5n
dGggPT09IDAgfHwgbGVhdmVUeXBlcy5sZW5ndGggPT09IDApIHJldHVybgogICAgc3VwYWJhc2UKICAgICAgLmZyb20oImxlYXZl
X2FwcGxpY2F0aW9ucyIpCiAgICAgIC5zZWxlY3QoImVtcGxveWVlX2lkLCBsZWF2ZV90eXBlX2lkLCBmcm9tX2RhdGUsIHRvX2Rh
dGUiKQogICAgICAuZXEoInN0YXR1cyIsICJhcHByb3ZlZCIpCiAgICAgIC50aGVuKCh7IGRhdGEgfSkgPT4gewogICAgICAgIGNv
bnN0IGJhbGFuY2VzOiBSZWNvcmQ8c3RyaW5nLCB7IHVzZWQ6IG51bWJlcjsgdG90YWw6IG51bWJlciB9PiA9IHt9CiAgICAgICAg
Y29uc3QgdG90YWxEYXlzTWFwOiBSZWNvcmQ8bnVtYmVyLCBudW1iZXI+ID0ge30KICAgICAgICBsZWF2ZVR5cGVzLmZvckVhY2go
bHQgPT4geyB0b3RhbERheXNNYXBbbHQuaWRdID0gMjAgfSkgLy8gcGxhY2Vob2xkZXIKICAgICAgICBpZiAoZGF0YSkgewogICAg
ICAgICAgZGF0YS5mb3JFYWNoKGFwcCA9PiB7CiAgICAgICAgICAgIGNvbnN0IGtleSA9IGAke2FwcC5lbXBsb3llZV9pZH1fJHth
cHAubGVhdmVfdHlwZV9pZH1gCiAgICAgICAgICAgIGlmICghYmFsYW5jZXNba2V5XSkgewogICAgICAgICAgICAgIGJhbGFuY2Vz
W2tleV0gPSB7IHVzZWQ6IDAsIHRvdGFsOiB0b3RhbERheXNNYXBbYXBwLmxlYXZlX3R5cGVfaWRdIHx8IDIwIH0KICAgICAgICAg
ICAgfQogICAgICAgICAgICBjb25zdCBmcm9tID0gbmV3IERhdGUoYXBwLmZyb21fZGF0ZSkKICAgICAgICAgICAgY29uc3QgdG8g
PSBuZXcgRGF0ZShhcHAudG9fZGF0ZSkKICAgICAgICAgICAgY29uc3QgZGlmZiA9IE1hdGgucm91bmQoKHRvLmdldFRpbWUoKSAt
IGZyb20uZ2V0VGltZSgpKSAvICgxMDAwICogNjAgKiA2MCAqIDI0KSkgKyAxCiAgICAgICAgICAgIGJhbGFuY2VzW2tleV0udXNl
ZCArPSBkaWZmCiAgICAgICAgICB9KQogICAgICAgIH0KICAgICAgICBzZXRMZWF2ZUJhbGFuY2VzKGJhbGFuY2VzKQogICAgICB9
KQogIH0sIFtjb21wYW55SWQsIGVtcGxveWVlcywgbGVhdmVUeXBlc10pCg==
'@ @'
ICAvLyBXZWVrbHkgb2ZmIHJ1bGVzIGNvbWUgZnJvbSBQYXlyb2xsIFNldHRpbmdzICgyMi1kYXkgYmFzaXMgPSBTYXR1cmRheSBh
bmQgU3VuZGF5IG9mZikKICB1c2VFZmZlY3QoKCkgPT4gewogICAgZmV0Y2goIi9hcGkvcGF5cm9sbC9zZXR0aW5ncyIpCiAgICAg
IC50aGVuKHIgPT4gci5qc29uKCkpCiAgICAgIC50aGVuKGogPT4geyBpZiAoaiAmJiBqLnNldHRpbmdzKSBzZXRMZWF2ZVNldHRp
bmdzKGouc2V0dGluZ3MpIH0pCiAgICAgIC5jYXRjaCgoKSA9PiB7fSkKICB9LCBbXSkKCiAgLy8gUmVhbCBsZWF2ZSBiYWxhbmNl
cyBvZiB0aGUgZW1wbG95ZWUgY2hvc2VuIGluIHRoZSBmb3JtIChjYWxjdWxhdGVkIGJ5IHRoZSBkYXRhYmFzZSkKICB1c2VFZmZl
Y3QoKCkgPT4gewogICAgaWYgKCFmb3JtRW1wbG95ZWVJZCkgeyBzZXRCYWxhbmNlUm93cyhbXSk7IHJldHVybiB9CiAgICBjb25z
dCB5ZWFyID0gZm9ybUZyb21EYXRlID8gTnVtYmVyKGZvcm1Gcm9tRGF0ZS5zbGljZSgwLCA0KSkgOiBuZXcgRGF0ZSgpLmdldEZ1
bGxZZWFyKCkKICAgIHN1cGFiYXNlCiAgICAgIC5ycGMoImdldF9sZWF2ZV9iYWxhbmNlcyIsIHsgcF9lbXBsb3llZV9pZDogZm9y
bUVtcGxveWVlSWQsIHBfeWVhcjogeWVhciB9KQogICAgICAudGhlbigoeyBkYXRhIH0pID0+IHNldEJhbGFuY2VSb3dzKEFycmF5
LmlzQXJyYXkoZGF0YSkgPyBkYXRhIDogW10pKQogIH0sIFtmb3JtRW1wbG95ZWVJZCwgZm9ybUZyb21EYXRlXSkK
'@

Add-Patch 'src\app\dashboard\payroll\leave-applications\page.tsx' @'
ICBjb25zdCBnZXREdXJhdGlvbkRheXMgPSAoZnJvbTogc3RyaW5nLCB0bzogc3RyaW5nKSA9PiB7CiAgICBjb25zdCBmID0gbmV3
IERhdGUoZnJvbSkKICAgIGNvbnN0IHQgPSBuZXcgRGF0ZSh0bykKICAgIHJldHVybiBNYXRoLnJvdW5kKCh0LmdldFRpbWUoKSAt
IGYuZ2V0VGltZSgpKSAvICgxMDAwICogNjAgKiA2MCAqIDI0KSkgKyAxCiAgfQo=
'@ @'
ICAvLyBXb3JraW5nIGRheXMgb25seSAod2Vla2x5IG9mZnMgYXJlIG5vdCBjb3VudGVkKQogIGNvbnN0IGdldER1cmF0aW9uRGF5
cyA9IChmcm9tOiBzdHJpbmcsIHRvOiBzdHJpbmcpID0+IGNvdW50V29ya2luZ0RheXMoZnJvbSwgdG8sIGxlYXZlU2V0dGluZ3Mp
Cg==
'@

Add-Patch 'src\app\dashboard\payroll\leave-applications\page.tsx' @'
ICBjb25zdCBidWxrQWN0aW9uID0gYXN5bmMgKGFjdGlvbjogImFwcHJvdmUiIHwgInJlamVjdCIpID0+IHsKICAgIGlmIChzZWxl
Y3RlZElkcy5zaXplID09PSAwKSByZXR1cm4KICAgIHNldEJ1bGtQcm9jZXNzaW5nKHRydWUpCiAgICBjb25zdCB7IGRhdGE6IHsg
dXNlciB9IH0gPSBhd2FpdCBzdXBhYmFzZS5hdXRoLmdldFVzZXIoKQogICAgY29uc3QgdXBkYXRlcyA9IHsKICAgICAgc3RhdHVz
OiBhY3Rpb24gPT09ICJhcHByb3ZlIiA/ICJhcHByb3ZlZCIgOiAicmVqZWN0ZWQiLAogICAgICBhcHByb3ZlZF9ieTogdXNlcj8u
aWQsCiAgICAgIGFwcHJvdmVkX2F0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksCiAgICB9CiAgICBhd2FpdCBzdXBhYmFzZS5m
cm9tKCJsZWF2ZV9hcHBsaWNhdGlvbnMiKS51cGRhdGUodXBkYXRlcykuaW4oImlkIiwgQXJyYXkuZnJvbShzZWxlY3RlZElkcykp
CiAgICBzZXRCdWxrUHJvY2Vzc2luZyhmYWxzZSkKICAgIGZldGNoQXBwbGljYXRpb25zKCkK
'@ @'
ICAvLyBBcHByb3ZlIC8gcmVqZWN0IHRocm91Z2ggdGhlIGRhdGFiYXNlOiBpdCBjaGVja3MgYmFsYW5jZSBhbmQgb3ZlcmxhcHMg
YW5kIG1hcmtzIGF0dGVuZGFuY2UKICBjb25zdCBkZWNpZGVPbmUgPSBhc3luYyAoaWQ6IG51bWJlciwgYWN0aW9uOiAiYXBwcm92
ZSIgfCAicmVqZWN0IikgPT4gewogICAgY29uc3QgeyBlcnJvcjogcnBjRXJyIH0gPSBhd2FpdCBzdXBhYmFzZS5ycGMoImRlY2lk
ZV9sZWF2ZV9hcHBsaWNhdGlvbiIsIHsgcF9hcHBsaWNhdGlvbl9pZDogaWQsIHBfYWN0aW9uOiBhY3Rpb24gfSkKICAgIHJldHVy
biBycGNFcnIgPyBycGNFcnIubWVzc2FnZSA6IG51bGwKICB9CgogIGNvbnN0IGJ1bGtBY3Rpb24gPSBhc3luYyAoYWN0aW9uOiAi
YXBwcm92ZSIgfCAicmVqZWN0IikgPT4gewogICAgaWYgKHNlbGVjdGVkSWRzLnNpemUgPT09IDApIHJldHVybgogICAgc2V0QnVs
a1Byb2Nlc3NpbmcodHJ1ZSkKICAgIGxldCBkb25lID0gMAogICAgY29uc3QgcHJvYmxlbXM6IHN0cmluZ1tdID0gW10KICAgIGZv
ciAoY29uc3QgaWQgb2YgQXJyYXkuZnJvbShzZWxlY3RlZElkcykpIHsKICAgICAgY29uc3QgbXNnID0gYXdhaXQgZGVjaWRlT25l
KGlkLCBhY3Rpb24pCiAgICAgIGlmIChtc2cpIHByb2JsZW1zLnB1c2goYCMke2lkfTogJHttc2d9YCkKICAgICAgZWxzZSBkb25l
KysKICAgIH0KICAgIHNldEJ1bGtQcm9jZXNzaW5nKGZhbHNlKQogICAgZmV0Y2hBcHBsaWNhdGlvbnMoKQogICAgaWYgKHByb2Js
ZW1zLmxlbmd0aCA+IDApIHsKICAgICAgc2V0RXJyb3IoYCR7ZG9uZX0gZG9uZSwgJHtwcm9ibGVtcy5sZW5ndGh9IG5vdCBkb25l
IC0gJHtwcm9ibGVtcy5zbGljZSgwLCAzKS5qb2luKCIgfCAiKX1gKQogICAgICByZXR1cm4KICAgIH0K
'@

Add-Patch 'src\app\dashboard\payroll\leave-applications\page.tsx' @'
ICBjb25zdCBzaW5nbGVBY3Rpb24gPSBhc3luYyAoaWQ6IG51bWJlciwgYWN0aW9uOiAiYXBwcm92ZSIgfCAicmVqZWN0IikgPT4g
ewogICAgY29uc3QgeyBkYXRhOiB7IHVzZXIgfSB9ID0gYXdhaXQgc3VwYWJhc2UuYXV0aC5nZXRVc2VyKCkKICAgIGF3YWl0IHN1
cGFiYXNlLmZyb20oImxlYXZlX2FwcGxpY2F0aW9ucyIpLnVwZGF0ZSh7CiAgICAgIHN0YXR1czogYWN0aW9uID09PSAiYXBwcm92
ZSIgPyAiYXBwcm92ZWQiIDogInJlamVjdGVkIiwKICAgICAgYXBwcm92ZWRfYnk6IHVzZXI/LmlkLAogICAgICBhcHByb3ZlZF9h
dDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLAogICAgfSkuZXEoImlkIiwgaWQpCiAgICBmZXRjaEFwcGxpY2F0aW9ucygpCg==
'@ @'
ICBjb25zdCBzaW5nbGVBY3Rpb24gPSBhc3luYyAoaWQ6IG51bWJlciwgYWN0aW9uOiAiYXBwcm92ZSIgfCAicmVqZWN0IikgPT4g
ewogICAgY29uc3QgbXNnID0gYXdhaXQgZGVjaWRlT25lKGlkLCBhY3Rpb24pCiAgICBpZiAobXNnKSB7IHNldEVycm9yKG1zZyk7
IGZldGNoQXBwbGljYXRpb25zKCk7IHJldHVybiB9CiAgICBmZXRjaEFwcGxpY2F0aW9ucygpCg==
'@

Add-Patch 'src\app\dashboard\payroll\leave-applications\page.tsx' @'
ICAgIGNvbnN0IHsgZXJyb3I6IGluc2VydEVyciB9ID0gYXdhaXQgc3VwYWJhc2UKICAgICAgLmZyb20oImxlYXZlX2FwcGxpY2F0
aW9ucyIpCiAgICAgIC5pbnNlcnQoewogICAgICAgIGVtcGxveWVlX2lkOiBmb3JtRW1wbG95ZWVJZCwKICAgICAgICBsZWF2ZV90
eXBlX2lkOiBmb3JtTGVhdmVUeXBlSWQsCiAgICAgICAgZnJvbV9kYXRlOiBmb3JtRnJvbURhdGUsCiAgICAgICAgdG9fZGF0ZTog
Zm9ybVRvRGF0ZSwKICAgICAgICBzdGF0dXM6ICJwZW5kaW5nIiwKICAgICAgICByZWFzb246IGZvcm1SZWFzb24udHJpbSgpIHx8
IG51bGwsCiAgICAgIH0pCg==
'@ @'
ICAgIGNvbnN0IHsgZXJyb3I6IGluc2VydEVyciB9ID0gYXdhaXQgc3VwYWJhc2UucnBjKCJzdWJtaXRfbGVhdmVfYXBwbGljYXRp
b24iLCB7CiAgICAgIHBfZW1wbG95ZWVfaWQ6IGZvcm1FbXBsb3llZUlkLAogICAgICBwX2xlYXZlX3R5cGVfaWQ6IGZvcm1MZWF2
ZVR5cGVJZCwKICAgICAgcF9mcm9tX2RhdGU6IGZvcm1Gcm9tRGF0ZSwKICAgICAgcF90b19kYXRlOiBmb3JtVG9EYXRlLAogICAg
ICBwX3JlYXNvbjogZm9ybVJlYXNvbi50cmltKCkgfHwgbnVsbCwKICAgIH0pCg==
'@

Add-Patch 'src\app\dashboard\payroll\leave-applications\page.tsx' @'
ICAgIGNvbnN0IGtleSA9IGAke2Zvcm1FbXBsb3llZUlkfV8ke2Zvcm1MZWF2ZVR5cGVJZH1gCiAgICByZXR1cm4gbGVhdmVCYWxh
bmNlc1trZXldIHx8IHsgdXNlZDogMCwgdG90YWw6IDIwIH0KICB9LCBbZm9ybUVtcGxveWVlSWQsIGZvcm1MZWF2ZVR5cGVJZCwg
bGVhdmVCYWxhbmNlc10pCg==
'@ @'
ICAgIHJldHVybiBiYWxhbmNlUm93cy5maW5kKChyOiBhbnkpID0+IHIubGVhdmVfdHlwZV9pZCA9PT0gZm9ybUxlYXZlVHlwZUlk
KSB8fCBudWxsCiAgfSwgW2Zvcm1FbXBsb3llZUlkLCBmb3JtTGVhdmVUeXBlSWQsIGJhbGFuY2VSb3dzXSkK
'@

Add-Patch 'src\app\dashboard\payroll\leave-applications\page.tsx' @'
ICAgICAgICAgICAgICAgICAgICA8ZGl2PjxzdHJvbmc+QmFsYW5jZTo8L3N0cm9uZz4ge2N1cnJlbnRCYWxhbmNlLnRvdGFsIC0g
Y3VycmVudEJhbGFuY2UudXNlZH0gZGF5cyByZW1haW5pbmcgKG9mIHtjdXJyZW50QmFsYW5jZS50b3RhbH0pPC9kaXY+CiAgICAg
ICAgICAgICAgICAgICAgPGRpdiBzdHlsZT17eyBjb2xvcjogInZhcigtLXRleHQtbXV0ZWQpIiwgbWFyZ2luVG9wOiAyIH19PlVz
ZWQ6IHtjdXJyZW50QmFsYW5jZS51c2VkfSBkYXlzPC9kaXY+Cg==
'@ @'
ICAgICAgICAgICAgICAgICAgICB7TnVtYmVyKGN1cnJlbnRCYWxhbmNlLmRheXNfcGVyX3llYXIpID4gMCA/ICgKICAgICAgICAg
ICAgICAgICAgICAgIDw+CiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXY+PHN0cm9uZz5CYWxhbmNlOjwvc3Ryb25nPiB7Y3Vy
cmVudEJhbGFuY2UucmVtYWluaW5nfSBkYXlzIHJlbWFpbmluZyAob2Yge2N1cnJlbnRCYWxhbmNlLmRheXNfcGVyX3llYXJ9IHBl
ciB5ZWFyKTwvZGl2PgogICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IGNvbG9yOiAidmFyKC0tdGV4dC1tdXRl
ZCkiLCBtYXJnaW5Ub3A6IDIgfX0+VXNlZDoge2N1cnJlbnRCYWxhbmNlLnVzZWR9IGRheXMsIHdhaXRpbmcgZm9yIGFwcHJvdmFs
OiB7Y3VycmVudEJhbGFuY2UucGVuZGluZ30gZGF5czwvZGl2PgogICAgICAgICAgICAgICAgICAgICAgPC8+CiAgICAgICAgICAg
ICAgICAgICAgKSA6ICgKICAgICAgICAgICAgICAgICAgICAgIDxkaXY+PHN0cm9uZz5ObyB5ZWFybHkgbGltaXQ8L3N0cm9uZz4g
Zm9yIHRoaXMgbGVhdmUgdHlwZXtjdXJyZW50QmFsYW5jZS5pc19wYWlkID8gIiIgOiAiICh1bnBhaWQgLSB0aGUgZGF5cyBhcmUg
ZGVkdWN0ZWQgZnJvbSBzYWxhcnkpIn0uPC9kaXY+CiAgICAgICAgICAgICAgICAgICAgKX0K
'@

Add-Patch 'src\app\dashboard\payroll\leave-applications\page.tsx' @'
ICAgICAgICAgICAgICAgIER1cmF0aW9uOiB7Z2V0RHVyYXRpb25EYXlzKGZvcm1Gcm9tRGF0ZSwgZm9ybVRvRGF0ZSl9IGRheXMK
'@ @'
ICAgICAgICAgICAgICAgIFdvcmtpbmcgZGF5czoge2dldER1cmF0aW9uRGF5cyhmb3JtRnJvbURhdGUsIGZvcm1Ub0RhdGUpfSAo
d2Vla2x5IG9mZnMgYXJlIG5vdCBjb3VudGVkKQo=
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
Write-Host ("Stage 2 applied: " + $script:count + " changes in " + $script:files.Count + " files.") -ForegroundColor Green
Write-Host 'REMINDER: run payroll_leave.sql in Supabase BEFORE deploying. Then: npm run build' -ForegroundColor Green