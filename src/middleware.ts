import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export async function middleware(request: NextRequest) {
  // Allow upgrade page to load without redirect
  if (request.nextUrl.pathname === '/dashboard/upgrade') {
    return NextResponse.next()
  }

  // 1. Get the user's session from the request cookie
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.next()   // not logged in – let auth guard handle

  // 2. Get the user's active company via the secure RPC (bypasses RLS)
  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: companyId, error: rpcErr } = await serviceSupabase
    .rpc('current_company_id')

  if (rpcErr || !companyId) return NextResponse.next()   // no company – allow

  // 3. Check trial expiry for that company
  const { data: settings } = await serviceSupabase
    .from("company_settings")
    .select("trial_ends_at, plan_id")
    .eq("company_id", companyId)
    .maybeSingle()

  if (settings) {
    const trialEnd = settings.trial_ends_at ? new Date(settings.trial_ends_at) : null
    const hasPlan = settings.plan_id !== null

    // If trial expired and no paid plan → block
    if (!hasPlan && trialEnd && trialEnd < new Date()) {
      return NextResponse.redirect(new URL('/dashboard/upgrade', request.url))
    }
  }

  return NextResponse.next()
}

// Run on all dashboard routes
export const config = {
  matcher: '/dashboard/:path*',
}