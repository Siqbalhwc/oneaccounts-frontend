$ErrorActionPreference = "Stop"
$base = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend"
$custPath = Join-Path $base "src\app\dashboard\customers\page.tsx"
$supPath  = Join-Path $base "src\app\dashboard\suppliers\page.tsx"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$utf8 = New-Object System.Text.UTF8Encoding($true)

function Apply-Edit {
    param([string]$content, [string]$old, [string]$new, [string]$label)
    if (-not $content.Contains($old)) {
        throw "Anchor not found for edit: $label"
    }
    $count = ([regex]::Matches([regex]::Escape($old), "(?!)")).Count # no-op, placeholder
    return $content.Replace($old, $new)
}

# ============ CUSTOMERS ============
$custContent = [System.IO.File]::ReadAllText($custPath, [System.Text.Encoding]::UTF8)

$old1 = @'
  const [showArchived, setShowArchived] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<any>(null)
  const [suppliersForLink, setSuppliersForLink] = useState<any[]>([])
'@
$new1 = @'
  const [showArchived, setShowArchived] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<any>(null)
  const [checkingUsage, setCheckingUsage] = useState<number | null>(null)
  const [suppliersForLink, setSuppliersForLink] = useState<any[]>([])
'@
$custContent = Apply-Edit $custContent $old1 $new1 "customers: state"

$old2 = @'
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
'@
$new2 = @'
  const handleArchiveOrDelete = async (cust: any) => {
    setCheckingUsage(cust.id)
    const hasBalance = Math.abs(cust.balance || 0) > 0 || Math.abs(cust.opening_balance || 0) > 0
    let hasHistory = hasBalance
    if (!hasHistory) {
      const [{ count: invCount }, { count: recCount }] = await Promise.all([
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("customer_id", cust.id).eq("company_id", companyId),
        supabase.from("receipts").select("id", { count: "exact", head: true }).eq("party_id", cust.id).eq("company_id", companyId),
      ])
      hasHistory = (invCount || 0) > 0 || (recCount || 0) > 0
    }
    setCheckingUsage(null)
    setConfirmTarget({ ...cust, _willArchive: hasHistory })
  }

  const confirmArchiveOrDelete = async () => {
    if (!confirmTarget) return
    const cust = confirmTarget

    if (cust._willArchive) {
      await supabase.from("customers").update({ archived_at: new Date().toISOString() }).eq("id", cust.id)
      setCustomers(prev => prev.map(c => c.id === cust.id ? { ...c, archived_at: new Date().toISOString() } : c))
    } else {
      await supabase.from("customers").update({ deleted_at: new Date().toISOString() }).eq("id", cust.id)
      setCustomers(prev => prev.filter(c => c.id !== cust.id))
    }
    setConfirmTarget(null)
  }
'@
$custContent = Apply-Edit $custContent $old2 $new2 "customers: archive logic"

