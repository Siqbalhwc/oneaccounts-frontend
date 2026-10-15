"use client"

import { useRouter } from "next/navigation"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"
import {
  FileText, Calculator, CreditCard, Landmark, PieChart,
  ClipboardList, DollarSign, TrendingUp
} from "lucide-react"

const reports = [
  { title: "Payslip",          description: "Individual employee payslip for a month",   icon: FileText,       href: "/dashboard/payroll/reports/payslip" },
  { title: "Payroll Register", description: "All employees' earnings and deductions",    icon: Calculator,     href: "/dashboard/payroll/reports/payroll-register" },
  { title: "Salary Tax",       description: "Taxable income and tax deducted per employee",                  icon: TrendingUp,     href: "/dashboard/payroll/reports/tax-deduction" },
  { title: "Bank Transfer",    description: "Net pay and bank details for transfers",   icon: CreditCard,     href: "/dashboard/payroll/reports/bank-transfer" },
  { title: "Salary Summary",   description: "Department‑wise payroll summary",           icon: PieChart,       href: "/dashboard/payroll/reports/salary-summary" },
  { title: "Attendance Register", description: "Attendance records for a month",        icon: ClipboardList,  href: "/dashboard/payroll/reports/attendance-register" },
  { title: "Loan Ledger",      description: "Loans issued, recovered and still owed per employee",           icon: DollarSign,     href: "/dashboard/payroll/reports/loan-ledger" },
  { title: "Employee Overtime", description: "Overtime paid to each employee, by month",   icon: Calculator,     href: "/dashboard/payroll/reports/employee-overtime" },
  { title: "Advance Ledger",   description: "Advances issued, recovered and still owed per employee",        icon: DollarSign,     href: "/dashboard/payroll/reports/advance-ledger" },
]

export default function ReportsPage() {
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature, loading: planLoading } = usePlan()
  const canView = role === "admin" || role === "accountant"

  if (planLoading) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  }

  if (!hasFeature("payroll")) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>
        <h2>Payroll feature is not enabled.</h2>
        <p>Enable it in the Feature Manager.</p>
      </div>
    )
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
        .card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 20px; cursor: pointer; transition: all 0.2s;
          box-shadow: var(--shadow-sm);
        }
        .card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
        .card-title { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
        .card-desc { font-size: 12px; color: var(--text-muted); }
        .icon { width: 32px; height: 32px; color: var(--primary); margin-bottom: 8px; }
      `}</style>

      <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", marginBottom: 20 }}>📊 Reports</h1>

      <div className="grid">
        {reports.map(report => (
          <div key={report.title} className="card" onClick={() => router.push(report.href)}>
            <report.icon className="icon" />
            <div className="card-title">{report.title}</div>
            <div className="card-desc">{report.description}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
