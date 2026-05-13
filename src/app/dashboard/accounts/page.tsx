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
  // ... keep all existing mappings if you like, or just use a simple default
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
      // Use stored category, fallback to old mapping if null
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

  if (!role) return <div style={{ padding: 24, textAlign: "center" }}>Loading…</div>
  if (!canView) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p style={{ color: "#94A3B8" }}>You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <style>{`
          .ac-card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.04); overflow: hidden; }
          .ac-header { display: grid; grid-template-columns: 70px 1fr 100px 120px 90px; padding: 12px 20px; background: #F8FAFC; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94A3B8; border-bottom: 1px solid #E2E8F0; }
          .ac-row { display: grid; grid-template-columns: 70px 1fr 100px 120px 90px; padding: 10px 20px; border-bottom: 1px solid #F1F5F9; font-size: 13px; align-items: center; transition: background 0.15s; }
          .ac-row:hover { background: #FAFBFF; }
          .ac-row:last-child { border-bottom: none; }
          .ac-sort-btn { background: none; border: none; cursor: pointer; font: inherit; color: inherit; display: inline-flex; align-items: center; gap: 4px; padding: 0; font-weight: 700; text-transform: uppercase; font-size: 10px; }
          .ac-sort-btn:hover { color: #1E3A8A; }
          .ac-search { height: 38px; border: 1.5px solid #E2E8F0; border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px; width: 260px; box-sizing: border-box; outline: none; font-family: inherit; }
          .ac-search:focus { border-color: #1D4ED8; }
          .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
          .btn-primary { background: #1D4ED8; color: white; }
          @media (max-width: 640px) {
            .ac-header, .ac-row { grid-template-columns: 60px 1fr 80px 80px; }
            .ac-header span:nth-child(4), .ac-row span:nth-child(4) { display: none; }
            .ac-search { width: 100%; }
          }
        `}</style>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", margin: 0 }}>📋 Chart of Accounts</h1>
            <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Manage your general ledger accounts</p>
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => router.push("/dashboard/accounts/new")}>
              <Plus size={16} /> Add Account
            </button>
          )}
        </div>

        <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
          <input className="ac-search" placeholder="Filter by code, name, type..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

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
                <span style={{ fontWeight: 600, color: "#1E3A8A" }}>{a.code}</span>
                <span style={{ color: "#334155" }}>{a.name}</span>
                <span style={{ fontSize: 11, color: "#64748B" }}>{a.type}</span>
                <span style={{ fontSize: 11, color: "#475569" }}>{a.category || "—"}</span>
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