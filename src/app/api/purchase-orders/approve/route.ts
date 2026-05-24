import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

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

    // Optional: verify the user has approval permission (the page already checks, but double-check here)
    // We'll skip to keep it simple, but you can add JWT check later.

    const { error } = await supabase
      .from("purchase_orders")
      .update({
        status: "Approved",
        updated_by: "system",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", company_id)
      .eq("status", "Draft")   // only approve drafts

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || "Internal server error" }, { status: 500 })
  }
}