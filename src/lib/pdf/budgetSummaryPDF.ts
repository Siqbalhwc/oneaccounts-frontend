// Budget Summary (flat Budget Report) PDF - General Ledger style.
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { fmtMoney } from "../money"
import {
  NAVY, DARK, WHITE, BORDER, ROW_ALT, ML, MR,
  drawReportHeader, addFooterAndPageNumbers, CompanyHeaderInfo,
} from "./reportCommon"

export interface BudgetSummaryRow {
  project: string
  donor: string
  activity: string
  location: string
  account_code: string
  account_name: string
  amount: number
}

export interface BudgetSummaryPDFData extends CompanyHeaderInfo {
  fiscalYear: number | string
  projectName?: string          // blank = all projects
  rows: BudgetSummaryRow[]
}

export async function generateBudgetSummaryPDF(data: BudgetSummaryPDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })

  const startY = await drawReportHeader(doc, data, "BUDGET SUMMARY", [
    `Project: ${data.projectName || "All Projects"}`,
    `Fiscal Year: ${data.fiscalYear}`,
  ])

  const headers = ["Project", "Donor", "Activity", "Location", "Code", "Account", "Budget (PKR)"]
  const body: any[] = data.rows.map(r => [
    r.project, r.donor, r.activity, r.location, r.account_code, r.account_name, fmtMoney(r.amount || 0),
  ])
  const grand = data.rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  body.push(["Grand Total", "", "", "", "", "", fmtMoney(grand)])
  const lastIdx = body.length - 1

  autoTable(doc, {
    startY,
    margin: { top: 14, left: ML, right: MR, bottom: 18 },
    head: [headers],
    body,
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      textColor: DARK,
      lineColor: BORDER,
      lineWidth: 0.2,
      overflow: "linebreak",
    },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      4: { cellWidth: 20 },
      6: { cellWidth: 36, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (h: any) => {
      if (h.section === "head" && h.column.index === 6) h.cell.styles.halign = "center"
      if (h.section === "body" && h.row.index === lastIdx) {
        h.cell.styles.fontStyle = "bold"
        h.cell.styles.fillColor = NAVY
        h.cell.styles.textColor = WHITE
      }
    },
  })

  addFooterAndPageNumbers(doc, data.companyName, data.companyTagline)
  return doc
}
