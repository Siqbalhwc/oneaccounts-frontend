import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const NAVY   = [7,8,91] as [number,number,number]
const MUTED  = [107,114,128] as [number,number,number]
const BORDER = [229,231,235] as [number,number,number]
const WHITE  = [255,255,255] as [number,number,number]
const ROW_ALT = [248,249,252] as [number,number,number]

const pkr = (n:number) => "PKR " + n.toLocaleString("en-PK",{minimumFractionDigits:2,maximumFractionDigits:2})

async function loadImage(url:string):Promise<string|null>{
  try {
    const r = await fetch(url)
    if(!r.ok) return null
    const b = await r.blob()
    return new Promise(res => {
      const reader = new FileReader()
      reader.onload = () => res(reader.result as string)
      reader.onerror = () => res("")
      reader.readAsDataURL(b)
    })
  } catch { return null }
}

export interface AssetRegisterRow {
  assetNo: string
  name: string
  category: string
  purchaseDate: string
  cost: number
  accumDep: number
  nbv: number
  remainingLife: number
  status: string
}

export interface AssetRegisterPDFData {
  companyName: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyTagline: string
  logoUrl?: string | null
  asOfDate: string
  assets: AssetRegisterRow[]
}

export async function generateAssetRegisterPDF(data: AssetRegisterPDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const PW = 297, PH = 210, ML = 14, MR = 14
  const LOGO_SIZE = 20, LOGO_X = ML, LOGO_Y = 7

  let logoData: string | null = null
  if (data.logoUrl) logoData = await loadImage(data.logoUrl)

  if (logoData) doc.addImage(logoData, "PNG", LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)
  const textX = logoData ? LOGO_X + LOGO_SIZE + 5 : ML

  // Company name & tagline
  doc.setTextColor(...NAVY).setFont("helvetica","bold").setFontSize(14).text(data.companyName || "", textX, LOGO_Y + 7)
  doc.setFont("helvetica","normal").setFontSize(8.5).setTextColor(...MUTED).text(data.companyTagline || "", textX, LOGO_Y + 13)

  // Company info (address/phone/email)
  let infoY = LOGO_Y + 19
  if (data.companyAddress) { doc.text(data.companyAddress, textX, infoY); infoY += 4 }
  if (data.companyPhone) { doc.text("Phone: " + data.companyPhone, textX, infoY); infoY += 4 }
  if (data.companyEmail) { doc.text("Email: " + data.companyEmail, textX, infoY) }

  // Title block
  doc.setFont("helvetica","bold").setFontSize(18).setTextColor(...NAVY).text("ASSET REGISTER", PW - MR, LOGO_Y + 8, { align: "right" })
  doc.setFont("helvetica","normal").setFontSize(8.5).setTextColor(...MUTED).text(`As at ${data.asOfDate}`, PW - MR, LOGO_Y + 16, { align: "right" })

  const headerBottom = Math.max(LOGO_Y + LOGO_SIZE, infoY) + 6
  doc.setDrawColor(...NAVY).setLineWidth(0.6).line(ML, headerBottom, PW - MR, headerBottom)

  let Y = headerBottom + 6

  const headers = ["Asset No", "Name", "Category", "Purchase Date", "Cost", "Accum. Dep.", "NBV", "Rem. Life", "Status"]
  const rows = data.assets.map(a => [
    a.assetNo,
    a.name,
    a.category || "—",
    a.purchaseDate,
    pkr(a.cost),
    pkr(a.accumDep),
    pkr(a.nbv),
    a.remainingLife + " m",
    a.status
  ])

  // Totals row
  const totalCost = data.assets.reduce((s,a)=> s + a.cost, 0)
  const totalAccum = data.assets.reduce((s,a)=> s + a.accumDep, 0)
  const totalNBV = data.assets.reduce((s,a)=> s + a.nbv, 0)
  rows.push(["", "", "", "", pkr(totalCost), pkr(totalAccum), pkr(totalNBV), "", ""])

  autoTable(doc, {
    startY: Y, margin: { left: ML, right: MR },
    head: [headers],
    body: rows,
    styles: {
      fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      textColor: [17,24,39], lineColor: BORDER, lineWidth: 0.2,
    },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 24 },
      3: { cellWidth: 28 },
      4: { cellWidth: 32, halign: "right" },
      5: { cellWidth: 32, halign: "right" },
      6: { cellWidth: 32, halign: "right" },
      7: { cellWidth: 22, halign: "right" },
      8: { cellWidth: 24, halign: "center" },
    },
    didParseCell: (hookData) => {
      const rowData = hookData.row.raw as string[]
      if (rowData && rowData[0] === "" && rowData[1] === "" && rowData[2] === "" && rowData[3] === "") {
        hookData.cell.styles.fontStyle = "bold"
        hookData.cell.styles.fillColor = NAVY
        hookData.cell.styles.textColor = WHITE
      }
    },
    didDrawPage: () => {
      const str = "Page " + doc.getNumberOfPages()
      doc.setFont("helvetica","normal").setFontSize(7.5).setTextColor(...MUTED)
      doc.text(str, PW - MR, PH - 8, { align: "right" })
    }
  })

  // Footer line & brand
  doc.setDrawColor(...NAVY).setLineWidth(0.4).line(ML, PH - 14, PW - MR, PH - 14)
  doc.setFont("helvetica","normal").setFontSize(7.5).setTextColor(...MUTED).text(`Generated by ${data.companyName}  ·  ${data.companyTagline}`, PW/2, PH-8, { align: "center" })

  return doc
}