$old3 = @'
              <h3 style={{ margin: "0 0 12px 0", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                {(Math.abs(confirmTarget.balance || 0) > 0 || Math.abs(confirmTarget.opening_balance || 0) > 0) ? "Archive Customer?" : "Delete Customer?"}
              </h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px 0", lineHeight: 1.5 }}>
                {(Math.abs(confirmTarget.balance || 0) > 0 || Math.abs(confirmTarget.opening_balance || 0) > 0)
                  ? ` has existing balance or transactions, so it will be archived (hidden from the list, fully recoverable) instead of deleted.`
                  : ` has no transactions and can be safely deleted. This cannot be undone.`}
              </p>
'@
$new3 = @'
              <h3 style={{ margin: "0 0 12px 0", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                {confirmTarget._willArchive ? "Archive Customer?" : "Delete Customer?"}
              </h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px 0", lineHeight: 1.5 }}>
                {confirmTarget._willArchive
                  ? `${confirmTarget.name} has existing balance, invoices, or receipts, so it will be archived (hidden from the list, fully recoverable) instead of deleted.`
                  : `${confirmTarget.name} has no transaction history and can be safely deleted. This cannot be undone.`}
              </p>
'@
$custContent = Apply-Edit $custContent $old3 $new3 "customers: modal text"

$old4 = @'
                                {
                                  key: "archive",
                                  label: "Archive / Delete",
                                  icon: <Trash2 size={14} />,
                                  color: "#EF4444",
                                  hidden: !(canEdit && !isArchived),
                                  onClick: () => handleArchiveOrDelete(cust),
                                },
'@
$new4 = @'
                                {
                                  key: "archive",
                                  label: checkingUsage === cust.id ? "Checking..." : "Archive / Delete",
                                  icon: <Trash2 size={14} />,
                                  color: "#EF4444",
                                  hidden: !(canEdit && !isArchived),
                                  onClick: () => { if (checkingUsage === null) handleArchiveOrDelete(cust) },
                                },
'@
$custContent = Apply-Edit $custContent $old4 $new4 "customers: row action label"

# ============ SUPPLIERS ============
$supContent = [System.IO.File]::ReadAllText($supPath, [System.Text.Encoding]::UTF8)

$sold1 = @'
import { Plus, Search, Edit, Trash2, Eye, ArrowUpDown, ArrowUp, ArrowDown, FileText, Download, Upload } from "lucide-react"
import CustomerVendorLink from "@/components/CustomerVendorLink"

interface Supplier {
  id: number
  code: string
  name: string
  phone: string
  email: string
  address: string
  opening_balance: number
  balance: number
  payment_terms?: string | null
}
'@
$snew1 = @'
import { Plus, Search, Edit, Trash2, Eye, RotateCcw, ArrowUpDown, ArrowUp, ArrowDown, FileText, Download, Upload } from "lucide-react"
import CustomerVendorLink from "@/components/CustomerVendorLink"

interface Supplier {
  id: number
  code: string
  name: string
  phone: string
  email: string
  address: string
  opening_balance: number
  balance: number
  payment_terms?: string | null
  archived_at?: string | null
}
'@
$supContent = Apply-Edit $supContent $sold1 $snew1 "suppliers: imports/interface"

$sold2 = @'
  const [importMessage, setImportMessage] = useState("")
  const [importing, setImporting] = useState(false)
  const [customersForLink, setCustomersForLink] = useState<any[]>([])
'@
$snew2 = @'
  const [importMessage, setImportMessage] = useState("")
  const [importing, setImporting] = useState(false)
  const [customersForLink, setCustomersForLink] = useState<any[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<any>(null)
  const [checkingUsage, setCheckingUsage] = useState<number | null>(null)
'@
$supContent = Apply-Edit $supContent $sold2 $snew2 "suppliers: state"

$sold3 = @'
    let query = supabase
      .from("suppliers")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order(sortField, { ascending: sortDir === "asc" })

    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%`)
    }

    query.range(start, end).then(({ data, count }) => {
      setSuppliers(data || [])
      setTotal(count || 0)
      setLoading(false)
    })
  }

  useEffect(() => { fetchSuppliers() }, [companyId, search, page, sortField, sortDir])
'@
$snew3 = @'
    let query = supabase
      .from("suppliers")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order(sortField, { ascending: sortDir === "asc" })

    if (!showArchived) {
      query = query.is("archived_at", null)
    }

    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%`)
    }

    query.range(start, end).then(({ data, count }) => {
      setSuppliers(data || [])
      setTotal(count || 0)
      setLoading(false)
    })
  }

  useEffect(() => { fetchSuppliers() }, [companyId, search, page, sortField, sortDir, showArchived])
'@
$supContent = Apply-Edit $supContent $sold3 $snew3 "suppliers: fetch query"

$sold4 = @'
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this supplier?")) return
    await supabase.from("suppliers").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", companyId)
    fetchSuppliers()
  }
'@
$snew4 = @'
  const handleArchiveOrDelete = async (s: Supplier) => {
    setCheckingUsage(s.id)
    const hasBalance = Math.abs(s.balance || 0) > 0 || Math.abs(s.opening_balance || 0) > 0
    let hasHistory = hasBalance
    if (!hasHistory) {
      const [{ count: billCount }, { count: payCount }] = await Promise.all([
        supabase.from("bills").select("id", { count: "exact", head: true }).eq("supplier_id", s.id).eq("company_id", companyId),
        supabase.from("payments").select("id", { count: "exact", head: true }).eq("party_id", s.id).eq("company_id", companyId),
      ])
      hasHistory = (billCount || 0) > 0 || (payCount || 0) > 0
    }
    setCheckingUsage(null)
    setConfirmTarget({ ...s, _willArchive: hasHistory })
  }

  const confirmArchiveOrDelete = async () => {
    if (!confirmTarget) return
    const s = confirmTarget

    if (s._willArchive) {
      await supabase.from("suppliers").update({ archived_at: new Date().toISOString() }).eq("id", s.id).eq("company_id", companyId)
    } else {
      await supabase.from("suppliers").update({ deleted_at: new Date().toISOString() }).eq("id", s.id).eq("company_id", companyId)
    }
    setConfirmTarget(null)
    fetchSuppliers()
  }

  const restoreSupplier = async (s: Supplier) => {
    await supabase.from("suppliers").update({ archived_at: null }).eq("id", s.id).eq("company_id", companyId)
    fetchSuppliers()
  }
'@
$supContent = Apply-Edit $supContent $sold4 $snew4 "suppliers: archive logic"

$sold5 = @'
      <div className="search-section">
        <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="search-input" placeholder="Search by code, name, or phone..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>
'@
$snew5 = @'
      <div className="search-section" style={{ display: "flex", alignItems: "center", gap: 16, maxWidth: "none" }}>
        <div style={{ position: "relative", maxWidth: 320, flex: 1 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="search-input" placeholder="Search by code, name, or phone..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", cursor: "pointer", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => { setShowArchived(e.target.checked); setPage(1) }} />
          Show Archived
        </label>
      </div>
'@
$supContent = Apply-Edit $supContent $sold5 $snew5 "suppliers: search section toggle"

$sold6 = @'
                suppliers.map((s) => (
                  <tr key={s.id}>
                    <td style={tdStyle}><span style={{ fontWeight: 600, color: "var(--primary)" }}>{s.code}</span></td>
                    <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{s.phone || "-"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>PKR {s.opening_balance?.toLocaleString() ?? "0"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: s.balance >= 0 ? "#10B981" : "#EF4444", whiteSpace: "nowrap" }}>PKR {s.balance?.toLocaleString()}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                        <button className="btn-icon" onClick={() => router.push(`/dashboard/reports/vendor-ledger?supplierId=${s.id}`)} title="View Ledger"><Eye size={13} /></button>
                        {canEdit && companyId && (
                          <CustomerVendorLink
                            partyType="supplier"
                            party={s}
                            companyId={companyId}
                            counterparts={customersForLink}
                            onUpdated={refreshLinkData}
                          />
                        )}
                        {canEdit && (
                          <button className="btn-icon" onClick={() => openEdit(s)} title="Edit"><Edit size={13} /></button>
                        )}
                        {canEdit && (
                          <button className="btn-icon" onClick={() => handleDelete(s.id)} style={{ color: "#EF4444" }} title="Delete"><Trash2 size={13} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
'@
$snew6 = @'
                suppliers.map((s) => {
                  const isArchived = !!s.archived_at
                  return (
                  <tr key={s.id} style={isArchived ? { opacity: 0.5 } : {}}>
                    <td style={tdStyle}><span style={{ fontWeight: 600, color: "var(--primary)" }}>{s.code}</span></td>
                    <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.name}
                      {isArchived && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px" }}>ARCHIVED</span>}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{s.phone || "-"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>PKR {s.opening_balance?.toLocaleString() ?? "0"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: s.balance >= 0 ? "#10B981" : "#EF4444", whiteSpace: "nowrap" }}>PKR {s.balance?.toLocaleString()}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                        <button className="btn-icon" onClick={() => router.push(`/dashboard/reports/vendor-ledger?supplierId=${s.id}`)} title="View Ledger"><Eye size={13} /></button>
                        {canEdit && companyId && (
                          <CustomerVendorLink
                            partyType="supplier"
                            party={s}
                            companyId={companyId}
                            counterparts={customersForLink}
                            onUpdated={refreshLinkData}
                          />
                        )}
                        {canEdit && (
                          <button className="btn-icon" onClick={() => openEdit(s)} title="Edit"><Edit size={13} /></button>
                        )}
                        {canEdit && isArchived && (
                          <button className="btn-icon" onClick={() => restoreSupplier(s)} style={{ color: "#10B981" }} title="Restore"><RotateCcw size={13} /></button>
                        )}
                        {canEdit && !isArchived && (
                          <button
                            className="btn-icon"
                            onClick={() => { if (checkingUsage === null) handleArchiveOrDelete(s) }}
                            style={{ color: "#EF4444" }}
                            title={checkingUsage === s.id ? "Checking..." : "Archive / Delete"}
                            disabled={checkingUsage === s.id}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })
'@
$supContent = Apply-Edit $supContent $sold6 $snew6 "suppliers: row rendering"

$sold7 = @'
      {total > pageSize && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 13, color: "var(--text-muted)" }}>
          <span>Showing {Math.min(pageSize, total - (page-1)*pageSize)} of {total}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn btn-outline" disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
'@
$snew7 = @'
      {total > pageSize && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 13, color: "var(--text-muted)" }}>
          <span>Showing {Math.min(pageSize, total - (page-1)*pageSize)} of {total}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn btn-outline" disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {confirmTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setConfirmTarget(null)}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, maxWidth: 380, width: "90%", boxShadow: "0 12px 32px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
              {confirmTarget._willArchive ? "Archive Supplier?" : "Delete Supplier?"}
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px 0", lineHeight: 1.5 }}>
              {confirmTarget._willArchive
                ? `${confirmTarget.name} has existing balance, bills, or payments, so it will be archived (hidden from the list, fully recoverable) instead of deleted.`
                : `${confirmTarget.name} has no transaction history and can be safely deleted. This cannot be undone.`}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline" onClick={() => setConfirmTarget(null)}>Cancel</button>
              <button className="btn" onClick={confirmArchiveOrDelete}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
'@
$supContent = Apply-Edit $supContent $sold7 $snew7 "suppliers: confirm modal"

# ============ ALL EDITS SUCCEEDED — BACKUP THEN WRITE ============
Copy-Item $custPath "$custPath.bak_$stamp"
Copy-Item $supPath  "$supPath.bak_$stamp"

[System.IO.File]::WriteAllText($custPath, $custContent, $utf8)
[System.IO.File]::WriteAllText($supPath, $supContent, $utf8)

Write-Host "SUCCESS: both files patched. Backups saved with suffix .bak_$stamp"