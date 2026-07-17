"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { useBreadcrumbContext } from "@/contexts/BreadcrumbContext"

// ── Configuration – now exported so the context can reuse them ──
export const BREADCRUMB_CONFIG: Record<string, { label: string; module?: string }> = {
  dashboard:       { label: "Dashboard" },
  invoices:        { label: "Sales Invoices",    module: "Sales" },
  bills:           { label: "Purchase Bills",    module: "Purchases" },
  receipts:        { label: "Receipts",          module: "Sales" },
  payments:        { label: "Payments",          module: "Purchases" },
  accounts:        { label: "Chart of Accounts", module: "Accounting" },
  journal:         { label: "Journal Entries",   module: "Accounting" },
  reports:         { label: "Reports" },
  "trial-balance": { label: "Trial Balance" },
  "profit-loss":   { label: "Profit & Loss" },
  "balance-sheet": { label: "Balance Sheet" },
  "customer-ledger": { label: "Customer Ledger" },
  "vendor-ledger":   { label: "Vendor Ledger" },
  "general-ledger":  { label: "General Ledger" },
  customers:       { label: "Customers" },
  suppliers:       { label: "Suppliers" },
  products:        { label: "Products" },
  payroll:         { label: "Payroll" },
  employees:       { label: "Employees",       module: "Payroll" },
  attendance:      { label: "Attendance",      module: "Payroll" },
  "leave-types":   { label: "Leave Types",     module: "Payroll" },
  "leave-applications": { label: "Leave Applications", module: "Payroll" },
  loans:           { label: "Loans",           module: "Payroll" },
  advances:        { label: "Advances",        module: "Payroll" },
  "salary-components": { label: "Salary Components", module: "Payroll" },
  "salary-structures": { label: "Salary Structures", module: "Payroll" },
  runs:            { label: "Payroll Runs",    module: "Payroll" },
  assets:          { label: "Assets",          module: "Fixed Assets" },
  materials:       { label: "Materials",       module: "Material Management" },
  settings:        { label: "Settings" },
  company:         { label: "Company" },
  users:           { label: "Users" },
  roles:           { label: "Roles" },
  "approval-workflow": { label: "Approval Workflow", module: "Payroll" },
  new:             { label: "New" },
  edit:            { label: "Edit" },
}

export const MODULE_NAMES: Record<string, string> = {
  sales:      "Sales",
  purchases:  "Purchases",
  accounting: "Accounting",
  payroll:    "Payroll",
  "fixed-assets": "Fixed Assets",
  "material-management": "Material Management",
  reports:    "Reports",
  settings:   "Settings",
}

function isNumeric(str: string) { return /^\d+$/.test(str) }

export default function Breadcrumb() {
  const pathname = usePathname()
  const { trail } = useBreadcrumbContext()

  if (!pathname) return null

  // Use the navigation trail if it exists, otherwise fall back to URL‑based
  const items = trail.length > 0
    ? [...trail]
    : buildFallbackItems(pathname)

  // Hide on dashboard root
  if (items.length === 0 || (items.length === 1 && items[0].label === "Dashboard")) return null

  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        marginTop: 24, marginBottom: 12, overflowX: "auto",
        whiteSpace: "nowrap", scrollbarWidth: "thin", paddingLeft: 24,
      }}
    >
      <ol style={{
        listStyle: "none", display: "flex", alignItems: "center", gap: 4,
        margin: 0, padding: 0, fontSize: 12, fontFamily: "'Inter', sans-serif",
      }}>
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1
          return (
            <li key={idx} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {isLast ? (
                <span style={{ color: "var(--text)", fontWeight: 600 }} aria-current="page">{item.label}</span>
              ) : (
                <Link href={item.href !== "#" ? item.href : ""}
                  style={{ color: "var(--text-muted)", textDecoration: "none", cursor: item.href !== "#" ? "pointer" : "default", fontWeight: 500 }}
                  onClick={item.href === "#" ? (e) => e.preventDefault() : undefined}
                >{item.label}</Link>
              )}
              {!isLast && <ChevronRight size={12} style={{ color: "var(--text-muted)", margin: "0 2px" }} />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function buildFallbackItems(pathname: string) {
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length === 1 && segments[0] === "dashboard") return []

  const items: { label: string; href: string }[] = []
  let accumulatedPath = ""
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    accumulatedPath += "/" + seg
    const config = BREADCRUMB_CONFIG[seg]
    if (config?.module) {
      const modLabel = MODULE_NAMES[config.module] || config.module
      if (items.length === 0 || items[items.length - 1].label !== modLabel) {
        items.push({ label: modLabel, href: "#" })
      }
    }
    let label = config ? config.label : isNumeric(seg) ? "Detail" : seg.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    if (items.length > 0 && items[items.length - 1].label === label) continue
    items.push({ label, href: accumulatedPath })
  }
  return items
}