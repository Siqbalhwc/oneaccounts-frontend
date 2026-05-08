"use client"

import { useState, useEffect, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import { Plus, Search, X, Edit, Trash2 } from "lucide-react"

interface Customer {
  id: number
  code: string
  name: string
  phone: string
  email: string
  payment_terms: string
  balance: number
}

export default function CustomersPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const canEdit = role === "admin" || role === "accountant"
  const canView = role === "admin" || role === "accountant"

  const [companyId, setCompanyId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 25

  // ── 1. Get REAL company ID from user metadata ────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
      else setCompanyId("") // will show a message later
    })
  }, [])

  // ── 2. Fetch customers only when companyId is known ───
  useEffect(() => {
    if (!companyId) return
    setLoading(true)

    const start = (page - 1) * pageSize
    const end = start + pageSize - 1

    let query = supabase
      .from("customers")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .order("name")

    if (search.trim()) {
      query = query.or(
        `name.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
      )
    }

    query.range(start, end).then(({ data, count }) => {
      setCustomers(data || [])
      setTotal(count || 0)
      setLoading(false)
    })
  }, [companyId, search, page])

  // ── While company ID is loading, show a clean message ──
  if (!companyId) {
    return (
      <div style={{ padding: 40, textAlign: "center", fontFamily: "Arial" }}>
        <p>Loading your company data…</p>
      </div>
    )
  }

  if (!canView) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h2>Access Denied</h2>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, fontFamily: "Arial", background: "#EFF4FB", minHeight: "100vh" }}>
      <style>{`
        .card { background: white; border-radius: 12px; border: 1px solid #E2E8F0; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .input { width: 100%; height: 38px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0 12px; font-size: 13px; }
        .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; }
        .btn-primary { background: #1D4ED8; color: white; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94A3B8; text-align: left; padding: 8px 6px; border-bottom: 1px solid #E2E8F0; }
        td { padding: 10px 6px; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
        tr:hover td { background: #FAFBFF; }
        .pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; font-size: 13px; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>👥 Customers</h2>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
            Manage customer accounts, view balances, and transactions
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => alert("Add customer modal – implement similar to Projects page")}>
            <Plus size={16} /> Add Customer
          </button>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Customers</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{total}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Total Receivables</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            PKR {customers.reduce((s, c) => s + (c.balance || 0), 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 12, position: "relative" }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: 12, color: "#94A3B8" }} />
        <input
          className="input"
          style={{ paddingLeft: 32 }}
          placeholder="Search by code, name, phone or email..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      {/* Table */}
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Terms</th>
              <th style={{ textAlign: "right" }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 20 }}>Loading...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 20, color: "#94A3B8" }}>
                {search ? "No matching customers found." : "No customers yet. Add your first customer above."}
              </td></tr>
            ) : (
              customers.map((cust) => (
                <tr key={cust.id}>
                  <td style={{ fontWeight: 600 }}>{cust.code}</td>
                  <td>{cust.name}</td>
                  <td>{cust.phone}</td>
                  <td>{cust.email || "—"}</td>
                  <td>{cust.payment_terms}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>
                    PKR {cust.balance?.toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="pagination">
          <span>Showing {Math.min(pageSize, total - (page-1)*pageSize)} of {total}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn" disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  )
}