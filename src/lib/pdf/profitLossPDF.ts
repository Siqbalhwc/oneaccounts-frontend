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
  id?: number | string
  code: string
  name: string
  type: string           // "Revenue" or "Expense"
  category: string       // e.g. "Direct Expenses", "Operating Expenses"
  amounts: Record<string, number>  // project id → amount
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

  // ── CONTENT ──────────────────────────────────────────────────────
  let Y = HEADER_H + 10
  const ROW_HEIGHT = 6

  if (data.mode === "overall") {
    // ── PORTRAIT MODE ──────────────────────────────────────────────
    const addSection = (title: string, accounts: PnLAccount[], total: number) => {
      // Section header – bold text, no background
      doc.setFont("helvetica", "bold")
      doc.setFontSize(9)
      doc.setTextColor(...DARK)
      doc.text(title, ML + 2, Y + 4)
      doc.text(pkr(total), PW - MR - 2, Y + 4, { align: "right" })
      Y += ROW_HEIGHT

      // Account rows
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

    // Revenue section
    addSection("Income / Revenue", data.revenueAccounts || [], data.totalRevenue || 0)
    if (data.directExpenses?.length) {
      addSection("Cost of Goods Sold / Direct Expenses", data.directExpenses, data.totalDirect || 0)
    }

    // Gross Profit – navy blue bold
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

    // Net Profit – navy blue bold
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(...NAVY)
    doc.text("Net Profit / Loss", ML + 2, Y + 4)
    doc.text(pkr(data.netProfit || 0), PW - MR - 2, Y + 4, { align: "right" })

  } else {
    // ── LANDSCAPE MODE – project‑wise columns ──────────────────────
    const projects = data.projects || []
    const rows = data.compareRows || []

    // Column widths
    const accColW = 60
    const numProj = projects.length
    // Distribute remaining width among project columns + unallocated + total
    const remaining = CW - accColW
    const numExtraCols = numProj + 2  // projects + unallocated + total
    const extraColW = Math.floor(remaining / numExtraCols)

    // Build header
    filledRect(doc, ML, Y, CW, ROW_HEIGHT, NAVY)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    doc.setTextColor(...WHITE)
    let curX = ML
    doc.text("Account", curX + 2, Y + ROW_HEIGHT / 2 + 1.5)
    curX += accColW
    projects.forEach(p => {
      doc.text(p.name, curX + extraColW / 2, Y + ROW_HEIGHT / 2 + 1.5, { align: "center" })
      curX += extraColW
    })
    doc.text("Unalloc.", curX + extraColW / 2, Y + ROW_HEIGHT / 2 + 1.5, { align: "center" })
    curX += extraColW
    doc.text("Total", curX + extraColW / 2, Y + ROW_HEIGHT / 2 + 1.5, { align: "center" })
    Y += ROW_HEIGHT

    // Helper to draw a section
    const addCompareSection = (title: string, filter: (r: PnLCompareRow) => boolean) => {
      // Section header – bold, no background
      doc.setFont("helvetica", "bold")
      doc.setFontSize(8)
      doc.setTextColor(...DARK)
      doc.text(title, ML + 2, Y + 4)
      Y += ROW_HEIGHT

      const sectionRows = rows.filter(filter)
      sectionRows.forEach(row => {
        doc.setFont("helvetica", "normal")
        doc.setFontSize(7)
        doc.setTextColor(...DARK)
        curX = ML
        doc.text(`${row.code} - ${row.name}`, curX + 2, Y + 4)
        curX += accColW
        projects.forEach(p => {
          const val = row.amounts[p.id] || 0
          doc.text(val > 0 ? pkr(val) : "–", curX + extraColW / 2, Y + 4, { align: "center" })
          curX += extraColW
        })
        doc.text(row.unallocated > 0 ? pkr(row.unallocated) : "–", curX + extraColW / 2, Y + 4, { align: "center" })
        curX += extraColW
        doc.text(pkr(row.total), curX + extraColW / 2, Y + 4, { align: "center" })
        Y += ROW_HEIGHT
      })
      Y += 2
    }

    // Sections using type and category from compareRows
    addCompareSection("Income / Revenue", r => r.type === "Revenue")
    addCompareSection("Cost of Goods Sold / Direct Expenses", r => r.category === "Direct Expenses")

    // Gross Profit – navy blue bold
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(...NAVY)
    curX = ML
    doc.text("Gross Profit", curX + 2, Y + 4)
    curX += accColW
    projects.forEach(p => {
      // compute from data if available, else show passed value
      const revRows = rows.filter(r => r.type === "Revenue")
      const expRows = rows.filter(r => r.category === "Direct Expenses")
      const rev = revRows.reduce((s, r) => s + (r.amounts[p.id] || 0), 0)
      const exp = expRows.reduce((s, r) => s + (r.amounts[p.id] || 0), 0)
      const gp = rev - exp
      doc.text(gp !== 0 ? pkr(gp) : "–", curX + extraColW / 2, Y + 4, { align: "center" })
      curX += extraColW
    })
    doc.text("–", curX + extraColW / 2, Y + 4, { align: "center" })
    curX += extraColW
    doc.text(pkr(data.compareGrossProfit || 0), curX + extraColW / 2, Y + 4, { align: "center" })
    Y += ROW_HEIGHT + 2

    addCompareSection("Operating Expenses", r => r.category === "Operating Expenses")
    addCompareSection("Other Expenses", r => r.category === "Other" && r.type === "Expense")

    // Net Profit – navy blue bold
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(...NAVY)
    curX = ML
    doc.text("Net Profit / Loss", curX + 2, Y + 4)
    curX += accColW
    projects.forEach(p => {
      const rev = rows.filter(r => r.type === "Revenue").reduce((s, r) => s + (r.amounts[p.id] || 0), 0)
      const exp = rows.filter(r => r.type === "Expense").reduce((s, r) => s + (r.amounts[p.id] || 0), 0)
      const net = rev - exp
      doc.text(net !== 0 ? pkr(net) : "–", curX + extraColW / 2, Y + 4, { align: "center" })
      curX += extraColW
    })
    doc.text("–", curX + extraColW / 2, Y + 4, { align: "center" })
    curX += extraColW
    doc.text(pkr(data.compareNetProfit || 0), curX + extraColW / 2, Y + 4, { align: "center" })
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