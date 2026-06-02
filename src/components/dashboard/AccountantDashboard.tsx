"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import { useCompany } from "@/contexts/CompanyContext"
import {
  PlusCircle, Users, Truck, FileText, Receipt, CreditCard, Briefcase, FolderOpen,
  DollarSign, Package, Monitor, BarChart3, BookOpen, TrendingUp, TrendingDown,
  ArrowRightLeft, ClipboardList, PieChart, Scale,
} from "lucide-react"

export default function AccountantDashboard({ role }: { role: string }) {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { hasFeature } = usePlan()
  const { companyId } = useCompany()
  const [businessType, setBusinessType] = useState<string>("")

  // Fetch company business type
  useEffect(() => {
    if (!companyId) return
    supabase
      .from("companies")
      .select("business_type")
      .eq("id", companyId)
      .single()
      .then(({ data }) => {
        if (data) setBusinessType(data.business_type || "")
      })
  }, [companyId])

  // Quick actions – conditionally shown
  const quickActions = [
    { label: "New Customer", icon: <Users size={18} />, link: "/dashboard/customers/new" },
    { label: "New Supplier", icon: <Truck size={18} />, link: "/dashboard/suppliers/new" },
    { label: "New Invoice", icon: <FileText size={18} />, link: "/dashboard/invoices/new" },
    { label: "New Bill", icon: <Receipt size={18} />, link: "/dashboard/bills/new" },
    { label: "New Receipt", icon: <CreditCard size={18} />, link: "/dashboard/receipts/new" },
    { label: "New Payment", icon: <DollarSign size={18} />, link: "/dashboard/payments/new" },
    {
      label: "New Project",
      icon: <Briefcase size={18} />,
      link: "/dashboard/projects/new",
      show: businessType === "ngo",
    },
    {
      label: "New Activity",
      icon: <FolderOpen size={18} />,
      link: "/dashboard/activities/new",
      show: businessType === "ngo",
    },
    {
      label: "New Budget",
      icon: <BarChart3 size={18} />,
      link: "/dashboard/budgets/new",
      show: businessType === "ngo",
    },
    {
      label: "New Product",
      icon: <Package size={18} />,
      link: "/dashboard/products/new",
      show: hasFeature("inventory"),
    },
    { label: "New Asset", icon: <Monitor size={18} />, link: "/dashboard/assets/new" },
    { label: "New Bank Account", icon: <ArrowRightLeft size={18} />, link: "/dashboard/banking/bank-accounts/new" },
    { label: "Bank Transfer", icon: <ArrowRightLeft size={18} />, link: "/dashboard/banking/bank-transfers/new" },
  ]

  // Report links
  const reports = [
    { label: "Sales Invoices", icon: <FileText size={18} />, link: "/dashboard/invoices" },
    { label: "Purchase Bills", icon: <Receipt size={18} />, link: "/dashboard/bills" },
    { label: "Receipts", icon: <CreditCard size={18} />, link: "/dashboard/receipts" },
    { label: "Payments", icon: <DollarSign size={18} />, link: "/dashboard/payments" },
    { label: "Customer Ledger", icon: <BookOpen size={18} />, link: "/dashboard/reports/customer-ledger" },
    { label: "Vendor Ledger", icon: <BookOpen size={18} />, link: "/dashboard/reports/vendor-ledger" },
    { label: "General Ledger", icon: <BookOpen size={18} />, link: "/dashboard/reports/ledger" },
    { label: "Product Ledger", icon: <Package size={18} />, link: "/dashboard/reports/product-ledger" },
    { label: "Chart of Accounts", icon: <ClipboardList size={18} />, link: "/dashboard/accounts" },
    { label: "Trial Balance", icon: <Scale size={18} />, link: "/dashboard/reports/trial-balance" },
    { label: "Profit & Loss", icon: <TrendingUp size={18} />, link: "/dashboard/reports/profit-loss" },
    { label: "Balance Sheet", icon: <PieChart size={18} />, link: "/dashboard/reports/balance-sheet" },
  ]

  // Filter out actions that shouldn't be shown
  const visibleActions = quickActions.filter(action => action.show !== false) // show by default if undefined
  // For reports, all are visible to accountants, but we could also filter based on features

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .dashboard-section {
          margin-bottom: 32px;
        }
        .section-title {
          font-size: 14px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          margin-bottom: 16px;
        }
        .action-grid, .report-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 12px;
        }
        .action-card, .report-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: all 0.15s;
          text-decoration: none;
          color: var(--text);
        }
        .action-card:hover, .report-card:hover {
          background: var(--card-hover);
          border-color: var(--primary);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .action-icon, .report-icon {
          color: var(--primary);
          flex-shrink: 0;
        }
        .action-label, .report-label {
          font-size: 13px;
          font-weight: 600;
        }

        /* Responsive */
        @media (max-width: 640px) {
          .action-grid, .report-grid {
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          }
          .action-card, .report-card {
            padding: 12px;
          }
        }
      `}</style>

      {/* Quick Actions Section */}
      <div className="dashboard-section">
        <h2 className="section-title">⚡ Quick Actions</h2>
        <div className="action-grid">
          {visibleActions.map((action, idx) => (
            <div
              key={idx}
              className="action-card"
              onClick={() => router.push(action.link)}
              title={action.label}
            >
              <span className="action-icon">{action.icon}</span>
              <span className="action-label">{action.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Reports Section */}
      <div className="dashboard-section">
        <h2 className="section-title">📊 Reports</h2>
        <div className="report-grid">
          {reports.map((report, idx) => (
            <div
              key={idx}
              className="report-card"
              onClick={() => router.push(report.link)}
              title={report.label}
            >
              <span className="report-icon">{report.icon}</span>
              <span className="report-label">{report.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Optional: Summary Row – just a placeholder for now, can be expanded */}
      <div className="dashboard-section">
        <h2 className="section-title">📈 This Month (coming soon)</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="action-card" style={{ flex: 1, minWidth: 160 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Invoices</span>
            <strong style={{ fontSize: 20 }}>—</strong>
          </div>
          <div className="action-card" style={{ flex: 1, minWidth: 160 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Bills</span>
            <strong style={{ fontSize: 20 }}>—</strong>
          </div>
          <div className="action-card" style={{ flex: 1, minWidth: 160 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Receipts</span>
            <strong style={{ fontSize: 20 }}>—</strong>
          </div>
          <div className="action-card" style={{ flex: 1, minWidth: 160 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Payments</span>
            <strong style={{ fontSize: 20 }}>—</strong>
          </div>
        </div>
      </div>
    </div>
  )
}