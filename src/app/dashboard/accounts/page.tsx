"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Plus, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

// Fallback category mapping for accounts without a stored category
function getFallbackCategory(code?: string): string {
  if (!code) return "—"
  const num = parseFloat(code)
  if (isNaN(num)) return "—"
  if (num >= 1000 && num <= 1099) return "Cash & Bank"
  if (num >= 1100 && num <= 1199) return "Accounts Receivable"
  if (num >= 1200 && num <= 1299) return "Inventory"
  if (num >= 1300 && num <= 1399) return "Other Current Assets"
  if (num >= 1400 && num <= 1499) return "Fixed Assets"
  if (num >= 1500 && num <= 1599) return "Vehicles"
  if (num >= 2000 && num <= 2099) return "Accounts Payable"
  if (num >= 2100 && num <= 2199) return "Other Current Liabilities"
  if (num >= 3000 && num <= 3099) return "Equity"
  if (num >= 4000 && num <= 4099) return "Revenue"
  if (num >= 5000 && num <= 5099) return "Direct Expenses"
  if (num >= 5100 && num <= 5199) return "Operating Expenses"
  return "—"
}

type SortField = "code" | "name" | "type" | "category"
type SortDir = "asc" | "desc"

export default function AccountsPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin"

  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("code")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  useEffect(() => {
    if (!role) return
    if (!canView) { setLoading(false); return }
    supabase
      .from("accounts")
      .select("*")
      .order("code", { ascending: true })
      .then(({ data }) => {
        setAccounts(data || [])
        setLoading(false)
      })
  }, [role, canView])

  const filteredAccounts = useMemo(() => {
    let list = accounts.map(a => ({
      ...a,
      category: a.category || getFallbackCategory(a.code),
    }))

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        a.code?.toLowerCase().includes(q) ||
        a.name?.toLowerCase().includes(q) ||
        a.type?.toLowerCase().includes(q) ||
        (a.category || "").toLowerCase().includes(q)
      )
    }

    list = [...list].sort((a, b) => {
      let valA = (a[sortField] || "").toString().toLowerCase()
      let valB = (b[sortField] || "").toString().toLowerCase()
      if (sortField === "code") {
        const numA = parseFloat(a.code)
        const numB = parseFloat(b.code)
        if (!isNaN(numA) && !isNaN(numB)) {
          valA = numA.toString().padStart(10, "0")
          valB = numB.toString().padStart(10, "0")
        }
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1
      if (valA > valB) return sortDir === "asc" ? 1 : -1
      return 0
    })

    return list
  }, [accounts, search, sortField, sortDir])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  // Summary calculations
  const totalAccounts = filteredAccounts.length
  const totalAssets = filteredAccounts.filter(a => a.type === "Asset").reduce((s, a) => s + (a.balance || 0), 0)
  const totalLiabilities = filteredAccounts.filter(a => a.type === "Liability").reduce((s, a) => s + (a.balance || 0), 0)
  const totalEquity = filteredAccounts.filter(a => a.type === "Equity").reduce((s, a) => s + (a.balance || 0), 0)

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "#94A3B8" }}>Loading…</div>
  if (!canView) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#E2E8F0" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
        <style>{`
          .ac-card { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.2); overflow: hidden; }
          .ac-header { display: grid; grid-template-columns: 70px 1fr 100px 120px 90px; padding: 12px 20px; background: #1E293B; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94A3B8; border-bottom: 1px solid #1E293B; }
          .ac-row { display: grid; grid-template-columns: 70px 1fr 100px 120px 90px; padding: 10px 20px; border-bottom: 1px solid #1E293B; font-size: 13px; align-items: center; transition: background 0.15s; }
          .ac-row:hover { background: #1E293B; }
          .ac-row:last-child { border-bottom: none; }
          .ac-sort-btn { background: none; border: none; cursor: pointer; font: inherit; color: inherit; display: inline-flex; align-items: center; gap: 4px; padding: 0; font-weight: 700; text-transform: uppercase; font-size: 10px; }
          .ac-sort-btn:hover { color: #93C5FD; }
          .ac-search { height: 38px; border: 1.5px solid #334155; border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px; width: 260px; box-sizing: border-box; outline: none; font-family: inherit; background: #1E293B; color: #F1F5F9; }
          .ac-search:focus { border-color: #64748B; }
          .btn { padding: 8px 16px; border-radius: 8px; border: 1.5px solid #334155; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
          .btn-outline { background: transparent; color: white; border-color: #334155; }
          .btn-outline:hover { background: #1E293B; }
          .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
          .summary-item { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 16px; }
          .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94A3B8; margin-bottom: 4px; }
          .summary-value { font-size: 22px; font-weight: 800; color: #F1F5F9; }
          @media (max-width: 640px) {
            .ac-header, .ac-row { grid-template-columns: 60px 1fr 80px 80px; }
            .ac-header span:nth-child(4), .ac-row span:nth-child(4) { display: none; }
            .ac-search { width: 100%; }
          }
        `}</style>

        {/* Header with Add Account button */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>📋 Chart of Accounts</h1>
            <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Manage your general ledger accounts</p>
          </div>
          {canEdit && (
            <button className="btn btn-outline" onClick={() => router.push("/dashboard/accounts/new")}>
              <Plus size={16} /> Add Account
            </button>
          )}
        </div>

        {/* Summary Cards */}
        <div className="summary-grid">
          <div className="summary-item">
            <div className="summary-label">Total Accounts</div>
            <div className="summary-value">{totalAccounts}</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Total Assets</div>
            <div className="summary-value" style={{ color: "#10B981" }}>PKR {totalAssets.toLocaleString()}</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Total Liabilities</div>
            <div className="summary-value" style={{ color: "#EF4444" }}>PKR {totalLiabilities.toLocaleString()}</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Total Equity</div>
            <div className="summary-value" style={{ color: "#F59E0B" }}>PKR {totalEquity.toLocaleString()}</div>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
          <input className="ac-search" placeholder="Filter by code, name, type..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading accounts…</div>
        ) : filteredAccounts.length === 0 ? (
          <div className="ac-card" style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>
            No accounts found. {canEdit && "Add a new account to get started."}
          </div>
        ) : (
          <div className="ac-card">
            <div className="ac-header">
              <button className="ac-sort-btn" onClick={() => handleSort("code")}>Code {getSortIcon("code")}</button>
              <button className="ac-sort-btn" onClick={() => handleSort("name")}>Name {getSortIcon("name")}</button>
              <button className="ac-sort-btn" onClick={() => handleSort("type")}>Type {getSortIcon("type")}</button>
              <button className="ac-sort-btn" onClick={() => handleSort("category")}>Category {getSortIcon("category")}</button>
              <span style={{ textAlign: "right" }}>Balance</span>
            </div>
            {filteredAccounts.map(a => (
              <div key={a.id} className="ac-row">
                <span style={{ fontWeight: 600, color: "#93C5FD" }}>{a.code}</span>
                <span style={{ color: "#E2E8F0" }}>{a.name}</span>
                <span style={{ fontSize: 11, color: "#94A3B8" }}>{a.type}</span>
                <span style={{ fontSize: 11, color: "#94A3B8" }}>{a.category || "—"}</span>
                <span style={{ textAlign: "right", fontWeight: 600, color: a.balance >= 0 ? "#10B981" : "#EF4444" }}>
                  PKR {(a.balance || 0).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  )
}