$ErrorActionPreference = "Stop"
$rel  = "src\app\dashboard\payments\page.tsx"
$full = Join-Path (Get-Location).Path $rel
if (-not (Test-Path -LiteralPath $full)) { throw "File not found: $full (run from the frontend folder)" }

$utf8 = New-Object System.Text.UTF8Encoding($true)
$text = [System.IO.File]::ReadAllText($full, $utf8)
if ($text.Contains("reverseTarget")) { throw "Fix already applied to this file." }
$nl = "`n"
if ($text.Contains("`r`n")) { $nl = "`r`n" }

$lines = New-Object 'System.Collections.Generic.List[string]'
foreach ($l in ($text -split "\r?\n")) { $lines.Add($l) }

function Find-One([string]$trimmed) {
  $hits = @()
  for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i].Trim() -eq $trimmed) { $hits += $i } }
  if ($hits.Count -ne 1) { throw "Anchor expected exactly once but found $($hits.Count): $trimmed" }
  return [int]$hits[0]
}
function Insert-Block([int]$idx, [string]$block) {
  $arr = [string[]]($block -split "\r?\n")
  $lines.InsertRange($idx, $arr)
}

# 1. Imports
$i = Find-One 'import { Plus, Eye, Edit, Search, ArrowUpDown, ArrowUp, ArrowDown, Undo2 } from "lucide-react"'
$lines[$i] = 'import { Plus, Eye, Edit, Search, ArrowUpDown, ArrowUp, ArrowDown, Undo2, CheckCircle, AlertCircle, X } from "lucide-react"'

# 2. State + auto-dismiss for success banner
$i = Find-One 'const [supplierMap, setSupplierMap] = useState<Record<number, { name: string; phone: string }>>({})'
$block = @'
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [reverseTarget, setReverseTarget] = useState<any>(null)
  const [reversing, setReversing] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (banner?.type === "success") {
      const t = setTimeout(() => setBanner(null), 8000)
      return () => clearTimeout(t)
    }
    return undefined
  }, [banner])
'@
Insert-Block ($i + 1) $block

# 3. Reload list after a reversal
$i = Find-One '}, [role, canView, companyId, sortField, sortDir])'
$lines[$i] = $lines[$i].Replace('sortDir])', 'sortDir, reloadKey])')

# 4. Replace handleReverse (6 lines) with dialog-based flow
$i = Find-One 'const handleReverse = async (paymentId: number) => {'
$expect = @(
  'if (!window.confirm("Reverse this payment? This will undo all its effects.")) return',
  "const { error } = await supabase.rpc('reverse_vendor_payment', { p_payment_id: paymentId, p_company_id: companyId })",
  'if (error) alert(error.message)',
  "else setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, status: 'reversed' } : p))",
  '}'
)
for ($k = 0; $k -lt $expect.Count; $k++) {
  if ($lines[$i + 1 + $k].Trim() -ne $expect[$k]) { throw "handleReverse block differs from expected at line offset $($k + 1)" }
}
$lines.RemoveRange($i, 6)
$block = @'
  const handleReverse = (paymentId: number) => {
    const pay = payments.find(p => p.id === paymentId)
    if (pay) setReverseTarget(pay)
  }

  const friendlyReverseError = (msg: string) => {
    const m = (msg || "").toLowerCase()
    if (m.includes("already been reversed")) return "This payment has already been reversed. Please refresh the page to see its current status."
    if (m.includes("not found")) return "This payment could not be found. Please refresh the page and try again."
    if (m.includes("cannot be reversed") || m.includes("only supplier payments")) return msg
    return `The payment could not be reversed. ${msg || "Please try again."}`
  }

  const confirmReverse = async () => {
    if (!reverseTarget || reversing) return
    const pay = reverseTarget
    setReversing(true)
    const { error } = await supabase.rpc('reverse_vendor_payment', { p_payment_id: pay.id, p_company_id: companyId })
    setReversing(false)
    setReverseTarget(null)
    if (error) {
      setBanner({ type: "error", text: friendlyReverseError(error.message) })
      return
    }
    setBanner({ type: "success", text: `Payment ${pay.payment_no} has been reversed. The supplier ledger and balances are updated.` })
    setReloadKey(k => k + 1)
  }
'@
Insert-Block $i $block

# 5. WhatsApp "no phone" alert -> banner
$i = Find-One 'if (!supp?.phone) { alert("No phone number for this supplier."); return }'
$lines[$i] = '    if (!supp?.phone) { setBanner({ type: "error", text: "This supplier has no phone number on file, so the WhatsApp message could not be sent." }); return }'

# 6. Banner above the summary cards
$i = Find-One '<div className="summary-grid">'
$block = @'
      {banner && (
        <div style={{ background: "var(--card)", border: `1px solid ${banner.type === "success" ? "var(--success)" : "var(--danger)"}`, color: "var(--text)", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          {banner.type === "success" ? <CheckCircle size={16} style={{ color: "var(--success)", flexShrink: 0 }} /> : <AlertCircle size={16} style={{ color: "var(--danger)", flexShrink: 0 }} />}
          <span style={{ flex: 1 }}>{banner.text}</span>
          <button onClick={() => setBanner(null)} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "inline-flex", padding: 0 }}><X size={14} /></button>
        </div>
      )}

'@
Insert-Block $i $block

# 7. Confirm dialog before the closing </div> of the page
$end = $lines.Count - 1
while ($end -ge 0 -and $lines[$end].Trim() -eq '') { $end-- }
if ($lines[$end].Trim() -ne '}' -or $lines[$end - 1].Trim() -ne ')' -or $lines[$end - 2].Trim() -ne '</div>') { throw "Unexpected end-of-file structure; nothing written." }
$block = @'
      {reverseTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => { if (!reversing) setReverseTarget(null) }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, maxWidth: 440, width: "90%", boxShadow: "0 12px 32px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Reverse Payment?</h3>
            <p style={{ fontSize: 13, color: "var(--text)", margin: "0 0 10px 0", lineHeight: 1.5 }}>
              You are about to reverse payment <strong>{reverseTarget.payment_no}</strong> to <strong>{supplierMap[reverseTarget.party_id]?.name || "this supplier"}</strong> for <strong>PKR {Number(reverseTarget.amount || 0).toLocaleString()}</strong>.
            </p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px 0", lineHeight: 1.5 }}>
              A reversing journal entry will be posted, and the supplier balance and any bills paid by this payment will be restored. The original entry is kept for audit.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setReverseTarget(null)} disabled={reversing}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmReverse} disabled={reversing}>{reversing ? "Reversing..." : "Reverse Payment"}</button>
            </div>
          </div>
        </div>
      )}
'@
Insert-Block ($end - 2) $block

# Final sanity checks
$newText = [string]::Join($nl, $lines)
if ($newText.Contains("window.confirm") -or $newText.Contains("alert(")) { throw "Browser popup still present; nothing written." }

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item -LiteralPath $full -Destination ($full + ".backup_" + $stamp)
[System.IO.File]::WriteAllText($full, $newText, $utf8)
Write-Host "Done. Backup saved as page.tsx.backup_$stamp"