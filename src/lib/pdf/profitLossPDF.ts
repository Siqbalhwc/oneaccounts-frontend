import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

// ─── Brand colours ────────────────────────────────────────────────
const NAVY  = [7,   8,  91]  as [number,number,number]
const DARK  = [17,  24,  39]  as [number,number,number]
const MUTED = [107,114, 128]  as [number,number,number]
const BORDER = [229,231, 235]  as [number,number,number]
const WHITE = [255,255, 255]  as [number,number,number]
const ROW_ALT = [248,249, 252]  as [number,number,number]

async function loadImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>(resolve => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result as string)
      reader.onerror = () => resolve("")
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

const pkr = (n: number) =>
  "PKR " + n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export interface PnLAccount {
  code: string
  name: string
  amount: number
}

export interface PnLCompareRow {
  id?: number | string
  code: string
  name: string
  type: string
  category: string
  amounts: Record<string, number>
  unallocated: number
  total: number
}

export interface ProfitLossPDFData {
  companyName: string
  companyTagline: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  logoUrl?: string | null

  startDate: string
  endDate: string
  mode: "overall" | "compare"

  // Overall mode
  revenueAccounts?: PnLAccount[]
  directExpenses?: PnLAccount[]
  operatingExpenses?: PnLAccount[]
  otherExpenses?: PnLAccount[]
  grossProfit?: number
  netProfit?: number
  totalRevenue?: number
  totalDirect?: number
  totalOpEx?: number
  totalOther?: number

  // Compare mode
  projects?: { id: string; name: string }[]
  compareRows?: PnLCompareRow[]
  compareGrossProfit?: number
  compareNetProfit?: number
}

