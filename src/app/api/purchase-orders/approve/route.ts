import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from "next/server"
import { logDataChange } from "@/lib/audit"

export async function PATCH(request: NextRequest) {
  try {
    // 1. Authenticate and get company from session
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyId = (user?.app_metadata as any)?.company_id
    if (!companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 })

    const body = await request.json()
    const { id } = body   // only need the PO id – company comes from session

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 })
    }

    const { error } = await supabase
      .from("purchase_orders")
      .update({
        status: "Approved",
        updated_by: user.email || "system",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", companyId)
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
      user.email || "system"
    )

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || "Internal server error" }, { status: 500 })
  }
}