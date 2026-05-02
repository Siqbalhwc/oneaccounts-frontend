"use client"

export default function PermissionsPage() {
  const matrix = [
    { page: "Dashboard", admin: "✅", accountant: "✅", viewer: "✅" },
    { page: "Chart of Accounts", admin: "✅", accountant: "✅", viewer: "✅" },
    { page: "Journal Entries", admin: "✅", accountant: "✅", viewer: "❌" },
    { page: "Sales Invoices", admin: "✅", accountant: "✅", viewer: "❌" },
    { page: "Purchase Bills", admin: "✅", accountant: "✅", viewer: "❌" },
    { page: "Receipts", admin: "✅", accountant: "✅", viewer: "❌" },
    { page: "Payments", admin: "✅", accountant: "✅", viewer: "❌" },
    { page: "Customers", admin: "✅", accountant: "✅", viewer: "✅" },
    { page: "Suppliers", admin: "✅", accountant: "✅", viewer: "✅" },
    { page: "Investors", admin: "✅", accountant: "✅", viewer: "❌" },
    { page: "Products", admin: "✅", accountant: "✅", viewer: "❌" },
    { page: "Inventory Adjustments", admin: "✅", accountant: "✅", viewer: "❌" },
    { page: "Bank Accounts", admin: "✅", accountant: "✅", viewer: "❌" },
    { page: "Bank Transfers", admin: "✅", accountant: "✅", viewer: "❌" },
    { page: "Reports", admin: "✅", accountant: "✅", viewer: "✅" },
    { page: "Admin Panel", admin: "✅", accountant: "❌", viewer: "❌" },
    { page: "Data Management", admin: "✅", accountant: "❌", viewer: "❌" },
    { page: "Invoice Automation", admin: "✅", accountant: "✅", viewer: "❌" },
    { page: "Company Settings", admin: "✅", accountant: "❌", viewer: "❌" },
  ]

  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh", fontFamily: "Arial" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", marginBottom: 4 }}>🔐 Permissions Reference</h1>
      <p style={{ fontSize: 13, color: "#94A3B8", marginBottom: 24 }}>Role‑based access matrix</p>

      <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 100px", padding: "10px 16px", background: "#F8FAFC", fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#94A3B8" }}>
          <span>Module</span><span>Admin</span><span>Accountant</span><span>Viewer</span>
        </div>
        {matrix.map(row => (
          <div key={row.page} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 100px", padding: "10px 16px", borderBottom: "1px solid #F1F5F9", fontSize: 13, alignItems: "center" }}>
            <span>{row.page}</span>
            <span>{row.admin}</span>
            <span>{row.accountant}</span>
            <span>{row.viewer}</span>
          </div>
        ))}
      </div>
    </div>
  )
}