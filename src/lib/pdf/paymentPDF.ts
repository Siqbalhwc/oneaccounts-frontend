/**
 * paymentPDF.ts
 * Generates a supplier payment PDF using the same format as the receipt.
 */

import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const NAVY   = [7,8,91] as [number,number,number]
const AMBER  = [245,158,11] as [number,number,number]
const DARK   = [17,24,39] as [number,number,number]
const MUTED  = [107,114,128] as [number,number,number]
const BORDER = [229,231,235] as [number,number,number]
const WHITE  = [255,255,255] as [number,number,number]
const ROW_ALT = [248,249,252] as [number,number,number]
const GREEN  = [5,150,105] as [number,number,number]

export interface PaymentItem {
  description:  string
  qty:          number
  unit_price:   number
  total:        number
  image_path?:  string | null
  product_id?:  string | null
  product_name?:string
}

export interface PaymentPDFData {
  companyName:    string
  companyAddress: string
  companyPhone:   string
  companyEmail:   string
  companyTagline: string
  logoUrl?:       string | null

  paymentNo:  string
  date:       string

  supplierName:    string
  supplierAddress: string
  supplierPhone:   string
  supplierEmail?:  string

  paymentMethod?: string
  notes?:         string | null

  status:     string
  items:      PaymentItem[]
  subtotal:   number
  total:      number
  balanceDue: number
  paid:       number
}

async function loadImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url); if (!res.ok) return null
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

function filledRect(doc: jsPDF, x: number, y: number, w: number, h: number, fillRgb: [number,number,number], radius = 0) {
  doc.setFillColor(...fillRgb)
  radius > 0 ? doc.roundedRect(x, y, w, h, radius, radius, "F") : doc.rect(x, y, w, h, "F")
}

