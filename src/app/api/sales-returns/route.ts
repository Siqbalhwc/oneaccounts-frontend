import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════ GET – List Sales Returns ═════════════════════════
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'
  const { searchParams } = new URL(request.url)
  const sortField = searchParams.get('sort') || 'date'
  const sortDir = searchParams.get('dir') || 'desc'

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('company_id', companyId)
    .eq('type', 'sale_return')
    .is('deleted_at', null)
    .order(sortField, { ascending: sortDir === 'asc' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ returns: data })
}

// ═══════════════════ POST – retired ═══════════════════════════════════
// Sales returns are now created by the database function
// create_sales_return_transaction (one all-or-nothing transaction), called from the
// Return button on the invoice page and the invoice list. This old multi-step route
// is switched off so nothing can create a half-finished return.
export async function POST() {
  return NextResponse.json(
    { error: 'Sales returns are now created from the invoice page (Return button).' },
    { status: 410 }
  )
}
