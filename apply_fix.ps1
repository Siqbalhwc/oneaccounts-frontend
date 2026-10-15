# apply_fix.ps1 - Payroll Stage 6: phone-friendly layout (tables become cards), readable messages on the light theme
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


# Replace every occurrence of a literal text; the number of occurrences must be exactly what is expected
function Add-Replace($rel, $oldB64, $newB64, $expected) {
  $old = B64 $oldB64
  $new = B64 $newB64
  if (-not (Load-File $rel)) { $script:failed += "MISSING FILE: $rel"; return }
  $t = $script:files[$rel]
  $n = 0; $i = 0
  while (($i = $t.IndexOf($old, $i, [StringComparison]::Ordinal)) -ge 0) { $n++; $i += $old.Length }
  if ($n -ne [int]$expected) { $script:failed += "NOT MATCHED in ${rel}: expected $expected x '$old' but found $n"; return }
  $script:files[$rel] = $t.Replace($old, $new)
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


Add-File 'src\app\dashboard\payroll\layout.tsx' @'
InVzZSBjbGllbnQiCgppbXBvcnQgeyBSZWFjdE5vZGUsIHVzZUVmZmVjdCwgdXNlU3RhdGUgfSBmcm9tICJyZWFjdCIKaW1wb3J0
IHsgdXNlUGxhbiB9IGZyb20gIkAvY29udGV4dHMvUGxhbkNvbnRleHQiCmltcG9ydCB7IHVzZVJvbGUgfSBmcm9tICJAL2NvbnRl
eHRzL1JvbGVDb250ZXh0IgoKLy8gU2hhcmVkIHNoZWxsIGZvciBldmVyeSBQYXlyb2xsIHBhZ2UuCi8vICAtIGZlYXR1cmUgZ2F0
ZSAodW5jaGFuZ2VkKQovLyAgLSBwaG9uZSBsYXlvdXQ6IHNtYWxsZXIgcGFkZGluZywgd3JhcHBpbmcgaGVhZGVyIHJvd3MsIHN0
YWNrZWQgZ3JpZHMsIGJpZ2dlciB0YXAgdGFyZ2V0cwovLyAgLSBvbiBwaG9uZXMsIG9yZGluYXJ5IGRhdGEgdGFibGVzIGFyZSBz
aG93biBhcyBjYXJkcyAoZWFjaCByb3cgPSBvbmUgY2FyZCwgZXZlcnkgdmFsdWUKLy8gICAga2VlcHMgaXRzIGNvbHVtbiBuYW1l
KS4gV2lkZSBncmlkcyBzdWNoIGFzIHRoZSBhdHRlbmRhbmNlIGNhbGVuZGFyIGFyZSBsZWZ0IGFsb25lLgoKY29uc3QgUkVTUE9O
U0lWRV9DU1MgPSBgCkBtZWRpYSAobWF4LXdpZHRoOiA3MDBweCkgewogIC5wYXlyb2xsLXJvb3QgPiBkaXYgeyBwYWRkaW5nOiAx
MnB4ICFpbXBvcnRhbnQ7IH0KICAucGF5cm9sbC1yb290IFtzdHlsZSo9ImRpc3BsYXk6IGZsZXgiXSB7IGZsZXgtd3JhcDogd3Jh
cDsgfQogIC5wYXlyb2xsLXJvb3QgW3N0eWxlKj0iZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zIl0geyBncmlkLXRlbXBsYXRlLWNvbHVt
bnM6IDFmciAhaW1wb3J0YW50OyB9CiAgLnBheXJvbGwtcm9vdCBbc3R5bGUqPSJyZXBlYXQoIl06bm90KFtzdHlsZSo9ImF1dG8t
Zml0Il0pOm5vdChbc3R5bGUqPSJhdXRvLWZpbGwiXSkgeyBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IHJlcGVhdCgyLCBtaW5tYXgo
MCwgMWZyKSkgIWltcG9ydGFudDsgfQogIC5wYXlyb2xsLXJvb3QgYnV0dG9uLCAucGF5cm9sbC1yb290IHNlbGVjdCwgLnBheXJv
bGwtcm9vdCBpbnB1dDpub3QoW3R5cGU9ImNoZWNrYm94Il0pOm5vdChbdHlwZT0icmFkaW8iXSkgeyBtaW4taGVpZ2h0OiA0MHB4
OyB9CiAgLnBheXJvbGwtcm9vdCAubW9kYWwtY29udGVudCB7IG1heC13aWR0aDogY2FsYygxMDB2dyAtIDI0cHgpICFpbXBvcnRh
bnQ7IH0KCiAgLnBheXJvbGwtcm9vdCB0YWJsZS5ydC1jYXJkcyB7IG1pbi13aWR0aDogMCAhaW1wb3J0YW50OyB3aWR0aDogMTAw
JSAhaW1wb3J0YW50OyB9CiAgLnBheXJvbGwtcm9vdCB0YWJsZS5ydC1jYXJkcyB0aGVhZCB7IGRpc3BsYXk6IG5vbmU7IH0KICAu
cGF5cm9sbC1yb290IHRhYmxlLnJ0LWNhcmRzLAogIC5wYXlyb2xsLXJvb3QgdGFibGUucnQtY2FyZHMgdGJvZHksCiAgLnBheXJv
bGwtcm9vdCB0YWJsZS5ydC1jYXJkcyB0Zm9vdCwKICAucGF5cm9sbC1yb290IHRhYmxlLnJ0LWNhcmRzIHRyLAogIC5wYXlyb2xs
LXJvb3QgdGFibGUucnQtY2FyZHMgdGQgeyBkaXNwbGF5OiBibG9jazsgd2lkdGg6IDEwMCUgIWltcG9ydGFudDsgYm94LXNpemlu
ZzogYm9yZGVyLWJveDsgfQogIC5wYXlyb2xsLXJvb3QgdGFibGUucnQtY2FyZHMgdHIgewogICAgYm9yZGVyOiAxcHggc29saWQg
dmFyKC0tYm9yZGVyKTsgYm9yZGVyLXJhZGl1czogMTBweDsgbWFyZ2luLWJvdHRvbTogMTBweDsKICAgIHBhZGRpbmc6IDZweCAx
MnB4OyBiYWNrZ3JvdW5kOiB2YXIoLS1jYXJkKTsKICB9CiAgLnBheXJvbGwtcm9vdCB0YWJsZS5ydC1jYXJkcyB0ZCB7CiAgICBk
aXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogMTJw
eDsKICAgIHBhZGRpbmc6IDZweCAwICFpbXBvcnRhbnQ7IGJvcmRlcjogMCAhaW1wb3J0YW50OyB0ZXh0LWFsaWduOiByaWdodCAh
aW1wb3J0YW50OyBtaW4td2lkdGg6IDA7CiAgfQogIC5wYXlyb2xsLXJvb3QgdGFibGUucnQtY2FyZHMgdGQ6OmJlZm9yZSB7CiAg
ICBjb250ZW50OiBhdHRyKGRhdGEtbGFiZWwpOyBmb250LXNpemU6IDExcHg7IGZvbnQtd2VpZ2h0OiA3MDA7IGNvbG9yOiB2YXIo
LS10ZXh0LW11dGVkKTsKICAgIHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7IHRleHQtYWxpZ246IGxlZnQ7IGZsZXg6IDAgMCAz
OCU7CiAgfQogIC5wYXlyb2xsLXJvb3QgdGFibGUucnQtY2FyZHMgdGRbZGF0YS1sYWJlbD0iIl06OmJlZm9yZSB7IGRpc3BsYXk6
IG5vbmU7IH0KICAucGF5cm9sbC1yb290IHRhYmxlLnJ0LWNhcmRzIHRkW2RhdGEtbGFiZWw9IiJdIHsganVzdGlmeS1jb250ZW50
OiBmbGV4LXN0YXJ0OyB0ZXh0LWFsaWduOiBsZWZ0ICFpbXBvcnRhbnQ7IH0KfQpgCgpjb25zdCBNQVhfQ0FSRF9DT0xVTU5TID0g
MTAKY29uc3QgTUFYX0NBUkRfUk9XUyA9IDQwMAoKLy8gR2l2ZSBldmVyeSBjZWxsIG9mIGFuIG9yZGluYXJ5IHRhYmxlIHRoZSBu
YW1lIG9mIGl0cyBjb2x1bW4sIGFuZCBtYXJrIHRoZSB0YWJsZSBhcyBjYXJkLWFibGUuCmZ1bmN0aW9uIGxhYmVsVGFibGVzKHJv
b3Q6IEhUTUxFbGVtZW50KSB7CiAgcm9vdC5xdWVyeVNlbGVjdG9yQWxsKCJ0YWJsZSIpLmZvckVhY2goKHRhYmxlKSA9PiB7CiAg
ICBpZiAodGFibGUuaGFzQXR0cmlidXRlKCJkYXRhLW5vLWNhcmRzIikpIHJldHVybgogICAgY29uc3QgaGVhZFJvdyA9IHRhYmxl
LnF1ZXJ5U2VsZWN0b3IoInRoZWFkIHRyIikKICAgIGNvbnN0IGJvZHlSb3dzID0gdGFibGUucXVlcnlTZWxlY3RvckFsbCgidGJv
ZHkgdHIiKQogICAgaWYgKCFoZWFkUm93IHx8IGJvZHlSb3dzLmxlbmd0aCA9PT0gMCB8fCBib2R5Um93cy5sZW5ndGggPiBNQVhf
Q0FSRF9ST1dTKSB7IHRhYmxlLmNsYXNzTGlzdC5yZW1vdmUoInJ0LWNhcmRzIik7IHJldHVybiB9CiAgICBjb25zdCBoZWFkcyA9
IEFycmF5LmZyb20oaGVhZFJvdy5jaGlsZHJlbikubWFwKCh0aCkgPT4gKHRoLnRleHRDb250ZW50IHx8ICIiKS50cmltKCkpCiAg
ICBpZiAoaGVhZHMubGVuZ3RoIDwgMiB8fCBoZWFkcy5sZW5ndGggPiBNQVhfQ0FSRF9DT0xVTU5TKSB7IHRhYmxlLmNsYXNzTGlz
dC5yZW1vdmUoInJ0LWNhcmRzIik7IHJldHVybiB9CiAgICB0YWJsZS5jbGFzc0xpc3QuYWRkKCJydC1jYXJkcyIpCiAgICBib2R5
Um93cy5mb3JFYWNoKCh0cikgPT4gewogICAgICBsZXQgY29sID0gMAogICAgICBBcnJheS5mcm9tKHRyLmNoaWxkcmVuKS5mb3JF
YWNoKCh0ZCkgPT4gewogICAgICAgIGNvbnN0IHNwYW4gPSBOdW1iZXIodGQuZ2V0QXR0cmlidXRlKCJjb2xzcGFuIikgfHwgMSkK
ICAgICAgICBjb25zdCBsYWJlbCA9IHNwYW4gPiAxID8gIiIgOiBoZWFkc1tjb2xdIHx8ICIiCiAgICAgICAgaWYgKHRkLmdldEF0
dHJpYnV0ZSgiZGF0YS1sYWJlbCIpICE9PSBsYWJlbCkgdGQuc2V0QXR0cmlidXRlKCJkYXRhLWxhYmVsIiwgbGFiZWwpCiAgICAg
ICAgY29sICs9IHNwYW4KICAgICAgfSkKICAgIH0pCiAgfSkKfQoKZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gUGF5cm9sbExheW91
dCh7IGNoaWxkcmVuIH06IHsgY2hpbGRyZW46IFJlYWN0Tm9kZSB9KSB7CiAgY29uc3QgeyBoYXNGZWF0dXJlLCBsb2FkaW5nOiBw
bGFuTG9hZGluZyB9ID0gdXNlUGxhbigpCiAgY29uc3QgeyByb2xlIH0gPSB1c2VSb2xlKCkKICBjb25zdCBbcm9vdEVsLCBzZXRS
b290RWxdID0gdXNlU3RhdGU8SFRNTERpdkVsZW1lbnQgfCBudWxsPihudWxsKQoKICB1c2VFZmZlY3QoKCkgPT4gewogICAgaWYg
KCFyb290RWwpIHJldHVybgogICAgbGV0IGZyYW1lID0gMAogICAgY29uc3QgcnVuID0gKCkgPT4geyBjYW5jZWxBbmltYXRpb25G
cmFtZShmcmFtZSk7IGZyYW1lID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IGxhYmVsVGFibGVzKHJvb3RFbCkpIH0KICAg
IHJ1bigpCiAgICBjb25zdCBtbyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKHJ1bikKICAgIG1vLm9ic2VydmUocm9vdEVsLCB7IGNo
aWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KQogICAgcmV0dXJuICgpID0+IHsgbW8uZGlzY29ubmVjdCgpOyBjYW5jZWxB
bmltYXRpb25GcmFtZShmcmFtZSkgfQogIH0sIFtyb290RWxdKQoKICAvLyBTaG93IGEgbWluaW1hbCBpbmxpbmUgbG9hZGVyIG9u
bHkgd2hpbGUgcGxhbiBpcyBzdGlsbCBsb2FkaW5nLgogIC8vIFRoZSBnbG9iYWwgZGFzaGJvYXJkIHNwbGFzaCBhbHJlYWR5IGhh
bmRsZXMgdGhlIGluaXRpYWwgcm9sZS9wbGFuIHdhaXQsCiAgLy8gc28gdGhpcyBvbmx5IGFwcGVhcnMgb24gc3Vic2VxdWVudCBy
YXBpZCBuYXZpZ2F0aW9ucy4KICBpZiAocGxhbkxvYWRpbmcpIHsKICAgIHJldHVybiAoCiAgICAgIDxkaXYgc3R5bGU9e3sKICAg
ICAgICBkaXNwbGF5OiAiZmxleCIsCiAgICAgICAgYWxpZ25JdGVtczogImNlbnRlciIsCiAgICAgICAganVzdGlmeUNvbnRlbnQ6
ICJjZW50ZXIiLAogICAgICAgIG1pbkhlaWdodDogIjYwdmgiLAogICAgICB9fT4KICAgICAgICA8ZGl2IHN0eWxlPXt7CiAgICAg
ICAgICB3aWR0aDogMjQsIGhlaWdodDogMjQsCiAgICAgICAgICBib3JkZXI6ICIzcHggc29saWQgdmFyKC0tYm9yZGVyKSIsCiAg
ICAgICAgICBib3JkZXJUb3BDb2xvcjogInZhcigtLXByaW1hcnkpIiwKICAgICAgICAgIGJvcmRlclJhZGl1czogIjUwJSIsCiAg
ICAgICAgICBhbmltYXRpb246ICJzcGluIDAuOHMgbGluZWFyIGluZmluaXRlIiwKICAgICAgICB9fSAvPgogICAgICAgIDxzdHls
ZT57YEBrZXlmcmFtZXMgc3BpbiB7IHRvIHsgdHJhbnNmb3JtOiByb3RhdGUoMzYwZGVnKTsgfSB9YH08L3N0eWxlPgogICAgICA8
L2Rpdj4KICAgICkKICB9CgogIC8vIElmIHBheXJvbGwgZmVhdHVyZSBpcyBub3QgZW5hYmxlZCwgc2hvdyB0aGUgbWVzc2FnZQog
IGlmICghaGFzRmVhdHVyZSgicGF5cm9sbCIpKSB7CiAgICByZXR1cm4gKAogICAgICA8ZGl2IHN0eWxlPXt7IHBhZGRpbmc6IDI0
LCB0ZXh0QWxpZ246ICJjZW50ZXIiLCBjb2xvcjogInZhcigtLXRleHQtbXV0ZWQpIiwgYmFja2dyb3VuZDogInZhcigtLWJnKSIs
IG1pbkhlaWdodDogIjEwMHZoIiB9fT4KICAgICAgICA8aDI+UGF5cm9sbCBmZWF0dXJlIGlzIG5vdCBlbmFibGVkLjwvaDI+CiAg
ICAgICAgPHA+RW5hYmxlIGl0IGluIHRoZSBGZWF0dXJlIE1hbmFnZXIuPC9wPgogICAgICA8L2Rpdj4KICAgICkKICB9CgogIC8v
IEFsbCBnb29kIC0gcmVuZGVyIHRoZSBwYWdlIGNvbnRlbnQKICByZXR1cm4gKAogICAgPGRpdiBjbGFzc05hbWU9InBheXJvbGwt
cm9vdCIgcmVmPXtzZXRSb290RWx9PgogICAgICA8c3R5bGU+e1JFU1BPTlNJVkVfQ1NTfTwvc3R5bGU+CiAgICAgIHtjaGlsZHJl
bn0KICAgIDwvZGl2PgogICkKfQo=
'@ '8b04f72e6abde7d6f7b20d6b232344e3dfcbbb700677e2aa46e080dfbe5f73e0'

Add-Replace 'src\app\dashboard\payroll\advances\page.tsx' 'Y29sb3I6ICIjRkNBNUE1IiwgcGFkZGluZzogMTAs' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSIsIGJvcmRlcjogIjFweCBzb2xpZCAjZGMyNjI2IiwgcGFkZGluZzogMTAs' 1

Add-Replace 'src\app\dashboard\payroll\advances\page.tsx' 'Y29sb3I6ICIjNkVFN0I3Ig==' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSI=' 1

Add-Replace 'src\app\dashboard\payroll\attendance\import\page.tsx' 'Ym9yZGVyOiAiMXB4IHNvbGlkICNGRUNBQ0Ei' 'Ym9yZGVyOiAiMXB4IHNvbGlkICNkYzI2MjYi' 1

Add-Replace 'src\app\dashboard\payroll\attendance\import\page.tsx' 'Y29sb3I6ICIjRkNBNUE1Ig==' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSI=' 1

Add-Replace 'src\app\dashboard\payroll\attendance\import\page.tsx' 'Y29sb3I6ICIjNkVFN0I3Ig==' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSI=' 1

Add-Replace 'src\app\dashboard\payroll\attendance\page.tsx' 'Y29sb3I6ICIjRkNBNUE1IiwgcGFkZGluZzogMTAs' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSIsIGJvcmRlcjogIjFweCBzb2xpZCAjZGMyNjI2IiwgcGFkZGluZzogMTAs' 1

Add-Replace 'src\app\dashboard\payroll\attendance\page.tsx' 'Y29sb3I6ICIjNkVFN0I3Ig==' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSI=' 1

Add-Replace 'src\app\dashboard\payroll\attendance\verify\page.tsx' 'Y29sb3I6ICIjRkNBNUE1IiwgcGFkZGluZzogMTAs' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSIsIGJvcmRlcjogIjFweCBzb2xpZCAjZGMyNjI2IiwgcGFkZGluZzogMTAs' 1

Add-Replace 'src\app\dashboard\payroll\attendance\verify\page.tsx' 'Y29sb3I6ICIjNkVFN0I3Ig==' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSI=' 1

Add-Replace 'src\app\dashboard\payroll\employees\[id]\revisions\new\page.tsx' 'Ym9yZGVyOiAiMXB4IHNvbGlkICNGRUNBQ0Ei' 'Ym9yZGVyOiAiMXB4IHNvbGlkICNkYzI2MjYi' 1

Add-Replace 'src\app\dashboard\payroll\employees\[id]\revisions\new\page.tsx' 'Y29sb3I6ICIjRkNBNUE1Ig==' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSI=' 1

Add-Replace 'src\app\dashboard\payroll\employees\[id]\revisions\new\page.tsx' 'Y29sb3I6ICIjNkVFN0I3Ig==' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSI=' 1

Add-Replace 'src\app\dashboard\payroll\leave-applications\page.tsx' 'Y29sb3I6ICIjRkNBNUE1IiwgcGFkZGluZzogMTAs' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSIsIGJvcmRlcjogIjFweCBzb2xpZCAjZGMyNjI2IiwgcGFkZGluZzogMTAs' 1

Add-Replace 'src\app\dashboard\payroll\leave-applications\page.tsx' 'Y29sb3I6ICIjNkVFN0I3Ig==' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSI=' 1

Add-Replace 'src\app\dashboard\payroll\leave-types\page.tsx' 'Ym9yZGVyOiAiMXB4IHNvbGlkICNGRUNBQ0Ei' 'Ym9yZGVyOiAiMXB4IHNvbGlkICNkYzI2MjYi' 1

Add-Replace 'src\app\dashboard\payroll\leave-types\page.tsx' 'Y29sb3I6ICIjRkNBNUE1Ig==' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSI=' 1

Add-Replace 'src\app\dashboard\payroll\leave-types\page.tsx' 'Y29sb3I6ICIjNkVFN0I3Ig==' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSI=' 1

Add-Replace 'src\app\dashboard\payroll\loans\page.tsx' 'Y29sb3I6ICIjRkNBNUE1IiwgcGFkZGluZzogMTAs' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSIsIGJvcmRlcjogIjFweCBzb2xpZCAjZGMyNjI2IiwgcGFkZGluZzogMTAs' 1

Add-Replace 'src\app\dashboard\payroll\loans\page.tsx' 'Y29sb3I6ICIjNkVFN0I3Ig==' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSI=' 1

Add-Replace 'src\app\dashboard\payroll\reports\attendance-register\page.tsx' 'eyBjb2xvcjogIiNGQ0E1QTUiLCBmb250U2l6ZTogMTM=' 'eyBjb2xvcjogIiNkYzI2MjYiLCBmb250U2l6ZTogMTM=' 1

Add-Replace 'src\app\dashboard\payroll\reports\bank-transfer\page.tsx' 'eyBjb2xvcjogIiNGQ0E1QTUiLCBmb250U2l6ZTogMTM=' 'eyBjb2xvcjogIiNkYzI2MjYiLCBmb250U2l6ZTogMTM=' 1

Add-Replace 'src\app\dashboard\payroll\reports\payroll-register\page.tsx' 'eyBjb2xvcjogIiNGQ0E1QTUiLCBmb250U2l6ZTogMTM=' 'eyBjb2xvcjogIiNkYzI2MjYiLCBmb250U2l6ZTogMTM=' 1

Add-Replace 'src\app\dashboard\payroll\reports\payslip\page.tsx' 'eyBjb2xvcjogIiNGQ0E1QTUiLCBmb250U2l6ZTogMTM=' 'eyBjb2xvcjogIiNkYzI2MjYiLCBmb250U2l6ZTogMTM=' 1

Add-Replace 'src\app\dashboard\payroll\reports\salary-summary\page.tsx' 'eyBjb2xvcjogIiNGQ0E1QTUiLCBmb250U2l6ZTogMTM=' 'eyBjb2xvcjogIiNkYzI2MjYiLCBmb250U2l6ZTogMTM=' 1

Add-Replace 'src\app\dashboard\payroll\reports\tax-deduction\page.tsx' 'eyBjb2xvcjogIiNGQ0E1QTUiLCBmb250U2l6ZTogMTM=' 'eyBjb2xvcjogIiNkYzI2MjYiLCBmb250U2l6ZTogMTM=' 1

Add-Replace 'src\app\dashboard\payroll\salary-components\[id]\page.tsx' 'Ym9yZGVyOiAiMXB4IHNvbGlkICNGRUNBQ0Ei' 'Ym9yZGVyOiAiMXB4IHNvbGlkICNkYzI2MjYi' 1

Add-Replace 'src\app\dashboard\payroll\salary-components\[id]\page.tsx' 'Y29sb3I6ICIjRkNBNUE1Ig==' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSI=' 1

Add-Replace 'src\app\dashboard\payroll\salary-components\[id]\page.tsx' 'Y29sb3I6ICIjNkVFN0I3Ig==' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSI=' 1

Add-Replace 'src\app\dashboard\payroll\salary-components\new\page.tsx' 'Ym9yZGVyOiAiMXB4IHNvbGlkICNGRUNBQ0Ei' 'Ym9yZGVyOiAiMXB4IHNvbGlkICNkYzI2MjYi' 1

Add-Replace 'src\app\dashboard\payroll\salary-components\new\page.tsx' 'Y29sb3I6ICIjRkNBNUE1Ig==' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSI=' 1

Add-Replace 'src\app\dashboard\payroll\salary-components\new\page.tsx' 'Y29sb3I6ICIjNkVFN0I3Ig==' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSI=' 1

Add-Replace 'src\app\dashboard\payroll\salary-structures\new\page.tsx' 'Ym9yZGVyOiAiMXB4IHNvbGlkICNGRUNBQ0Ei' 'Ym9yZGVyOiAiMXB4IHNvbGlkICNkYzI2MjYi' 1

Add-Replace 'src\app\dashboard\payroll\salary-structures\new\page.tsx' 'Y29sb3I6ICIjRkNBNUE1Ig==' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSI=' 1

Add-Replace 'src\app\dashboard\payroll\salary-structures\new\page.tsx' 'Y29sb3I6ICIjNkVFN0I3Ig==' 'Y29sb3I6ICJ2YXIoLS10ZXh0KSI=' 1


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
Write-Host ("Stage 6 applied: " + $script:count + " changes in " + $script:files.Count + " files.") -ForegroundColor Green
Write-Host 'No SQL is needed for this stage. Next: npm run build' -ForegroundColor Green