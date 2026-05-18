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

const HEADER_GREY: [number, number, number] = [31, 41, 55]  // #1F2937
const WHITE: [number, number, number] = [255, 255, 255]

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
    options?: { fontSize?: number; fontStyle?: "bold" | "normal"; color?: [number, number, number]; align?: "left" | "right" }
  ) => {
    doc.setFontSize(options?.fontSize || 10)
    doc.setFont("helvetica", options?.fontStyle || "normal")
    if (options?.color) doc.setTextColor(options.color[0], options.color[1], options.color[2])
    else doc.setTextColor(0, 0, 0)
    if (options?.align === "right") {
      doc.text(text, x, yPos, { align: "right" })
    } else {
      doc.text(text, x, yPos)
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  HEADER – Two columns: Company info / Invoice info
  // ═══════════════════════════════════════════════════════════

  // Company logo + name (left)
  if (data.logoUrl) {
    try {
      doc.addImage(data.logoUrl, "JPEG", margin, y, 16, 16)
    } catch { /* ignore */ }
  }
  addText(data.companyName, margin + (data.logoUrl ? 20 : 0), y + 4, { fontSize: 14, fontStyle: "bold" })
  y += 22

  // Company tagline / address
  if (data.companyTagline) {
    addText(data.companyTagline, margin, y, { fontSize: 9, color: [100, 100, 100] })
    y += 5
  }
  if (data.companyAddress) {
    addText(data.companyAddress, margin, y, { fontSize: 9, color: [100, 100, 100] })
    y += 5
  }
  if (data.companyPhone || data.companyEmail) {
    const contact = [data.companyPhone, data.companyEmail].filter(Boolean).join(" · ")
    addText(contact, margin, y, { fontSize: 9, color: [100, 100, 100] })
    y += 5
  }
  y += 6

  // ── Two‑column: Bill To (left) / Invoice details (right) ──
  const leftColX = margin
  const rightColX = pageWidth - margin - 70
  const billToStartY = y

  // Bill To
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

  // Invoice details (right)
  const invStartY = billToStartY
  addText(`Invoice #: ${data.invoiceNo}`, rightColX, invStartY, { fontSize: 10, fontStyle: "bold", align: "right" })
  addText(`Date: ${data.date}`, rightColX, invStartY + 6, { fontSize: 9, align: "right" })
  addText(`Due Date: ${data.dueDate}`, rightColX, invStartY + 12, { fontSize: 9, align: "right" })
  if (data.status) {
    addText(`Status: ${data.status}`, rightColX, invStartY + 18, { fontSize: 9, align: "right" })
  }

  y = Math.max(y, invStartY + 24) + 6

  // ── Thin separator line ──
  doc.setDrawColor(HEADER_GREY[0], HEADER_GREY[1], HEADER_GREY[2])
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6

  // ═══════════════════════════════════════════════════════════
  //  ITEMS TABLE
  // ═══════════════════════════════════════════════════════════
  const tableColumns: any[] = isTrading
    ? [
        { header: "", dataKey: "image", width: 10 },
        { header: "Product", dataKey: "product", width: 35 },
        { header: "Description", dataKey: "description", width: 45 },
        { header: "Qty", dataKey: "qty", width: 12 },
        { header: "Rate", dataKey: "rate", width: 22 },
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
        image: "",   // image is drawn separately via didDrawCell
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
    headStyles: { fillColor: HEADER_GREY, textColor: WHITE, fontStyle: "bold" },
    columnStyles: tableColumns.reduce((acc, col, i) => {
      if (col.width) acc[i] = { cellWidth: col.width }
      if (col.dataKey === "amount" || col.dataKey === "rate") acc[i] = { ...acc[i], halign: "right" }
      if (col.dataKey === "qty" || col.dataKey === "sr") acc[i] = { ...acc[i], halign: "center" }
      return acc
    }, {} as any),
    didDrawCell: (hookData: any) => {
      // Draw product image for trading companies
      if (isTrading && hookData.column.dataKey === "image") {
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

  // Grey background for total
  doc.setFillColor(HEADER_GREY[0], HEADER_GREY[1], HEADER_GREY[2])
  doc.rect(totalsX - 2, y - 2, pageWidth - totalsX - margin + 2, 10, "F")
  addText("Total", totalsX, y + 4, { fontSize: 12, fontStyle: "bold", color: WHITE })
  addText(`PKR ${data.total.toLocaleString()}`, pageWidth - margin, y + 4, { fontSize: 12, fontStyle: "bold", color: WHITE, align: "right" })
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

  addText("Thank you for your business!", margin, y, { fontSize: 8, color: [136, 136, 136] })
  addText("Generated by OneAccounts", pageWidth - margin, y, { fontSize: 8, color: [136, 136, 136], align: "right" })

  return doc
}