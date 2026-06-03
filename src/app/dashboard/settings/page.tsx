"use client"

import { useRouter } from "next/navigation"
import { Settings, ArrowRight, Users } from "lucide-react"

export default function SettingsHubPage() {
  const router = useRouter()

  const cards = [
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
  ]

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