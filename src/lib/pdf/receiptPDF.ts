import jsPDF from "jspdf"

// ─── Brand colours (same as invoice) ────────────────────────────────
const NAVY     = [7,   8,  91]  as [number,number,number]
const DARK     = [17,  24,  39]  as [number,number,number]
const MUTED    = [107,114, 128]  as [number,number,number]
const BORDER   = [229,231, 235]  as [number,number,number]
const WHITE    = [255,255, 255]  as [number,number,number]

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

export interface ReceiptPDFData {
  companyName:    string
  companyAddress: string
  companyPhone:   string
  companyEmail:   string
  companyTagline: string
  logoUrl?:       string | null

  receiptNo:  string
  date:       string

  customerName:    string
  customerAddress: string
  customerPhone:   string
  customerEmail?:  string

  paymentMethod?: string | null
  amount:        number
  reference?:    string
  notes?:        string
}

export async function generateReceiptPDF(data: ReceiptPDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  const PW = 210
  const PH = 297
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
  doc.text("RECEIPT", PW - MR, LOGO_Y + 9, { align: "right" })

  // Receipt number (below title, well‑separated)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(`Receipt #: ${data.receiptNo}`, PW - MR, LOGO_Y + 17, { align: "right" })

  // Date
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(`Date: ${data.date}`, PW - MR, LOGO_Y + 22, { align: "right" })

  const HEADER_H = LOGO_Y + LOGO_SIZE + 4
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.4)
  doc.line(ML, HEADER_H, PW - MR, HEADER_H)

  // ── RECEIVED FROM / AMOUNT ──────────────────────────────────────
  let Y = HEADER_H + 7

  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text("RECEIVED FROM", ML, Y)
  doc.text("AMOUNT", PW - MR, Y, { align: "right" })

  Y += 5

  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(...DARK)
  doc.text(data.customerName || "", ML, Y)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(16, 185, 129)   // green for payment received
  doc.text(pkr(data.amount), PW - MR, Y, { align: "right" })

  Y += 5

  if (data.customerAddress) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    const addrLines = doc.splitTextToSize(data.customerAddress, CW * 0.55)
    doc.text(addrLines, ML, Y)
    Y += addrLines.length * 4.5
  }

  if (data.customerPhone) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text("Phone: " + data.customerPhone, ML, Y)
    Y += 4.5
  }

  // ── DIVIDER ──────────────────────────────────────────────────────
  Y += 2
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(ML, Y, PW - MR, Y)

  Y += 6

  // ── DETAILS TABLE ────────────────────────────────────────────────
  // Square border around the details section (matches invoice style)
  const detailsStartY = Y

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...DARK)
  doc.text("Payment Method:", ML, Y)
  doc.setFont("helvetica", "normal")
  doc.text(data.paymentMethod || "—", ML + 60, Y)

  Y += 7

  if (data.reference) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...DARK)
    doc.text("Reference:", ML, Y)
    doc.setFont("helvetica", "normal")
    doc.text(data.reference, ML + 60, Y)
    Y += 7
  }

  if (data.notes) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...DARK)
    doc.text("Notes:", ML, Y)
    doc.setFont("helvetica", "normal")
    doc.text(data.notes, ML + 60, Y)
    Y += 7
  }

  // Square border around the details
  const detailsHeight = Y - detailsStartY + 4
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.rect(ML, detailsStartY, CW, detailsHeight, "S")

  Y += 10

  // ── THANK YOU NOTE ──────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...NAVY)
  doc.text("Thank you for your payment!", PW / 2, Y, { align: "center" })

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