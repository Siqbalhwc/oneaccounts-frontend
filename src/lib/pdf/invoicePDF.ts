/**
 * invoicePDF.ts
 * Generates a sales invoice PDF that matches the Shahid Iqbal & Co sample design.
 *
 * Dependencies (already in most Next.js setups):
 *   npm install jspdf jspdf-autotable
 *
 * Place this file at:  src/lib/pdf/invoicePDF.ts
 */

import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

// ─── Brand colours (from the sample invoice) ────────────────────────────────
const NAVY   = [7,   8,  91] as [number, number, number]  // #07085B — header stripe
const BLUE   = [29,  78, 216] as [number, number, number] // #1D4ED8 — accent / INVOICE title
const RED    = [220,  38,  38] as [number, number, number]// #DC2626 — UNPAID badge
const AMBER  = [245, 158, 11] as [number, number, number] // amount-due highlight
const DARK   = [17,  24,  39] as [number, number, number] // near-black body text
const MUTED  = [107, 114, 128] as [number, number, number]// grey labels
const BORDER = [229, 231, 235] as [number, number, number]// light table border
const WHITE  = [255, 255, 255] as [number, number, number]
const TABLE_HEADER_BG = [30, 58, 138] as [number, number, number] // #1E3A8A
const ROW_ALT = [248, 249, 252] as [number, number, number]        // very light blue-grey

// ─── Types ───────────────────────────────────────────────────────────────────
export interface InvoiceItem {
  description:  string
  qty:          number
  unit_price:   number
  total:        number
  image_path?:  string | null
  product_id?:  string | null
  product_name?:string
}

export interface InvoicePDFData {
  // Company (pulled from company_settings)
  companyName:    string
  companyAddress: string
  companyPhone:   string
  companyEmail:   string
  companyTagline: string
  logoUrl?:       string | null
  businessType?:  string

  // Invoice header
  invoiceNo:  string
  date:       string
  dueDate:    string

  // Customer
  customerName:    string
  customerAddress: string
  customerPhone:   string
  customerEmail?:  string

  // Status & amounts
  status:     string   // "Paid" | "Unpaid" | "Overdue" | "Partial"
  items:      InvoiceItem[]
  subtotal:   number
  total:      number
  paid:       number
  balanceDue: number

