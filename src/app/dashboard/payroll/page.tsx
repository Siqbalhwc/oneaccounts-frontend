"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createBrowserClient } from "@supabase/ssr"
import { useRole } from "@/contexts/RoleContext"

type Step = { n: number; title: string; why: string; href: string; done: boolean | null; detail: string }

export default function PayrollHomePage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { role } = useRole()
  const canView = role === "admin" || role === "accountant"
  const [steps, setSteps] = useState<Step[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) { setLoading(false); return }
      const count = async (table: string, extra?: (q: any) => any) => {
        let q: any = supabase.from(table).select("*", { count: "exact", head: true }).eq("company_id", cid)
        if (extra) q = extra(q)
        const { count: c, error } = await q
        return error ? null : (c || 0)
      }
      const [comps, basicComps, structs, leaveTypes, emps, workflow, settings] = await Promise.all([
        count("salary_components", q => q.eq("is_active", true)),
        count("salary_components", q => q.eq("is_active", true).eq("is_basic", true)),
        count("salary_structures"),
        count("leave_types"),
        count("employees"),
        count("payroll_approval_settings"),
        count("payroll_settings"),
      ])
      if (cancelled) return
      const n = (v: number | null) => v || 0
      setSteps([
        { n: 1, title: "Salary Components", href: "/dashboard/payroll/salary-components", done: n(comps) > 0 && n(basicComps) > 0,
          why: "The building blocks of pay: Basic Salary, House Rent, Provident Fund, Tax... Mark one earning as the Basic Salary.",
          detail: n(comps) === 0 ? "None yet" : n(basicComps) === 0 ? `${n(comps)} created - none is marked as Basic Salary yet` : `${n(comps)} created` },
        { n: 2, title: "Salary Structures", href: "/dashboard/payroll/salary-structures", done: n(structs) > 0,
          why: "A pay package: choose the components and say how each is calculated (fixed, % of Gross or % of Basic).",
          detail: n(structs) === 0 ? "None yet - needs step 1" : `${n(structs)} created` },
        { n: 3, title: "Leave Types", href: "/dashboard/payroll/leave-types", done: n(leaveTypes) > 0,
          why: "Annual, Casual, Sick, Unpaid... and whether each one is paid.",
          detail: n(leaveTypes) === 0 ? "None yet" : `${n(leaveTypes)} created` },
        { n: 4, title: "Payroll Settings", href: "/dashboard/payroll/settings/general", done: settings === null ? null : n(settings) > 0,
          why: "Days used to value one day (month days, 30, 22...) and whether it is based on Gross or Basic.",
          detail: n(settings) > 0 ? "Saved" : "Using the defaults (days of the month, Gross)" },
        { n: 5, title: "Approval Workflow", href: "/dashboard/payroll/settings/approval-workflow", done: n(workflow) > 0,
          why: "Who submits, approves and posts a payroll run (1, 2 or 3 stages).",
          detail: n(workflow) > 0 ? "Saved" : "Not set yet" },
        { n: 6, title: "Employees", href: "/dashboard/payroll/employees", done: n(emps) > 0,
          why: "Add each employee with the salary and the structure - the pay is shown before you save.",
          detail: n(emps) === 0 ? "None yet - needs steps 1 and 2" : `${n(emps)} added` },
      ])
      setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [])

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  const next = steps.find(s => s.done === false)
  const monthly = [
    { title: "Leave Applications", href: "/dashboard/payroll/leave-applications", why: "First enter and approve the month's leave requests." },
    { title: "Attendance", href: "/dashboard/payroll/attendance", why: "Then mark who was present, absent or on leave." },
    { title: "Attendance Verification", href: "/dashboard/payroll/attendance/verify", why: "Approve the attendance. Payroll only counts approved days." },
    { title: "Payroll Runs", href: "/dashboard/payroll/runs", why: "Generate the month's payroll, approve it and post it." },
    { title: "Reports", href: "/dashboard/payroll/reports", why: "Payslips, register, bank transfer sheet and more." },
  ]

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)", maxWidth: 860 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Payroll</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
        Follow the steps in order. Set up once, then repeat the monthly steps every month.
      </p>

      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "20px 0 10px" }}>Setup (once)</h2>
      {loading ? <div style={{ color: "var(--text-muted)" }}>Loading...</div> : steps.map(s => {
        const isNext = next && next.n === s.n
        return (
          <div key={s.n} style={{ display: "flex", gap: 12, alignItems: "center", background: "var(--card)", border: `1.5px solid ${isNext ? "var(--primary)" : "var(--border)"}`, borderRadius: 12, padding: 14, marginBottom: 10, flexWrap: "wrap" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: s.done ? "#16a34a" : "var(--card-hover)", color: s.done ? "white" : "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>
              {s.done ? "\u2713" : s.n}
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{s.n}. {s.title}{isNext ? "  - do this next" : ""}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.why}</div>
              <div style={{ fontSize: 12, marginTop: 2 }}><strong>{s.detail}</strong></div>
            </div>
            <Link href={s.href} style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid var(--border)", fontWeight: 600, fontSize: 13, color: "var(--text)", textDecoration: "none", background: isNext ? "var(--primary)" : "transparent", ...(isNext ? { color: "var(--primary-text)", borderColor: "var(--primary)" } : {}) }}>
              {s.done ? "Open" : "Start"}
            </Link>
          </div>
        )
      })}

      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "24px 0 10px" }}>Every month</h2>
      {monthly.map((m, i) => (
        <Link key={m.href} href={m.href} style={{ display: "flex", gap: 12, alignItems: "center", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginBottom: 8, textDecoration: "none", color: "var(--text)" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--card-hover)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{i + 1}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{m.title}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{m.why}</div>
          </div>
        </Link>
      ))}
    </div>
  )
}
