import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ email: null }, { status: 400 })

    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (error || !data?.user) return NextResponse.json({ email: null }, { status: 404 })

    return NextResponse.json({ email: data.user.email || null })
  } catch {
    return NextResponse.json({ email: null }, { status: 500 })
  }
}