  // Optional
  reference?: string
  notes?:     string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Load a remote or data-URL image and return a base-64 data URL */
async function loadImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve("")
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** Format a number as Pakistani rupees */
const pkr = (n: number) =>
  "PKR " + n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Set fill + text colour, draw a rounded rect, then reset colours */
function filledRect(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  fillRgb: [number,number,number],
  radius = 0,
) {
  doc.setFillColor(...fillRgb)
  if (radius > 0) {
    doc.roundedRect(x, y, w, h, radius, radius, "F")
  } else {
    doc.rect(x, y, w, h, "F")
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function generateInvoicePDF(data: InvoicePDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  const PW  = 210  // page width  (A4)
  const PH  = 297  // page height (A4)
  const ML  = 14   // margin left
  const MR  = 14   // margin right
  const CW  = PW - ML - MR  // usable width

  // ── 1. Top navy header bar ──────────────────────────────────────────────
  filledRect(doc, 0, 0, PW, 38, NAVY)

  let logoData: string | null = null
  if (data.logoUrl) {
    logoData = await loadImage(data.logoUrl)
  }

  // Logo (32×32 circle clipped — jsPDF doesn't support clip, so we just place
  // the image in a square; the sample uses a dark-circle logo)
  const LOGO_SIZE = 20
  const LOGO_X    = ML
  const LOGO_Y    = 9
  if (logoData) {
    // White circle behind logo
    doc.setFillColor(255, 255, 255)
    doc.circle(LOGO_X + LOGO_SIZE / 2, LOGO_Y + LOGO_SIZE / 2, LOGO_SIZE / 2 + 1, "F")
    doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)
  }

  // Company name & tagline in header
  const textX = logoData ? LOGO_X + LOGO_SIZE + 5 : ML
  doc.setTextColor(...WHITE)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text(data.companyName || "Your Company", textX, 18)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(180, 190, 220)
  doc.text(data.companyTagline || "", textX, 24)

  // "INVOICE" title — right side of header
  doc.setFont("helvetica", "bold")
  doc.setFontSize(28)
  doc.setTextColor(...WHITE)
  doc.text("INVOICE", PW - MR, 20, { align: "right" })

  // Invoice No & Date below the big title
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(200, 210, 235)
  doc.text(`Invoice No:`, PW - MR - 38, 28, { align: "left" })
  doc.text(`Date:`,       PW - MR - 38, 33, { align: "left" })
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...WHITE)
  doc.text(data.invoiceNo,  PW - MR, 28, { align: "right" })
  doc.text(data.date,       PW - MR, 33, { align: "right" })

  // ── 2. Bill-To / Amount-Due row ─────────────────────────────────────────
  let Y = 48

  // Left: BILL TO
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text("BILL TO", ML, Y)

  // Right: AMOUNT DUE label
  doc.text("AMOUNT DUE", PW - MR, Y, { align: "right" })

  Y += 5
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(...DARK)
  doc.text(data.customerName, ML, Y)

  // Amount Due value — large amber
  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(...AMBER)
  doc.text(pkr(data.balanceDue), PW - MR, Y, { align: "right" })

  Y += 5
  // Customer phone
  if (data.customerPhone) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(`▪ ${data.customerPhone}`, ML, Y)
    Y += 4.5
  }

