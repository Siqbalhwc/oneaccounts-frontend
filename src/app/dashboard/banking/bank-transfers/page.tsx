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

function SkeletonRow() {
  return (
    <tr>
      {[60, 50, 50, 40, 50, 80].map((w, i) => (
        <td key={i} style={{ padding: "12px 16px" }}>
          <div style={{
            width: `${w}%`,
            height: 12,
            background: "var(--bg-soft)",
            borderRadius: 4,
            animation: "shimmer 1.5s ease-in-out infinite"
          }} />
        </td>
      ))}
    </tr>
  )
}

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

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  const fetchData = async () => {
    if (!companyId) return
    setLoading(true)

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

  // Shared th/td styles (identical to invoice page)
  const thStyle: React.CSSProperties = {
    padding: "12px 16px",
    background: "var(--card-hover)",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    userSelect: "none",
  }
  const tdStyle: React.CSSProperties = {
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
    verticalAlign: "middle",
  }

  const SortTh = ({ field, children, style }: { field: SortField; children: React.ReactNode; style?: React.CSSProperties }) => (
    <th style={{ ...thStyle, ...style }}>
      <button
        onClick={() => handleSort(field)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          font: "inherit", fontSize: 12, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)",
          display: "inline-flex", alignItems: "center", gap: 4, padding: 0,
          whiteSpace: "nowrap",
        }}
      >
        {children} {getSortIcon(field)}
      </button>
    </th>
  )

  return (
    <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
        .transfer-table { width: 100%; border-collapse: collapse; }
        .transfer-table tbody tr:last-child td { border-bottom: none; }
        .transfer-table tbody tr:hover td { background: var(--card-hover); }
        .btn {
          padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          color: white; border: none; transition: all 0.2s;
        }
        .btn:hover {
          background: linear-gradient(135deg, #1E55E8 0%, #0F2280 100%);
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(7,19,82,0.45);
        }
        .btn-outline {
          background: transparent; color: var(--text-muted); border: 1.5px solid var(--border);
        }
        .btn-outline:hover {
          background: var(--card-hover);
          transform: translateY(-1px);
          box-shadow: none;
        }
        .search-input {
          width: 100%; height: 38px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px;
          background: var(--card); color: var(--text); outline: none;
          box-sizing: border-box;
        }
        .search-input:focus { border-color: var(--primary); }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px; margin-bottom: 20px;
        }
        .summary-item {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px;
        }
        .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
        .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
        .card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; overflow: hidden;
          box-shadow: var(--shadow-sm);
        }
        .table-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }
        .table-scroll::-webkit-scrollbar { height: 4px; }
        .table-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .transfer-table { min-width: 700px; }

        @media (max-width: 480px) {
          .page-wrap { padding: 12px !important; }
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>↔️ Bank Transfers</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Record transfers between your bank accounts</p>
        </div>
        {canEdit && (
          <button className="btn" onClick={() => router.push("/dashboard/banking/bank-transfers/new")}>
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
        <div className="summary-item"><div className="summary-label">Total Transfers</div><div className="summary-value">{filtered.length}</div></div>
        <div className="summary-item"><div className="summary-label">Total Amount</div><div className="summary-value" style={{ color: "#F59E0B" }}>PKR {totalAmount.toLocaleString()}</div></div>
      </div>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="search-input" placeholder="Search account name, code, or reference..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="transfer-table">
            <colgroup>
              <col style={{ width: 100 }} /> {/* Date */}
              <col />                         {/* From Account – takes remaining space */}
              <col />                         {/* To Account – takes remaining space */}
              <col style={{ width: 120 }} /> {/* Amount */}
              <col style={{ width: 130 }} /> {/* Reference */}
              <col style={{ width: 90  }} /> {/* Actions (none, just spacer) */}
            </colgroup>
            <thead>
              <tr>
                <SortTh field="transfer_date">Date</SortTh>
                <SortTh field="from_code" style={{ textAlign: "left" }}>From Account</SortTh>
                <SortTh field="to_code" style={{ textAlign: "left" }}>To Account</SortTh>
                <SortTh field="amount" style={{ textAlign: "right" }}>Amount</SortTh>
                <SortTh field="reference" style={{ textAlign: "left" }}>Reference</SortTh>
                <th style={{ ...thStyle, textAlign: "center" }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : sortedFiltered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                    No transfers recorded yet. {canEdit && 'Click "New Transfer" to record one.'}
                  </td>
                </tr>
              ) : (
                sortedFiltered.map((t) => (
                  <tr key={t.id}>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{new Date(t.transfer_date).toLocaleDateString()}</td>
                    <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.from_code} - {t.from_name}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.to_code} - {t.to_name}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, whiteSpace: "nowwrap" }}>
                      PKR {t.amount.toLocaleString()}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{t.reference || "—"}</td>
                    <td style={tdStyle}></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}