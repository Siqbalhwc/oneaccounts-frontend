"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  CreditCard,
  Receipt,
  Wallet,
  ClipboardList,
  Plus,
} from "lucide-react"

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

  const formatPKR = (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `PKR ${(v / 1_000_000).toFixed(1)}M`
    return `PKR ${v.toLocaleString()}`
  }

  // animation variants
  const cardVariant = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.08, duration: 0.45 },
    }),
  }

  const hoverScale = { whileHover: { scale: 1.02, y: -4 } }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", background: "#0A0A0A", minHeight: "100vh", color: "#94A3B8" }}>
        Loading accountant dashboard…
      </div>
    )
  }

  return (
    <div
      style={{
        background: "#071018",
        minHeight: "100vh",
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        color: "#F1F5F9",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ── Animated background dots ── */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <div
          style={{
            position: "absolute",
            top: "10%",
            left: "5%",
            width: 6,
            height: 6,
            background: "rgba(34,211,238,0.5)",
            borderRadius: "50%",
            animation: "float 10s infinite ease-in-out",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "40%",
            right: "10%",
            width: 6,
            height: 6,
            background: "rgba(34,211,238,0.5)",
            borderRadius: "50%",
            animation: "float 12s infinite ease-in-out 2s",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "20%",
            left: "50%",
            width: 6,
            height: 6,
            background: "rgba(34,211,238,0.5)",
            borderRadius: "50%",
            animation: "float 14s infinite ease-in-out 4s",
          }}
        />
      </div>

      <style>{`
        @keyframes float {
          0% { transform: translateY(0px); opacity: 0.4; }
          50% { transform: translateY(-25px); opacity: 1; }
          100% { transform: translateY(0px); opacity: 0.4; }
        }
        .glass-card {
          background: rgba(255,255,255,0.03);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 20px;
          padding: 20px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          transition: all 0.3s ease;
        }
        .glass-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 30px rgba(0,255,255,0.1);
        }
        .kpi-label { text-transform: uppercase; font-size: 0.7rem; font-weight: 700; color: #94A3B8; letter-spacing: 0.04em; }
        .kpi-value { font-size: 1.8rem; font-weight: 700; color: #F1F5F9; line-height: 1.2; margin: 4px 0; }
        .kpi-meta { font-size: 0.8rem; color: #64748B; display: flex; align-items: center; gap: 0.3rem; }
      `}</style>

      <div style={{ position: "relative", zIndex: 1, padding: 24 }}>
        {/* ── Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ marginBottom: 24 }}
        >
          <h1 style={{ fontSize: 32, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>
            Accountant Workspace
          </h1>
          <p style={{ color: "#94A3B8", fontSize: 14, margin: 0 }}>
            Daily operations & financial summary
          </p>
        </motion.div>

        {/* ── Today's counters ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 20,
            marginBottom: 24,
          }}
        >
          {[
            { label: "Bills Entered Today", value: todayCounts.bills, color: "#F97316", icon: <FileText size={20} /> },
            { label: "Receipts Today", value: todayCounts.receipts, color: "#10B981", icon: <Receipt size={20} /> },
            { label: "Payments Today", value: todayCounts.payments, color: "#3B82F6", icon: <Wallet size={20} /> },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              className="glass-card"
              custom={i}
              initial="hidden"
              animate="visible"
              variants={cardVariant}
              {...hoverScale}
              style={{ textAlign: "center" }}
            >
              <div style={{ marginBottom: 8, color: item.color, opacity: 0.8, display: "flex", justifyContent: "center" }}>
                {item.icon}
              </div>
              <div className="kpi-value" style={{ color: item.color }}>{item.value}</div>
              <div className="kpi-label">{item.label}</div>
            </motion.div>
          ))}
        </div>

        {/* ── Quick Actions ── */}
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          style={{ marginBottom: 24 }}
        >
          <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, color: "#F1F5F9" }}>
            Quick Actions
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {[
              { label: "New Purchase Bill", link: "/dashboard/bills/new", color: "#F97316" },
              { label: "New Invoice", link: "/dashboard/invoices/new", color: "#3B82F6" },
              { label: "New Receipt", link: "/dashboard/receipts/new", color: "#10B981" },
              { label: "New Payment", link: "/dashboard/payments/new", color: "#8B5CF6" },
              { label: "Budget Entry", link: "/dashboard/settings/budgets", color: "#EC4899" },
              { label: "Journal Entry", link: "/dashboard/journal/new", color: "#F59E0B" },
            ].map((action) => (
              <button
                key={action.label}
                onClick={() => router.push(action.link)}
                style={{
                  padding: "10px 18px",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#E2E8F0",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${action.color}20`
                  e.currentTarget.style.borderColor = `${action.color}40`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)"
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"
                }}
              >
                <Plus size={14} style={{ marginRight: 4 }} />
                {action.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* ── Pending Bills ── */}
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          style={{ marginBottom: 24 }}
        >
          <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, color: "#F1F5F9" }}>
            Pending Supplier Bills
          </h3>
          {pendingBills.length === 0 ? (
            <div style={{ color: "#94A3B8", fontSize: 13 }}>No pending bills.</div>
          ) : (
            pendingBills.map((bill) => (
              <div
                key={bill.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
                onClick={() => router.push(`/dashboard/bills/${bill.id}`)}
              >
                <div>
                  <span style={{ color: "#93C5FD", fontWeight: 600 }}>{bill.invoice_no}</span>
                  <span style={{ color: "#94A3B8", marginLeft: 12 }}>{bill.suppliers?.name || "—"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ color: "#94A3B8" }}>{bill.date}</span>
                  <span style={{ fontWeight: 700, color: "#F97316" }}>PKR {bill.total?.toLocaleString()}</span>
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: 12,
                    fontSize: 10,
                    fontWeight: 700,
                    background: "#7C2D12",
                    color: "#FCA5A5",
                  }}>
                    Unpaid
                  </span>
                </div>
              </div>
            ))
          )}
        </motion.div>

        {/* ── Recent Journal Entries ── */}
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, color: "#F1F5F9" }}>
            Recent Journal Entries
          </h3>
          {recentEntries.length === 0 ? (
            <div style={{ color: "#94A3B8", fontSize: 13 }}>No recent entries.</div>
          ) : (
            recentEntries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  fontSize: 13,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: "#93C5FD", fontWeight: 600 }}>{entry.entry_no}</span>
                  <span style={{ color: "#94A3B8" }}>{entry.date}</span>
                </div>
                <div style={{ color: "#CBD5E1", marginBottom: 4 }}>{entry.description}</div>
                {entry.journal_lines?.map((line: any, i: number) => (
                  <div key={i} style={{ fontSize: 11, color: "#64748B", paddingLeft: 8 }}>
                    {line.accounts?.code} — {line.accounts?.name}: Dr {line.debit} / Cr {line.credit}
                  </div>
                ))}
              </div>
            ))
          )}
        </motion.div>
      </div>
    </div>
  )
}