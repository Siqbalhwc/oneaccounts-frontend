import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
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

  // 1. Authenticate
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Get company ID (using the existing helper)
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!roleData?.company_id) return NextResponse.json({ error: 'No company found' }, { status: 400 })
  const companyId = roleData.company_id

  // 3. Check feature toggle (payroll must be enabled for this company)
  const { data: featureRow } = await supabase
    .from('company_features')
    .select('enabled')
    .eq('company_id', companyId)
    .eq('features(code)', 'payroll')
    .maybeSingle()
  if (!featureRow || !featureRow.enabled) {
    return NextResponse.json({ error: 'Payroll feature is not enabled' }, { status: 403 })
  }

  const runId = parseInt(params.runId, 10)
  if (isNaN(runId)) return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 })

  // 4. Verify the run belongs to this company and is ready to post
  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, status')
    .eq('id', runId)
    .eq('company_id', companyId)
    .not('status', 'in', '("posted","locked","reversed")')
    .maybeSingle()

  if (!run) {
    return NextResponse.json({ error: 'Run not found or already posted/locked/reversed' }, { status: 404 })
  }

  // 5. Call the Postgres function that does the actual posting
  const { data, error: rpcError } = await supabase.rpc('create_payroll_transaction', {
    p_run_id: runId,
  })

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}