export async function generateProfitLossPDF(data: ProfitLossPDFData): Promise<jsPDF> {
  const isLandscape = data.mode === "compare"
  const doc = new jsPDF({
    orientation: isLandscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  })

  const PW = isLandscape ? 297 : 210
  const PH = isLandscape ? 210 : 297
  const ML = 14
  const MR = 14
  const CW = PW - ML - MR

  // ── LOGO & COMPANY INFO ─────────────────────────────────────────
  const LOGO_SIZE = 18
  const LOGO_X = ML
  const LOGO_Y = 6
  let logoData: string | null = null
  if (data.logoUrl) {
    logoData = await loadImage(data.logoUrl)
  }
  if (logoData) {
    doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)
  }

  const textX = logoData ? LOGO_X + LOGO_SIZE + 4 : ML
  doc.setTextColor(...NAVY)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text(data.companyName || "Your Company", textX, LOGO_Y + 7)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(data.companyTagline || "", textX, LOGO_Y + 13)

  let infoY = LOGO_Y + 18
  if (data.companyAddress) { doc.text(data.companyAddress, textX, infoY); infoY += 4 }
  if (data.companyPhone)   { doc.text("Phone: " + data.companyPhone, textX, infoY); infoY += 4 }
  if (data.companyEmail)   { doc.text("Email: " + data.companyEmail, textX, infoY) }

  // ── REPORT TITLE ─────────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(26)
  doc.setTextColor(...NAVY)
  doc.text("PROFIT & LOSS", PW - MR, LOGO_Y + 9, { align: "right" })

  // Single‑line date
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(`From: ${data.startDate}  To: ${data.endDate}`, PW - MR, LOGO_Y + 16, { align: "right" })

  const HEADER_H = LOGO_Y + LOGO_SIZE + 4
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.4)
  doc.line(ML, HEADER_H, PW - MR, HEADER_H)

  let Y = HEADER_H + 10
  const ROW_HEIGHT = 6

  if (data.mode === "overall") {
    // ── PORTRAIT MODE (unchanged, works) ──────────────────────────
    const addSection = (title: string, accounts: PnLAccount[], total: number) => {
      doc.setFont("helvetica", "bold")
      doc.setFontSize(9)
      doc.setTextColor(...DARK)
      doc.text(title, ML + 2, Y + 4)
      doc.text(pkr(total), PW - MR - 2, Y + 4, { align: "right" })
      Y += ROW_HEIGHT

      accounts.forEach(acc => {
        doc.setFont("helvetica", "normal")
        doc.setFontSize(8)
        doc.setTextColor(...DARK)
        doc.text(`${acc.code} - ${acc.name}`, ML + 5, Y + 4)
        doc.text(pkr(acc.amount), PW - MR - 2, Y + 4, { align: "right" })
        Y += ROW_HEIGHT
      })
      Y += 2
    }

    addSection("Income / Revenue", data.revenueAccounts || [], data.totalRevenue || 0)
    if (data.directExpenses?.length) {
      addSection("Cost of Goods Sold / Direct Expenses", data.directExpenses, data.totalDirect || 0)
    }

    // Gross Profit
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(...NAVY)
    doc.text("Gross Profit", ML + 2, Y + 4)
    doc.text(pkr(data.grossProfit || 0), PW - MR - 2, Y + 4, { align: "right" })
    Y += ROW_HEIGHT + 2

    if (data.operatingExpenses?.length) {
      addSection("Operating Expenses", data.operatingExpenses, data.totalOpEx || 0)
    }
    if (data.otherExpenses?.length) {
      addSection("Other Expenses", data.otherExpenses, data.totalOther || 0)
    }

    // Net Profit
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(...NAVY)
    doc.text("Net Profit / Loss", ML + 2, Y + 4)
    doc.text(pkr(data.netProfit || 0), PW - MR - 2, Y + 4, { align: "right" })
  } else {
    // ── LANDSCAPE MODE – using autoTable for perfect alignment ────
    const projects = data.projects || []
    const rows = data.compareRows || []

    // Build column headers
    const headers = ["Account", ...projects.map(p => p.name), "Unallocated", "Total"]
    // Build data rows
    const tableRows: any[] = []

    // Helper to add a section
    const addSectionRows = (title: string, filter: (r: PnLCompareRow) => boolean) => {
      // Section header row (bold, no background – autoTable will style it)
      tableRows.push([title, ...projects.map(() => ""), "", ""])
      rows.filter(filter).forEach(row => {
        const projVals = projects.map(p => {
          const val = row.amounts[p.id] || 0
          return val > 0 ? pkr(val) : "–"
        })
        tableRows.push([
          `${row.code} - ${row.name}`,
          ...projVals,
          row.unallocated > 0 ? pkr(row.unallocated) : "–",
          pkr(row.total),
        ])
      })
    }

    addSectionRows("Income / Revenue", r => r.type === "Revenue")
    addSectionRows("Cost of Goods Sold / Direct Expenses", r => r.category === "Direct Expenses")

    // Gross Profit row
    const gpRow = ["Gross Profit"]
    projects.forEach(p => {
      const rev = rows.filter(r => r.type === "Revenue").reduce((s, r) => s + (r.amounts[p.id] || 0), 0)
      const exp = rows.filter(r => r.category === "Direct Expenses").reduce((s, r) => s + (r.amounts[p.id] || 0), 0)
      const gp = rev - exp
      gpRow.push(gp !== 0 ? pkr(gp) : "–")
    })
    gpRow.push("–", pkr(data.compareGrossProfit || 0))
    tableRows.push(gpRow)

    addSectionRows("Operating Expenses", r => r.category === "Operating Expenses")
    addSectionRows("Other Expenses", r => r.category === "Other" && r.type === "Expense")

    // Net Profit row
    const netRow = ["Net Profit / Loss"]
    projects.forEach(p => {
      const rev = rows.filter(r => r.type === "Revenue").reduce((s, r) => s + (r.amounts[p.id] || 0), 0)
      const exp = rows.filter(r => r.type === "Expense").reduce((s, r) => s + (r.amounts[p.id] || 0), 0)
      const net = rev - exp
      netRow.push(net !== 0 ? pkr(net) : "–")
    })
    netRow.push("–", pkr(data.compareNetProfit || 0))
    tableRows.push(netRow)

    // Generate table with autoTable
    autoTable(doc, {
      startY: Y,
      margin: { left: ML, right: MR },
      head: [headers],
      body: tableRows,
      styles: {
        fontSize: 7,
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        textColor: DARK,
        lineColor: BORDER,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: NAVY,
        textColor: WHITE,
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: ROW_ALT },
      // Style section headers and totals
      didParseCell: (hookData) => {
        const rowData = hookData.row.raw as string[]
        if (rowData && ["Income / Revenue", "Cost of Goods Sold / Direct Expenses", "Operating Expenses", "Other Expenses"].includes(rowData[0])) {
          hookData.cell.styles.fontStyle = "bold"
          hookData.cell.styles.textColor = DARK
          hookData.cell.styles.fillColor = [240, 240, 245]
        }
        if (rowData && rowData[0] === "Gross Profit") {
          hookData.cell.styles.fontStyle = "bold"
          hookData.cell.styles.textColor = NAVY
          hookData.cell.styles.fillColor = [230, 235, 250]
        }
        if (rowData && rowData[0] === "Net Profit / Loss") {
          hookData.cell.styles.fontStyle = "bold"
          hookData.cell.styles.textColor = WHITE
          hookData.cell.styles.fillColor = NAVY
        }
      },
      columnStyles: {
        0: { cellWidth: 60, halign: "left" },
      },
    })
  }

  // ── FOOTER ───────────────────────────────────────────────────────
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(ML, PH - 16, PW - MR, PH - 16)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  const footerParts = ["Generated by " + data.companyName, data.companyTagline].filter(Boolean)
  doc.text(footerParts.join(" · "), PW / 2, PH - 10, { align: "center" })

  return doc
}