"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Search } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"

export default function SalaryStructuresPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [payrollEnabled, setPayrollEnabled] = useState(false)
  const [checkingFeature, setCheckingFeature] = useState(true)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) return
        const cid = (user?.app_metadata as any)?.company_id
        if (!cid) { setCheckingFeature(false); return }

        const { data: feat } = await supabase
          .from("features")
          .select("id")
          .eq("code", "payroll")
          .maybeSingle()

        if (feat && !cancelled) {
          const { data: cf } = await supabase
            .from("company_features")
            .select("enabled")
            .eq("company_id", cid)
            .eq("feature_id", feat.id)
            .maybeSingle()

          if (!cancelled) {
            setPayrollEnabled(cf?.enabled === true)
          }
        }
      } catch (_) {
        // ignore errors
      } finally {
        if (!cancelled) setCheckingFeature(false)
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  if (checkingFeature) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  }

  if (!payrollEnabled) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>
        <h2>Payroll feature is not enabled.</h2>
        <p>Enable it in the Feature Manager.</p>
      </div>
    )
  }

  const [structures, setStructures] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [companyId, setCompanyId] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!role || !canView || !companyId) return
    setLoading(true)
    supabase
      .from("salary_structures")
      .select("*")
      .eq("company_id", companyId)
      .order("name")
      .then(({ data }) => {
        setStructures(data || [])
        setLoading(false)
      })
  }, [role, canView, companyId])

  const filtered = search.trim()
    ? structures.filter(s => s.name?.toLowerCase().includes(search.toLowerCase()))
    : structures

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div className="page-wrap" style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 12px; overflow: hidden; box-shadow: var(--shadow-sm);
        }
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
        .search-input {
          width: 100%; height: 38px; border: 1.5px solid var(--border);
          border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px;
          background: var(--card); color: var(--text); outline: none;
          box-sizing: border-box;
        }
        .search-input:focus { border-color: var(--primary); }
        .table { width: 100%; border-collapse: collapse; }
        .table th, .table td {
          padding: 12px 16px; border-bottom: 1px solid var(--border);
          text-align: left; font-size: 13px;
        }
        .table th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
        .table tr:hover td { background: var(--card-hover); }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📊 Salary Structures</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{canEdit ? "Manage salary structures" : "View salary structures"}</p>
        </div>
        {canEdit && (
          <button className="btn" onClick={() => router.push("/dashboard/payroll/salary-structures/new")}>
            <Plus size={16} /> New Structure
          </button>
        )}
      </div>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input className="search-input" placeholder="Search by name..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={2} style={{ textAlign: "center", padding: 20 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={2} style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>No salary structures found.</td></tr>
            ) : (
              filtered.map(s => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td style={{ fontWeight: 600, color: "var(--primary)" }}>{s.name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}