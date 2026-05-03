"use client"

import { useRouter } from "next/navigation"
import { Settings, Database, Cog, Shield, Bell, ArrowRight } from "lucide-react"

export default function SettingsHubPage() {
  const router = useRouter()

  const cards = [
    {
      title: "Company Settings",
      desc: "Business name, logo, contact details",
      icon: <Settings size={22} />,
      href: "/dashboard/settings/company",
      color: "#1E3A8A",
    },
    {
      title: "Data Management",
      desc: "Clean, import, export, backup & restore",
      icon: <Database size={22} />,
      href: "/dashboard/settings/data-tools",
      color: "#0EA5E9",
    },
    {
      title: "Invoice Automation",
      desc: "Configure expense rules and profit allocation",
      icon: <Cog size={22} />,
      href: "/dashboard/settings/invoice-automation",
      color: "#F59E0B",
    },
    {
      title: "Permissions Reference",
      desc: "View role‑based access matrix",
      icon: <Shield size={22} />,
      href: "/dashboard/settings/permissions",
      color: "#8B5CF6",
    },
    {
      title: "Notification Settings",
      desc: "Configure reminders and alerts",
      icon: <Bell size={22} />,
      href: "/dashboard/settings/notifications",
      color: "#EF4444",
    },
  ]

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", marginBottom: 4 }}>⚙️ Settings</h1>
      <p style={{ fontSize: 13, color: "#94A3B8", marginBottom: 24 }}>Manage your business configuration</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {cards.map(c => (
          <div
            key={c.title}
            onClick={() => router.push(c.href)}
            style={{
              background: "white",
              borderRadius: 12,
              border: "1px solid #E2E8F0",
              borderTop: `3px solid ${c.color}`,
              padding: "20px 18px",
              cursor: "pointer",
              transition: "box-shadow 0.15s",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 18px rgba(0,0,0,0.08)"}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = "none"}
          >
            <div>
              <div style={{ color: c.color, marginBottom: 12 }}>{c.icon}</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", margin: "0 0 4px" }}>{c.title}</h3>
              <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>{c.desc}</p>
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