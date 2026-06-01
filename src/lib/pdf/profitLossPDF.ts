import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

// ─── Brand colours (matching Trial Balance) ──────────────────────
const NAVY   = [7,   8,  91]  as [number,number,number]
const DARK   = [17,  24,  39]  as [number,number,number]
const MUTED  = [107,114, 128]  as [number,number,number]
const BORDER = [229,231, 235]  as [number,number,number]
const WHITE  = [255,255, 255]  as [number,number,number]
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

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(`From: ${data.startDate}  To: ${data.endDate}`, PW - MR, LOGO_Y + 16, { align: "right" })

  const HEADER_H = LOGO_Y + LOGO_SIZE + 4
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.4)
  doc.line(ML, HEADER_H, PW - MR, HEADER_H)

  // ── HELPER: build a section with rows ──────────────────────────
  const addSection = (rows: any[], title: string, items: any[], total: number, color: [number,number,number]) => {
    if (!items || items.length === 0) return
    rows.push([{ content: title, styles: { fontStyle: "bold", fillColor: [240,240,245], textColor: color } },
               { content: pkr(total), styles: { fontStyle: "bold", fillColor: [240,240,245], textColor: color, halign: "right" } }])
    items.forEach((item: any) => {
      rows.push([{ content: `${item.code} – ${item.name}`, styles: { textColor: DARK } },
                 { content: pkr(item.amount), styles: { textColor: DARK, halign: "right" } }])
    })
  }

  if (data.mode === "overall") {
    const rows: any[] = []

    // Header
    rows.push([{ content: "Account", styles: { fontStyle: "bold", fillColor: NAVY, textColor: WHITE } },
               { content: "Amount (PKR)", styles: { fontStyle: "bold", fillColor: NAVY, textColor: WHITE, halign: "right" } }])

    addSection(rows, "Income / Revenue", data.revenueAccounts || [], data.totalRevenue || 0, [16,185,129])

    if (data.directExpenses && data.directExpenses.length > 0) {
      addSection(rows, "Cost of Goods Sold / Direct Expenses", data.directExpenses, data.totalDirect || 0, [239,68,68])
      rows.push([{ content: "Gross Profit", styles: { fontStyle: "bold", fillColor: NAVY, textColor: WHITE } },
                 { content: pkr(data.grossProfit || 0), styles: { fontStyle: "bold", fillColor: NAVY, textColor: WHITE, halign: "right" } }])
    }

    if (data.operatingExpenses && data.operatingExpenses.length > 0) {
      addSection(rows, "Operating Expenses", data.operatingExpenses, data.totalOpEx || 0, [245,158,11])
    }

    if (data.otherExpenses && data.otherExpenses.length > 0) {
      addSection(rows, "Other Expenses", data.otherExpenses, data.totalOther || 0, [139,92,246])
    }

    rows.push([{ content: "Net Profit / Loss", styles: { fontStyle: "bold", fillColor: NAVY, textColor: WHITE } },
               { content: pkr(data.netProfit || 0), styles: { fontStyle: "bold", fillColor: NAVY, textColor: WHITE, halign: "right" } }])

    autoTable(doc, {
      startY: HEADER_H + 10,
      margin: { left: ML, right: MR },
      body: rows,
      theme: "plain",
      styles: { fontSize: 9, cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 }, textColor: DARK },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: {
        0: { cellWidth: CW * 0.65 },
        1: { cellWidth: CW * 0.35, halign: "right" },
      },
    })

    const finalY = (doc as any).lastAutoTable.finalY
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.3)
    doc.rect(ML, HEADER_H + 10, CW, finalY - HEADER_H - 10, "S")
  } else {
    // ── COMPARE MODE ───────────────────────────────────────────────
    const projects = data.projects || []
    const rows = data.compareRows || []

    const headers = ["Account", ...projects.map(p => p.name), "Unallocated", "Total"]
    const tableRows: any[] = []
    tableRows.push(headers.map(h => ({ content: h, styles: { fontStyle: "bold", fillColor: NAVY, textColor: WHITE, halign: h === "Account" ? "left" : "right" } })))

    const addCompareSection = (title: string, filter: (r: any) => boolean, color: [number,number,number]) => {
      const sectionRows = rows.filter(filter)
      if (sectionRows.length === 0) return
      tableRows.push([{ content: title, styles: { fontStyle: "bold", fillColor: [240,240,245], textColor: color, halign: "left" } },
                      ...projects.map(() => ""), "", ""])

      sectionRows.forEach((row: any) => {
        const projVals = projects.map(p => row.amounts[p.id] ? pkr(row.amounts[p.id]) : "–")
        tableRows.push([{ content: `${row.code} – ${row.name}`, styles: { halign: "left" } },
                        ...projVals.map(v => ({ content: v, styles: { halign: "right" } })),
                        { content: row.unallocated ? pkr(row.unallocated) : "–", styles: { halign: "right" } },
                        { content: pkr(row.total), styles: { halign: "right", fontStyle: "bold" } }])
      })

      // Subtotal
      const subTotalVals = projects.map(p => {
        const sum = sectionRows.reduce((s: number, r: any) => s + (r.amounts[p.id] || 0), 0)
        return sum ? pkr(sum) : "–"
      })
      const unallocSum = sectionRows.reduce((s: number, r: any) => s + r.unallocated, 0)
      const totalSum = sectionRows.reduce((s: number, r: any) => s + r.total, 0)
      tableRows.push([{ content: `Total ${title}`, styles: { fontStyle: "bold", halign: "left" } },
                      ...subTotalVals.map(v => ({ content: v, styles: { halign: "right", fontStyle: "bold" } })),
                      { content: unallocSum ? pkr(unallocSum) : "–", styles: { halign: "right", fontStyle: "bold" } },
                      { content: pkr(totalSum), styles: { halign: "right", fontStyle: "bold" } }])
    }

    // Revenue
    addCompareSection("Income / Revenue", (r: any) => r.type === "Revenue", [16,185,129])

    // Direct Expenses
    addCompareSection("Direct Expenses", (r: any) => r.category === "Direct Expenses", [239,68,68])

    // Gross Profit
    const gpVals = projects.map(p => {
      const rev = rows.filter(r => r.type === "Revenue").reduce((s, r) => s + (r.amounts[p.id] || 0), 0)
      const exp = rows.filter(r => r.category === "Direct Expenses").reduce((s, r) => s + (r.amounts[p.id] || 0), 0)
      const gp = rev - exp
      return gp !== 0 ? pkr(gp) : "–"
    })
    tableRows.push([{ content: "Gross Profit", styles: { fontStyle: "bold", fillColor: NAVY, textColor: WHITE, halign: "left" } },
                    ...gpVals.map(v => ({ content: v, styles: { halign: "right", fillColor: NAVY, textColor: WHITE } })),
                    { content: "–", styles: { fillColor: NAVY, textColor: WHITE, halign: "right" } },
                    { content: pkr(data.compareGrossProfit || 0), styles: { fillColor: NAVY, textColor: WHITE, halign: "right", fontStyle: "bold" } }])

    // Operating Expenses
    addCompareSection("Operating Expenses", (r: any) => r.category === "Operating Expenses", [245,158,11])

    // Other Expenses
    addCompareSection("Other Expenses", (r: any) => r.category === "Other" && r.type === "Expense", [139,92,246])

    // Net Profit
    const netVals = projects.map(p => {
      const rev = rows.filter(r => r.type === "Revenue").reduce((s, r) => s + (r.amounts[p.id] || 0), 0)
      const exp = rows.filter(r => r.type === "Expense").reduce((s, r) => s + (r.amounts[p.id] || 0), 0)
      const net = rev - exp
      return net !== 0 ? pkr(net) : "–"
    })
    tableRows.push([{ content: "Net Profit / Loss", styles: { fontStyle: "bold", fillColor: NAVY, textColor: WHITE, halign: "left" } },
                    ...netVals.map(v => ({ content: v, styles: { halign: "right", fillColor: NAVY, textColor: WHITE } })),
                    { content: "–", styles: { fillColor: NAVY, textColor: WHITE, halign: "right" } },
                    { content: pkr(data.compareNetProfit || 0), styles: { fillColor: NAVY, textColor: WHITE, halign: "right", fontStyle: "bold" } }])

    autoTable(doc, {
      startY: HEADER_H + 10,
      margin: { left: ML, right: MR },
      head: [],
      body: tableRows,
      theme: "plain",
      styles: {
        fontSize: 7,
        cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
        textColor: DARK,
        lineColor: BORDER,
        lineWidth: 0.2,
      },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: {
        0: { cellWidth: 55, halign: "left" },
      },
    })

    const finalY = (doc as any).lastAutoTable.finalY
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.3)
    doc.rect(ML, HEADER_H + 10, CW, finalY - HEADER_H - 10, "S")
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