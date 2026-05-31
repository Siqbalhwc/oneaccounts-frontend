import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const TABLE_COLUMNS: Record<string, string[]> = {
  customers: ["code", "name", "phone", "address", "email", "country_code", "payment_terms", "balance"],
  suppliers: ["code", "name", "phone", "address", "email", "balance"],
  products: ["code", "name", "sale_price", "cost_price", "qty_on_hand", "reorder_level", "description", "image_path"],
}

const PHONE_LENGTHS: Record<string, number> = {
  "+92": 10, "+1": 10, "+44": 10, "+971": 9,
  "+966": 9, "+91": 10, "+86": 11, "+81": 10,
  "+49": 10, "+33": 9, "+61": 9, "+27": 9,
}

export async function POST(request: NextRequest) {
  try {
    // 1. Get the authenticated user's email
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {},
        },
      }
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }
    const userEmail = user.email || "system"

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const table = formData.get("table") as string | null
    const companyId = formData.get("company_id") as string | null

    if (!file || !table || !companyId) {
      return NextResponse.json({ success: false, error: "Missing file, table, or company_id" }, { status: 400 })
    }

    if (!TABLE_COLUMNS[table]) {
      return NextResponse.json({ success: false, error: "Invalid table" }, { status: 400 })
    }

    const text = await file.text()
    const lines = text.trim().split("\n")
    if (lines.length < 2) {
      return NextResponse.json({ success: false, error: "CSV must have header and at least one data row" }, { status: 400 })
    }

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase())
    const requiredCols = TABLE_COLUMNS[table]
    for (const col of requiredCols) {
      if (!headers.includes(col)) {
        return NextResponse.json({ success: false, error: `Missing required column: ${col}` }, { status: 400 })
      }
    }

    // 2. Auto‑generate codes for customers and suppliers
    let lastCustNum = 0
    if (table === "customers") {
      const { data: codes } = await supabaseAdmin
        .from("customers")
        .select("code")
        .eq("company_id", companyId)
        .ilike("code", "CUST-%")
        .order("code", { ascending: false })
        .limit(1)
      if (codes && codes.length > 0) {
        const match = codes[0].code.match(/CUST-(\d+)/)
        if (match) lastCustNum = parseInt(match[1], 10)
      }
    }

    let lastSupNum = 0
    if (table === "suppliers") {
      const { data: supCodes } = await supabaseAdmin
        .from("suppliers")
        .select("code")
        .eq("company_id", companyId)
        .ilike("code", "SUP-%")
        .order("code", { ascending: false })
        .limit(1)
      if (supCodes && supCodes.length > 0) {
        const match = supCodes[0].code.match(/SUP-(\d+)/)
        if (match) lastSupNum = parseInt(match[1], 10)
      }
    }

    const rows: any[] = []
    const errors: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map(v => v.trim())
      if (values.length !== headers.length) {
        errors.push(`Row ${i}: column count mismatch`)
        continue
      }

      const row: any = {}
      headers.forEach((h, idx) => {
        let val: any = values[idx]
        if (["balance", "sale_price", "cost_price", "qty_on_hand", "reorder_level"].includes(h)) {
          val = parseFloat(val) || 0
        }
        row[h] = val
      })

      // Auto‑generate customer code if empty
      if (table === "customers" && (!row.code || row.code === "")) {
        lastCustNum++
        row.code = `CUST-${String(lastCustNum).padStart(3, "0")}`
      }

      // Auto‑generate supplier code if empty
      if (table === "suppliers" && (!row.code || row.code === "")) {
        lastSupNum++
        row.code = `SUP-${String(lastSupNum).padStart(3, "0")}`
      }

      // Phone validation for customers
      if (table === "customers" && row.phone) {
        const phoneStr = String(row.phone)
        const match = phoneStr.match(/^(\+\d{1,3})(\d+)$/)
        if (!match) {
          errors.push(`Row ${i}: phone must start with + and country code, e.g. +923001234567`)
          continue
        }
        const country = match[1]
        const digits = match[2]
        const expected = PHONE_LENGTHS[country]
        if (expected && digits.length !== expected) {
          errors.push(`Row ${i}: phone for ${country} must be ${expected} digits, got ${digits.length}`)
          continue
        }
        row.phone = country + digits
      } else if (table === "customers") {
        row.phone = null
      }

      // Phone validation for suppliers
      if (table === "suppliers" && row.phone) {
        const phoneStr = String(row.phone)
        const match = phoneStr.match(/^(\+\d{1,3})(\d+)$/)
        if (!match) {
          errors.push(`Row ${i}: phone must start with + and country code, e.g. +923001234567`)
          continue
        }
        const country = match[1]
        const digits = match[2]
        const expected = PHONE_LENGTHS[country]
        if (expected && digits.length !== expected) {
          errors.push(`Row ${i}: phone for ${country} must be ${expected} digits, got ${digits.length}`)
          continue
        }
        row.phone = country + digits
      } else if (table === "suppliers") {
        row.phone = null
      }

      row.company_id = companyId
      row.created_by = userEmail
      row.updated_by = userEmail
      rows.push(row)
    }

    if (errors.length > 0) {
      return NextResponse.json({ success: false, error: errors.join("; ") }, { status: 400 })
    }

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "No valid data rows" }, { status: 400 })
    }

    const { data, error: insertErr } = await supabaseAdmin.from(table).insert(rows).select()
    if (insertErr) {
      return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: data?.length || rows.length })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || "Unknown error" }, { status: 500 })
  }
}