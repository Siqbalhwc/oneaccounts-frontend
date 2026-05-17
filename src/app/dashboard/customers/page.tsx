"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

type SortField = "code" | "name" | "phone" | "balance"
type SortDir = "asc" | "desc"

export default function CustomersPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortField, setSortField] = useState<SortField>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  useEffect(() => {
    if (!role) return
    if (!canView) {
      setLoading(false)
      return
    }
    supabase
      .from("customers")
      .select("*")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .then(({ data }) => {
        setCustomers(data || [])
        setLoading(false)
      })
  }, [role, canView])

  // Sorting & filtering
  const filteredCustomers = (() => {
    let list = customers

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (c) =>
          c.code?.toLowerCase().includes(q) ||
          c.name?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
      )
    }

    return [...list].sort((a, b) => {
      let valA = (a[sortField] || "").toString().toLowerCase()
      let valB = (b[sortField] || "").toString().toLowerCase()
      if (sortField === "balance") {
        valA = parseFloat(a.balance || 0)
        valB = parseFloat(b.balance || 0)
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1
      if (valA > valB) return sortDir === "asc" ? 1 : -1
      return 0
    })
  })()

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
  const totalCustomers = filteredCustomers.length
  const totalBalance = filteredCustomers.reduce((s, c) => s + (c.balance || 0), 0)
  const activeCustomers = filteredCustomers.filter(c => (c.balance || 0) > 0).length

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "#94A3B8" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "#E2E8F0" }}><h2>Access Denied</h2></div>

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
        <style>{`
          .card { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.2); overflow: hidden; }
          .header-row { display: grid; grid-template-columns: 80px 1fr 120px 100px 40px; padding: 12px 20px; background: #1E293B; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94A3B8; border-bottom: 1px solid #1E293B; }
          .data-row { display: grid; grid-template-columns: 80px 1fr 120px 100px 40px; padding: 10px 20px; border-bottom: 1px solid #1E293B; font-size: 13px; align-items: center; transition: background 0.15s; }
          .data-row:hover { background: #1E293B; }
          .data-row:last-child { border-bottom: none; }
          .sort-btn { background: none; border: none; cursor: pointer; font: inherit; color: inherit; display: inline-flex; align-items: center; gap: 4px; padding: 0; font-weight: 700; text-transform: uppercase; font-size: 10px; }
          .sort-btn:hover { color: #93C5FD; }
          .search-input { height: 38px; border: 1.5px solid #334155; border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px; width: 260px; box-sizing: border-box; outline: none; font-family: inherit; background: #1E293B; color: #F1F5F9; }
          .search-input:focus { border-color: #64748B; }
          .btn { padding: 8px 16px; border-radius: 8px; border: 1.5px solid #334155; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
          .btn-outline { background: transparent; color: white; border-color: #334155; }
          .btn-outline:hover { background: #1E293B; }
          .btn-icon { background: transparent; border: 1.5px solid #334155; color: #CBD5E1; padding: 6px; border-radius: 8px; cursor: pointer; }
          .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
          .summary-item { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 16px; }
          .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94A3B8; margin-bottom: 4px; }
          .summary-value { font-size: 22px; font-weight: 800; color: #F1F5F9; }
          @media (max-width: 640px) {
            .header-row, .data-row { grid-template-columns: 60px 1fr 80px 60px 30px; }
            .header-row span:nth-child(3), .data-row span:nth-child(3) { display: none; }
            .search-input { width: 100%; }
          }
        `}</style>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>👥 Customers</h1>
            <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>Manage your customer accounts</p>
          </div>
          {canEdit && (
            <button className="btn btn-outline" onClick={() => router.push("/dashboard/customers/new")}>
              <Plus size={16} /> Add Customer
            </button>
          )}
        </div>

        {/* Summary Cards */}
        <div className="summary-grid">
          <div className="summary-item">
            <div className="summary-label">Total Customers</div>
            <div className="summary-value">{totalCustomers}</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Total Balance</div>
            <div className="summary-value" style={{ color: totalBalance >= 0 ? "#10B981" : "#EF4444" }}>
              PKR {totalBalance.toLocaleString()}
            </div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Active</div>
            <div className="summary-value" style={{ color: "#10B981" }}>{activeCustomers}</div>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
          <input
            className="search-input"
            placeholder="Search by code, name, phone, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Customers Table */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading customers…</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>
            No customers found. {canEdit && "Add a customer to get started."}
          </div>
        ) : (
          <div className="card">
            <div className="header-row">
              <button className="sort-btn" onClick={() => handleSort("code")}>Code {getSortIcon("code")}</button>
              <button className="sort-btn" onClick={() => handleSort("name")}>Name {getSortIcon("name")}</button>
              <button className="sort-btn" onClick={() => handleSort("phone")}>Phone {getSortIcon("phone")}</button>
              <button
  className="sort-btn"
  onClick={() => handleSort("balance")}
  style={{ textAlign: "right", justifyContent: "flex-end", paddingRight: "0" }}>Balance {getSortIcon("balance")}</button>
              <span></span>
            </div>
            {filteredCustomers.map((cust) => (
              <div key={cust.id} className="data-row">
                <span style={{ fontWeight: 600, color: "#93C5FD" }}>{cust.code}</span>
                <span style={{ color: "#E2E8F0" }}>{cust.name}</span>
                <span style={{ color: "#94A3B8" }}>{cust.phone || "—"}</span>
                <span style={{ textAlign: "right", fontWeight: 600, color: cust.balance >= 0 ? "#10B981" : "#EF4444" }}>
                  PKR {(cust.balance || 0).toLocaleString()}
                </span>
                <button className="btn-icon" onClick={() => router.push(`/dashboard/reports/customer-ledger?customerId=${cust.id}`)} title="View ledger">
                  <Eye size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  )
}