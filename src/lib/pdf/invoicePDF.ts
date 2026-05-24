/**
 * invoicePDF.ts
 * Generates a sales invoice PDF that matches the Shahid Iqbal & Co sample design.
 *
 * Dependencies:
 *   npm install jspdf jspdf-autotable
 *
 * Place this file at:  src/lib/pdf/invoicePDF.ts
 *
 * FIXES applied vs previous version:
 *  1. Header background → pure white (no blue/navy background in header area)
 *  2. Removed the blue separator line under the header
 *  3. Logo / company name / tagline now fetched from company_settings at call-site
 *     and passed via InvoicePDFData — works both before and after posting
 *  4. Bill-to mobile and address now correctly read from customerPhone /
 *     customerAddress fields (null-safe, no runtime errors)
 *  5. Amount Due is right-aligned and vertically parallel to the customer name
 *  6. Header colour corrected to NAVY #07085B exactly as in sample
 *  7. Notes/Terms now uses actual invoice payment_terms + customer_terms fields
 *     instead of a hard-coded 30-day string
 */

import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

// ─── Brand colours (exactly from the sample PDF) ─────────────────────────────
const NAVY              = [7,   8,  91]  as [number,number,number]  // #07085B
const RED               = [220, 38,  38]  as [number,number,number]  // #DC2626
const AMBER             = [245,158,  11]  as [number,number,number]  // amount-due
const DARK              = [17,  24,  39]  as [number,number,number]  // body text
const MUTED             = [107,114, 128]  as [number,number,number]  // grey labels
const BORDER            = [229,231, 235]  as [number,number,number]  // table border
const WHITE             = [255,255, 255]  as [number,number,number]
const TABLE_HEADER_BG   = [30,  58, 138]  as [number,number,number]  // #1E3A8A
const ROW_ALT           = [248,249, 252]  as [number,number,number]  // alt row

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
  // ── Company (always pass fresh from company_settings, never cache) ──────────
  companyName:    string
  companyAddress: string
  companyPhone:   string
  companyEmail:   string
  companyTagline: string
  logoUrl?:       string | null   // absolute URL or data-URL
  businessType?:  string

  // ── Invoice header ──────────────────────────────────────────────────────────
  invoiceNo:  string
  date:       string
  dueDate:    string

  // ── Customer ────────────────────────────────────────────────────────────────
  customerName:    string
  customerAddress: string
  customerPhone:   string
  customerEmail?:  string

  // ── Terms (FIX 7: real terms, not hard-coded string) ────────────────────────
  /**
   * Pass the invoice's own payment_terms text if set, otherwise fall back to
   * the customer's default terms, otherwise undefined (a sensible default will
   * be used).
   *
   * Example at call-site:
   *   paymentTerms: invoice.payment_terms
   *              ?? customer.payment_terms
   *              ?? undefined
   */
  paymentTerms?: string | null

  /**
   * Any extra free-text notes stored on the invoice (invoice.notes column).
   */
  notes?: string | null

  // ── Status & amounts ────────────────────────────────────────────────────────
  status:     string   // "Paid" | "Unpaid" | "Overdue" | "Partial"
  items:      InvoiceItem[]
  subtotal:   number
  total:      number
  paid:       number
  balanceDue: number

  // ── Optional ────────────────────────────────────────────────────────────────
  reference?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Load a remote or data-URL image → base-64 data URL. Never throws. */
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

