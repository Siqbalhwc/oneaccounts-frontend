"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, Edit, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

type SortField = "code" | "name" | "phone" | "balance" | "created_at" | "updated_at"
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
      if (sortField === "balance" || sortField === "created_at" || sortField === "updated_at") {
        valA = a[sortField] || ""
        valB = b[sortField] || ""
        if (sortField === "balance") {
          valA = parseFloat(a.balance || 0)
          valB = parseFloat(b.balance || 0)
        }
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

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this customer? This will not remove their transactions.")) return
    await supabase.from("customers").update({ deleted_at: new Date().toISOString() }).eq("id", id)
    setCustomers(prev => prev.filter(c => c.id !== id))
  }

  // Summary calculations
  const totalCustomers = filteredCustomers.length
  const totalBalance = filteredCustomers.reduce((s, c) => s + (c.balance || 0), 0)
  const activeCustomers = filteredCustomers.filter(c => (c.balance || 0) > 0).length

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
        <style>{`
          .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 0; box-shadow: var(--shadow-sm); overflow: hidden; }
          .header-row {
            display: grid;
            grid-template-columns: 80px 1fr 120px 100px 100px 100px 50px 50px;
            padding: 14px 24px;
            background: var(--card-hover);
            font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);
            border-bottom: 1px solid var(--border);
          }
          .data-row {
            display: grid;
            grid-template-columns: 80px 1fr 120px 100px 100px 100px 50px 50px;
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
          .search-input {
            height: 38px; border: 1.5px solid var(--border); border-radius: 8px;
            padding: 0 12px 0 36px; font-size: 13px; width: 260px;
            box-sizing: border-box; outline: none; font-family: inherit;
            background: var(--card); color: var(--text);
          }
          .search-input:focus { border-color: var(--primary); }
          .btn { padding: 8px 16px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
          .btn-outline { background: transparent; color: var(--text-muted); border-color: var(--border); }
          .btn-outline:hover { background: var(--card-hover); }
          .btn-icon {
            background: transparent; border: 1.5px solid var(--border); color: var(--text-muted);
            padding: 6px; border-radius: 8px; cursor: pointer;
          }
          .btn-icon:hover { background: var(--card-hover); }
          .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
          .summary-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
          .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
          .summary-value { font-size: 22px; font-weight: 800; color: var(--text); }
          @media (max-width: 640px) {
            .header-row, .data-row { grid-template-columns: 60px 1fr 80px 60px 60px 30px 30px; }
            .search-input { width: 100%; }
          }
        `}</style>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>👥 Customers</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Manage your customer accounts</p>
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
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            className="search-input"
            placeholder="Search by code, name, phone, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Customers Table */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading customers…</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            No customers found. {canEdit && "Add a customer to get started."}
          </div>
        ) : (
          <div className="card">
            <div className="header-row">
              <button className="sort-btn" onClick={() => handleSort("code")}>Code {getSortIcon("code")}</button>
              <button className="sort-btn" onClick={() => handleSort("name")}>Name {getSortIcon("name")}</button>
              <button className="sort-btn" onClick={() => handleSort("phone")}>Phone {getSortIcon("phone")}</button>
              <button className="sort-btn" onClick={() => handleSort("balance")} style={{ textAlign: "right", justifyContent: "flex-end" }}>Balance {getSortIcon("balance")}</button>
              <button className="sort-btn" onClick={() => handleSort("created_at")} style={{ fontSize: 10 }}>Created {getSortIcon("created_at")}</button>
              <button className="sort-btn" onClick={() => handleSort("updated_at")} style={{ fontSize: 10 }}>Edited {getSortIcon("updated_at")}</button>
              <span></span>
              <span></span>
            </div>
            {filteredCustomers.map((cust) => (
              <div key={cust.id} className="data-row">
                <span style={{ fontWeight: 600, color: "var(--primary)" }}>{cust.code}</span>
                <span style={{ color: "var(--text)" }}>{cust.name}</span>
                <span style={{ color: "var(--text-muted)" }}>{cust.phone || "—"}</span>
                <span style={{ textAlign: "right", fontWeight: 600, color: cust.balance >= 0 ? "#10B981" : "#EF4444" }}>
                  PKR {(cust.balance || 0).toLocaleString()}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {cust.created_at ? new Date(cust.created_at).toLocaleDateString() : "—"}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {cust.updated_at ? new Date(cust.updated_at).toLocaleDateString() : "—"}
                </span>
                <button className="btn-icon" onClick={() => router.push(`/dashboard/customers/new?id=${cust.id}`)} title="Edit">
                  <Edit size={14} />
                </button>
                <button className="btn-icon" onClick={() => handleDelete(cust.id)} style={{ color: "#EF4444" }} title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  )
}