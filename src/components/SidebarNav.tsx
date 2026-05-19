"use client"

export default function SidebarNav({
  navSections, email, initial, logoUrl, companyName, companyTagline,
}: {
  navSections: any[]
  email: string; initial: string; logoUrl: string; companyName: string; companyTagline: string
}) {
  return (
    <aside className="dl-sidebar" id="dl-sidebar">
      <div className="dl-sidebar-logo">
        <img src={logoUrl} alt={companyName} className="dl-sidebar-logo-img" />
        <div>
          <div className="dl-sidebar-logo-name">{companyName}</div>
          <div className="dl-sidebar-logo-sub">{companyTagline}</div>
        </div>
      </div>
      <nav className="dl-sidebar-nav" style={{ padding: 10, color: '#94A3B8', fontSize: 13 }}>
        <p style={{ padding: 8 }}>Sidebar navigation is loading…</p>
      </nav>
      <div className="dl-sidebar-user">
        <div className="dl-sidebar-avatar">{initial}</div>
        <div style={{ overflow: "hidden" }}>
          <div className="dl-sidebar-email">{email}</div>
        </div>
      </div>
    </aside>
  )
}