import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export interface InvoiceItem {
  description: string
  qty: number
  unit_price: number
  total: number
  image_path?: string | null
  product_id?: string | number | null
  product_name?: string
}

export interface InvoicePDFData {
  companyName: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyTagline?: string
  logoUrl?: string | null
  businessType?: string
  invoiceNo: string
  date: string
  dueDate: string
  reference?: string
  notes?: string
  status?: string
  customerName: string
  customerAddress?: string
  customerPhone?: string
  customerEmail?: string
  items: InvoiceItem[]
  subtotal: number
  tax?: number
  total: number
  paid?: number
  balanceDue?: number
}

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  headerBg:   [15,  23,  42] as [number,number,number],
  headerText: [255,255,255]  as [number,number,number],
  rowAlt:     [248,250,252]  as [number,number,number],
  totalBg:    [15,  23,  42] as [number,number,number],
  totalText:  [255,255,255]  as [number,number,number],
  line:       [203,213,225]  as [number,number,number],
  black:      [15,  23,  42] as [number,number,number],
  muted:      [100,116,139]  as [number,number,number],
}

function txt(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  opts?: { size?: number; bold?: boolean; color?: [number,number,number]; align?: "left"|"right"|"center" }
) {
  doc.setFontSize(opts?.size ?? 9)
  doc.setFont("helvetica", opts?.bold ? "bold" : "normal")
  const c = opts?.color ?? C.black
  doc.setTextColor(c[0], c[1], c[2])
  doc.text(text, x, y, { align: opts?.align ?? "left" })
}

async function toBase64(url: string): Promise<string | null> {
  return new Promise(resolve => {
    try {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const canvas = document.createElement("canvas")
        canvas.width = img.width; canvas.height = img.height
        const ctx = canvas.getContext("2d")
        if (!ctx) { resolve(null); return }
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL("image/jpeg"))
      }
      img.onerror = () => resolve(null)
      img.src = url
    } catch { resolve(null) }
  })
}

