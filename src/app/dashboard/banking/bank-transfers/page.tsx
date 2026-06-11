"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowRightLeft, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRole } from "@/contexts/RoleContext"

interface Transfer {
  id: number
  from_account_id: number
  to_account_id: number
  amount: number
  transfer_date: string
  reference: string
  notes: string
  created_at: string
  from_code?: string
  from_name?: string
  to_code?: string
  to_name?: string
  created_by?: string | null
  updated_by?: string | null
}

type SortField = "transfer_date" | "from_code" | "to_code" | "amount" | "reference"
type SortDir = "asc" | "desc"

export default function BankTransfersPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role, loading: roleLoading } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [flash, setFlash] = useState("")

  const [sortField, setSortField] = useState<SortField>("transfer_date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  // ✅ No fallback – wait for real company ID from JWT
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  const fetchData = async () => {
    if (!companyId) return
    setLoading(true)

    // Fetch all asset accounts (bank accounts) for the current company
    const { data: accountData } = await supabase
      .from("accounts")
      .select("id, code, name, balance")
      .eq("company_id", companyId)
      .eq("type", "Asset")
      .order("code")

    const { data: transferData } = await supabase
      .from("bank_transfers")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })

    const accountMap: Record<number, any> = {}
    accountData?.forEach((a: any) => { accountMap[a.id] = a })

    const enrichedTransfers = transferData?.map((t: any) => ({
      ...t,
      from_code: accountMap[t.from_account_id]?.code || "—",
      from_name: accountMap[t.from_account_id]?.name || "—",
      to_code: accountMap[t.to_account_id]?.code || "—",
      to_name: accountMap[t.to_account_id]?.name || "—",
    })) || []

    setTransfers(enrichedTransfers)
    setLoading(false)
  }

  useEffect(() => { if (companyId) fetchData() }, [companyId])

  if (!companyId || roleLoading || !role) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading company data…</div>
  }
  if (!canView) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "var(--text-muted)" }}>You do not have permission to view this page.</p>
      </div>
    )
  }

  const filtered = search.trim()
    ? transfers.filter(t =>
        (t.from_code || "").toLowerCase().includes(search.toLowerCase()) ||
        (t.from_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (t.to_code || "").toLowerCase().includes(search.toLowerCase()) ||
        (t.to_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (t.reference || "").toLowerCase().includes(search.toLowerCase())
      )
    : transfers

  const sortedFiltered = [...filtered].sort((a, b) => {
    let valA: any, valB: any
    if (sortField === "from_code") {
      valA = (a.from_code || "").toLowerCase()
      valB = (b.from_code || "").toLowerCase()
    } else if (sortField === "to_code") {
      valA = (a.to_code || "").toLowerCase()
      valB = (b.to_code || "").toLowerCase()
    } else if (sortField === "amount") {
      valA = Number(a.amount) || 0
      valB = Number(b.amount) || 0
    } else {
      valA = (a[sortField] || "").toString().toLowerCase()
      valB = (b[sortField] || "").toString().toLowerCase()
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1
    if (valA > valB) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const totalAmount = sortedFiltered.reduce((sum, t) => sum + (t.amount || 0), 0)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 0; box-shadow: var(--shadow-sm); overflow: hidden; }
        .table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .table-grid { min-width: 900px; }
        .header-row {
          display: grid;
          grid-template-columns: 100px 1fr 1fr 100px 1fr 130px;
          column-gap: 8px;
          padding: 14px 24px;
          font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
          border-bottom: 1px solid var(--border);
          background: var(--card);
        }
        .data-row {
          display: grid;
          grid-template-columns: 100px 1fr 1fr 100px 1fr 130px;
          column-gap: 8px;
          padding: 12px 24px;
          border-bottom: 1px solid var(--border);
          font-size: 13px; align-items: center;
          transition: background 0.15s;
        }
        .data-row:hover { background: var(--card-hover); }
        .data-row:last-child { border-bottom: none; }
        .sort-btn {
          background: none; border: none; cursor: pointer; font: inherit; color: var(--text-muted);
          display: inline-flex; align-items: center; gap: 4px; padding: 0;
          font-weight: 700; text-transform: uppercase; font-size: 10px;
        }
        .sort-btn:hover { color: var(--primary); }
        .btn {
          padding: 8px 16px; border-radius: 8px; border: 1.5px solid var(--border);
          font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
        }
        .btn-outline { background: transparent; color: var(--text-muted); border-color: var(--border); }
        .btn-outline:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .input {
          height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px 0 36px;
          font-size: 13px; width: 260px; box-sizing: border-box; outline: none;
          font-family: inherit; background: var(--card); color: var(--text);
        }
        .input:focus { border-color: var(--primary); }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
        .creator-editor-cell {
          display: flex; flex-direction: column; font-size: 11px; color: var(--text-muted);
          line-height: 1.3; word-wrap: break-word;
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>↔️ Bank Transfers</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Record transfers between your bank accounts</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => router.push("/dashboard/banking/bank-transfers/new")}>
            <ArrowRightLeft size={16} /> New Transfer
          </button>
        )}
      </div>

      {flash && (
        <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {flash}
        </div>
      )}

      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">Total Transfers</div>
          <div className="summary-value">{filtered.length}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Total Amount</div>
          <div className="summary-value" style={{ color: "#F59E0B" }}>PKR {totalAmount.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input
          className="input"
          placeholder="Search account name, code, or reference..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading transfers...</div>
        ) : sortedFiltered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            No transfers recorded yet. {canEdit && 'Click "New Transfer" to record one.'}
          </div>
        ) : (
          <div className="table-wrapper">
            <div className="table-grid">
              <div className="header-row">
                <button className="sort-btn" onClick={() => handleSort("transfer_date")}>Date {getSortIcon("transfer_date")}</button>
                <button className="sort-btn" onClick={() => handleSort("from_code")}>From Account {getSortIcon("from_code")}</button>
                <button className="sort-btn" onClick={() => handleSort("to_code")}>To Account {getSortIcon("to_code")}</button>
                <button className="sort-btn" onClick={() => handleSort("amount")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Amount {getSortIcon("amount")}</button>
                <button className="sort-btn" onClick={() => handleSort("reference")}>Reference {getSortIcon("reference")}</button>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                  Created / Edited By
                </span>
              </div>
              {sortedFiltered.map(t => (
                <div key={t.id} className="data-row">
                  <span>{new Date(t.transfer_date).toLocaleDateString()}</span>
                  <span>{t.from_code} - {t.from_name}</span>
                  <span>{t.to_code} - {t.to_name}</span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>PKR {t.amount.toLocaleString()}</span>
                  <span style={{ color: "var(--text-muted)" }}>{t.reference || "—"}</span>
                  <div className="creator-editor-cell">
                    <span>Created: {t.created_by || "—"}</span>
                    <span>Edited: {t.updated_by || "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}