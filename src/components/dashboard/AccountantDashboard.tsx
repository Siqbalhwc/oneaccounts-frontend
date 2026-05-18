"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  FileText,
  Receipt,
  Wallet,
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

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", background: "#071018", minHeight: "100vh", color: "#94A3B8" }}>
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
          border-radius: 24px;
          padding: 24px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          transition: all 0.3s ease;
        }
        .glass-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 12px 40px rgba(0,255,255,0.1);
        }
        .kpi-label { text-transform: uppercase; font-size: 0.7rem; font-weight: 700; color: #94A3B8; letter-spacing: 0.04em; }
        .kpi-value { font-size: 2rem; font-weight: 800; color: #F1F5F9; line-height: 1.2; margin: 8px 0; }
      `}</style>

      <div style={{ position: "relative", zIndex: 1, padding: 24 }}>
        {/* ── Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ marginBottom: 24 }}
        >
          <h1 style={{ fontSize: 36, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>
            Accountant Workspace
          </h1>
          <p style={{ color: "#94A3B8", fontSize: 14, margin: 0 }}>
            Daily operations & quick actions
          </p>
        </motion.div>

        {/* ── Today's counters ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 20,
            marginBottom: 24,
          }}
        >
          {[
            { label: "Bills Entered Today", value: todayCounts.bills, color: "#F97316", icon: <FileText size={24} /> },
            { label: "Receipts Today", value: todayCounts.receipts, color: "#10B981", icon: <Receipt size={24} /> },
            { label: "Payments Today", value: todayCounts.payments, color: "#3B82F6", icon: <Wallet size={24} /> },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              className="glass-card"
              custom={i}
              initial="hidden"
              animate="visible"
              variants={cardVariant}
              whileHover={{ y: -4 }}
              style={{ textAlign: "center" }}
            >
              <div style={{ marginBottom: 12, color: item.color, opacity: 0.9, display: "flex", justifyContent: "center" }}>
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
          <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 20, color: "#F1F5F9" }}>
            Quick Actions
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {[
              { label: "New Purchase Bill", link: "/dashboard/bills/new", color: "#F97316" },
              { label: "New Invoice", link: "/dashboard/invoices/new", color: "#3B82F6" },
              { label: "New Receipt", link: "/dashboard/receipts/new", color: "#10B981" },
              { label: "New Payment", link: "/dashboard/payments/new", color: "#8B5CF6" },
              { label: "Budget Entry", link: "/dashboard/settings/budgets", color: "#EC4899" },
              { label: "Journal Entry", link: "/dashboard/journal/new", color: "#F59E0B" },
            ].map((action) => (
              <motion.button
                key={action.label}
                onClick={() => router.push(action.link)}
                style={{
                  padding: "12px 22px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#E2E8F0",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
                whileHover={{
                  background: `${action.color}20`,
                  borderColor: `${action.color}40`,
                  scale: 1.03,
                }}
              >
                <Plus size={16} />
                {action.label}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* ── Pending Bills ── */}
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 20, color: "#F1F5F9" }}>
            Pending Supplier Bills
          </h3>
          {pendingBills.length === 0 ? (
            <div style={{ color: "#94A3B8", fontSize: 14, padding: "12px 0" }}>No pending bills.</div>
          ) : (
            pendingBills.map((bill) => (
              <motion.div
                key={bill.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  fontSize: 14,
                  cursor: "pointer",
                }}
                onClick={() => router.push(`/dashboard/bills/${bill.id}`)}
                whileHover={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, paddingLeft: 12, paddingRight: 12 }}
              >
                <div>
                  <span style={{ color: "#93C5FD", fontWeight: 600 }}>{bill.invoice_no}</span>
                  <span style={{ color: "#94A3B8", marginLeft: 16 }}>{bill.suppliers?.name || "—"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <span style={{ color: "#94A3B8" }}>{bill.date}</span>
                  <span style={{ fontWeight: 700, color: "#F97316" }}>PKR {bill.total?.toLocaleString()}</span>
                  <span style={{
                    padding: "4px 10px",
                    borderRadius: 14,
                    fontSize: 11,
                    fontWeight: 700,
                    background: "#7C2D12",
                    color: "#FCA5A5",
                  }}>
                    Unpaid
                  </span>
                </div>
              </motion.div>
            ))
          )}
        </motion.div>
      </div>
    </div>
  )
}