/** Format a number as Pakistani Rupees */
const pkr = (n: number) =>
  "PKR " + n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Draw a filled rectangle (optionally rounded). */
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

  const PW = 210   // A4 width
  const PH = 297   // A4 height
  const ML = 14    // left margin
  const MR = 14    // right margin
  const CW = PW - ML - MR

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 1 — HEADER  (FIX 1: WHITE background, FIX 6: navy text/logo ring)
  // The header area is plain white — no coloured background stripe.
  // The navy colour appears only in the logo circle and text.
  // ─────────────────────────────────────────────────────────────────────────
  const HEADER_H  = 38
  // White background for entire header (redundant but explicit)
  filledRect(doc, 0, 0, PW, HEADER_H, WHITE)

  // Load logo
  let logoData: string | null = null
  if (data.logoUrl) {
    logoData = await loadImage(data.logoUrl)
  }

  const LOGO_SIZE = 20
  const LOGO_X    = ML
  const LOGO_Y    = 9

  if (logoData) {
    // Navy circle behind logo (matches the dark circle in the sample)
    doc.setFillColor(...NAVY)
    doc.circle(LOGO_X + LOGO_SIZE / 2, LOGO_Y + LOGO_SIZE / 2, LOGO_SIZE / 2 + 1, "F")
    doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)
  }

  // Company name (left side, dark navy, bold)
  const textX = logoData ? LOGO_X + LOGO_SIZE + 5 : ML
  doc.setTextColor(...NAVY)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text(data.companyName || "Your Company", textX, 18)

  // Tagline (muted, smaller)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text(data.companyTagline || "", textX, 24)

  // "INVOICE" title — right side, navy (FIX 6: was blue, now navy)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(28)
  doc.setTextColor(...NAVY)
  doc.text("INVOICE", PW - MR, 20, { align: "right" })

  // Invoice No & Date (right, below INVOICE title)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text("Invoice No:", PW - MR - 38, 28)
  doc.text("Date:",       PW - MR - 38, 33)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...DARK)
  doc.text(data.invoiceNo, PW - MR, 28, { align: "right" })
  doc.text(data.date,      PW - MR, 33, { align: "right" })

  // ─────────────────────────────────────────────────────────────────────────
  // FIX 2: No blue separator line — use a very light grey hairline instead
  // so the header still has a subtle visual boundary without the blue stripe.
  // ─────────────────────────────────────────────────────────────────────────
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.4)
  doc.line(ML, HEADER_H, PW - MR, HEADER_H)

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 2 — BILL TO / AMOUNT DUE
  // FIX 4: null-safe phone & address  FIX 5: Amount Due aligned to customer name
  // ─────────────────────────────────────────────────────────────────────────
  let Y = HEADER_H + 8

  // "BILL TO" label (left)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text("BILL TO", ML, Y)

  // "AMOUNT DUE" label (right — same baseline as BILL TO)
  doc.text("AMOUNT DUE", PW - MR, Y, { align: "right" })

  Y += 5

  // ── Customer name (left, large bold dark) — FIX 5: Amount Due at same Y ──
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(...DARK)
  doc.text(data.customerName || "", ML, Y)

  // Amount Due value (right, amber, same Y as customer name) — FIX 5
  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(...AMBER)
  doc.text(pkr(data.balanceDue), PW - MR, Y, { align: "right" })

  Y += 5

  // Phone — FIX 4: guard against null/undefined/empty
  const phone = (data.customerPhone ?? "").trim()
  if (phone) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(`▪ ${phone}`, ML, Y)
    Y += 4.5
  }

  // Address — FIX 4
  const address = (data.customerAddress ?? "").trim()
  if (address) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    const addrLines = doc.splitTextToSize(`▪ ${address}`, CW * 0.55)
    doc.text(addrLines, ML, Y)
    Y += addrLines.length * 4.5
  }

  // Email (optional) — FIX 4
  const email = (data.customerEmail ?? "").trim()
  if (email) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(`▪ ${email}`, ML, Y)
    Y += 4.5
  }

  // ── STATUS badge (right-aligned, below Amount Due) ────────────────────────
  const statusText = (data.status || "Unpaid").toUpperCase()
  const isUnpaid   = ["UNPAID","OVERDUE"].includes(statusText)
  const isPaid     = statusText === "PAID"
  const badgeColor: [number,number,number] = isPaid
    ? [5, 150, 105]
    : isUnpaid ? RED : AMBER

  // "STATUS" label
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  // Place STATUS label 2 lines below the AMOUNT DUE value
  const statusLabelY = HEADER_H + 8 + 5 + 5 + 5   // same logic: headerH+8+5+5 = ~23
  doc.text("STATUS", PW - MR, statusLabelY, { align: "right" })

  // Badge pill
  const badgeW = 22
  const badgeH = 6
  const badgeX = PW - MR - badgeW
  const badgeY = statusLabelY + 2
  filledRect(doc, badgeX, badgeY, badgeW, badgeH, badgeColor, 2)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...WHITE)
  doc.text(statusText, badgeX + badgeW / 2, badgeY + 4, { align: "center" })

  // Thin divider before table
  const divY = Math.max(Y, badgeY + badgeH) + 5
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(ML, divY, PW - MR, divY)

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 3 — ITEMS TABLE
  // ─────────────────────────────────────────────────────────────────────────
  const tableY = divY + 4

  const tableColumns = [
    { header: "",             dataKey: "img"         },
    { header: "#",            dataKey: "num"         },
    { header: "Description",  dataKey: "description" },
    { header: "Qty",          dataKey: "qty"         },
    { header: "Unit Price",   dataKey: "unit_price"  },
    { header: "Amount",       dataKey: "amount"      },
  ]

  // Pre-load product images in parallel
  const imageCache: Record<number, string> = {}
  await Promise.all(
    data.items.map(async (item, i) => {
      if (item.image_path) {
        const img = await loadImage(item.image_path)
        if (img) imageCache[i] = img
      }
    }),
  )

  const tableRows = data.items.map((item, i) => ({
    img:         i,
    num:         i + 1,
    description: item.product_id
      ? `${item.product_id}${item.product_name ? " – " + item.product_name : ""}${item.description ? "\n" + item.description : ""}`
      : (item.description || ""),
    qty:         item.qty,
    unit_price:  pkr(item.unit_price),
    amount:      pkr(item.total),
  }))

  const ROW_H = 14

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
      minCellHeight: ROW_H,
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
      unit_price:  { cellWidth: 32, halign: "right" },
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

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 4 — SUBTOTAL / TAX / TOTAL
  // ─────────────────────────────────────────────────────────────────────────
  const afterTable = (doc as any).lastAutoTable.finalY as number
  let SY = afterTable + 6

  const sumX = PW - MR - 70
  const valX = PW - MR

  // Subtotal row
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text("Subtotal", sumX, SY)
  doc.setTextColor(...DARK)
  doc.text(pkr(data.subtotal), valX, SY, { align: "right" })
  SY += 5.5

  // Tax row (bold label to match sample)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...MUTED)
  doc.text("Tax (0%)", sumX, SY)
  doc.setTextColor(...DARK)
  doc.text(pkr(0), valX, SY, { align: "right" })
  SY += 5.5

  // Total — filled navy pill
  filledRect(doc, sumX - 2, SY - 4, valX - sumX + 4, 9, NAVY, 2)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...WHITE)
  doc.text("Total", sumX + 2, SY + 1.5)
  doc.text(pkr(data.total), valX - 2, SY + 1.5, { align: "right" })
  SY += 10

  // Balance Due (only if partial payment recorded)
  if (data.paid > 0) {
    SY += 2
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text("Amount Paid", sumX, SY)
    doc.setTextColor(16, 185, 129)
    doc.text(`– ${pkr(data.paid)}`, valX, SY, { align: "right" })
    SY += 5.5

    doc.setFont("helvetica", "bold")
    doc.setTextColor(...RED)
    doc.text("Balance Due", sumX, SY)
    doc.text(pkr(data.balanceDue), valX, SY, { align: "right" })
    SY += 5
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 5 — NOTES & TERMS  (FIX 7: uses real terms from invoice/customer)
  // ─────────────────────────────────────────────────────────────────────────
  SY += 6

  /**
   * Priority order for the terms/notes block:
   *   1. invoice.payment_terms   (e.g. "Net 15", "Due on receipt", custom text)
   *   2. invoice.notes            (free-text note field)
   *   3. Hard-coded fallback      (only if nothing is set at all)
   *
   * At the call-site, merge them like:
   *   paymentTerms: invoice.payment_terms ?? customer.payment_terms ?? null
   *   notes:        invoice.notes ?? null
   */
  const termsLines: string[] = []

  const terms = (data.paymentTerms ?? "").trim()
  if (terms) termsLines.push(terms)

  const notes = (data.notes ?? "").trim()
  if (notes) termsLines.push(notes)

  // Absolute fallback when neither field is populated
  if (termsLines.length === 0) {
    termsLines.push(
      "Payment is due within 30 days of invoice date.",
      "Please reference the invoice number with your payment.",
    )
  }

  const notesBlock = termsLines.join("\n")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text("NOTES & TERMS", ML, SY)
  SY += 4

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...DARK)
  const noteLines = doc.splitTextToSize(notesBlock, CW)
  doc.text(noteLines, ML, SY)
  SY += noteLines.length * 4.5 + 4

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 6 — FOOTER
  // ─────────────────────────────────────────────────────────────────────────
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(ML, PH - 16, PW - MR, PH - 16)

  const footerParts = [
    "Thank you for your business!",
    data.companyName,
    data.companyTagline,
  ].filter(Boolean)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(footerParts.join(" · "), PW / 2, PH - 10, { align: "center" })

  return doc
}

