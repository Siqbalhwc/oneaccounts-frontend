"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye } from "lucide-react"
import RoleGuard from "@/components/RoleGuard"
import { useRole } from "@/contexts/RoleContext"

export default function InvoicesPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!role) return
    if (!canView) { setLoading(false); return }
    supabase
      .from("invoices")
      .select("*")
      .eq("type", "sale")
      .is("deleted_at", null)            // ← hide soft‑deleted
      .order("date", { ascending: false })
      .then(({ data }) => {
        setInvoices(data || [])
        setLoading(false)
      })
  }, [role, canView])

  const filtered = search.trim()
    ? invoices.filter((inv) =>
        inv.invoice_no?.toLowerCase().includes(search.toLowerCase()) ||
        inv.party?.name?.toLowerCase().includes(search.toLowerCase())
      )
    : invoices

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "#94A3B8" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "#E2E8F0" }}><h2>Access Denied</h2></div>

  return (
    <RoleGuard allowedRoles={["admin", "accountant"]}>
      <div style={{ padding: 24, background: "#0B1120", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "#E2E8F0" }}>
        <style>{`
          .card { background: #111827; border: 1px solid #1E293B; border-radius: 12px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
          .input { height: 38px; border: 1px solid #334155; border-radius: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box; background: #1E293B; color: #F1F5F9; }
          .btn { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
          .btn-primary { background: #2563EB; color: white; }
          .btn-outline { background: transparent; border: 1.5px solid #334155; color: #CBD5E1; }
          table { width: 100%; border-collapse: collapse; }
          th { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94A3B8; text-align: left; padding: 8px 6px; border-bottom: 1px solid #1E293B; }
          td { padding: 10px 6px; border-bottom: 1px solid #1E293B; font-size: 13px; }
          tr:hover td { background: #1E293B; }
        `}</style>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9" }}>🧾 Sales Invoices</h1>
            <p style={{ fontSize: 13, color: "#94A3B8" }}>{canEdit ? "Create and manage invoices" : "View invoices"}</p>
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => router.push("/dashboard/invoices/new")}>
              <Plus size={16} /> New Invoice
            </button>
          )}
        </div>

        <div style={{ maxWidth: 300, marginBottom: 16, position: "relative" }}>
          <input className="input" style={{ paddingLeft: 32, width: "100%" }} placeholder="Search invoice…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>No invoices found.</div>
        ) : (
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 600, color: "#93C5FD" }}>{inv.invoice_no}</td>
                    <td>{inv.date}</td>
                    <td>{inv.party?.name || "—"}</td>
                    <td style={{ fontWeight: 600 }}>{inv.total?.toLocaleString()}</td>
                    <td>{inv.status}</td>
                    <td>
                      <button className="btn btn-outline" style={{ padding: 4 }} onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}>
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RoleGuard>
  )
}