export async function generateInvoicePDF(data: InvoicePDFData): Promise<jsPDF> {
  const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pw    = doc.internal.pageSize.getWidth()
  const ph    = doc.internal.pageSize.getHeight()
  const ml    = 14
  const mr    = pw - 14

  // Pre-load images
  const imgCache: Record<string, string | null> = {}
  for (const item of data.items) {
    if (item.product_id && item.image_path && !imgCache[item.image_path]) {
      imgCache[item.image_path] = await toBase64(item.image_path)
    }
  }
  let logoB64: string | null = null
  if (data.logoUrl) logoB64 = await toBase64(data.logoUrl)

  // ── 1. HEADER BAR ─────────────────────────────────────────────────────────
  doc.setFillColor(C.headerBg[0], C.headerBg[1], C.headerBg[2])
  doc.rect(0, 0, pw, 38, "F")

  let logoEndX = ml
  if (logoB64) {
    try { doc.addImage(logoB64, "JPEG", ml, 6, 26, 26); logoEndX = ml + 30 } catch {}
  }
  txt(doc, data.companyName.toUpperCase(), logoEndX, 15, { size: 13, bold: true, color: C.headerText })
  if (data.companyTagline)
    txt(doc, data.companyTagline, logoEndX, 21, { size: 8, color: [148,163,184] })
  const contact = [data.companyAddress, data.companyPhone, data.companyEmail].filter(Boolean).join("  ·  ")
  if (contact) txt(doc, contact, logoEndX, 27, { size: 7.5, color: [148,163,184] })

  txt(doc, "SALES INVOICE", mr, 16, { size: 16, bold: true, color: C.headerText, align: "right" })
  txt(doc, `# ${data.invoiceNo}`, mr, 24, { size: 9, color: [148,163,184], align: "right" })

  let y = 46

  // ── 2. BILL TO + INVOICE META ─────────────────────────────────────────────
  const billStartY = y
  txt(doc, "BILL TO", ml, y, { size: 7, bold: true, color: C.muted }); y += 4
  txt(doc, data.customerName, ml, y, { size: 10, bold: true }); y += 5
  if (data.customerAddress) { txt(doc, data.customerAddress, ml, y, { size: 8, color: C.muted }); y += 4 }
  if (data.customerPhone)   { txt(doc, `Tel: ${data.customerPhone}`, ml, y, { size: 8, color: C.muted }); y += 4 }
  if (data.customerEmail)   { txt(doc, data.customerEmail, ml, y, { size: 8, color: C.muted }); y += 4 }

  // Right side meta
  const detX = pw / 2 + 8
  let dy = billStartY
  const metaRows: [string, string][] = [
    ["Invoice No",  data.invoiceNo],
    ["Date",        data.date],
    ["Due Date",    data.dueDate],
  ]
  if (data.reference) metaRows.push(["Reference", data.reference])
  if (data.status)    metaRows.push(["Status",    data.status])

  for (const [label, value] of metaRows) {
    txt(doc, label, detX, dy, { size: 8, color: C.muted })
    txt(doc, ":", detX + 22, dy, { size: 8, color: C.muted })
    txt(doc, value, detX + 26, dy, { size: 8, bold: true })
    dy += 5
  }

  y = Math.max(y, dy) + 8

  // ── 3. DIVIDER ────────────────────────────────────────────────────────────
  doc.setDrawColor(C.line[0], C.line[1], C.line[2])
  doc.setLineWidth(0.3)
  doc.line(ml, y, mr, y)
  y += 6

  // ── 4. ITEMS TABLE ────────────────────────────────────────────────────────
  // Fixed columns (mm): img=8 | product=36 | description=auto | qty=14 | rate=28 | amount=28
  const COL_IMG  = 8
  const COL_PROD = 36
  const COL_QTY  = 14
  const COL_RATE = 28
  const COL_AMT  = 28
  const totalW   = mr - ml
  const COL_DESC = totalW - COL_IMG - COL_PROD - COL_QTY - COL_RATE - COL_AMT

  const headRow  = ["", "Product", "Description", "Qty", "Rate (PKR)", "Amount (PKR)"]
  const bodyRows = data.items.map(item => {
    const hasProduct = Boolean(item.product_id)
    return [
      "",
      hasProduct ? (item.product_name || "") : "",
      item.description || "",
      String(item.qty),
      Number(item.unit_price).toLocaleString("en-PK"),
      Number(item.total).toLocaleString("en-PK"),
    ]
  })

  autoTable(doc, {
    startY: y,
    head: [headRow],
    body: bodyRows,
    margin: { left: ml, right: ml },
    tableWidth: totalW,
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
      valign: "middle",
      textColor: C.black as [number,number,number],
      font: "helvetica",
      lineColor: C.line as [number,number,number],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: C.headerBg as [number,number,number],
      textColor: C.headerText as [number,number,number],
      fontStyle: "bold",
      fontSize: 7.5,
      halign: "left",
      cellPadding: { top: 5, bottom: 5, left: 3, right: 3 },
    },
    alternateRowStyles: { fillColor: C.rowAlt as [number,number,number] },
    columnStyles: {
      0: { cellWidth: COL_IMG,  halign: "center", overflow: "hidden" },
      1: { cellWidth: COL_PROD, halign: "left",   fontStyle: "bold" },
      2: { cellWidth: COL_DESC, halign: "left",   overflow: "linebreak" },
      3: { cellWidth: COL_QTY,  halign: "center" },
      4: { cellWidth: COL_RATE, halign: "right" },
      5: { cellWidth: COL_AMT,  halign: "right",  fontStyle: "bold" },
    },
    didDrawCell: (hookData: any) => {
      if (hookData.section === "body" && hookData.column.index === 0) {
        const item = data.items[hookData.row.index]
        if (item?.product_id && item.image_path) {
          const b64 = imgCache[item.image_path]
          if (b64) {
            try {
              const cell = hookData.cell
              const size = Math.min(cell.height - 2, 8)
              doc.addImage(b64, "JPEG", cell.x + (cell.width - size) / 2, cell.y + (cell.height - size) / 2, size, size)
            } catch {}
          }
        }
      }
    },
  })

  // @ts-ignore
  y = (doc as any).lastAutoTable.finalY + 8

  // ── 5. TOTALS ─────────────────────────────────────────────────────────────
  const totW = 70
  const totX = mr - totW

  const addTotal = (label: string, value: number, highlight = false) => {
    if (highlight) {
      doc.setFillColor(C.totalBg[0], C.totalBg[1], C.totalBg[2])
      doc.rect(totX - 2, y - 4, totW + 2, 10, "F")
      txt(doc, label, totX, y + 2, { size: 10, bold: true, color: C.totalText })
      txt(doc, `PKR ${value.toLocaleString("en-PK")}`, mr, y + 2, { size: 10, bold: true, color: C.totalText, align: "right" })
      y += 14
    } else {
      txt(doc, label, totX, y, { size: 9, color: C.muted })
      txt(doc, `PKR ${value.toLocaleString("en-PK")}`, mr, y, { size: 9, bold: false, align: "right" })
      y += 6
    }
  }

  addTotal("Subtotal", data.subtotal)
  if (data.tax && data.tax > 0) addTotal("Tax", data.tax)

  doc.setDrawColor(C.line[0], C.line[1], C.line[2])
  doc.setLineWidth(0.2)
  doc.line(totX - 2, y - 2, mr, y - 2)
  y += 2

  addTotal("TOTAL DUE", data.total, true)

  if (data.paid !== undefined && data.paid > 0) {
    addTotal("Amount Paid", data.paid)
    addTotal("Balance Due", data.balanceDue ?? 0)
  }

  // ── 6. NOTES ──────────────────────────────────────────────────────────────
  if (data.notes) {
    y += 4
    txt(doc, "NOTES", ml, y, { size: 7, bold: true, color: C.muted }); y += 4
    const lines = doc.splitTextToSize(data.notes, pw / 2)
    txt(doc, lines, ml, y, { size: 8.5 }); y += lines.length * 5 + 4
  }

  // ── 7. FOOTER BAR ─────────────────────────────────────────────────────────
  const footerY = ph - 12
  doc.setFillColor(C.headerBg[0], C.headerBg[1], C.headerBg[2])
  doc.rect(0, footerY - 4, pw, 16, "F")
  txt(doc, "Thank you for your business!", ml, footerY + 2, { size: 8, color: [148,163,184] })
  txt(doc, "Generated by OneAccounts", mr, footerY + 2, { size: 8, color: [148,163,184], align: "right" })

  return doc
}
