import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const NAVY   = [7,8,91] as [number,number,number]
const DARK   = [17,24,39] as [number,number,number]
const MUTED  = [107,114,128] as [number,number,number]
const BORDER = [229,231,235] as [number,number,number]
const WHITE  = [255,255,255] as [number,number,number]
const ROW_ALT = [248,249,252] as [number,number,number]

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
  } catch { return null }
}

const pkr = (n: number) => "PKR " + n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export interface ProjectPDFData {
  companyName: string
  companyTagline: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  logoUrl?: string | null

  projectName: string
  projectCode?: string
  projectDescription?: string
  donorName?: string
  projectStatus: string
  isApproved: boolean
  totalBudgeted?: number

  accountGroups: { code: string; name: string; amount: number; type: string }[]
  monthlyTotals: { month: string; budget: number; actual: number; type: string }[]
}

export async function generateProjectPDF(data: ProjectPDFData): Promise<jsPDF> {
  // Landscape A4
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const PW = 297, PH = 210, ML = 14, MR = 14

  // ── Logo & company info ──────────────────────────────────────
  const LOGO_SIZE = 20, LOGO_X = ML, LOGO_Y = 7
  let logoData: string | null = null
  if (data.logoUrl) logoData = await loadImage(data.logoUrl)
  if (logoData) doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)

  const textX = logoData ? LOGO_X + LOGO_SIZE + 5 : ML
  doc.setTextColor(...NAVY)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text(data.companyName || "Your Company", textX, LOGO_Y + 7)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(data.companyTagline || "", textX, LOGO_Y + 13)

  let infoY = LOGO_Y + 19
  if (data.companyAddress) { doc.text(data.companyAddress, textX, infoY); infoY += 4 }
  if (data.companyPhone)   { doc.text("Phone: " + data.companyPhone, textX, infoY); infoY += 4 }
  if (data.companyEmail)   { doc.text("Email: " + data.companyEmail, textX, infoY) }

  // ── Report title ─────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(24)
  doc.setTextColor(...NAVY)
  doc.text("PROJECT REPORT", PW - MR, LOGO_Y + 8, { align: "right" })

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(`Project: ${data.projectName}`, PW - MR, LOGO_Y + 16, { align: "right" })

  const HEADER_BOTTOM = LOGO_Y + LOGO_SIZE + 5
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.6)
  doc.line(ML, HEADER_BOTTOM, PW - MR, HEADER_BOTTOM)

  let Y = HEADER_BOTTOM + 6

  // ── Project details box ──────────────────────────────────────
  const details = [
    ["Project Name", data.projectName],
    ["Donor", data.donorName || "—"],
    ["Status", data.projectStatus],
    ["Approved", data.isApproved ? "Yes" : "No"],
    ["Total Budgeted", data.totalBudgeted ? pkr(data.totalBudgeted) : "—"],
  ]

  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...DARK)
  doc.text("Project Details", ML, Y)
  Y += 6

  details.forEach(([label, value], i) => {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(...DARK)
    doc.text(label, ML + 2, Y + 4)
    doc.setFont("helvetica", "normal")
    doc.text(value, ML + 60, Y + 4)
    Y += 8
    if (i % 2 === 0) {
      doc.setFillColor(245, 246, 250)
      doc.rect(ML, Y - 8, PW - ML - MR, 8, "F")
    }
  })

  Y += 6

  // ── Monthly Budget vs Actual ──────────────────────────────────
  if (data.monthlyTotals.length > 0) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(...DARK)
    doc.text("Monthly Budget vs Actual", ML, Y)
    Y += 8

    const monthHeaders = ["Month", "Budget", "Actual", "Type"]
    const monthRows = data.monthlyTotals.map(m => [
      m.month,
      pkr(m.budget),
      pkr(m.actual),
      m.type,
    ])

    autoTable(doc, {
      startY: Y,
      margin: { left: ML, right: MR },
      head: [monthHeaders],
      body: monthRows,
      styles: { fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 }, textColor: DARK, lineColor: BORDER, lineWidth: 0.2 },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 45, halign: "right" },
        2: { cellWidth: 45, halign: "right" },
        3: { cellWidth: 30, halign: "center" },
      },
    })

    Y = (doc as any).lastAutoTable.finalY + 10
  }

  // ── GL‑wise Breakdown ────────────────────────────────────────
  if (data.accountGroups.length > 0) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(...DARK)
    doc.text("GL‑wise Breakdown (Actuals)", ML, Y)
    Y += 8

    const glHeaders = ["Code", "Account Name", "Amount", "Type"]
    const glRows = data.accountGroups.map(a => [
      a.code,
      a.name,
      pkr(a.amount),
      a.type,
    ])

    autoTable(doc, {
      startY: Y,
      margin: { left: ML, right: MR },
      head: [glHeaders],
      body: glRows,
      styles: { fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 }, textColor: DARK, lineColor: BORDER, lineWidth: 0.2 },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 45, halign: "right" },
        3: { cellWidth: 30, halign: "center" },
      },
    })
  }

  // ── Footer ───────────────────────────────────────────────────
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.4)
  doc.line(ML, PH - 14, PW - MR, PH - 14)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text(`Generated by ${data.companyName}  ·  ${data.companyTagline}`, PW / 2, PH - 8, { align: "center" })

  return doc
}