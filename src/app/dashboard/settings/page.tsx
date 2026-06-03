"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Settings, Database, Cog, Shield, Bell, CreditCard, ArrowRight, Briefcase, Wallet, Users } from "lucide-react"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"

export default function SettingsHubPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user?.email) return
      supabase
        .from("platform_admins")
        .select("id")
        .eq("email", user.email)
        .maybeSingle()
        .then(({ data }) => setIsPlatformAdmin(!!data))
    })
  }, [])

  const allCards = [
    {
      title: "Company Settings",
      desc: "Business name, logo, contact details",
      icon: <Settings size={22} />,
      href: "/dashboard/settings/company",
      color: "#3B82F6",
    },
    {
      title: "Users & Roles",
      desc: "Invite team members and manage permissions",
      icon: <Users size={22} />,
      href: "/dashboard/admin/users",
      color: "#10B981",
    },
    {
      title: "Data Management",
      desc: "Clean, import, export, backup & restore",
      icon: <Database size={22} />,
      href: "/dashboard/settings/data-tools",
      color: "#0EA5E9",
      adminOnly: true,
    },
    {
      title: "Invoice Automation",
      desc: "Configure expense rules and profit allocation",
      icon: <Cog size={22} />,
      href: "/dashboard/settings/invoice-automation",
      color: "#F59E0B",
      adminOnly: true,
    },
    {
      title: "Projects & Activities",
      desc: "Manage projects, locations, and activities for budgeting",
      icon: <Briefcase size={22} />,
      href: "/dashboard/settings/projects",
      color: "#8B5CF6",
      adminOnly: true,
    },
    {
      title: "Budget Entry",
      desc: "Set annual expense budgets per account",
      icon: <Wallet size={22} />,
      href: "/dashboard/settings/budgets",
      color: "#F59E0B",
      adminOnly: true,
    },
    {
      title: "Payment Settings",
      desc: "JazzCash merchant credentials and gateway config",
      icon: <CreditCard size={22} />,
      href: "/dashboard/settings/payments",
      color: "#10B981",
      adminOnly: true,
    },
    {
      title: "Permissions Reference",
      desc: "View role‑based access matrix",
      icon: <Shield size={22} />,
      href: "/dashboard/settings/permissions",
      color: "#8B5CF6",
      adminOnly: true,
    },
    {
      title: "Notification Settings",
      desc: "Configure reminders and alerts",
      icon: <Bell size={22} />,
      href: "/dashboard/settings/notifications",
      color: "#EF4444",
      adminOnly: true,
    },
  ]

  // ✅ Show admin cards if user is a company admin OR a platform admin
  const showAdminCards = role === "admin" || isPlatformAdmin

  const cards = allCards.filter(c => !c.adminOnly || showAdminCards)

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>⚙️ Settings</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>Manage your business configuration</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {cards.map(c => (
          <div
            key={c.title}
            onClick={() => router.push(c.href)}
            style={{
              background: "var(--card)",
              borderRadius: 12,
              border: "1px solid var(--border)",
              borderTop: `3px solid ${c.color}`,
              padding: "20px 18px",
              cursor: "pointer",
              transition: "box-shadow 0.15s, background 0.15s",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 18px rgba(0,0,0,0.1)"
              ;(e.currentTarget as HTMLDivElement).style.background = "var(--card-hover)"
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = "none"
              ;(e.currentTarget as HTMLDivElement).style.background = "var(--card)"
            }}
          >
            <div>
              <div style={{ color: c.color, marginBottom: 12 }}>{c.icon}</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>{c.title}</h3>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{c.desc}</p>
            </div>
            <div style={{ textAlign: "right", marginTop: 12, color: c.color }}>
              <ArrowRight size={16} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}