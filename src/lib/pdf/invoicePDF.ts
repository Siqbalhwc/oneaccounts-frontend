/**
 * invoicePDF.ts
 * Generates a sales invoice PDF matching the Shahid Iqbal & Co sample.
 *
 * Place at:  src/lib/pdf/invoicePDF.ts
 * Deps:      npm install jspdf jspdf-autotable
 *
 * FIXES in this version:
 *  1. Header — plain white background, no navy stripe
 *  2. Grey hairline separator (not blue line)
 *  3. Company logo/name/tagline always fetched fresh at call-site
 *  4. Bill-to phone & address null-safe, no runtime errors
 *  5. Amount Due vertically parallel to customer name
 *  6. All headings use correct NAVY #07085B (not bright blue)
 *  7. Notes/Terms uses real invoice.payment_terms / customer.payment_terms
 *  8. Bullet character changed from ▪ (Unicode, renders as %ª in jsPDF) to "-"
 *  9. Description de-duplicated: product_id row shows only once
 * 10. Header area height tightened to match sample compactness
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
const TABLE_HEADER_BG = [30,  58, 138]  as [number,number,number]  // #1E3A8A
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
  // Company — always pass fresh from company_settings
  companyName:    string
  companyAddress: string
  companyPhone:   string
  companyEmail:   string
  companyTagline: string
  logoUrl?:       string | null   // absolute URL or Supabase storage URL
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

  // Terms — pass invoice.payment_terms ?? customer.payment_terms ?? null
  paymentTerms?: string | null
  // Free-text notes on the invoice
  notes?: string | null

  // Status & amounts
  status:     string   // "Paid" | "Unpaid" | "Overdue" | "Partial"
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
  // Tight compact header — white background, navy text only.
  // Logo circle is navy; "INVOICE" title is navy. No coloured stripe.

  const LOGO_SIZE = 18
  const LOGO_X    = ML
  const LOGO_Y    = 6

  // Load logo
  let logoData: string | null = null
  if (data.logoUrl) {
    logoData = await loadImage(data.logoUrl)
  }

  if (logoData) {
    // Navy circle behind logo
    doc.setFillColor(...NAVY)
    doc.circle(LOGO_X + LOGO_SIZE / 2, LOGO_Y + LOGO_SIZE / 2, LOGO_SIZE / 2 + 1, "F")
    doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)
  }

  // Company name — navy bold, vertically centered in logo area
  const textX = logoData ? LOGO_X + LOGO_SIZE + 4 : ML
  doc.setTextColor(...NAVY)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text(data.companyName || "Your Company", textX, LOGO_Y + 7)

  // Tagline — muted, small
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(data.companyTagline || "", textX, LOGO_Y + 13)

  // "INVOICE" — right side, navy, large bold  (FIX 6)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(26)
  doc.setTextColor(...NAVY)
  doc.text("INVOICE", PW - MR, LOGO_Y + 9, { align: "right" })

  // Invoice No & Date — right, below INVOICE
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

  // Compact header ends at ~30mm
  const HEADER_H = LOGO_Y + LOGO_SIZE + 4   // ~28mm total

  // Grey hairline separator (FIX 2 — no blue line)
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.4)
  doc.line(ML, HEADER_H, PW - MR, HEADER_H)

  // ── SECTION 2: BILL TO / AMOUNT DUE ────────────────────────────────────────
  let Y = HEADER_H + 7

  // Labels row
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text("BILL TO",    ML,        Y)
  doc.text("AMOUNT DUE", PW - MR,   Y, { align: "right" })

  Y += 5

  // Customer name + Amount Due on the same Y baseline  (FIX 5)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(...DARK)
  doc.text(data.customerName || "", ML, Y)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(...AMBER)
  doc.text(pkr(data.balanceDue), PW - MR, Y, { align: "right" })

  Y += 5

  // Phone  (FIX 4 null-safe; FIX 8 use "-" not ▪ to avoid jsPDF encoding bug)
  const phone = (data.customerPhone ?? "").trim()
  if (phone) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text("- " + phone, ML, Y)
    Y += 4.5
  }

  // Address  (FIX 4 + FIX 8)
  const address = (data.customerAddress ?? "").trim()
  if (address) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    const addrLines = doc.splitTextToSize("- " + address, CW * 0.55)
    doc.text(addrLines, ML, Y)
    Y += addrLines.length * 4.5
  }

  // Email  (FIX 4 + FIX 8)
  const email = (data.customerEmail ?? "").trim()
  if (email) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text("- " + email, ML, Y)
    Y += 4.5
  }

  // STATUS badge — right side, below Amount Due
  const statusText = (data.status || "Unpaid").toUpperCase()
  const isUnpaid   = ["UNPAID", "OVERDUE"].includes(statusText)
  const isPaid     = statusText === "PAID"
  const badgeColor: [number,number,number] = isPaid
    ? [5, 150, 105] : isUnpaid ? RED : AMBER

  const statusLabelY = HEADER_H + 7 + 5 + 5   // same as name row + 5
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

  // Divider before table
  const divY = Math.max(Y, badgeY + badgeH) + 5
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(ML, divY, PW - MR, divY)

  // ── SECTION 3: ITEMS TABLE ──────────────────────────────────────────────────
  const tableY = divY + 4

  const tableColumns = [
    { header: "",            dataKey: "img"         },
    { header: "#",           dataKey: "num"         },
    { header: "Description", dataKey: "description" },
    { header: "Qty",         dataKey: "qty"         },
    { header: "Unit Price",  dataKey: "unit_price"  },
    { header: "Amount",      dataKey: "amount"      },
  ]

  // Pre-load product images
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
    // FIX 9: Build description without duplicating product name.
    // If product_id is set, show "PROD-004 - Ball Point" once.
    // item.description often equals product_name — skip it if identical.
    let desc = ""
    if (item.product_id) {
      const namepart = item.product_name ? ` - ${item.product_name}` : ""
      desc = `${item.product_id}${namepart}`
      // Only append item.description if it adds new info (not a repeat)
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
      img:        i,
      num:        i + 1,
      description: desc,
      qty:        item.qty,
      unit_price: pkr(item.unit_price),
      amount:     pkr(item.total),
    }
  })

  autoTable(doc, {
    startY:       tableY,
    margin:       { left: ML, right: MR },
    columns:      tableColumns,
    body:         tableRows,
    rowPageBreak: "avoid",
    styles: {
      fontSize:      9,
      cellPadding:   { top: 3, bottom: 3, left: 3, right: 3 },
      textColor:     DARK,
      lineColor:     BORDER,
      lineWidth:     0.2,
      minCellHeight: 14,
    },
    headStyles: {
      fillColor:  TABLE_HEADER_BG,
      textColor:  WHITE,
      fontStyle:  "bold",
      fontSize:   9,
      halign:     "left",
    },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      img:         { cellWidth: 14, halign: "center" },
      num:         { cellWidth: 8,  halign: "center" },
      description: { cellWidth: "auto" },
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

  // ── SECTION 4: SUBTOTAL / TAX / TOTAL ──────────────────────────────────────
  const afterTable = (doc as any).lastAutoTable.finalY as number
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

  // Total pill — navy rounded rect, same style as sample
  filledRect(doc, sumX - 2, SY - 4, valX - sumX + 4, 9, NAVY, 2)
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

  // ── SECTION 5: NOTES & TERMS  (FIX 7) ──────────────────────────────────────
  SY += 6

  const termsLines: string[] = []
  const terms = (data.paymentTerms ?? "").trim()
  if (terms) termsLines.push(terms)
  const notes = (data.notes ?? "").trim()
  if (notes) termsLines.push(notes)
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

  // ── SECTION 6: FOOTER ───────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// CALL-SITE EXAMPLE
// ─────────────────────────────────────────────────────────────────────────────
//
// async function printInvoice(invoiceId: string, companyId: string) {
//   // Always fetch company_settings fresh — never use React state (FIX 3)
//   const { data: company } = await supabase
//     .from("company_settings")
//     .select("name, address, phone, email, tagline, logo_url, business_type")
//     .eq("company_id", companyId)
//     .single()
//
//   const { data: invoice } = await supabase
//     .from("invoices")
//     .select(`*, customer:parties!party_id (name, phone, address, email, payment_terms)`)
//     .eq("id", invoiceId)
//     .single()
//
//   const pdfData: InvoicePDFData = {
//     companyName:    company.name    ?? "",
//     companyAddress: company.address ?? "",
//     companyPhone:   company.phone   ?? "",
//     companyEmail:   company.email   ?? "",
//     companyTagline: company.tagline ?? "",
//     logoUrl:        company.logo_url ?? null,
//
//     invoiceNo: invoice.invoice_number,
//     date:      invoice.date,
//     dueDate:   invoice.due_date,
//
//     customerName:    invoice.customer?.name    ?? "",
//     customerPhone:   invoice.customer?.phone   ?? "",   // FIX 4
//     customerAddress: invoice.customer?.address ?? "",   // FIX 4
//     customerEmail:   invoice.customer?.email   ?? "",
//
//     paymentTerms: invoice.payment_terms ?? invoice.customer?.payment_terms ?? null,  // FIX 7
//     notes:        invoice.notes ?? null,
//
//     status:     invoice.status,
//     items:      invoice.items,
//     subtotal:   invoice.subtotal,
//     total:      invoice.total,
//     paid:       invoice.amount_paid ?? 0,
//     balanceDue: invoice.balance_due,
//   }
//
//   const pdf = await generateInvoicePDF(pdfData)
//   pdf.save(`Invoice-${invoice.invoice_number}.pdf`)
// }
