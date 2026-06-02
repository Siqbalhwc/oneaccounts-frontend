"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import { useCompany } from "@/contexts/CompanyContext"
import {
  FileText, Receipt, CreditCard, DollarSign, Users, Truck,
  Package, Monitor, ArrowRightLeft, Briefcase, FolderOpen,
  BarChart3, BookOpen, ClipboardList, Scale, TrendingUp, PieChart,
  PlusCircle, Plus,
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

  // ── Secondary actions (always visible) ──
  const secondaryActions = [
    { label: "Receipt", icon: <CreditCard size={20} />, link: "/dashboard/receipts/new" },
    { label: "Payment", icon: <DollarSign size={20} />, link: "/dashboard/payments/new" },
    { label: "Customer", icon: <Users size={20} />, link: "/dashboard/customers/new" },
    { label: "Supplier", icon: <Truck size={20} />, link: "/dashboard/suppliers/new" },
    { label: "Product", icon: <Package size={20} />, link: "/dashboard/products/new", show: hasFeature("inventory") },
    { label: "Asset", icon: <Monitor size={20} />, link: "/dashboard/assets/new" },
    { label: "Bank", icon: <ArrowRightLeft size={20} />, link: "/dashboard/banking/bank-accounts/new" },
    { label: "Transfer", icon: <ArrowRightLeft size={20} />, link: "/dashboard/banking/bank-transfers/new" },
    { label: "Project", icon: <Briefcase size={20} />, link: "/dashboard/projects/new", show: businessType === "ngo" },
    { label: "Activity", icon: <FolderOpen size={20} />, link: "/dashboard/activities/new", show: businessType === "ngo" },
    { label: "Budget", icon: <BarChart3 size={20} />, link: "/dashboard/budgets/new", show: businessType === "ngo" },
  ].filter(a => a.show !== false)   // remove hidden actions

  // ── Report links ──
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

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        /* ── Mobile‑first layout ── */
        .ad-hero-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
        }
        .hero-action {
          border-radius: 18px;
          padding: 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          cursor: pointer;
          color: white;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .hero-action:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.15);
        }
        .hero-action.invoice {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
        }
        .hero-action.bill {
          background: linear-gradient(135deg, #0f172a, #1e293b);
        }
        .hero-action h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
        }
        .hero-action p {
          margin: 0;
          opacity: 0.85;
          font-size: 12px;
        }

        /* Secondary grid */
        .secondary-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }
        .secondary-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 18px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.15s;
          color: var(--text);
        }
        .secondary-card:hover {
          background: var(--card-hover);
          border-color: var(--primary);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        /* Reports – collapsible on mobile, expanded on desktop */
        .reports-section {
          margin-top: 8px;
        }
        .reports-details > summary {
          font-size: 14px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          cursor: pointer;
          padding: 8px 0;
          list-style: none;
        }
        .reports-details > summary::-webkit-details-marker {
          display: none;
        }
        .reports-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 12px;
          margin-top: 12px;
        }
        .report-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          transition: all 0.15s;
          color: var(--text);
        }
        .report-card:hover {
          background: var(--card-hover);
          border-color: var(--primary);
        }

        /* Floating action button */
        .fab {
          position: fixed;
          right: 20px;
          bottom: 20px;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          border: none;
          background: #2563eb;
          color: white;
          box-shadow: 0 10px 30px rgba(37,99,235,0.4);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .fab:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 35px rgba(37,99,235,0.55);
        }

        /* ── Desktop / tablet overrides ── */
        @media (min-width: 768px) {
          .ad-hero-actions {
            flex-direction: row;
          }
          .hero-action {
            flex: 1;
          }
          .secondary-grid {
            grid-template-columns: repeat(4, 1fr);
          }
          .fab {
            display: none;           /* FAB only on mobile */
          }
          .reports-details {
            /* Expand reports by default on desktop */
          }
          .reports-details[open] > summary {
            /* keep it open */
          }
        }
        @media (min-width: 1024px) {
          .secondary-grid {
            grid-template-columns: repeat(5, 1fr);
          }
        }
      `}</style>

      {/* ── Hero Actions ── */}
      <div className="ad-hero-actions">
        <div className="hero-action invoice" onClick={() => router.push("/dashboard/invoices/new")}>
          <FileText size={24} />
          <div>
            <h3>Create Invoice</h3>
            <p>Create customer invoice</p>
          </div>
        </div>
        <div className="hero-action bill" onClick={() => router.push("/dashboard/bills/new")}>
          <Receipt size={24} />
          <div>
            <h3>Create Bill</h3>
            <p>Create supplier bill</p>
          </div>
        </div>
      </div>

      {/* ── Secondary Actions ── */}
      <div className="secondary-grid">
        {secondaryActions.map((action, idx) => (
          <div
            key={idx}
            className="secondary-card"
            onClick={() => router.push(action.link)}
          >
            <span style={{ color: "var(--primary)" }}>{action.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{action.label}</span>
          </div>
        ))}
      </div>

      {/* ── Reports (collapsible on mobile, open on desktop) ── */}
      <div className="reports-section">
        <details className="reports-details" open>
          <summary>📊 Reports</summary>
          <div className="reports-grid">
            {reports.map((report, idx) => (
              <div
                key={idx}
                className="report-card"
                onClick={() => router.push(report.link)}
              >
                <span style={{ color: "var(--primary)", flexShrink: 0 }}>{report.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{report.label}</span>
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* ── Floating Action Button (mobile only) ── */}
      <button className="fab" onClick={() => router.push("/dashboard/invoices/new")}>
        <Plus size={28} />
      </button>
    </div>
  )
}