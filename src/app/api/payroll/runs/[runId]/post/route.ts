import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId: runIdStr } = await params
  const cookieStore = await cookies()

  // ✅ Use service‑role key for server‑side operations that need to bypass RLS
  const supabaseAdmin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,   // NEVER exposed to client
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

  // 1. Authenticate
  const { data: { user } } = await supabaseAdmin.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Get company ID
  const { data: roleData } = await supabaseAdmin
    .from('user_roles')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!roleData?.company_id) return NextResponse.json({ error: 'No company found' }, { status: 400 })
  const companyId = roleData.company_id

  // 3. ✅ Correct, safe feature check – no broken join
  const { data: payrollFeature } = await supabaseAdmin
    .from('features')
    .select('id')
    .eq('code', 'payroll')
    .maybeSingle()

  if (!payrollFeature) {
    return NextResponse.json({ error: 'Payroll feature not configured' }, { status: 403 })
  }

  const { data: cfRow } = await supabaseAdmin
    .from('company_features')
    .select('enabled')
    .eq('company_id', companyId)
    .eq('feature_id', payrollFeature.id)
    .maybeSingle()

  if (!cfRow?.enabled) {
    return NextResponse.json({ error: 'Payroll feature is not enabled' }, { status: 403 })
  }

  const runId = parseInt(runIdStr, 10)
  if (isNaN(runId)) return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 })

  // 4. Verify the run belongs to this company and is not already posted
  const { data: run } = await supabaseAdmin
    .from('payroll_runs')
    .select('id, status')
    .eq('id', runId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }
  if (['posted','locked','reversed'].includes(run.status)) {
    return NextResponse.json({ error: 'Run already posted/locked/reversed' }, { status: 409 })
  }

  // 5. Call the Postgres function (service‑role bypasses RLS)
  const { data, error: rpcError } = await supabaseAdmin.rpc('create_payroll_transaction', {
    p_run_id: runId,
  })

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}