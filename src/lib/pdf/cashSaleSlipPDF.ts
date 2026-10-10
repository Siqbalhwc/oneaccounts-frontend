import jsPDF from "jspdf"
import { fmtMoney, fmtRate } from "../money"
import { fmtQty } from "../format-number"

// Thermal roll slip for Cash Sales. Black and white only, single column.
// Width is 80 mm or 58 mm; the page height is calculated from the content.

export type SlipWidth = 58 | 80

export interface CashSaleSlipItem {
  name: string
  qty: number
  rate: number
  total: number
}

export interface CashSaleSlipData {
  companyName: string
  companyTagline?: string | null
  logoUrl?: string | null

  saleNo: string
  date: string
  customerName: string
  returned?: boolean

  items: CashSaleSlipItem[]
  subtotal: number   // before discount
  discount: number
  net: number        // total payable
  received: number
  due: number
}

// jsPDF's standard fonts only know Latin characters; swap the common fancy ones.
const clean = (s: any) =>
  String(s ?? "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, " ")

async function fetchAsDataUrl(url: string): Promise<string | null> {
  if (url.startsWith("data:")) return url
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

// Flatten the logo onto a white background in greyscale so transparent PNGs
// do not print as black boxes on a thermal printer.
async function prepareLogo(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const raw = await fetchAsDataUrl(url)
    if (!raw) return null
    return await new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        try {
          const maxW = 400
          const scale = Math.min(1, maxW / img.naturalWidth)
          const w = Math.max(1, Math.round(img.naturalWidth * scale))
          const h = Math.max(1, Math.round(img.naturalHeight * scale))
          const canvas = document.createElement("canvas")
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext("2d")
          if (!ctx) { resolve(null); return }
          ctx.fillStyle = "#FFFFFF"
          ctx.fillRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0, w, h)
          const px = ctx.getImageData(0, 0, w, h)
          for (let i = 0; i < px.data.length; i += 4) {
            const g = Math.round(0.299 * px.data[i] + 0.587 * px.data[i + 1] + 0.114 * px.data[i + 2])
            px.data[i] = px.data[i + 1] = px.data[i + 2] = g
          }
          ctx.putImageData(px, 0, 0)
          resolve({ data: canvas.toDataURL("image/png"), w, h })
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = raw
    })
  } catch {
    return null
  }
}

const PT = 0.3528 // mm per point
const lineH = (fs: number) => fs * PT * 1.3

function render(
  doc: jsPDF,
  d: CashSaleSlipData,
  W: SlipWidth,
  logo: { data: string; w: number; h: number } | null,
): number {
  const M = W === 80 ? 4 : 5          // side margin; 80mm paper prints ~72mm, 58mm paper ~48mm
  const L = M
  const R = W - M
  const UW = W - 2 * M
  const CX = W / 2

  const FS_TITLE = W === 80 ? 12 : 10
  const FS_ITEM  = W === 80 ? 9 : 8
  const FS_SMALL = W === 80 ? 8 : 7
  const FS_TOTAL = W === 80 ? 11 : 9.5

  let y = 4

  const setFont = (fs: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal")
    doc.setFontSize(fs)
    doc.setTextColor(0, 0, 0)
  }

  const rule = () => {
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.2)
    doc.setLineDashPattern([0.8, 0.8], 0)
    doc.line(L, y, R, y)
    doc.setLineDashPattern([], 0)
    y += 2
  }

  const centered = (text: string, fs: number, bold = false) => {
    setFont(fs, bold)
    const lines = doc.splitTextToSize(clean(text), UW) as string[]
    lines.forEach(line => {
      y += lineH(fs)
      doc.text(line, CX, y, { align: "center" })
    })
  }

  const wrappedLeft = (text: string, fs: number, bold = false) => {
    setFont(fs, bold)
    const lines = doc.splitTextToSize(clean(text), UW) as string[]
    lines.forEach(line => {
      y += lineH(fs)
      doc.text(line, L, y)
    })
  }

  const pair = (left: string, right: string, fs: number, bold = false) => {
    setFont(fs, bold)
    y += lineH(fs)
    doc.text(clean(left), L, y)
    doc.text(clean(right), R, y, { align: "right" })
  }

  // ── Logo ──
  if (logo) {
    const maxH = W === 80 ? 16 : 12
    const maxW = UW * 0.6
    let h = maxH
    let w = (logo.w / logo.h) * h
    if (w > maxW) { w = maxW; h = (logo.h / logo.w) * w }
    doc.addImage(logo.data, "PNG", CX - w / 2, y, w, h)
    y += h + 1.5
  }

  // ── Company ──
  centered(d.companyName || "", FS_TITLE, true)
  if (d.companyTagline) centered(d.companyTagline, FS_SMALL)
  y += 1.5
  rule()

  // ── Sale info ──
  centered("CASH SALE", FS_ITEM, true)
  if (d.returned) centered("*** RETURNED ***", FS_ITEM, true)
  y += 0.5
  pair("Sale No:", d.saleNo, FS_SMALL)
  pair("Date:", d.date, FS_SMALL)
  wrappedLeft(`Customer: ${d.customerName || "Walk-in Customer"}`, FS_SMALL)
  y += 1.5
  rule()

  // ── Items ──
  pair("Item", "Amount", FS_SMALL, true)
  y += 1
  rule()

  d.items.forEach((it, idx) => {
    wrappedLeft(it.name || "-", FS_ITEM, true)
    pair(`${fmtQty(it.qty)} x ${fmtRate(it.rate)}`, fmtMoney(it.total), FS_SMALL)
    if (idx < d.items.length - 1) y += 1.5
  })
  y += 1.5
  rule()

  // ── Totals ──
  if (d.discount > 0) {
    pair("Sub Total", fmtMoney(d.subtotal), FS_SMALL)
    pair("Discount", "-" + fmtMoney(d.discount), FS_SMALL)
    y += 0.5
  }
  pair("TOTAL (PKR)", fmtMoney(d.net), FS_TOTAL, true)
  y += 0.5
  pair("Received", fmtMoney(d.received), FS_SMALL)
  if (d.due > 0) pair("Balance Due", fmtMoney(d.due), FS_ITEM, true)
  y += 1.5
  rule()

  // ── Footer ──
  centered("Thank you for your business", FS_SMALL)
  y += 6 // blank space so the cutter does not clip the last line

  return y
}

export async function generateCashSaleSlipPDF(d: CashSaleSlipData, width: SlipWidth): Promise<jsPDF> {
  const logo = d.logoUrl ? await prepareLogo(d.logoUrl) : null

  // Pass 1: measure the content height on a very tall scratch page.
  const scratch = new jsPDF({ orientation: "portrait", unit: "mm", format: [width, 5000] })
  const height = render(scratch, d, width, logo)

  // Pass 2: real page, exactly as tall as needed (portrait needs height > width).
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [width, Math.max(height, width + 1)],
  })
  render(doc, d, width, logo)
  return doc
}

// Opens the slip in a new tab and starts the print dialog.
// The tab is opened first (inside the click) so the browser's popup blocker allows it;
// if it is blocked anyway, the PDF is downloaded instead.
export async function openCashSaleSlip(build: () => Promise<jsPDF>, fileName: string): Promise<void> {
  const win = typeof window !== "undefined" ? window.open("", "_blank") : null
  try {
    const doc = await build()
    doc.autoPrint()
    if (win) {
      win.location.href = String(doc.output("bloburl"))
    } else {
      doc.save(fileName)
    }
  } catch (err) {
    if (win) win.close()
    throw err
  }
}
