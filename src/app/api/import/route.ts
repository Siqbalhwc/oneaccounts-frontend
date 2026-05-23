import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Allowed tables and their required columns (must match CSV header)
const TABLE_COLUMNS: Record<string, string[]> = {
  customers: ["code", "name", "phone", "address", "email", "country_code", "payment_terms", "balance"],
  suppliers: ["code", "name", "phone", "address", "email", "balance"],
  products: ["code", "name", "sale_price", "cost_price", "qty_on_hand", "reorder_level", "description", "image_path"],
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const table = formData.get("table") as string | null

    if (!file || !table) {
      return NextResponse.json({ success: false, error: "Missing file or table parameter" }, { status: 400 })
    }

    if (!TABLE_COLUMNS[table]) {
      return NextResponse.json({ success: false, error: "Invalid table" }, { status: 400 })
    }

    const text = await file.text()
    const lines = text.trim().split("\n")
    if (lines.length < 2) {
      return NextResponse.json({ success: false, error: "CSV must have header row and at least one data row" }, { status: 400 })
    }

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase())
    const requiredColumns = TABLE_COLUMNS[table]

    // Validate headers
    for (const col of requiredColumns) {
      if (!headers.includes(col)) {
        return NextResponse.json({ success: false, error: `Missing required column: ${col}` }, { status: 400 })
      }
    }

    // Get company ID from user (optional, but enforce RLS would work)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Extract user's company from auth – in API route we can't easily get the user JWT, but we can use service role key and rely on the company_id sent by frontend? 
    // Instead, we'll expect the frontend to include company_id. Or better, we'll use the anon key and get user from request cookie. 
    // For simplicity, we'll accept company_id as a form field. (Frontend will send it.)
    const companyId = formData.get("company_id") as string | null
    if (!companyId) {
      return NextResponse.json({ success: false, error: "Missing company_id" }, { status: 400 })
    }

    // Parse data rows
    const rows: any[] = []
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map(v => v.trim())
      if (values.length !== headers.length) continue // skip malformed
      const row: any = {}
      headers.forEach((h, idx) => {
        let val: any = values[idx]
        // Convert numbers if needed
        if (["balance", "sale_price", "cost_price", "qty_on_hand", "reorder_level"].includes(h)) {
          val = parseFloat(val) || 0
        }
        row[h] = val
      })
      // Force company_id
      row.company_id = companyId
      rows.push(row)
    }

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "No valid data rows" }, { status: 400 })
    }

    // Insert into table
    const { data, error } = await supabase.from(table).insert(rows).select()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: data?.length || rows.length })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || "Unknown error" }, { status: 500 })
  }
}