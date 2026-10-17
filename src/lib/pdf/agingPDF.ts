// AR Aging and AP Aging PDF - one generator so both always look identical.
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { fmtMoney } from "../money"
import {
  NAVY, DARK, WHITE, BORDER, ROW_ALT, ML, MR,
  drawReportHeader, addFooterAndPageNumbers, CompanyHeaderInfo,
} from "./reportCommon"

export interface AgingDocRow {
  docNo: string
  docDate: string
  current: number
  days1to30: number
  days31to60: number
  days61to90: number
  over90: number
  total: number
}

export interface AgingGroupData {
  name: string
  current: number
  days1to30: number
  days31to60: number
  days61to90: number
  over90: number
  total: number
  rows: AgingDocRow[]
}

export interface AgingPDFData extends CompanyHeaderInfo {
  kind: "AR" | "AP"
  asOfDate: string
  filterLabel: string          // e.g. "All Customers" / "Junaid Said"
  groups: AgingGroupData[]
  totals: { current: number; days1to30: number; days31to60: number; days61to90: number; over90: number; total: number }
}

const f = (n: number) => (n ? fmtMoney(n) : "\u2013")

export async function generateAgingPDF(data: AgingPDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const isAR = data.kind === "AR"

  const startY = await drawReportHeader(
    doc,
    data,
    isAR ? "AR AGING REPORT" : "AP AGING REPORT",
    [
      `${isAR ? "Customer" : "Supplier"}: ${data.filterLabel}`,
      `As of: ${data.asOfDate}`,
    ]
  )

  const headers = [
    isAR ? "Customer" : "Supplier",
    isAR ? "Invoice #" : "Bill #",
    "Date",
    "Current",
    "1-30",
    "31-60",
    "61-90",
    "90+",
    "Total (PKR)",
  ]

  const body: any[] = []
  const types: ("group" | "doc" | "sub" | "grand")[] = []

  data.groups.forEach(g => {
    body.push([g.name, "", "", "", "", "", "", "", ""]); types.push("group")
    g.rows.forEach(r => {
      body.push(["", r.docNo, r.docDate, f(r.current), f(r.days1to30), f(r.days31to60), f(r.days61to90), f(r.over90), f(r.total)])
      types.push("doc")
    })
    body.push(["Subtotal", "", "", f(g.current), f(g.days1to30), f(g.days31to60), f(g.days61to90), f(g.over90), f(g.total)])
    types.push("sub")
  })
  body.push(["Grand Total", "", "", f(data.totals.current), f(data.totals.days1to30), f(data.totals.days31to60), f(data.totals.days61to90), f(data.totals.over90), f(data.totals.total)])
  types.push("grand")

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
      0: { halign: "left" },
      1: { halign: "left", cellWidth: 36 },
      2: { halign: "left", cellWidth: 26 },
      3: { halign: "right", cellWidth: 28 },
      4: { halign: "right", cellWidth: 28 },
      5: { halign: "right", cellWidth: 28 },
      6: { halign: "right", cellWidth: 28 },
      7: { halign: "right", cellWidth: 28 },
      8: { halign: "right", cellWidth: 32, fontStyle: "bold" },
    },
    didParseCell: (h: any) => {
      if (h.section === "head" && h.column.index >= 3) h.cell.styles.halign = "center"
      if (h.section !== "body") return
      const t = types[h.row.index]
      if (t === "group") {
        h.cell.styles.fontStyle = "bold"
        h.cell.styles.fillColor = [235, 238, 250]
      } else if (t === "sub") {
        h.cell.styles.fontStyle = "bold"
        h.cell.styles.fillColor = [219, 224, 245]
      } else if (t === "grand") {
        h.cell.styles.fontStyle = "bold"
        h.cell.styles.fillColor = NAVY
        h.cell.styles.textColor = WHITE
      }
    },
  })

  addFooterAndPageNumbers(doc, data.companyName, data.companyTagline)
  return doc
}
