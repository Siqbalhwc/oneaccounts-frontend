import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

// ─── Brand colours ────────────────────────────────────────────────
const NAVY     = [7,   8,  91]  as [number,number,number]
const RED      = [220, 38,  38]  as [number,number,number]
const AMBER    = [245,158,  11]  as [number,number,number]
const DARK     = [17,  24,  39]  as [number,number,number]
const MUTED    = [107,114, 128]  as [number,number,number]
const BORDER   = [229,231, 235]  as [number,number,number]
const WHITE    = [255,255, 255]  as [number,number,number]
const ROW_ALT  = [248,249, 252]  as [number,number,number]

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

export interface InvoiceItem {
  description:   string
  qty:           number
  unit_price:    number
  total:         number
  image_path?:   string | null
  product_id?:   string | null
  product_name?: string
  tax_rate?:     number
  tax_amount?:   number
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
  notes?:       string | null
  createdBy?:   string | null

  status:     string
  items:      InvoiceItem[]
  subtotal:   number
  total:      number
  totalTax?:  number
  paid:       number
  balanceDue: number

  reference?: string

  // bank accounts to show at the bottom of the invoice
  bankAccounts?: {
    bankName:       string
    accountTitle:   string
    accountNumber:  string
    showOnInvoice?: boolean
  }[]
}

