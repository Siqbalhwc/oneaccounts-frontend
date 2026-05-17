import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ email: null }, { status: 400 })

  const supabase = createRouteHandlerClient(
    { cookies },
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    }
  )

  const { data, error } = await supabase.auth.admin.getUserById(userId)
  if (error || !data?.user) return NextResponse.json({ email: null })

  return NextResponse.json({ email: data.user.email || data.user.phone || null })
}