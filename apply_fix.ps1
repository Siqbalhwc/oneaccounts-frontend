$filePath = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\dashboard\customers\page.tsx"
$backupPath = "$filePath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

$rawContent = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($backupPath, $rawContent, [System.Text.Encoding]::UTF8)

# Normalize to LF only for reliable matching
$content = $rawContent -replace "`r`n", "`n"

$old1 = "  const [importing, setImporting] = useState(false)`n  const [importMessage, setImportMessage] = useState(`"`")"
$new1 = "  const [importing, setImporting] = useState(false)`n  const [importMessage, setImportMessage] = useState(`"`")`n  const [showArchived, setShowArchived] = useState(false)`n  const [confirmTarget, setConfirmTarget] = useState<any>(null)"

$old2 = "    setLoading(true)`n    supabase`n      .from(`"customers`")`n      .select(`"*`")`n      .eq(`"company_id`", companyId)`n      .is(`"deleted_at`", null)`n      .order(sortField === `"balance`" ? `"balance`" : sortField, { ascending: sortDir === `"asc`" })`n      .then(({ data }) => {`n        setCustomers(data || [])`n        setLoading(false)`n      })`n  }, [role, canView, companyId, sortField, sortDir])"
$new2 = $old2 + "`n`n  const visibleCustomers = showArchived ? customers : customers.filter(c => !c.archived_at)"

$old3 = "  const handleDelete = async (id: number) => {`n    if (!confirm(`"Delete this customer? This will not remove their transactions.`")) return`n    await supabase.from(`"customers`").update({ deleted_at: new Date().toISOString() }).eq(`"id`", id)`n    setCustomers(prev => prev.filter(c => c.id !== id))`n  }"
$new3 = @"
  const handleArchiveOrDelete = (cust: any) => {
    setConfirmTarget(cust)
  }

  const confirmArchiveOrDelete = async () => {
    if (!confirmTarget) return
    const cust = confirmTarget
    const hasTransactions = Math.abs(cust.balance || 0) > 0 || Math.abs(cust.opening_balance || 0) > 0

    if (hasTransactions) {
      await supabase.from("customers").update({ archived_at: new Date().toISOString() }).eq("id", cust.id)
      setCustomers(prev => prev.map(c => c.id === cust.id ? { ...c, archived_at: new Date().toISOString() } : c))
    } else {
      await supabase.from("customers").update({ deleted_at: new Date().toISOString() }).eq("id", cust.id)
      setCustomers(prev => prev.filter(c => c.id !== cust.id))
    }
    setConfirmTarget(null)
  }

  const restoreCustomer = async (cust: any) => {
    await supabase.from("customers").update({ archived_at: null }).eq("id", cust.id)
    setCustomers(prev => prev.map(c => c.id === cust.id ? { ...c, archived_at: null } : c))
  }
"@ -replace "`r`n", "`n"

$old5 = "  // -- Filter by search --`n  const filtered = customers.filter((c) => {"
$new5 = "  // -- Filter by search --`n  const filtered = visibleCustomers.filter((c) => {"

$old6 = "        <div className=`"search-section`">`n          <Search size={16} style={{ position: `"absolute`", left: 12, top: `"50%`", transform: `"translateY(-50%)`", color: `"var(--text-muted)`" }} />`n          <input className=`"input`" placeholder=`"Search by code, name, phone, email...`" value={search} onChange={(e) => setSearch(e.target.value)} />`n        </div>"
$new6 = @"
        <div className="search-section" style={{ display: "flex", alignItems: "center", gap: 16, maxWidth: "none" }}>
          <div style={{ position: "relative", maxWidth: 320, flex: 1 }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input className="input" placeholder="Search by code, name, phone, email..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", cursor: "pointer", whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show Archived
          </label>
        </div>
"@ -replace "`r`n", "`n"
$new6 = $new6.TrimEnd()

$old7 = "                  sortedFiltered.map((cust) => {`n                    const balance = cust.balance || 0`n                    return (`n                      <tr key={cust.id}>"
$new7 = "                  sortedFiltered.map((cust) => {`n                    const balance = cust.balance || 0`n                    const isArchived = !!cust.archived_at`n                    return (`n                      <tr key={cust.id} style={isArchived ? { opacity: 0.5 } : {}}>"

$old8 = "                        <td style={{ ...tdStyle, maxWidth: 0, overflow: `"hidden`", textOverflow: `"ellipsis`", whiteSpace: `"nowrap`" }}>`n                          {cust.name}`n                        </td>"
$new8 = "                        <td style={{ ...tdStyle, maxWidth: 0, overflow: `"hidden`", textOverflow: `"ellipsis`", whiteSpace: `"nowrap`" }}>`n                          {cust.name}`n                          {isArchived && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: `"var(--text-muted)`", border: `"1px solid var(--border)`", borderRadius: 4, padding: `"1px 6px`" }}>ARCHIVED</span>}`n                        </td>"

$old9 = "                            {canEdit && (`n                              <button className=`"btn-icon`" onClick={() => handleDelete(cust.id)} style={{ color: `"#EF4444`" }} title=`"Delete`">`n                                <Trash2 size={13} />`n                              </button>`n                            )}"
$new9 = @"
                            {canEdit && isArchived && (
                              <button className="btn-icon" onClick={() => restoreCustomer(cust)} style={{ color: "#10B981" }} title="Restore">
                                <Trash2 size={13} style={{ transform: "scaleY(-1)" }} />
                              </button>
                            )}
                            {canEdit && !isArchived && (
                              <button className="btn-icon" onClick={() => handleArchiveOrDelete(cust)} style={{ color: "#EF4444" }} title="Archive / Delete">
                                <Trash2 size={13} />
                              </button>
                            )}
"@ -replace "`r`n", "`n"
$new9 = $new9.TrimEnd()

$old10 = "        {importing && <div style={{ textAlign: `"center`", padding: 20, color: `"var(--text-muted)`" }}>Importing...</div>}`n      </div>`n    </RoleGuard>`n  )`n}"
$new10 = @"
        {importing && <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>Importing...</div>}

        {confirmTarget && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setConfirmTarget(null)}>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, maxWidth: 380, width: "90%", boxShadow: "0 12px 32px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                {(Math.abs(confirmTarget.balance || 0) > 0 || Math.abs(confirmTarget.opening_balance || 0) > 0) ? "Archive Customer?" : "Delete Customer?"}
              </h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px 0", lineHeight: 1.5 }}>
                {(Math.abs(confirmTarget.balance || 0) > 0 || Math.abs(confirmTarget.opening_balance || 0) > 0)
                  ? ``${confirmTarget.name} has existing balance or transactions, so it will be archived (hidden from the list, fully recoverable) instead of deleted.``
                  : ``${confirmTarget.name} has no transactions and can be safely deleted. This cannot be undone.``}
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-outline" onClick={() => setConfirmTarget(null)}>Cancel</button>
                <button className="btn" onClick={confirmArchiveOrDelete}>Confirm</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  )
}
"@ -replace "`r`n", "`n"
$new10 = $new10.TrimEnd()

$blocks = @(
  @{old=$old1; new=$new1; label="1 of 9"},
  @{old=$old2; new=$new2; label="2 of 9"},
  @{old=$old3; new=$new3; label="3 of 9"},
  @{old=$old5; new=$new5; label="4 of 9"},
  @{old=$old6; new=$new6; label="5 of 9"},
  @{old=$old7; new=$new7; label="6 of 9"},
  @{old=$old8; new=$new8; label="7 of 9"},
  @{old=$old9; new=$new9; label="8 of 9"},
  @{old=$old10; new=$new10; label="9 of 9"}
)

$allFound = $true
foreach ($b in $blocks) {
    if ($content.Contains($b.old)) {
        $content = $content.Replace($b.old, $b.new)
        Write-Host "Step $($b.label): OK"
    } else {
        Write-Host "Step $($b.label): NOT FOUND"
        $allFound = $false
    }
}

if ($allFound) {
    [System.IO.File]::WriteAllText($filePath, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Customer archive/delete fix applied. Backup saved at $backupPath"
} else {
    Write-Host "ERROR: One or more blocks not found. No changes were written. Please tell Claude which steps said NOT FOUND."
}