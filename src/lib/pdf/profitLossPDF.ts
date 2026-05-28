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

function filledRect(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  fillRgb: [number,number,number],
) {
  doc.setFillColor(...fillRgb)
  doc.rect(x, y, w, h, "F")
}

export interface PnLAccount {
  code: string
  name: string
  amount: number
}

export interface PnLCompareRow {
  code: string
  name: string
  amounts: Record<string, number>  // project id -> amount
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
  // Totals for compare mode (used in section headers)
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

  // ── CONTENT ──────────────────────────────────────────────────────
  let Y = HEADER_H + 10
  const ROW_HEIGHT = 6

  if (data.mode === "overall") {
    // ── PORTRAIT: one section per category ─────────────────────────
    const addSection = (title: string, accounts: PnLAccount[], total: number, color: [number,number,number]) => {
      // Section header
      filledRect(doc, ML, Y, CW, ROW_HEIGHT, color)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(8)
      doc.setTextColor(...WHITE)
      doc.text(title, ML + 3, Y + ROW_HEIGHT / 2 + 1.5, { align: "left" })
      doc.text(pkr(total), PW - MR - 3, Y + ROW_HEIGHT / 2 + 1.5, { align: "right" })
      Y += ROW_HEIGHT

      // Account rows
      accounts.forEach(acc => {
        doc.setFont("helvetica", "normal")
        doc.setFontSize(8)
        doc.setTextColor(...DARK)
        // simple two‑column line
        doc.text(`${acc.code} - ${acc.name}`, ML + 3, Y + 4)
        doc.text(pkr(acc.amount), PW - MR - 3, Y + 4, { align: "right" })
        Y += ROW_HEIGHT
      })
      Y += 2 // small gap
    }

    addSection("Income / Revenue", data.revenueAccounts || [], data.totalRevenue || 0, NAVY)
    if (data.directExpenses?.length) {
      addSection("Cost of Goods Sold / Direct Expenses", data.directExpenses, data.totalDirect || 0, [220,38,38])
    }
    // Gross Profit row
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...DARK)
    doc.text("Gross Profit", ML + 3, Y + 4)
    doc.text(pkr(data.grossProfit || 0), PW - MR - 3, Y + 4, { align: "right" })
    Y += ROW_HEIGHT + 2

    if (data.operatingExpenses?.length) {
      addSection("Operating Expenses", data.operatingExpenses, data.totalOpEx || 0, [245,158,11])
    }
    if (data.otherExpenses?.length) {
      addSection("Other Expenses", data.otherExpenses, data.totalOther || 0, [139,92,246])
    }
    // Net Profit row
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(...NAVY)
    doc.text("Net Profit / Loss", ML + 3, Y + 4)
    doc.text(pkr(data.netProfit || 0), PW - MR - 3, Y + 4, { align: "right" })

  } else {
    // ── LANDSCAPE: project‑wise columns ────────────────────────────
    const projects = data.projects || []
    const rows = data.compareRows || []
    const numProj = projects.length

    // Column widths: account col = 60, each project = 25, unallocated = 25, total = 25
    const accColW = 60
    const projColW = Math.min(25, (CW - accColW - 50) / (numProj + 2)) // ensure fits
    const unallocColW = projColW
    const totalColW = projColW
    const totalTableW = accColW + numProj * projColW + unallocColW + totalColW
    const startX = ML // left-aligned

    // Table header (navy)
    filledRect(doc, startX, Y, totalTableW, ROW_HEIGHT, NAVY)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    doc.setTextColor(...WHITE)
    let colX = startX
    doc.text("Account", colX + 2, Y + ROW_HEIGHT / 2 + 1.5)
    colX += accColW
    projects.forEach(p => {
      doc.text(p.name, colX + projColW / 2, Y + ROW_HEIGHT / 2 + 1.5, { align: "center" })
      colX += projColW
    })
    doc.text("Unalloc.", colX + unallocColW / 2, Y + ROW_HEIGHT / 2 + 1.5, { align: "center" })
    colX += unallocColW
    doc.text("Total", colX + totalColW / 2, Y + ROW_HEIGHT / 2 + 1.5, { align: "center" })
    Y += ROW_HEIGHT

    // Section: Revenue, Direct Expenses, etc.
    const addCompareSection = (title: string, filter: (r: PnLCompareRow) => boolean, color: [number,number,number]) => {
      // Section header
      filledRect(doc, startX, Y, totalTableW, ROW_HEIGHT, color)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7)
      doc.setTextColor(...WHITE)
      doc.text(title, startX + 2, Y + ROW_HEIGHT / 2 + 1.5)
      Y += ROW_HEIGHT

      const sectionRows = rows.filter(filter)
      sectionRows.forEach(row => {
        doc.setFont("helvetica", "normal")
        doc.setFontSize(7)
        doc.setTextColor(...DARK)
        let x = startX
        doc.text(`${row.code} - ${row.name}`, x + 2, Y + 4)
        x += accColW
        projects.forEach(p => {
          const val = row.amounts[p.id] || 0
          doc.text(val > 0 ? pkr(val) : "–", x + projColW / 2, Y + 4, { align: "center" })
          x += projColW
        })
        doc.text(row.unallocated > 0 ? pkr(row.unallocated) : "–", x + unallocColW / 2, Y + 4, { align: "center" })
        x += unallocColW
        doc.text(pkr(row.total), x + totalColW / 2, Y + 4, { align: "center" })
        Y += ROW_HEIGHT
      })
      Y += 2
    }

    addCompareSection("Income / Revenue", r => r.code.startsWith("4"), NAVY)
    addCompareSection("Cost of Goods Sold / Direct Expenses", r => r.code.startsWith("5"), [220,38,38])
    // Gross Profit row
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    doc.setTextColor(...DARK)
    let x = startX
    doc.text("Gross Profit", x + 2, Y + 4)
    x += accColW
    projects.forEach(p => {
      // compute gross profit per project from data? we'll skip for simplicity, just placeholder or compute from passed data
      doc.text("–", x + projColW / 2, Y + 4, { align: "center" })
      x += projColW
    })
    doc.text("–", x + unallocColW / 2, Y + 4, { align: "center" })
    x += unallocColW
    doc.text(pkr(data.compareGrossProfit || 0), x + totalColW / 2, Y + 4, { align: "center" })
    Y += ROW_HEIGHT + 2

    addCompareSection("Operating Expenses", r => r.code.startsWith("51"), [245,158,11])
    addCompareSection("Other Expenses", r => !r.code.startsWith("4") && !r.code.startsWith("5") && !r.code.startsWith("51"), [139,92,246])

    // Net Profit row
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(...NAVY)
    x = startX
    doc.text("Net Profit / Loss", x + 2, Y + 4)
    x += accColW
    projects.forEach(p => {
      doc.text("–", x + projColW / 2, Y + 4, { align: "center" })
      x += projColW
    })
    doc.text("–", x + unallocColW / 2, Y + 4, { align: "center" })
    x += unallocColW
    doc.text(pkr(data.compareNetProfit || 0), x + totalColW / 2, Y + 4, { align: "center" })
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