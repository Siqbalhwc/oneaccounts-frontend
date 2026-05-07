"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"

export default function AccountantDashboard({ role }: { role: string }) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  const [companyId, setCompanyId] = useState("00000000-0000-0000-0000-000000000001")
  const [pendingBills, setPendingBills] = useState<any[]>([])
  const [recentEntries, setRecentEntries] = useState<any[]>([])
  const [todayCounts, setTodayCounts] = useState({ bills: 0, receipts: 0, payments: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const cid = (user.app_metadata as any)?.company_id || companyId
        setCompanyId(cid)

        // Pending bills (unpaid purchase invoices)
        const { data: bills } = await supabase
          .from("invoices")
          .select("id, invoice_no, party_id, date, total, suppliers(name)")
          .eq("company_id", cid)
          .eq("type", "purchase")
          .eq("status", "Unpaid")
          .order("date", { ascending: false })
          .limit(6)
        setPendingBills(bills || [])

        // Recent journal entries
        const { data: entries } = await supabase
          .from("journal_entries")
          .select("id, entry_no, date, description, journal_lines(debit, credit, accounts(code,name))")
          .eq("company_id", cid)
          .order("created_at", { ascending: false })
          .limit(10)
        setRecentEntries(entries || [])

        // Today's counts
        const today = new Date().toISOString().split('T')[0]
        const { count: billCount } = await supabase
          .from("invoices")
          .select("*", { count: "exact", head: true })
          .eq("company_id", cid)
          .eq("type", "purchase")
          .gte("created_at", today)
        const { count: receiptCount } = await supabase
          .from("receipts")
          .select("*", { count: "exact", head: true })
          .eq("company_id", cid)
          .gte("created_at", today)
        const { count: paymentCount } = await supabase
          .from("payments")
          .select("*", { count: "exact", head: true })
          .eq("company_id", cid)
          .gte("created_at", today)

        setTodayCounts({
          bills: billCount || 0,
          receipts: receiptCount || 0,
          payments: paymentCount || 0,
        })
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  if (loading) return <div style={{ padding: 40, textAlign: "center", background: "#f0fdf4", minHeight: "100vh" }}>Loading accountant dashboard...</div>

  return (
    <div style={{ background: "#f0fdf4", minHeight: "100vh", fontFamily: "Segoe UI, system-ui, sans-serif", padding: "20px 24px" }}>
      <style>{`
        .acc-card { background: white; border-radius: 12px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .acc-btn { padding: 10px 16px; border-radius: 8px; border: none; font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-teal { background: #0d9488; color: white; }
        .btn-outline { background: white; border: 1px solid #e2e8f0; color: #475569; }
        .badge { padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; }
        .badge-unpaid { background: #fef2f2; color: #991b1b; }
        .badge-paid { background: #f0fdf4; color: #166534; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; text-align: left; padding-bottom: 8px; border-bottom: 1px solid #f1f5f9; }
        td { padding: 8px 0; border-bottom: 1px solid #f8fafc; font-size: 13px; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0 }}>Accountant Dashboard</h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>Daily operations & quick actions</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <span style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: "#0d9488", color: "white" }}>Today</span>
        </div>
      </div>

      {/* Today's work counters */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        <div className="acc-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#0d9488" }}>{todayCounts.bills}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Bills Entered Today</div>
        </div>
        <div className="acc-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#0d9488" }}>{todayCounts.receipts}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Receipts Today</div>
        </div>
        <div className="acc-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#0d9488" }}>{todayCounts.payments}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Payments Today</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Quick Actions</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="acc-btn btn-teal" onClick={() => router.push("/dashboard/bills/new")}>📄 New Purchase Bill</button>
          <button className="acc-btn btn-teal" onClick={() => router.push("/dashboard/invoices/new")}>🧾 New Invoice</button>
          <button className="acc-btn btn-teal" onClick={() => router.push("/dashboard/receipts/new")}>✅ New Receipt</button>
          <button className="acc-btn btn-teal" onClick={() => router.push("/dashboard/payments/new")}>💳 New Payment</button>
          <button className="acc-btn btn-outline" onClick={() => router.push("/dashboard/settings/budgets")}>🎯 Budget Entry</button>
        </div>
      </div>

      {/* Pending Bills */}
      <div className="acc-card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Pending Supplier Bills</h3>
        <table>
          <thead>
            <tr>
              <th>Bill #</th>
              <th>Supplier</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pendingBills.map(bill => (
              <tr key={bill.id}>
                <td style={{ fontWeight: 600 }}>{bill.invoice_no}</td>
                <td>{bill.suppliers?.name}</td>
                <td>{bill.date}</td>
                <td style={{ fontWeight: 700 }}>PKR {bill.total?.toLocaleString()}</td>
                <td><span className="badge badge-unpaid">Unpaid</span></td>
              </tr>
            ))}
            {pendingBills.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "#94a3b8", padding: 20 }}>No pending bills.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Recent Journal Entries */}
      <div className="acc-card">
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Recent Journal Entries</h3>
        <table>
          <thead>
            <tr>
              <th>Entry #</th>
              <th>Date</th>
              <th>Description</th>
              <th>Lines</th>
            </tr>
          </thead>
          <tbody>
            {recentEntries.map(entry => (
              <tr key={entry.id}>
                <td style={{ fontWeight: 600 }}>{entry.entry_no}</td>
                <td>{entry.date}</td>
                <td>{entry.description}</td>
                <td>
                  {entry.journal_lines?.map((line: any, i: number) => (
                    <div key={i} style={{ fontSize: 11 }}>
                      {line.accounts?.code} — {line.accounts?.name} : Dr {line.debit} / Cr {line.credit}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
            {recentEntries.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: "center", color: "#94a3b8", padding: 20 }}>No recent entries.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}