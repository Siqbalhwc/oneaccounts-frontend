import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export interface InvoicePDFData {
  // Company details
  companyName: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyTagline?: string
  logoUrl?: string | null
  businessType?: string           // "trading" | "ngo" | "service"

  // Invoice details
  invoiceNo: string
  date: string
  dueDate: string
  reference?: string
  notes?: string
  status?: string

  // Customer details
  customerName: string
  customerAddress?: string
  customerPhone?: string
  customerEmail?: string

  // Items
  items: {
    description: string
    qty: number
    unit_price: number
    total: number
    image_path?: string | null
    product_id?: string | null      // product code or ID
    product_name?: string           // product name (for trading)
  }[]

  // Totals
  subtotal: number
  tax?: number
  total: number
  paid?: number
  balanceDue?: number
}

// Navy blue colour palette
const NAVY = [15, 23, 42] as const          // #0F172A
const NAVY_LIGHT = [30, 58, 138] as const   // #1E3A8A
const WHITE = 255
const GRAY = 136

export function generateInvoicePDF(data: InvoicePDFData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  let y = 15
  const isTrading = data.businessType === "trading"

  // ── Helper functions ──
  const addText = (
    text: string,
    x: number,
    yPos: number,
    options?: { fontSize?: number; fontStyle?: "bold" | "normal"; color?: number[]; align?: "left" | "right" }
  ) => {
    doc.setFontSize(options?.fontSize || 10)
    doc.setFont("helvetica", options?.fontStyle || "normal")
    if (options?.color) doc.setTextColor(options.color[0], options.color[1], options.color[2])
    if (options?.align === "right") {
      doc.text(text, x, yPos, { align: "right" })
    } else {
      doc.text(text, x, yPos)
    }
    doc.setTextColor(0, 0, 0) // reset
  }

  const drawLine = (yPos: number, color: readonly number[] = NAVY_LIGHT) => {
    doc.setDrawColor(color[0], color[1], color[2])
    doc.setLineWidth(0.5)
    doc.line(margin, yPos, pageWidth - margin, yPos)
  }

  // ═══════════════════════════════════════════════════════════
  //  HEADER BAND
  // ═══════════════════════════════════════════════════════════
  // Navy background band for the title area
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2])
  doc.rect(margin, y, pageWidth - margin * 2, 18, "F")
  addText("INVOICE", margin + 4, y + 12, { fontSize: 16, fontStyle: "bold", color: [255, 255, 255] })
  y += 24

  // ── Two‑column company + invoice info ──
  const leftColX = margin
  const rightColX = pageWidth - margin - 70
  const startY = y

  // Left column: company logo + name + tagline + address
  if (data.logoUrl) {
    try {
      doc.addImage(data.logoUrl, "JPEG", leftColX, y, 16, 16)
      y += 18
    } catch { /* ignore */ }
  }
  addText(data.companyName, leftColX, y, { fontSize: 14, fontStyle: "bold" })
  y += 6
  if (data.companyTagline) {
    addText(data.companyTagline, leftColX, y, { fontSize: 8, color: [100, 100, 100] })
    y += 5
  }
  if (data.companyAddress) {
    addText(data.companyAddress, leftColX, y, { fontSize: 8, color: [100, 100, 100] })
    y += 5
  }
  if (data.companyPhone) {
    addText(data.companyPhone, leftColX, y, { fontSize: 8, color: [100, 100, 100] })
    y += 5
  }
  if (data.companyEmail) {
    addText(data.companyEmail, leftColX, y, { fontSize: 8, color: [100, 100, 100] })
    y += 5
  }

  // Right column: invoice #, date, due date, status
  const rightY = startY
  const rightStart = rightY
  addText(`Invoice #: ${data.invoiceNo}`, rightColX, rightY, { fontSize: 10, fontStyle: "bold", align: "right" })
  addText(`Date: ${data.date}`, rightColX, rightY + 6, { fontSize: 9, align: "right" })
  addText(`Due Date: ${data.dueDate}`, rightColX, rightY + 12, { fontSize: 9, align: "right" })
  if (data.status) {
    addText(`Status: ${data.status}`, rightColX, rightY + 18, { fontSize: 9, align: "right" })
  }

  // Move Y below whichever column is taller
  y = Math.max(y, rightY + 24) + 6

  // ── Bill To section ──
  addText("Bill To:", leftColX, y, { fontSize: 10, fontStyle: "bold" })
  y += 6
  addText(data.customerName, leftColX, y, { fontSize: 10 })
  y += 6
  if (data.customerAddress) {
    addText(data.customerAddress, leftColX, y, { fontSize: 9, color: [100, 100, 100] })
    y += 5
  }
  if (data.customerPhone) {
    addText(data.customerPhone, leftColX, y, { fontSize: 9, color: [100, 100, 100] })
    y += 5
  }
  if (data.customerEmail) {
    addText(data.customerEmail, leftColX, y, { fontSize: 9, color: [100, 100, 100] })
    y += 5
  }
  y += 4

  // ── Thin navy line ──
  drawLine(y, NAVY_LIGHT)
  y += 6

  // ═══════════════════════════════════════════════════════════
  //  ITEMS TABLE
  // ═══════════════════════════════════════════════════════════
  const tableColumns: any[] = isTrading
    ? [
        { header: "", dataKey: "image", width: 12 },
        { header: "Product", dataKey: "product", width: 40 },
        { header: "Description", dataKey: "description", width: 50 },
        { header: "Qty", dataKey: "qty", width: 12 },
        { header: "Rate", dataKey: "rate", width: 20 },
        { header: "Amount", dataKey: "amount", width: 25 },
      ]
    : [
        { header: "SR", dataKey: "sr", width: 8 },
        { header: "Description", dataKey: "description", width: 70 },
        { header: "Qty", dataKey: "qty", width: 15 },
        { header: "Rate", dataKey: "rate", width: 25 },
        { header: "Amount", dataKey: "amount", width: 30 },
      ]

  const tableRows = data.items.map((item, index) => {
    if (isTrading) {
      return {
        image: item.image_path ? "" : "", // handled separately
        product: item.product_id
          ? `${item.product_id} – ${item.product_name || item.description}`
          : item.description,
        description: item.product_id ? item.description : "",
        qty: item.qty,
        rate: `PKR ${item.unit_price?.toLocaleString()}`,
        amount: `PKR ${item.total?.toLocaleString()}`,
      }
    } else {
      return {
        sr: index + 1,
        description: item.description,
        qty: item.qty,
        rate: `PKR ${item.unit_price?.toLocaleString()}`,
        amount: `PKR ${item.total?.toLocaleString()}`,
      }
    }
  })

  autoTable(doc, {
    startY: y,
    head: [tableColumns.map(c => c.header)],
    body: tableRows.map(row => tableColumns.map(c => (row as any)[c.dataKey])),
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: NAVY_LIGHT, textColor: WHITE, fontStyle: "bold" },
    columnStyles: tableColumns.reduce((acc, col, i) => {
      if (col.width) acc[i] = { cellWidth: col.width }
      if (col.dataKey === "amount" || col.dataKey === "rate") acc[i] = { ...acc[i], halign: "right" }
      if (col.dataKey === "qty" || col.dataKey === "sr") acc[i] = { ...acc[i], halign: "center" }
      return acc
    }, {} as any),
    didDrawCell: (hookData: any) => {
      // Add product image if available (for trading)
      if (isTrading && hookData.column.dataKey === "image" && hookData.cell.raw === "") {
        const item = data.items[hookData.row.index]
        if (item?.image_path) {
          try {
            const cell = hookData.cell
            doc.addImage(item.image_path, "JPEG", cell.x + 1, cell.y + 1, 8, 8)
          } catch { /* ignore */ }
        }
      }
    },
  })

  // @ts-ignore - finalY exists
  y = (doc as any).lastAutoTable.finalY + 8

  // ═══════════════════════════════════════════════════════════
  //  TOTALS
  // ═══════════════════════════════════════════════════════════
  const totalsX = pageWidth - margin - 80
  addText("Subtotal", totalsX, y, { fontSize: 10, fontStyle: "bold" })
  addText(`PKR ${data.subtotal.toLocaleString()}`, pageWidth - margin, y, { fontSize: 10, align: "right" })
  y += 6

  if (data.tax && data.tax > 0) {
    addText("Tax", totalsX, y, { fontSize: 10 })
    addText(`PKR ${data.tax.toLocaleString()}`, pageWidth - margin, y, { fontSize: 10, align: "right" })
    y += 6
  }

  // Navy band behind the total
  doc.setFillColor(NAVY_LIGHT[0], NAVY_LIGHT[1], NAVY_LIGHT[2])
  doc.rect(totalsX - 2, y - 2, pageWidth - totalsX - margin + 2, 10, "F")
  addText("Total", totalsX, y + 4, { fontSize: 12, fontStyle: "bold", color: [255, 255, 255] })
  addText(`PKR ${data.total.toLocaleString()}`, pageWidth - margin, y + 4, { fontSize: 12, fontStyle: "bold", color: [255, 255, 255], align: "right" })
  y += 12

  if (data.paid !== undefined && data.paid > 0) {
    addText("Paid", totalsX, y, { fontSize: 10 })
    addText(`PKR ${data.paid.toLocaleString()}`, pageWidth - margin, y, { fontSize: 10, align: "right" })
    y += 6
    addText("Balance Due", totalsX, y, { fontSize: 10, fontStyle: "bold" })
    addText(`PKR ${(data.balanceDue || 0).toLocaleString()}`, pageWidth - margin, y, { fontSize: 10, fontStyle: "bold", align: "right" })
    y += 8
  }

  // ═══════════════════════════════════════════════════════════
  //  NOTES & FOOTER
  // ═══════════════════════════════════════════════════════════
  if (data.notes) {
    y += 4
    addText("Notes:", margin, y, { fontSize: 9, fontStyle: "bold" })
    y += 5
    addText(data.notes, margin, y, { fontSize: 9 })
    y += 8
  }

  addText("Thank you for your business!", margin, y, { fontSize: 8, color: [GRAY, GRAY, GRAY] })
  addText("Generated by OneAccounts", pageWidth - margin, y, { fontSize: 8, color: [GRAY, GRAY, GRAY], align: "right" })

  return doc
}