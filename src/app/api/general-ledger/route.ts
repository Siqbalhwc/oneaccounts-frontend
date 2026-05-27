import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // 1. Authenticate with standard server client
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

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = user.app_metadata?.company_id
  if (!companyId) {
    return NextResponse.json({ error: 'No company linked' }, { status: 400 })
  }

  // 2. Parse and validate query params
  const { searchParams } = new URL(request.url)
  const accountId  = searchParams.get('accountId')
  const startDate  = searchParams.get('startDate')
  const endDate    = searchParams.get('endDate')
  const projectId  = searchParams.get('projectId')  || null
  const donorId    = searchParams.get('donorId')    || null
  const activityId = searchParams.get('activityId') || null
  const locationId = searchParams.get('locationId') || null

  if (!accountId || !startDate || !endDate) {
    return NextResponse.json({ error: 'Missing accountId, startDate or endDate' }, { status: 400 })
  }

  // 3. Service‑role client (bypasses RLS)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Build base query builder
  const baseQuery = (query: any) => {
    query = query.eq('account_id', parseInt(accountId))
                .eq('company_id', companyId)
                .is('journal_entries.deleted_at', null)   // correct null check
    if (projectId)  query = query.eq('project_id', parseInt(projectId))
    if (donorId)    query = query.eq('donor_id', parseInt(donorId))
    if (activityId) query = query.eq('activity_id', parseInt(activityId))
    if (locationId) query = query.eq('location_id', parseInt(locationId))
    return query
  }

  try {
    // 4. Opening balance (before start date)
    const { data: openingLines, error: openingErr } = await baseQuery(
      supabaseAdmin.from('journal_lines')
        .select('debit, credit, journal_entries!inner(date)')
    ).lt('journal_entries.date', startDate)

    if (openingErr) {
      return NextResponse.json({ error: 'Opening balance query failed: ' + openingErr.message }, { status: 500 })
    }

    let openingBalance = 0
    openingLines?.forEach((line: any) => {
      openingBalance += (line.debit || 0) - (line.credit || 0)
    })

    // 5. Period lines
    const { data: periodLines, error: periodErr } = await baseQuery(
      supabaseAdmin.from('journal_lines')
        .select('id, debit, credit, journal_entries!inner(entry_no, date, description, id)')
    )
    .gte('journal_entries.date', startDate)
    .lte('journal_entries.date', endDate)
    .order('date', { foreignTable: 'journal_entries', ascending: true })

    if (periodErr) {
      return NextResponse.json({ error: 'Period lines query failed: ' + periodErr.message }, { status: 500 })
    }

    // 6. Running balances
    let running = openingBalance
    const finalLines: any[] = [
      {
        id: 'opening',
        entry_no: '',
        entry_id: null,
        date: startDate,
        description: 'Opening Balance',
        debit: openingBalance > 0 ? openingBalance : 0,
        credit: openingBalance < 0 ? -openingBalance : 0,
        running_balance: openingBalance,
        isOpening: true,
      },
    ]

    periodLines?.forEach((line: any) => {
      running += (line.debit || 0) - (line.credit || 0)
      finalLines.push({
        id: line.id,
        entry_no: line.journal_entries?.entry_no || '',
        entry_id: line.journal_entries?.id || null,
        date: line.journal_entries?.date,
        description: line.journal_entries?.description || '',
        debit: line.debit || 0,
        credit: line.credit || 0,
        running_balance: running,
        isOpening: false,
      })
    })

    // 7. Tag labels
    const tagLabels: Record<string, string> = {}
    if (projectId) {
      const { data: p } = await supabaseAdmin.from('projects').select('name').eq('id', parseInt(projectId)).single()
      if (p) tagLabels.project = p.name
    }
    if (donorId) {
      const { data: d } = await supabaseAdmin.from('donors').select('name').eq('id', parseInt(donorId)).single()
      if (d) tagLabels.donor = d.name
    }
    if (activityId) {
      const { data: a } = await supabaseAdmin.from('activities').select('name').eq('id', parseInt(activityId)).single()
      if (a) tagLabels.activity = a.name
    }
    if (locationId) {
      const { data: l } = await supabaseAdmin.from('locations').select('name').eq('id', parseInt(locationId)).single()
      if (l) tagLabels.location = l.name
    }

    return NextResponse.json({ openingBalance, lines: finalLines, tagLabels })

  } catch (err: any) {
    console.error('General Ledger API error:', err)
    return NextResponse.json({ error: 'Internal server error: ' + err.message }, { status: 500 })
  }
}