// ─────────────────────────────────────────────────────────────────────────────
// CALL-SITE EXAMPLE (in your invoice view/print handler)
// ─────────────────────────────────────────────────────────────────────────────
//
// import { generateInvoicePDF, InvoicePDFData } from "@/lib/pdf/invoicePDF"
//
// async function printInvoice(invoiceId: string) {
//   // 1. Always fetch company settings fresh — never use cached/stale data
//   const { data: company } = await supabase
//     .from("company_settings")
//     .select("name, address, phone, email, tagline, logo_url, business_type")
//     .eq("company_id", companyId)
//     .single()
//
//   // 2. Fetch invoice + customer in one go
//   const { data: invoice } = await supabase
//     .from("invoices")
//     .select(`
//       *,
//       customer:parties!party_id (name, phone, address, email, payment_terms)
//     `)
//     .eq("id", invoiceId)
//     .single()
//
//   const pdfData: InvoicePDFData = {
//     // Company — always fresh from DB (FIX 3)
//     companyName:    company.name,
//     companyAddress: company.address,
//     companyPhone:   company.phone,
//     companyEmail:   company.email,
//     companyTagline: company.tagline,
//     logoUrl:        company.logo_url,        // full URL or Supabase storage URL
//     businessType:   company.business_type,
//
//     // Invoice
//     invoiceNo:  invoice.invoice_number,
//     date:       invoice.date,
//     dueDate:    invoice.due_date,
//
//     // Customer (FIX 4: use ?. so null fields don't crash)
//     customerName:    invoice.customer?.name    ?? "",
//     customerPhone:   invoice.customer?.phone   ?? "",
//     customerAddress: invoice.customer?.address ?? "",
//     customerEmail:   invoice.customer?.email   ?? "",
//
//     // Terms (FIX 7: invoice-level terms first, then customer default)
//     paymentTerms: invoice.payment_terms ?? invoice.customer?.payment_terms ?? null,
//     notes:        invoice.notes ?? null,
//
//     // Amounts
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
