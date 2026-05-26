import { NextResponse } from "next/server"
import * as XLSX from "xlsx"

export async function GET() {
  const ws = XLSX.utils.json_to_sheet([
    {
      "Asset Name": "Example Laptop",
      "Category": "IT",
      "Purchase Date": "2026-01-01",
      "Cost Price": 150000,
      "Life (Months)": 36,
      "Salvage Value": 0,
      "Opening Flag": "N",
      "Opening Accum Dep": 0,
      "Location": "Head Office",
      "Responsible Person": "John Doe",
      "GL Asset Acct Code": "1200",
      "GL Accum Dep Acct Code": "1201",
      "GL Dep Expense Acct Code": "5000"
    }
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Assets")
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=asset_import_template.xlsx",
    },
  })
}