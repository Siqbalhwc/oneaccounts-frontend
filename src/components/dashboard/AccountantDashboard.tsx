"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { FileText, Receipt, Wallet, Plus, Sun, Moon } from "lucide-react"

export default function AccountantDashboard({ role }: { role: string }) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  const [darkMode, setDarkMode] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [pendingBills, setPendingBills] = useState<any[]>([])
  const [todayCounts, setTodayCounts] = useState({ bills: 0, receipts: 0, payments: 0 })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // Theme tokens
  const t = {
    bg: darkMode ? "#071018" : "#F8FAFC",
    card: darkMode ? "rgba(255,255,255,0.03)" : "#FFFFFF",
    cardBorder: darkMode ? "rgba(255,255,255,0.06)" : "#E2E8F0",
    cardShadow: darkMode ? "0 8px 32px rgba(0,0,0,0.2)" : "0 2px 8px rgba(0,0,0,0.06)",
    text: darkMode ? "#F1F5F9" : "#1E293B",
    textMuted: darkMode ? "#94A3B8" : "#64748B",
    rowBorder: darkMode ? "rgba(255,255,255,0.05)" : "#E2E8F0",
    rowHover: darkMode ? "rgba(255,255,255,0.03)" : "#F8FAFC",
    btnBg: darkMode ? "rgba(255,255,255,0.05)" : "#F1F5F9",
    btnBorder: darkMode ? "rgba(255,255,255,0.08)" : "#E2E8F0",
    inputBg: darkMode ? "#1E293B" : "#F1F5F9",
    inputBorder: darkMode ? "#334155" : "#CBD5E1",
    inputText: darkMode ? "#F1F5F9" : "#1E293B",
    dot1: darkMode ? "rgba(34,211,238,0.5)" : "rgba(14,165,233,0.3)",
  }

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) {
          setLoadError(true)
          return
        }

        const cid = (user.app_metadata as any)?.company_id
        if (!cid) {
          setLoadError(true)
          return
        }
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
        const today = new Date().toISOString().split("T")[0]
        const [{ count: billCount }, { count: receiptCount }, { count: paymentCount }] = await Promise.all([
          supabase.from("invoices").select("*", { count: "exact", head: true }).eq("company_id", cid).eq("type", "purchase").gte("created_at", today),
          supabase.from("receipts").select("*", { count: "exact", head: true }).eq("company_id", cid).gte("created_at", today),
          supabase.from("payments").select("*", { count: "exact", head: true }).eq("company_id", cid).gte("created_at", today),
        ])
        setTodayCounts({ bills: billCount || 0, receipts: receiptCount || 0, payments: paymentCount || 0 })

      } catch (err) {
        console.error("Accountant dashboard fetch error:", err)
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const formatPKR = (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `PKR ${(v / 1_000_000).toFixed(1)}M`
    return `PKR ${v.toLocaleString()}`
  }

  const cardVariant = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.45 } }),
  }

  if (loadError) {
    return (
      <div style={{ padding: 40, textAlign: "center", background: t.bg, minHeight: "100vh", color: t.textMuted }}>
        <div style={{ fontSize: "1.2rem", marginBottom: 8, color: "#F87171" }}>Could not load dashboard</div>
        <div style={{ fontSize: "0.85rem" }}>Your account may not be linked to a company. Please contact your administrator.</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", background: t.bg, minHeight: "100vh", color: t.textMuted, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          style={{ width: 36, height: 36, borderRadius: "50%", border: `3px solid ${t.cardBorder}`, borderTop: "3px solid #22D3EE" }}
        />
        <div style={{ fontSize: "0.9rem" }}>Loading accountant workspace…</div>
      </div>
    )
  }

  return (
    <div style={{ background: t.bg, minHeight: "100vh", fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", color: t.text, position: "relative", overflow: "hidden", transition: "background 0.3s, color 0.3s" }}>
      {/* Ambient dots */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        {[[{ top: "10%", left: "5%", dur: "10s", del: "0s" }], [{ top: "40%", right: "10%", dur: "12s", del: "2s" }], [{ bottom: "20%", left: "50%", dur: "14s", del: "4s" }]].flat().map((pos, i) => (
          <div key={i} style={{ position: "absolute", width: 6, height: 6, background: t.dot1, borderRadius: "50%", animation: `float_acc ${pos.dur} infinite ease-in-out ${pos.del}`, ...pos } as any} />
        ))}
      </div>

      <style>{`
        @keyframes float_acc {
          0% { transform: translateY(0px); opacity: 0.4; }
          50% { transform: translateY(-25px); opacity: 1; }
          100% { transform: translateY(0px); opacity: 0.4; }
        }
        .glass-card {
          background: ${t.card};
          backdrop-filter: blur(12px);
          border: 1px solid ${t.cardBorder};
          border-radius: 24px;
          padding: 24px;
          box-shadow: ${t.cardShadow};
          transition: all 0.3s ease;
        }
        .glass-card:hover { transform: translateY(-4px); }
        .kpi-label { text-transform: uppercase; font-size: 0.7rem; font-weight: 700; color: ${t.textMuted}; letter-spacing: 0.04em; }
        .kpi-value { font-size: 2rem; font-weight: 800; line-height: 1.2; margin: 8px 0; }
      `}</style>

      <div style={{ position: "relative", zIndex: 1, padding: 24 }}>

        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: t.text, margin: 0 }}>Accountant Workspace</h1>
            <p style={{ color: t.textMuted, fontSize: 14, margin: 0 }}>Daily operations &amp; quick actions</p>
          </div>
          <button
            onClick={() => setDarkMode(d => !d)}
            style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 20, padding: "0.35rem 0.9rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: t.inputText, fontSize: "0.8rem", fontWeight: 500, fontFamily: "inherit", transition: "all 0.2s" }}
          >
            {darkMode ? <Sun size={14} /> : <Moon size={14} />}
            {darkMode ? "Light mode" : "Dark mode"}
          </button>
        </motion.div>

        {/* Today's counters */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20, marginBottom: 24 }}>
          {[
            { label: "Bills Entered Today", value: todayCounts.bills, color: "#F97316", icon: <FileText size={24} /> },
            { label: "Receipts Today", value: todayCounts.receipts, color: "#10B981", icon: <Receipt size={24} /> },
            { label: "Payments Today", value: todayCounts.payments, color: "#3B82F6", icon: <Wallet size={24} /> },
          ].map((item, i) => (
            <motion.div key={item.label} className="glass-card" custom={i} initial="hidden" animate="visible" variants={cardVariant} whileHover={{ y: -4 }} style={{ textAlign: "center" }}>
              <div style={{ marginBottom: 12, color: item.color, opacity: 0.9, display: "flex", justifyContent: "center" }}>{item.icon}</div>
              <div className="kpi-value" style={{ color: item.color }}>{item.value}</div>
              <div className="kpi-label">{item.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <motion.div className="glass-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} style={{ marginBottom: 24 }}>
          <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 20, color: t.text }}>Quick Actions</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
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
                style={{ padding: "10px 18px", borderRadius: 12, background: t.btnBg, border: `1px solid ${t.btnBorder}`, color: t.text, cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" }}
                whileHover={{ background: `${action.color}20`, borderColor: `${action.color}40`, scale: 1.03 }}
              >
                <Plus size={14} style={{ color: action.color }} />
                {action.label}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Pending Bills */}
        <motion.div className="glass-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 20, color: t.text }}>Pending Supplier Bills</h3>
          {pendingBills.length === 0
            ? <div style={{ color: t.textMuted, fontSize: 14, padding: "12px 0" }}>No pending bills — you're all caught up!</div>
            : pendingBills.map((bill) => (
              <motion.div
                key={bill.id}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 8px", borderBottom: `1px solid ${t.rowBorder}`, fontSize: 14, cursor: "pointer", borderRadius: 8 }}
                onClick={() => router.push(`/dashboard/bills/${bill.id}`)}
                whileHover={{ background: t.rowHover, paddingLeft: 16, paddingRight: 16 }}
                transition={{ duration: 0.15 }}
              >
                <div>
                  <span style={{ color: "#93C5FD", fontWeight: 600 }}>{bill.invoice_no}</span>
                  <span style={{ color: t.textMuted, marginLeft: 14 }}>{bill.suppliers?.name || "—"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <span style={{ color: t.textMuted }}>{bill.date}</span>
                  <span style={{ fontWeight: 700, color: "#F97316" }}>PKR {bill.total?.toLocaleString()}</span>
                  <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: "#7C2D12", color: "#FCA5A5" }}>Unpaid</span>
                </div>
              </motion.div>
            ))
          }
        </motion.div>
      </div>
    </div>
  )
}