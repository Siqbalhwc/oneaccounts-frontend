"use client"

export default function SidebarClient({ children }: { children?: React.ReactNode }) {
  return <div className="dl-overlay" id="dl-overlay" onClick={() => {
    document.getElementById('dl-overlay')?.classList.remove('open')
    document.getElementById('dl-sidebar')?.classList.remove('mobile-open')
  }} />
}