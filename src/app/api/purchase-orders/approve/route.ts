import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { logDataChange } from "@/lib/audit"

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, company_id } = body

    if (!id || !company_id) {
      return NextResponse.json({ success: false, error: "Missing id or company_id" }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { error } = await supabase
      .from("purchase_orders")
      .update({
        status: "Approved",
        updated_by: "system",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", company_id)
      .eq("status", "Draft")

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Audit log
    await logDataChange(
      "purchase_orders",
      String(id),
      "UPDATE",
      { status: "Approved" },
      "system"
    )

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || "Internal server error" }, { status: 500 })
  }
}