export async function generateInvoicePDF(data: InvoicePDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  const PW = 210
  const PH = 297
  const ML = 14
  const MR = 14
  const CW = PW - ML - MR   // 182 mm

  // ── LOGO & COMPANY INFO ─────────────────────────────────────────
  const LOGO_SIZE = 18
  const LOGO_X = ML
  const LOGO_Y = 6
  let logoData: string | null = null
  if (data.logoUrl) logoData = await loadImage(data.logoUrl)
  if (logoData) doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)

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

  // ── BILL TO / AMOUNT DUE ────────────────────────────────────────
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
  filledRect(doc, badgeX, badgeY, badgeW, badgeH, badgeColor)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...WHITE)
  doc.text(statusText, badgeX + badgeW / 2, badgeY + 4, { align: "center" })

  const divY = Math.max(Y, badgeY + badgeH) + 5
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(ML, divY, PW - MR, divY)

  // ── TABLE HEADER ─────────────────────────────────────────────────
  const tableY = divY + 4
  const ROW_H = 9
  const HEADER_ROW_H = ROW_H

  const hasTax = data.totalTax && data.totalTax > 0

  // Column widths – new proportions with Tax and Amount equal
  const COL_IMG_W  = 18
  const COL_NUM_W  = 8
  const COL_AMT_W  = 36            // wider, shared by Tax and Amount
  const COL_TAX_W  = hasTax ? COL_AMT_W : 0
  const COL_PRICE_W = hasTax ? 26 : 32
  const COL_QTY_W  = 16
  const COL_DESC_W = CW - COL_IMG_W - COL_NUM_W - COL_QTY_W - COL_PRICE_W - COL_TAX_W - COL_AMT_W

  // Navy background
  filledRect(doc, ML, tableY, CW, HEADER_ROW_H, NAVY)

  // White vertical separators
  doc.setDrawColor(...WHITE).setLineWidth(0.2)
  let sepX = ML + COL_IMG_W
  doc.line(sepX, tableY, sepX, tableY + HEADER_ROW_H)
  sepX += COL_NUM_W
  doc.line(sepX, tableY, sepX, tableY + HEADER_ROW_H)
  sepX += COL_DESC_W
  doc.line(sepX, tableY, sepX, tableY + HEADER_ROW_H)
  sepX += COL_QTY_W
  doc.line(sepX, tableY, sepX, tableY + HEADER_ROW_H)
  sepX += COL_PRICE_W
  doc.line(sepX, tableY, sepX, tableY + HEADER_ROW_H)
  if (hasTax) {
    sepX += COL_TAX_W
    doc.line(sepX, tableY, sepX, tableY + HEADER_ROW_H)
  }

  // Header text
  const headerTextY = tableY + HEADER_ROW_H / 2 + 1.5
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...WHITE)

  const imgCenterX   = ML + COL_IMG_W / 2
  const numCenterX   = ML + COL_IMG_W + COL_NUM_W / 2
  const descLeftX    = ML + COL_IMG_W + COL_NUM_W + 2
  const qtyCenterX   = ML + COL_IMG_W + COL_NUM_W + COL_DESC_W + COL_QTY_W / 2
  const priceCenterX = ML + COL_IMG_W + COL_NUM_W + COL_DESC_W + COL_QTY_W + COL_PRICE_W / 2
  const taxCenterX   = hasTax ? ML + COL_IMG_W + COL_NUM_W + COL_DESC_W + COL_QTY_W + COL_PRICE_W + COL_TAX_W / 2 : 0
  const amtCenterX   = hasTax
    ? ML + COL_IMG_W + COL_NUM_W + COL_DESC_W + COL_QTY_W + COL_PRICE_W + COL_TAX_W + COL_AMT_W / 2
    : ML + COL_IMG_W + COL_NUM_W + COL_DESC_W + COL_QTY_W + COL_PRICE_W + COL_AMT_W / 2

  doc.text("Img",        imgCenterX, headerTextY, { align: "center" })
  doc.text("#",          numCenterX, headerTextY, { align: "center" })
  doc.text("Description", descLeftX,  headerTextY, { align: "left" })
  doc.text("Qty",        qtyCenterX, headerTextY, { align: "center" })
  doc.text("Unit Price", priceCenterX, headerTextY, { align: "center" })
  if (hasTax) doc.text("Tax", taxCenterX, headerTextY, { align: "center" })
  doc.text("Amount",     amtCenterX, headerTextY, { align: "center" })

  // ── TABLE BODY ───────────────────────────────────────────────────
  const bodyStartY = tableY + HEADER_ROW_H

  // Preload all product images
  const imageCache: Record<number, string> = {}
  await Promise.all(data.items.map(async (item, i) => {
    if (item.image_path) {
      try {
        const img = await loadImage(item.image_path)
        if (img) imageCache[i] = img
      } catch {}
    }
  }))

  // Build rows with or without tax column
  const tableRows = data.items.map((item, i) => {
    const productIdStr = String(item.product_id ?? "")
    let namepart = ""
    if (item.product_name) namepart = ` - ${item.product_name}`
    let desc = ""
    if (productIdStr) {
      desc = `${productIdStr}${namepart}`
      const extra = (item.description ?? "").trim()
      const isDuplicate =
        extra === "" ||
        extra === (item.product_name?.trim() || "") ||
        extra === productIdStr.trim() ||
        extra === `${productIdStr}${namepart}`.trim()
      if (!isDuplicate) desc += "\n" + extra
    } else {
      desc = (item.description ?? "").trim()
    }

    const row = [
      i,               // image index (will be drawn manually)
      i + 1,
      desc,
      item.qty.toString(),
      pkr(item.unit_price),
    ]
    if (hasTax) {
      row.push(item.tax_amount && item.tax_amount > 0 ? pkr(item.tax_amount) : "—")
    }
    row.push(pkr(item.total))
    return row
  })

  // Adjust column styles
  const columnStyles: any = {
    0: { cellWidth: COL_IMG_W, halign: "center", cellPadding: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } },
    1: { cellWidth: COL_NUM_W, halign: "center" },
    2: { cellWidth: COL_DESC_W, halign: "left" },
    3: { cellWidth: COL_QTY_W, halign: "center" },
    4: { cellWidth: COL_PRICE_W, halign: "right" },
  }
  if (hasTax) {
    columnStyles[5] = { cellWidth: COL_TAX_W, halign: "right" }
    columnStyles[6] = { cellWidth: COL_AMT_W, halign: "right", fontStyle: "bold" }
  } else {
    columnStyles[5] = { cellWidth: COL_AMT_W, halign: "right", fontStyle: "bold" }
  }

  autoTable(doc, {
    startY: bodyStartY,
    margin: { left: ML, right: MR },
    body: tableRows,
    showHead: false,
    styles: {
      fontSize: 8,
      cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
      textColor: DARK,
      lineColor: BORDER,
      lineWidth: 0.2,
      minCellHeight: ROW_H,
    },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles,
    didDrawCell(hookData) {
      if (hookData.section === "body" && hookData.column.index === 0) {
        const imgData = imageCache[hookData.row.index]
        if (imgData) {
          const { x, y, width, height } = hookData.cell
          const size = Math.min(width - 1, height - 1)
          const offsetX = x + (width - size) / 2
          const offsetY = y + (height - size) / 2
          doc.addImage(imgData, "JPEG", offsetX, offsetY, size, size)
        }
      }
    },
  })

  const afterTable = (doc as any).lastAutoTable.finalY as number

  // ── Square border around table body ─────────────────────────────
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.rect(ML, bodyStartY, CW, afterTable - bodyStartY, "S")

  // ── SUBTOTAL / TAX / TOTAL – aligned with table columns ──────────
  const amtRightX = PW - MR                           // right edge of amount column
  const amtLeftX  = amtRightX - COL_AMT_W             // left edge of amount column
  const descLeft  = ML + COL_IMG_W + COL_NUM_W        // left edge of description column (for labels)

  let SY = afterTable + 6

  // Subtotal
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text("Subtotal", descLeft, SY)
  doc.setTextColor(...DARK)
  doc.text(pkr(data.subtotal), amtRightX, SY, { align: "right" })
  SY += 5.5

  // Tax label with rate if available
  let effectiveRate: number | null = null
  if (hasTax && data.items.length > 0) {
    const rates = new Set<number>()
    data.items.forEach(i => {
      if (i.tax_rate && i.tax_rate > 0) rates.add(i.tax_rate)
    })
    if (rates.size === 1) {
      const val = rates.values().next().value
      effectiveRate = val !== undefined ? val : null
    }
  }
  const taxLabel = hasTax
    ? (effectiveRate ? `Tax (${effectiveRate}%)` : "Tax")
    : "Tax (0%)"

  doc.setFont("helvetica", "bold")
  doc.setTextColor(...MUTED)
  doc.text(taxLabel, descLeft, SY)
  doc.setTextColor(...DARK)
  doc.text(pkr(data.totalTax || 0), amtRightX, SY, { align: "right" })
  SY += 5.5

  // Total box
  const TOTAL_H = ROW_H
  const boxX = amtLeftX - 2
  filledRect(doc, boxX, SY - 3, amtRightX - boxX + 2, TOTAL_H, NAVY)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...WHITE)
  doc.text("Total", descLeft, SY + TOTAL_H / 2 - 0.5)
  doc.text(pkr(data.total), amtRightX, SY + TOTAL_H / 2 - 0.5, { align: "right" })
  SY += TOTAL_H + 2

  if (data.paid > 0) {
    SY += 2
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text("Amount Paid", descLeft, SY)
    doc.setTextColor(16, 185, 129)
    doc.text("- " + pkr(data.paid), amtRightX, SY, { align: "right" })
    SY += 5.5

    doc.setFont("helvetica", "bold")
    doc.setTextColor(...RED)
    doc.text("Balance Due", descLeft, SY)
    doc.text(pkr(data.balanceDue), amtRightX, SY, { align: "right" })
    SY += 5
  }

  // ── NOTES & TERMS ───────────────────────────────────────────────
  SY += 6

  const terms = data.paymentTerms || "Payment is due within 30 days of invoice date."
  const termsLines: string[] = [terms]
  if (data.notes) termsLines.push(data.notes)

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

  // ── BANK ACCOUNTS ───────────────────────────────────────────────
  if (data.bankAccounts && data.bankAccounts.length > 0) {
    const visibleBanks = data.bankAccounts.filter(b => b.showOnInvoice !== false)
    if (visibleBanks.length > 0) {
      SY += 8
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7.5)
      doc.setTextColor(...MUTED)
      doc.text("BANK ACCOUNTS", ML, SY)
      SY += 4
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8.5)
      doc.setTextColor(...DARK)
      visibleBanks.forEach((bank, idx) => {
        if (idx > 0) SY += 1
        const line = `${bank.bankName} | ${bank.accountTitle} | ${bank.accountNumber}`
        doc.text(line, ML, SY, { maxWidth: CW })
        SY += 4
      })
    }
  }

  // ── FOOTER ───────────────────────────────────────────────────────
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