export async function generatePaymentPDF(data: PaymentPDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const PW = 210, PH = 297, ML = 14, MR = 14, CW = PW - ML - MR

  // ── LOGO ──
  const LOGO_SIZE = 18, LOGO_X = ML, LOGO_Y = 6
  let logoData = null
  if (data.logoUrl) logoData = await loadImage(data.logoUrl)
  if (logoData) {
    doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)
  }

  const textX = logoData ? LOGO_X + LOGO_SIZE + 4 : ML
  doc.setTextColor(...NAVY).setFont("helvetica", "bold").setFontSize(13)
  doc.text(data.companyName || "Your Company", textX, LOGO_Y + 7)

  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED)
  doc.text(data.companyTagline || "", textX, LOGO_Y + 13)

  let infoY = LOGO_Y + 18
  if (data.companyAddress) { doc.text(data.companyAddress, textX, infoY); infoY += 4 }
  if (data.companyPhone)   { doc.text("Phone: " + data.companyPhone, textX, infoY); infoY += 4 }
  if (data.companyEmail)   { doc.text("Email: " + data.companyEmail, textX, infoY) }

  // ── RIGHT SIDE: PAYMENT title ──
  doc.setFont("helvetica", "bold").setFontSize(26).setTextColor(...NAVY)
  doc.text("PAYMENT", PW - MR, LOGO_Y + 9, { align: "right" })

  const metaY = LOGO_Y + 15
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
  doc.text("Payment No:", PW - MR - 48, metaY)
  doc.text("Date:",       PW - MR - 48, metaY + 5)
  doc.setFont("helvetica", "bold").setTextColor(...DARK)
  doc.text(data.paymentNo, PW - MR, metaY,     { align: "right" })
  doc.text(data.date,      PW - MR, metaY + 5, { align: "right" })

  const HEADER_H = LOGO_Y + LOGO_SIZE + 4
  doc.setDrawColor(...BORDER).setLineWidth(0.4).line(ML, HEADER_H, PW - MR, HEADER_H)

  // ── SUPPLIER / AMOUNT ──
  let Y = HEADER_H + 7
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...MUTED)
  doc.text("SUPPLIER",  ML,      Y)
  doc.text("AMOUNT",    PW - MR, Y, { align: "right" })
  Y += 5
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...DARK)
  doc.text(data.supplierName || "", ML, Y)
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...AMBER)
  doc.text(pkr(data.total), PW - MR, Y, { align: "right" })
  Y += 5

  const phone = (data.supplierPhone ?? "").trim()
  if (phone) { doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED); doc.text("- " + phone, ML, Y); Y += 4.5 }
  const address = (data.supplierAddress ?? "").trim()
  if (address) { doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED); const addrLines = doc.splitTextToSize("- " + address, CW * 0.55); doc.text(addrLines, ML, Y); Y += addrLines.length * 4.5 }
  const email = (data.supplierEmail ?? "").trim()
  if (email) { doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED); doc.text("- " + email, ML, Y); Y += 4.5 }

  // Status badge
  const statusText = (data.status || "Processed").toUpperCase()
  const badgeColor: [number,number,number] = statusText === "PROCESSED" ? GREEN : [220,38,38]
  const statusLabelY = HEADER_H + 7 + 5 + 5
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...MUTED)
  doc.text("STATUS", PW - MR, statusLabelY, { align: "right" })
  const badgeW = 22, badgeH = 6, badgeX = PW - MR - badgeW, badgeY = statusLabelY + 2
  filledRect(doc, badgeX, badgeY, badgeW, badgeH, badgeColor, 2)
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...WHITE)
  doc.text(statusText, badgeX + badgeW / 2, badgeY + 4, { align: "center" })

  const divY = Math.max(Y, badgeY + badgeH) + 5
  doc.setDrawColor(...BORDER).setLineWidth(0.3).line(ML, divY, PW - MR, divY)

  // ── ITEMS TABLE (single line) ──
  const tableY = divY + 4, HEADER_ROW_H = 10, HEADER_RADIUS = 4
  filledRect(doc, ML, tableY, CW, HEADER_ROW_H, NAVY, HEADER_RADIUS)
  const descColX = ML + 14 + 8 + 2
  const descColW = CW - (14 + 8 + 2) - (16 + 32 + 34 + 4)
  const FONT_SIZE_HEADER = 9
  const textYHeader = tableY + HEADER_ROW_H / 2 + FONT_SIZE_HEADER * 0.35
  doc.setFont("helvetica", "bold").setFontSize(FONT_SIZE_HEADER).setTextColor(...WHITE)
  doc.text("#", ML + 14 + 8 / 2, textYHeader, { align: "center" })
  doc.text("Description", descColX + 3, textYHeader, { align: "left" })
  doc.text("Qty", descColX + descColW + 16 / 2, textYHeader, { align: "center" })
  doc.text("Unit Price", descColX + descColW + 16 + 32 / 2, textYHeader, { align: "center" })
  doc.text("Amount", descColX + descColW + 16 + 32 + 34 / 2, textYHeader, { align: "center" })

  const bodyStartY = tableY + HEADER_ROW_H
  const tableColumns = [
    { header: "", dataKey:"img" }, { header: "#", dataKey:"num" },
    { header: "Description", dataKey:"description" },
    { header: "Qty", dataKey:"qty" }, { header: "Unit Price", dataKey:"unit_price" }, { header: "Amount", dataKey:"amount" }
  ]

  const imageCache: Record<number, string> = {}
  await Promise.all(data.items.map(async (item, i) => { if (item.image_path) { const img = await loadImage(item.image_path); if (img) imageCache[i] = img } }))

  const tableRows = data.items.map((item, i) => {
    return { img: i, num: i+1, description: item.description || "", qty: item.qty || 1, unit_price: pkr(item.unit_price || 0), amount: pkr(item.total || 0) }
  })

  autoTable(doc, {
    startY: bodyStartY, margin: { left: ML, right: MR }, columns: tableColumns, body: tableRows, showHead: false,
    styles: { fontSize:9, cellPadding:{top:3,bottom:3,left:3,right:3}, textColor:DARK, lineColor:BORDER, lineWidth:0.2, minCellHeight:14 },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      img: { cellWidth:14, halign:"center" }, num: { cellWidth:8, halign:"center" },
      description: { cellWidth:"auto", halign:"left" },
      qty: { cellWidth:16, halign:"center" }, unit_price: { cellWidth:32, halign:"right" }, amount: { cellWidth:34, halign:"right", fontStyle:"bold" }
    },
    didDrawCell(hookData) {
      if (hookData.section === "body" && hookData.column.dataKey === "img") {
        const imgData = imageCache[hookData.row.index]; if (imgData) {
          const { x, y, width, height } = hookData.cell; const pad = 2; const size = Math.min(width, height) - pad * 2
          doc.addImage(imgData, "JPEG", x + (width - size)/2, y + (height - size)/2, size, size)
        }
      }
    },
  })

  const afterTable = (doc as any).lastAutoTable.finalY as number
  const TABLE_RADIUS = 4
  doc.setDrawColor(...BORDER).setLineWidth(0.8).roundedRect(ML, bodyStartY, CW, afterTable - bodyStartY, TABLE_RADIUS, TABLE_RADIUS, "S")

  // ── TOTALS ──
  let SY = afterTable + 6; const sumX = PW - MR - 70, valX = PW - MR
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED)
  doc.text("Subtotal", sumX, SY); doc.setTextColor(...DARK); doc.text(pkr(data.subtotal), valX, SY, { align:"right" }); SY += 5.5
  doc.setFont("helvetica", "bold").setTextColor(...MUTED); doc.text("Tax (0%)", sumX, SY); doc.setTextColor(...DARK); doc.text(pkr(0), valX, SY, { align:"right" }); SY += 5.5
  const TOTAL_RADIUS = 4; filledRect(doc, sumX - 2, SY - 4, valX - sumX + 4, 9, NAVY, TOTAL_RADIUS)
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...WHITE)
  doc.text("Total", sumX + 2, SY + 1.5); doc.text(pkr(data.total), valX - 2, SY + 1.5, { align:"right" }); SY += 10
  if (data.paid > 0) {
    SY += 2; doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED); doc.text("Amount Paid", sumX, SY)
    doc.setTextColor(16,185,129); doc.text("- " + pkr(data.paid), valX, SY, { align:"right" }); SY += 5.5
    if (data.balanceDue > 0) {
      doc.setFont("helvetica", "bold").setTextColor(...[220,38,38]); doc.text("Balance Due", sumX, SY)
      doc.text(pkr(data.balanceDue), valX, SY, { align:"right" }); SY += 5
    }
  }

  // ── NOTES ──
  SY += 6
  const termsLines: string[] = []
  if (data.paymentMethod) termsLines.push(`Payment Method: ${data.paymentMethod}`)
  if (data.notes) termsLines.push(data.notes)
  if (termsLines.length === 0) termsLines.push("Payment processed.")
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...MUTED); doc.text("NOTES", ML, SY); SY += 4
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...DARK)
  const noteLines = doc.splitTextToSize(termsLines.join("\n"), CW); doc.text(noteLines, ML, SY)

  // ── FOOTER ──
  doc.setDrawColor(...BORDER).setLineWidth(0.3).line(ML, PH - 16, PW - MR, PH - 16)
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED)
  const footerParts = ["Thank you for your business!", data.companyName, data.companyTagline].filter(Boolean)
  doc.text(footerParts.join(" · "), PW / 2, PH - 10, { align: "center" })

  return doc
}