  // Customer address
  if (data.customerAddress) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(`▪ ${data.customerAddress}`, ML, Y)
    Y += 4.5
  }

  // Customer email
  if (data.customerEmail) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(`▪ ${data.customerEmail}`, ML, Y)
    Y += 4.5
  }

  // STATUS badge (right-aligned under Amount Due)
  const statusText  = (data.status || "Unpaid").toUpperCase()
  const isUnpaid    = ["UNPAID","OVERDUE"].includes(statusText)
  const isPaid      = statusText === "PAID"
  const badgeColor  = isPaid ? [5, 150, 105] as [number,number,number]
                    : isUnpaid ? RED
                    : AMBER

  // "STATUS" label
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text("STATUS", PW - MR, 58, { align: "right" })

  // Pill badge
  const badgeW = 22
  const badgeH = 6
  const badgeX = PW - MR - badgeW
  const badgeY = 60
  filledRect(doc, badgeX, badgeY, badgeW, badgeH, badgeColor, 2)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...WHITE)
  doc.text(statusText, badgeX + badgeW / 2, badgeY + 4, { align: "center" })

  // Thin divider line
  Y = Math.max(Y, badgeY + badgeH) + 4
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(ML, Y, PW - MR, Y)
  Y += 6

  // ── 3. Items table ──────────────────────────────────────────────────────
  const tableColumns = [
    { header: "",          dataKey: "img"         },
    { header: "#",         dataKey: "num"         },
    { header: "Description",dataKey: "description"},
    { header: "Qty",       dataKey: "qty"         },
    { header: "Unit Price",dataKey: "unit_price"  },
    { header: "Amount",    dataKey: "amount"      },
  ]

  // Pre-load product images (parallel)
  const imageCache: Record<string, string> = {}
  await Promise.all(
    data.items.map(async (item, i) => {
      if (item.image_path) {
        const img = await loadImage(item.image_path)
        if (img) imageCache[i] = img
      }
    })
  )

  const tableRows = data.items.map((item, i) => ({
    img:         i,            // index into imageCache
    num:         i + 1,
    description: item.product_id
      ? `${item.product_id}${item.product_name ? " – " + item.product_name : ""}\n${item.description || ""}`
      : item.description,
    qty:         item.qty,
    unit_price:  pkr(item.unit_price),
    amount:      pkr(item.total),
  }))

  const ROW_H = 14  // row height in mm

  autoTable(doc, {
    startY:        Y,
    margin:        { left: ML, right: MR },
    columns:       tableColumns,
    body:          tableRows,
    rowPageBreak:  "avoid",
    styles: {
      fontSize:    9,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      textColor:   DARK,
      lineColor:   BORDER,
      lineWidth:   0.2,
      minCellHeight: ROW_H,
    },
    headStyles: {
      fillColor:   TABLE_HEADER_BG,
      textColor:   WHITE,
      fontStyle:   "bold",
      fontSize:    9,
      halign:      "left",
    },
    alternateRowStyles: {
      fillColor: ROW_ALT,
    },
    columnStyles: {
      img:          { cellWidth: 14, halign: "center" },
      num:          { cellWidth: 8,  halign: "center" },
      description:  { cellWidth: "auto" },
      qty:          { cellWidth: 16, halign: "center" },
      unit_price:   { cellWidth: 32, halign: "right" },
      amount:       { cellWidth: 34, halign: "right", fontStyle: "bold" },
    },
    didDrawCell(hookData) {
      // Draw product image in the first column
      if (hookData.section === "body" && hookData.column.dataKey === "img") {
        const rowIdx = hookData.row.index
        const imgData = imageCache[rowIdx]
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

  // ── 4. Subtotal / Tax / Total block ────────────────────────────────────
  const afterTable = (doc as any).lastAutoTable.finalY as number
  Y = afterTable + 6

  const sumX  = PW - MR - 70   // left edge of summary block
  const valX  = PW - MR        // right edge

  const summaryRows: Array<{ label: string; value: string; bold?: boolean; color?: [number,number,number] }> = [
    { label: "Subtotal",  value: pkr(data.subtotal) },
    { label: "Tax (0%)",  value: pkr(0), bold: true },
  ]

  for (const row of summaryRows) {
    doc.setFont("helvetica", row.bold ? "bold" : "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(row.label, sumX, Y)
    doc.setTextColor(...DARK)
    doc.text(row.value, valX, Y, { align: "right" })
    Y += 5.5
  }

  // Total row — filled navy background
  filledRect(doc, sumX - 2, Y - 4, valX - sumX + 4, 9, NAVY, 2)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...WHITE)
  doc.text("Total", sumX + 2, Y + 1.5)
  doc.text(pkr(data.total), valX - 2, Y + 1.5, { align: "right" })
  Y += 10

  // If there's a paid amount show Balance Due row too
  if (data.paid > 0) {
    Y += 2
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text("Amount Paid", sumX, Y)
    doc.setTextColor(16, 185, 129)
    doc.text(`– ${pkr(data.paid)}`, valX, Y, { align: "right" })
    Y += 5.5
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...RED)
    doc.text("Balance Due", sumX, Y)
    doc.text(pkr(data.balanceDue), valX, Y, { align: "right" })
    Y += 5
  }

  // ── 5. Notes & Terms ───────────────────────────────────────────────────
  Y += 6
  const defaultNotes =
    "Payment is due within 30 days of invoice date.\nPlease reference the invoice number with your payment."
  const notesText = data.notes || defaultNotes

  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text("NOTES & TERMS", ML, Y)
  Y += 4

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...DARK)
  const noteLines = doc.splitTextToSize(notesText, CW)
  doc.text(noteLines, ML, Y)
  Y += noteLines.length * 4.5 + 4

  // ── 6. Footer ──────────────────────────────────────────────────────────
  // Thin top border
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(ML, PH - 16, PW - MR, PH - 16)

  const footerText = [
    "Thank you for your business!",
    data.companyName,
    data.companyTagline,
  ].filter(Boolean).join(" · ")

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(footerText, PW / 2, PH - 10, { align: "center" })

  return doc
}