"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { useCompany } from "@/contexts/CompanyContext"

interface KpiData {
  totalReceivables: number
  totalPayables: number
  cashBalance: number
  overdueBillsCount: number
  overdueBills: any[]
  recentTransactions: any[]
}

function fmt(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `PKR ${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `PKR ${(abs / 1_000).toFixed(1)}K`
  return `PKR ${abs.toLocaleString()}`
}

export default function AccountantDashboard({ role }: { role: string }) {
  const router = useRouter()
  const { companyId } = useCompany()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<KpiData>({
    totalReceivables: 0,
    totalPayables: 0,
    cashBalance: 0,
    overdueBillsCount: 0,
    overdueBills: [],
    recentTransactions: [],
  })
  const [userDisplayName, setUserDisplayName] = useState("")

  useEffect(() => {
    if (!companyId) return
    fetchData()

    // Fetch user name
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const fullName =
        (user.user_metadata as any)?.full_name ||
        (user.user_metadata as any)?.name ||
        user.email?.split("@")[0] ||
        "User"
      setUserDisplayName(fullName)
    })
  }, [companyId])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Wrap each query in Promise.all with individual catch
      const [customers, suppliers, bankAccounts, cashAccount, overdueBills, journalLines] = await Promise.all([
        supabase.from("customers").select("balance").eq("company_id", companyId).then(r => r).catch(() => null),
        supabase.from("suppliers").select("balance").eq("company_id", companyId).then(r => r).catch(() => null),
        supabase.from("bank_accounts").select("current_balance").eq("company_id", companyId).then(r => r).catch(() => null),
        supabase.from("accounts").select("balance").eq("company_id", companyId).eq("code", "1000").maybeSingle().then(r => r).catch(() => null),
        supabase
          .from("invoices")
          .select("id, invoice_no, due_date, total, paid, status, suppliers(name)")
          .eq("company_id", companyId)
          .eq("type", "purchase")
          .in("status", ["Unpaid", "Partial"])
          .lt("due_date", new Date().toISOString().split("T")[0])
          .order("due_date", { ascending: true })
          .limit(5)
          .then(r => r).catch(() => null),
        supabase
          .from("journal_lines")
          .select("debit, credit, accounts(code,name), journal_entries!inner(date,description)")
          .eq("company_id", companyId)
          .order("journal_entries(date)", { ascending: false })
          .limit(10)
          .then(r => r).catch(() => null),
      ])

      const totalReceivables = (customers?.data || []).reduce((s: number, c: any) => s + (c.balance || 0), 0)
      const totalPayables = (suppliers?.data || []).reduce((s: number, s2: any) => s + (s2.balance || 0), 0)
      const bankCash = (bankAccounts?.data || []).reduce((s: number, b: any) => s + (b.current_balance || 0), 0)
      const cash = cashAccount?.data?.balance || 0
      const cashBalance = bankCash + cash
      const overdueBillsCount = (overdueBills?.data || []).length

      const recentTransactions = (journalLines?.data || []).map((jl: any) => ({
        date: jl.journal_entries?.date?.split("T")[0],
        description: jl.journal_entries?.description,
        accountCode: jl.accounts?.code,
        accountName: jl.accounts?.name,
        debit: jl.debit || 0,
        credit: jl.credit || 0,
      }))

      setData({
        totalReceivables,
        totalPayables,
        cashBalance,
        overdueBillsCount,
        overdueBills: overdueBills?.data || [],
        recentTransactions,
      })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)", color: "var(--text-muted)" }}>
        Loading accountant dashboard…
      </div>
    )
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)", padding: "0.8rem 1.2rem" }}>
      <style>{`
        .acct * { box-sizing: border-box; }
        .acct .card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px;
          box-shadow: var(--shadow-sm);
        }
        .acct .kpi-label {
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          margin-bottom: 6px;
        }
        .acct .kpi-value {
          font-size: 1.7rem;
          font-weight: 800;
          line-height: 1.2;
        }
        .acct .kpi-meta {
          font-size: 0.8rem;
          color: var(--text-muted);
          margin-top: 4px;
        }
        .acct .hero {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 1rem 1.5rem;
          margin-bottom: 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.8rem;
        }
        .acct .greeting h2 {
          font-size: 1.3rem;
          font-weight: 700;
          color: var(--text);
        }
        .acct .greeting p {
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .acct .date-range {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .acct .date-range label {
          font-size: 0.8rem;
          color: var(--text-muted);
        }
        .acct .date-range input {
          padding: 6px 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-family: inherit;
          font-size: 0.8rem;
          background: var(--bg);
          color: var(--text);
        }
        .acct .kpi-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        .acct .two-col {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 24px;
          margin-bottom: 24px;
        }
        .acct table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.8rem;
        }
        .acct th {
          text-align: left;
          padding: 8px 12px;
          border-bottom: 2px solid var(--border);
          color: var(--text-muted);
          font-weight: 600;
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .acct td {
          padding: 8px 12px;
          border-bottom: 1px solid var(--border);
          color: var(--text);
        }
        .acct .status-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.65rem;
          font-weight: 600;
        }
        .status-unpaid { background: #fee2e2; color: #991b1b; }
        .status-partial { background: #fef9c3; color: #854d0e; }
        .acct .quick-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 12px;
        }
        .acct .quick-action-btn {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px;
          text-align: center;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text);
          cursor: pointer;
          transition: 0.15s;
        }
        .acct .quick-action-btn:hover {
          background: var(--primary);
          color: var(--primary-text);
          border-color: var(--primary);
        }

        @media (max-width: 1024px) {
          .acct .kpi-row { grid-template-columns: repeat(2, 1fr); }
          .acct .two-col { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
          .acct .kpi-row { grid-template-columns: repeat(2, 1fr); }
          .acct .hero { flex-direction: column; align-items: flex-start; }
          .acct .two-col {
            display: flex;
            flex-direction: column;
            gap: 24px;
          }
          .acct .recent-transactions-card {
            order: 2;
          }
          .acct .right-column-card {
            order: 1;
            display: flex;
            flex-direction: column;
            gap: 24px;
          }
          .acct .quick-actions-card {
            order: -1;
          }
          .acct .quick-actions { grid-template-columns: 1fr 1fr; }
          .acct table { font-size: 0.7rem; }
          .acct th, .acct td { padding: 6px 8px; }
        }
        @media (max-width: 380px) {
          .acct .kpi-row { grid-template-columns: 1fr; }
          .acct .quick-actions { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="acct">
        <div className="hero">
          <div className="greeting">
            <h2>{getGreeting()}, {userDisplayName || "User"}</h2>
            <p>Here’s your accounting snapshot for today</p>
          </div>
          <div className="date-range">
            <label>From</label>
            <input type="date" defaultValue="2026-01-01" />
            <label>to</label>
            <input type="date" defaultValue="2026-12-31" />
          </div>
        </div>

        <div className="kpi-row">
          {[
            { label: "💰 Total Receivables", value: fmt(data.totalReceivables), color: "#f97316", meta: `${data.overdueBillsCount} overdue bills` },
            { label: "📤 Total Payables",      value: fmt(data.totalPayables),    color: "#ef4444", meta: "Pending payments" },
            { label: "🏦 Cash & Bank Balance", value: fmt(data.cashBalance),      color: "#10b981", meta: "Cash + Bank accounts" },
            { label: "⚠️ Overdue Bills",        value: data.overdueBillsCount.toString(), color: "#ef4444", meta: "Need attention" },
          ].map((kpi) => (
            <div key={kpi.label} className="card" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
              <div className="kpi-meta">{kpi.meta}</div>
            </div>
          ))}
        </div>

        <div className="two-col">
          <div className="card recent-transactions-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)" }}>🔄 Recent Transactions</span>
              <button onClick={() => router.push("/dashboard/reports/general-ledger")} style={{ background: "none", border: "none", color: "var(--primary)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>View All →</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr><th>Date</th><th>Description</th><th>Account</th><th style={{ textAlign: "right" }}>Debit</th><th style={{ textAlign: "right" }}>Credit</th></tr>
                </thead>
                <tbody>
                  {data.recentTransactions.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>No recent transactions</td></tr>
                  ) : (
                    data.recentTransactions.map((t: any, idx: number) => (
                      <tr key={idx}>
                        <td>{t.date}</td>
                        <td>{t.description}</td>
                        <td>{t.accountCode} – {t.accountName}</td>
                        <td style={{ textAlign: "right", color: t.debit > 0 ? "#ef4444" : "var(--text)" }}>{t.debit > 0 ? t.debit.toLocaleString() : "—"}</td>
                        <td style={{ textAlign: "right", color: t.credit > 0 ? "#10b981" : "var(--text)" }}>{t.credit > 0 ? t.credit.toLocaleString() : "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="right-column-card" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div className="card quick-actions-card">
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>⚡ Quick Actions</div>
              <div className="quick-actions">
                <div className="quick-action-btn" onClick={() => router.push("/dashboard/invoices/new")}>➕ New Invoice</div>
                <div className="quick-action-btn" onClick={() => router.push("/dashboard/bills/new")}>📦 New Bill</div>
                <div className="quick-action-btn" onClick={() => router.push("/dashboard/receipts/new")}>💰 Record Receipt</div>
                <div className="quick-action-btn" onClick={() => router.push("/dashboard/payments/new")}>💳 Record Payment</div>
                <div className="quick-action-btn" onClick={() => router.push("/dashboard/customers/new")}>👤 Add Customer</div>
                <div className="quick-action-btn" onClick={() => router.push("/dashboard/suppliers/new")}>🚚 Add Vendor</div>
              </div>
            </div>

            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)" }}>📦 Unpaid Bills</span>
                <button onClick={() => router.push("/dashboard/bills?status=Unpaid&overdue=true")} style={{ background: "none", border: "none", color: "var(--primary)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>View All →</button>
              </div>
              {data.overdueBills.length === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "12px 0" }}>No overdue bills – great job!</p>
              ) : (
                <table>
                  <thead>
                    <tr><th>Supplier</th><th>Bill No</th><th>Due Date</th><th>Amount</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {data.overdueBills.map((bill: any) => (
                      <tr key={bill.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/dashboard/bills/${bill.id}`)}>
                        <td>{bill.suppliers?.name || "—"}</td>
                        <td>{bill.invoice_no}</td>
                        <td>{bill.due_date}</td>
                        <td>{fmt(bill.total)}</td>
                        <td><span className={`status-badge ${bill.status === "Unpaid" ? "status-unpaid" : "status-partial"}`}>{bill.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}