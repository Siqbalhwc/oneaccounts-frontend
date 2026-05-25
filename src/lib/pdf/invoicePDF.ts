/**
 * invoicePDF.ts
 * Generates a sales invoice PDF matching the Shahid Iqbal & Co sample.
 *
 * Place at:  src/lib/pdf/invoicePDF.ts
 * Deps:      npm install jspdf jspdf-autotable
 *
 * FIXES in this version:
 *  … (all previous fixes retained)
 *  15. Table rounded border now thicker so no sharp corners peek through
 *  16. Column header text alignment fixed:
 *        - Description: left-aligned (matching data)
 *        - Qty: center-aligned (matching data)
 *        - Unit Price: center-aligned header (data stays right)
 *        - Amount: center-aligned header (data stays right)
 *  17. Header text vertical centering corrected using font-size-aware baseline offset
 */

import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

// ─── Brand colours ────────────────────────────────────────────────────────────
const NAVY            = [7,   8,  91]  as [number,number,number]  // #07085B
const RED             = [220, 38,  38]  as [number,number,number]  // #DC2626
const AMBER           = [245,158,  11]  as [number,number,number]  // amount-due
const DARK            = [17,  24,  39]  as [number,number,number]  // body text
const MUTED           = [107,114, 128]  as [number,number,number]  // grey labels
const BORDER          = [229,231, 235]  as [number,number,number]  // table border
const WHITE           = [255,255, 255]  as [number,number,number]
const ROW_ALT         = [248,249, 252]  as [number,number,number]

// ─── Types ────────────────────────────────────────────────────────────────────
export interface InvoiceItem {
  description:   string
  qty:           number
  unit_price:    number
  total:         number
  image_path?:   string | null
  product_id?:   string | null
  product_name?: string
}

export interface InvoicePDFData {
  companyName:    string
  companyAddress: string
  companyPhone:   string
  companyEmail:   string
  companyTagline: string
  logoUrl?:       string | null
  businessType?:  string

  invoiceNo:  string
  date:       string
  dueDate:    string

  customerName:    string
  customerAddress: string
  customerPhone:   string
  customerEmail?:  string

  paymentTerms?: string | null
  notes?: string | null

  status:     string
  items:      InvoiceItem[]
  subtotal:   number
  total:      number
  paid:       number
  balanceDue: number

