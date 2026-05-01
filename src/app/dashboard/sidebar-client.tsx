"use client";

export default function SidebarClient({ children }: { children: React.ReactNode }) {
  const toggleSidebar = () => {
    const sidebar = document.getElementById('dl-sidebar')
    const overlay = document.getElementById('dl-overlay')
    sidebar?.classList.toggle('mobile-open')
    overlay?.classList.toggle('open')
  }

  const closeSidebar = () => {
    document.getElementById('dl-overlay')?.classList.remove('open')
    document.getElementById('dl-sidebar')?.classList.remove('mobile-open')
  }

  return (
    <>
      <div className="dl-overlay" id="dl-overlay" onClick={closeSidebar} />
      <button className="dl-hamburger" onClick={toggleSidebar}>
        <span /><span /><span />
      </button>
      {children}
    </>
  )
}