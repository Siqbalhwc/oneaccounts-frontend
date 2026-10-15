"use client"

import { ReactNode, useEffect, useState } from "react"
import { usePlan } from "@/contexts/PlanContext"
import { useRole } from "@/contexts/RoleContext"

// Shared shell for every Payroll page.
//  - feature gate (unchanged)
//  - phone layout: smaller padding, wrapping header rows, stacked grids, bigger tap targets
//  - on phones, ordinary data tables are shown as cards (each row = one card, every value
//    keeps its column name). Wide grids such as the attendance calendar are left alone.

const RESPONSIVE_CSS = `
@media (max-width: 700px) {
  .payroll-root > div { padding: 12px !important; }
  .payroll-root [style*="display: flex"] { flex-wrap: wrap; }
  .payroll-root [style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
  .payroll-root [style*="repeat("]:not([style*="auto-fit"]):not([style*="auto-fill"]) { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  .payroll-root button, .payroll-root select, .payroll-root input:not([type="checkbox"]):not([type="radio"]) { min-height: 40px; }
  .payroll-root .modal-content { max-width: calc(100vw - 24px) !important; }

  .payroll-root table.rt-cards { min-width: 0 !important; width: 100% !important; }
  .payroll-root table.rt-cards thead { display: none; }
  .payroll-root table.rt-cards,
  .payroll-root table.rt-cards tbody,
  .payroll-root table.rt-cards tfoot,
  .payroll-root table.rt-cards tr,
  .payroll-root table.rt-cards td { display: block; width: 100% !important; box-sizing: border-box; }
  .payroll-root table.rt-cards tr {
    border: 1px solid var(--border); border-radius: 10px; margin-bottom: 10px;
    padding: 6px 12px; background: var(--card);
  }
  .payroll-root table.rt-cards td {
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    padding: 6px 0 !important; border: 0 !important; text-align: right !important; min-width: 0;
  }
  .payroll-root table.rt-cards td::before {
    content: attr(data-label); font-size: 11px; font-weight: 700; color: var(--text-muted);
    text-transform: uppercase; text-align: left; flex: 0 0 38%;
  }
  .payroll-root table.rt-cards td[data-label=""]::before { display: none; }
  .payroll-root table.rt-cards td[data-label=""] { justify-content: flex-start; text-align: left !important; }
}
`

const MAX_CARD_COLUMNS = 10
const MAX_CARD_ROWS = 400

// Give every cell of an ordinary table the name of its column, and mark the table as card-able.
function labelTables(root: HTMLElement) {
  root.querySelectorAll("table").forEach((table) => {
    if (table.hasAttribute("data-no-cards")) return
    const headRow = table.querySelector("thead tr")
    const bodyRows = table.querySelectorAll("tbody tr")
    if (!headRow || bodyRows.length === 0 || bodyRows.length > MAX_CARD_ROWS) { table.classList.remove("rt-cards"); return }
    const heads = Array.from(headRow.children).map((th) => (th.textContent || "").trim())
    if (heads.length < 2 || heads.length > MAX_CARD_COLUMNS) { table.classList.remove("rt-cards"); return }
    table.classList.add("rt-cards")
    bodyRows.forEach((tr) => {
      let col = 0
      Array.from(tr.children).forEach((td) => {
        const span = Number(td.getAttribute("colspan") || 1)
        const label = span > 1 ? "" : heads[col] || ""
        if (td.getAttribute("data-label") !== label) td.setAttribute("data-label", label)
        col += span
      })
    })
  })
}

export default function PayrollLayout({ children }: { children: ReactNode }) {
  const { hasFeature, loading: planLoading } = usePlan()
  const { role } = useRole()
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!rootEl) return
    let frame = 0
    const run = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => labelTables(rootEl)) }
    run()
    const mo = new MutationObserver(run)
    mo.observe(rootEl, { childList: true, subtree: true })
    return () => { mo.disconnect(); cancelAnimationFrame(frame) }
  }, [rootEl])

  // Show a minimal inline loader only while plan is still loading.
  // The global dashboard splash already handles the initial role/plan wait,
  // so this only appears on subsequent rapid navigations.
  if (planLoading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
      }}>
        <div style={{
          width: 24, height: 24,
          border: "3px solid var(--border)",
          borderTopColor: "var(--primary)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // If payroll feature is not enabled, show the message
  if (!hasFeature("payroll")) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>
        <h2>Payroll feature is not enabled.</h2>
        <p>Enable it in the Feature Manager.</p>
      </div>
    )
  }

  // All good - render the page content
  return (
    <div className="payroll-root" ref={setRootEl}>
      <style>{RESPONSIVE_CSS}</style>
      {children}
    </div>
  )
}