  reference?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
  radius = 0,
) {
  doc.setFillColor(...fillRgb)
  radius > 0
    ? doc.roundedRect(x, y, w, h, radius, radius, "F")
    : doc.rect(x, y, w, h, "F")
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generateInvoicePDF(data: InvoicePDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  const PW = 210
  const PH = 297
  const ML = 14
  const MR = 14
  const CW = PW - ML - MR

  // ── SECTION 1: HEADER ───────────────────────────────────────────────────────
  const LOGO_SIZE = 18
  const LOGO_X    = ML
  const LOGO_Y    = 6

  let logoData: string | null = null
  if (data.logoUrl) {
    logoData = await loadImage(data.logoUrl)
  }

  if (logoData) {
    doc.setFillColor(...NAVY)
    doc.circle(LOGO_X + LOGO_SIZE / 2, LOGO_Y + LOGO_SIZE / 2, LOGO_SIZE / 2 + 1, "F")
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

  doc.setFont("helvetica", "bold")
  doc.setFontSize(26)
  doc.setTextColor(...NAVY)
  doc.text("INVOICE", PW - MR, LOGO_Y + 9, { align: "right" })

  const metaY = LOGO_Y + 15
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text("Invoice No:", PW - MR - 36, metaY)
  doc.text("Date:",       PW - MR - 36, metaY + 5)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...DARK)
  doc.text(data.invoiceNo, PW - MR, metaY,     { align: "right" })
  doc.text(data.date,      PW - MR, metaY + 5, { align: "right" })

  const HEADER_H = LOGO_Y + LOGO_SIZE + 4

  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.4)
  doc.line(ML, HEADER_H, PW - MR, HEADER_H)

  // ── SECTION 2: BILL TO / AMOUNT DUE ────────────────────────────────────────
  let Y = HEADER_H + 7

  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text("BILL TO",    ML,        Y)
  doc.text("AMOUNT DUE", PW - MR,   Y, { align: "right" })

  Y += 5

  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(...DARK)
  doc.text(data.customerName || "", ML, Y)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(...AMBER)
  doc.text(pkr(data.balanceDue), PW - MR, Y, { align: "right" })

  Y += 5

  const phone = (data.customerPhone ?? "").trim()
  if (phone) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text("- " + phone, ML, Y)
    Y += 4.5
  }

  const address = (data.customerAddress ?? "").trim()
  if (address) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    const addrLines = doc.splitTextToSize("- " + address, CW * 0.55)
    doc.text(addrLines, ML, Y)
    Y += addrLines.length * 4.5
  }

  const email = (data.customerEmail ?? "").trim()
  if (email) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text("- " + email, ML, Y)
    Y += 4.5
  }

  const statusText = (data.status || "Unpaid").toUpperCase()
  const isUnpaid   = ["UNPAID", "OVERDUE"].includes(statusText)
  const isPaid     = statusText === "PAID"
  const badgeColor: [number,number,number] = isPaid
    ? [5, 150, 105] : isUnpaid ? RED : AMBER

  const statusLabelY = HEADER_H + 7 + 5 + 5
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text("STATUS", PW - MR, statusLabelY, { align: "right" })

  const badgeW = 22
  const badgeH = 6
  const badgeX = PW - MR - badgeW
  const badgeY = statusLabelY + 2
  filledRect(doc, badgeX, badgeY, badgeW, badgeH, badgeColor, 2)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...WHITE)
  doc.text(statusText, badgeX + badgeW / 2, badgeY + 4, { align: "center" })

  const divY = Math.max(Y, badgeY + badgeH) + 5
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(ML, divY, PW - MR, divY)

  // ── SECTION 3: CUSTOM ROUNDED TABLE HEADER ─────────────────────────────────
  const tableY = divY + 4
  const HEADER_ROW_H = 10
  const HEADER_RADIUS = 4

  filledRect(doc, ML, tableY, CW, HEADER_ROW_H, NAVY, HEADER_RADIUS)

  const descColX = ML + 14 + 8 + 2
  const descColW = CW - (14 + 8 + 2) - (16 + 32 + 34 + 4)

  // FIX: vertical center baseline — font size 9pt, baseline offset = fontSize * 0.35
  const FONT_SIZE_HEADER = 9
  const textY = tableY + HEADER_ROW_H / 2 + FONT_SIZE_HEADER * 0.35

  doc.setFont("helvetica", "bold")
  doc.setFontSize(FONT_SIZE_HEADER)
  doc.setTextColor(...WHITE)

  // FIX: each header drawn with alignment matching its data column
  // Column 1: image placeholder — skip
  // Column 2: # — center
  doc.text("#", ML + 14 + 8 / 2, textY, { align: "center" })

  // Column 3: Description — left, with 3mm cell padding to match autoTable cellPadding
  doc.text("Description", descColX + 3, textY, { align: "left" })

  // Column 4: Qty — center of its column
  doc.text("Qty", descColX + descColW + 16 / 2, textY, { align: "center" })

  // Column 5: Unit Price — center of its column
  doc.text("Unit Price", descColX + descColW + 16 + 32 / 2, textY, { align: "center" })

  // Column 6: Amount — center of its column
  doc.text("Amount", descColX + descColW + 16 + 32 + 34 / 2, textY, { align: "center" })

  // ── SECTION 4: ITEMS TABLE (body only, no head) ───────────────────────────
  const bodyStartY = tableY + HEADER_ROW_H

  const tableColumns = [
    { header: "",            dataKey: "img"         },
    { header: "#",           dataKey: "num"         },
    { header: "Description", dataKey: "description" },
    { header: "Qty",         dataKey: "qty"         },
    { header: "Unit Price",  dataKey: "unit_price"  },
    { header: "Amount",      dataKey: "amount"      },
  ]

  const imageCache: Record<number, string> = {}
  await Promise.all(
    data.items.map(async (item, i) => {
      if (item.image_path) {
        const img = await loadImage(item.image_path)
        if (img) imageCache[i] = img
      }
    }),
  )

  const tableRows = data.items.map((item, i) => {
    let desc = ""
    if (item.product_id) {
      const namepart = item.product_name ? ` - ${item.product_name}` : ""
      desc = `${item.product_id}${namepart}`
      const extra = (item.description ?? "").trim()
      const isDuplicate =
        extra === "" ||
        extra === item.product_name?.trim() ||
        extra === item.product_id?.trim() ||
        extra === `${item.product_id}${namepart}`.trim()
      if (!isDuplicate) desc += "\n" + extra
    } else {
      desc = (item.description ?? "").trim()
    }

    return {
      img:         i,
      num:         i + 1,
      description: desc,
      qty:         item.qty,
      unit_price:  pkr(item.unit_price),
      amount:      pkr(item.total),
    }
  })

  autoTable(doc, {
    startY:       bodyStartY,
    margin:       { left: ML, right: MR },
    columns:      tableColumns,
    body:         tableRows,
    showHead:     false,
    rowPageBreak: "avoid",
    styles: {
      fontSize:      9,
      cellPadding:   { top: 3, bottom: 3, left: 3, right: 3 },
      textColor:     DARK,
      lineColor:     BORDER,
      lineWidth:     0.2,
      minCellHeight: 14,
    },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      img:         { cellWidth: 14, halign: "center" },
      num:         { cellWidth: 8,  halign: "center" },
      description: { cellWidth: "auto", halign: "left" },
      qty:         { cellWidth: 16, halign: "center" },
      unit_price:  { cellWidth: 32, halign: "right"  },
      amount:      { cellWidth: 34, halign: "right", fontStyle: "bold" },
    },
    didDrawCell(hookData) {
      if (hookData.section === "body" && hookData.column.dataKey === "img") {
        const imgData = imageCache[hookData.row.index]
        if (imgData) {
          const { x, y, width, height } = hookData.cell
          const pad  = 2
          const size = Math.min(width, height) - pad * 2
          doc.addImage(
            imgData, "JPEG",
            x + (width  - size) / 2,
            y + (height - size) / 2,
            size, size,
          )
        }
      }
    },
  })

  const afterTable = (doc as any).lastAutoTable.finalY as number

  // ── Rounded border around data rows (thicker line to hide inner corners) ──
  const TABLE_RADIUS = 4
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.8)
  doc.roundedRect(ML, bodyStartY, CW, afterTable - bodyStartY, TABLE_RADIUS, TABLE_RADIUS, "S")

  // ── SECTION 5: SUBTOTAL / TAX / TOTAL ──────────────────────────────────────
  let SY = afterTable + 6

  const sumX = PW - MR - 70
  const valX = PW - MR

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text("Subtotal", sumX, SY)
  doc.setTextColor(...DARK)
  doc.text(pkr(data.subtotal), valX, SY, { align: "right" })
  SY += 5.5

  doc.setFont("helvetica", "bold")
  doc.setTextColor(...MUTED)
  doc.text("Tax (0%)", sumX, SY)
  doc.setTextColor(...DARK)
  doc.text(pkr(0), valX, SY, { align: "right" })
  SY += 5.5

  // Total pill – navy rounded rect
  const TOTAL_RADIUS = 4
  filledRect(doc, sumX - 2, SY - 4, valX - sumX + 4, 9, NAVY, TOTAL_RADIUS)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...WHITE)
  doc.text("Total", sumX + 2, SY + 1.5)
  doc.text(pkr(data.total), valX - 2, SY + 1.5, { align: "right" })
  SY += 10

  if (data.paid > 0) {
    SY += 2
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text("Amount Paid", sumX, SY)
    doc.setTextColor(16, 185, 129)
    doc.text("- " + pkr(data.paid), valX, SY, { align: "right" })
    SY += 5.5

    doc.setFont("helvetica", "bold")
    doc.setTextColor(...RED)
    doc.text("Balance Due", sumX, SY)
    doc.text(pkr(data.balanceDue), valX, SY, { align: "right" })
    SY += 5
  }

  // ── SECTION 6: NOTES & TERMS ───────────────────────────────────────────────
  SY += 6

  const termsLines: string[] = []
  if (data.paymentTerms) {
    termsLines.push(data.paymentTerms)
  }
  if (data.notes) {
    termsLines.push(data.notes)
  }
  if (termsLines.length === 0) {
    termsLines.push(
      "Payment is due within 30 days of invoice date.",
      "Please reference the invoice number with your payment.",
    )
  }

  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text("NOTES & TERMS", ML, SY)
  SY += 4

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...DARK)
  const noteLines = doc.splitTextToSize(termsLines.join("\n"), CW)
  doc.text(noteLines, ML, SY)

  // ── SECTION 7: FOOTER ───────────────────────────────────────────────────────
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(ML, PH - 16, PW - MR, PH - 16)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  const footerParts = ["Thank you for your business!", data.companyName, data.companyTagline].filter(Boolean)
  doc.text(footerParts.join(" · "), PW / 2, PH - 10, { align: "center" })

  return doc
}
