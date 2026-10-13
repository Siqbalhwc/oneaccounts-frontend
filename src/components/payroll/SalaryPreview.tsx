"use client"

import { useEffect, useMemo, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import Link from "next/link"
import { computeSalary, describeCalc, type SalaryBasis, type StructureLine } from "@/lib/payrollCalc"

// Shows how a salary figure is split by a structure, live.
// Used on the structure page (sample figure), the employee form and the salary revision form.

interface Props {
  structureId: number | null
  amount: string
  onAmountChange?: (v: string) => void
  refreshKey?: any
  title?: string
}

export default function SalaryPreview({ structureId, amount, onAmountChange, refreshKey, title }: Props) {
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), [])
  const [basis, setBasis] = useState<SalaryBasis>("gross")
  const [lines, setLines] = useState<StructureLine[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!structureId) { setLines([]); setLoaded(false); return }
    const load = async () => {
      const { data: st } = await supabase.from("salary_structures").select("salary_basis").eq("id", structureId).maybeSingle()
      const { data: comps } = await supabase
        .from("salary_structure_components")
        .select("calculation_type, value, salary_component_id, salary_components!inner(id, name, type, is_basic)")
        .eq("salary_structure_id", structureId)
      if (cancelled) return
      setBasis(st?.salary_basis === "basic" ? "basic" : "gross")
      setLines((comps || []).map((c: any) => ({
        key: c.salary_component_id,
        name: c.salary_components?.name || "Unknown",
        type: c.salary_components?.type === "earning" ? "earning" : "deduction",
        isBasic: !!c.salary_components?.is_basic,
        calcType: c.calculation_type,
        value: Number(c.value || 0),
      })) as StructureLine[])
      setLoaded(true)
    }
    load()
    return () => { cancelled = true }
  }, [structureId, refreshKey, supabase])

  const result = useMemo(() => computeSalary(lines, basis, Number(amount)), [lines, basis, amount])
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  const label = basis === "gross" ? "Gross Salary" : "Basic Salary"

  if (!structureId) {
    return (
      <div style={{ background: "var(--card-hover)", border: "1px dashed var(--border)", borderRadius: 8, padding: 12, fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
        Pick a salary structure to enter the salary and see how it is split.
        <br />
        No structure yet? Set up first: <strong>1. Salary Components</strong> then <strong>2. Salary Structures</strong>.{" "}
        <Link href="/dashboard/payroll" style={{ color: "var(--primary)" }}>Open Payroll Home</Link>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {onAmountChange && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, display: "block" }}>
            {label} (per month) *
          </label>
          <input
            type="number" step="any" value={amount} onChange={e => onAmountChange(e.target.value)} placeholder="e.g. 100000"
            style={{ width: "100%", height: 38, border: "1.5px solid var(--border)", borderRadius: 8, padding: "0 12px", fontSize: 13, boxSizing: "border-box", background: "var(--bg)", color: "var(--text)" }}
          />
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            {basis === "gross"
              ? "This structure splits the Gross you enter into Basic, House Rent and so on."
              : "This structure takes the Basic you enter and adds the allowances on top."}
          </div>
        </div>
      )}

      {loaded && lines.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>This structure has no components yet - add them on the Salary Structures page.</div>
      )}

      {loaded && lines.length > 0 && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ background: "var(--card-hover)", padding: "8px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
            {title || "How this salary is calculated"}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {result.lines.filter(l => l.type === "earning").map((l, i) => (
                  <tr key={"e" + i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px" }}>{l.name}{l.isBasic ? " (Basic)" : ""}</td>
                    <td style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: 12 }}>{describeCalc(l.calcType, l.value)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmt(l.amount)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "1px solid var(--border)", fontWeight: 700, background: "var(--card-hover)" }}>
                  <td style={{ padding: "8px 12px" }} colSpan={2}>Gross</td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmt(result.gross)}</td>
                </tr>
                {result.lines.filter(l => l.type !== "earning").map((l, i) => (
                  <tr key={"d" + i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px" }}>{l.name}</td>
                    <td style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: 12 }}>{describeCalc(l.calcType, l.value)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>- {fmt(l.amount)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
                  <td style={{ padding: "10px 12px" }} colSpan={2}>Net pay (before attendance, loans and advances)</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(result.net)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loaded && result.warnings.length > 0 && Number(amount) > 0 && (
        <div style={{ marginTop: 8, background: "var(--card)", border: "1px solid #F59E0B", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "var(--text)" }}>
          {result.warnings.map((w, i) => <div key={i}>Warning: {w}</div>)}
        </div>
      )}
    </div>
  )
}
