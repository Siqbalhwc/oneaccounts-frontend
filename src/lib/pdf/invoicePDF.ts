import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export interface InvoicePDFData {
  // Company details
  companyName: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  logoUrl?: string | null

  // Invoice details
  invoiceNo: string
  date: string
  dueDate: string
  reference?: string
  notes?: string

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
    image_path?: string | null  // product image (optional, for trading)
  }[]

  // Totals
  subtotal: number
  tax?: number
  total: number
  paid?: number
  balanceDue?: number
  status?: string
}

export function generateInvoicePDF(data: InvoicePDFData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  let y = 15

  // ── Helper ──
  const addText = (text: string, x: number, yPos: number, options?: { fontSize?: number; fontStyle?: "bold" | "normal"; color?: string; align?: string }) => {
    doc.setFontSize(options?.fontSize || 10)
    doc.setFont("helvetica", options?.fontStyle || "normal")
    if (options?.color) doc.setTextColor(options.color)
    if (options?.align === "right") {
      doc.text(text, x, yPos, { align: "right" })
    } else {
      doc.text(text, x, yPos)
    }
    doc.setTextColor(0, 0, 0) // reset
  }

  // ── Company logo & header ──
  if (data.logoUrl) {
    try {
      doc.addImage(data.logoUrl, "JPEG", margin, y, 20, 20)
    } catch { /* ignore */ }
  }
  // Company name (right aligned)
  addText(data.companyName, pageWidth - margin, y, { fontSize: 16, fontStyle: "bold", align: "right" })
  y += 8
  if (data.companyAddress) {
    addText(data.companyAddress, pageWidth - margin, y, { fontSize: 9, align: "right" })
    y += 5
  }
  if (data.companyPhone) {
    addText(data.companyPhone, pageWidth - margin, y, { fontSize: 9, align: "right" })
    y += 5
  }
  if (data.companyEmail) {
    addText(data.companyEmail, pageWidth - margin, y, { fontSize: 9, align: "right" })
    y += 5
  }

  y += 5

  // ── "INVOICE" title ──
  addText("INVOICE", margin, y, { fontSize: 18, fontStyle: "bold" })
  y += 10

  // ── Invoice details (left) ──
  addText(`Invoice #: ${data.invoiceNo}`, margin, y, { fontSize: 10 })
  y += 6
  addText(`Date: ${data.date}`, margin, y, { fontSize: 10 })
  y += 6
  addText(`Due Date: ${data.dueDate}`, margin, y, { fontSize: 10 })
  if (data.reference) {
    y += 6
    addText(`Ref: ${data.reference}`, margin, y, { fontSize: 10 })
  }
  y += 8

  // ── Bill To (left) ──
  addText("Bill To:", margin, y, { fontSize: 10, fontStyle: "bold" })
  y += 6
  addText(data.customerName, margin, y, { fontSize: 10 })
  y += 6
  if (data.customerAddress) {
    addText(data.customerAddress, margin, y, { fontSize: 9, color: "#555" })
    y += 5
  }
  if (data.customerPhone) {
    addText(data.customerPhone, margin, y, { fontSize: 9, color: "#555" })
    y += 5
  }
  if (data.customerEmail) {
    addText(data.customerEmail, margin, y, { fontSize: 9, color: "#555" })
    y += 5
  }

  y += 6

  // ── Items table ──
  const tableColumns = [
    { header: "Description", dataKey: "description" },
    { header: "Qty", dataKey: "qty" },
    { header: "Unit Price", dataKey: "unit_price" },
    { header: "Total", dataKey: "total" },
  ]

  const tableRows = data.items.map(item => ({
    description: item.description || "",
    qty: item.qty,
    unit_price: `PKR ${item.unit_price?.toLocaleString()}`,
    total: `PKR ${item.total?.toLocaleString()}`,
  }))

  autoTable(doc, {
    startY: y,
    head: [tableColumns.map(c => c.header)],
    body: tableRows.map(row => [row.description, row.qty, row.unit_price, row.total]),
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { halign: "center" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  })

  // @ts-ignore - finalY exists
  y = (doc as any).lastAutoTable.finalY + 8

  // ── Totals section (right aligned) ──
  const totalsX = pageWidth - margin - 80
  addText("Subtotal", totalsX, y, { fontSize: 10, fontStyle: "bold" })
  addText(`PKR ${data.subtotal.toLocaleString()}`, pageWidth - margin, y, { fontSize: 10, align: "right" })
  y += 6

  if (data.tax && data.tax > 0) {
    addText("Tax", totalsX, y, { fontSize: 10 })
    addText(`PKR ${data.tax.toLocaleString()}`, pageWidth - margin, y, { fontSize: 10, align: "right" })
    y += 6
  }

  addText("Total", totalsX, y, { fontSize: 12, fontStyle: "bold" })
  addText(`PKR ${data.total.toLocaleString()}`, pageWidth - margin, y, { fontSize: 12, fontStyle: "bold", align: "right" })
  y += 8

  if (data.paid !== undefined && data.paid > 0) {
    addText("Paid", totalsX, y, { fontSize: 10 })
    addText(`PKR ${data.paid.toLocaleString()}`, pageWidth - margin, y, { fontSize: 10, align: "right" })
    y += 6
    addText("Balance Due", totalsX, y, { fontSize: 10, fontStyle: "bold" })
    addText(`PKR ${(data.balanceDue || 0).toLocaleString()}`, pageWidth - margin, y, { fontSize: 10, fontStyle: "bold", align: "right" })
    y += 8
  }

  if (data.status) {
    addText(`Status: ${data.status}`, margin, y, { fontSize: 10, fontStyle: "normal" })
    y += 8
  }

  // ── Notes ──
  if (data.notes) {
    y += 4
    addText("Notes:", margin, y, { fontSize: 9, fontStyle: "bold" })
    y += 5
    addText(data.notes, margin, y, { fontSize: 9 })
    y += 8
  }

  // ── Footer ──
  addText("Thank you for your business!", margin, y, { fontSize: 8, color: "#888" })
  addText("Generated by OneAccounts", pageWidth - margin, y, { fontSize: 8, color: "#888", align: "right" })

  return doc
}