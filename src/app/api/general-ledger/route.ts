import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// Helper to check if a string is a valid YYYY-MM-DD date
function isValidDate(str: string) {
  const regex = /^\d{4}-\d{2}-\d{2}$/
  if (!regex.test(str)) return false
  const d = new Date(str)
  return d instanceof Date && !isNaN(d.getTime())
}

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

  // 2. Parse query params – validate dates strictly
  const { searchParams } = new URL(request.url)
  const accountId  = searchParams.get('accountId')
  const startDate  = searchParams.get('startDate')
  const endDate    = searchParams.get('endDate')
  const projectId  = searchParams.get('projectId')  || null
  const donorId    = searchParams.get('donorId')    || null
  const activityId = searchParams.get('activityId') || null
  const locationId = searchParams.get('locationId') || null

  if (!accountId || !startDate || !endDate || !isValidDate(startDate) || !isValidDate(endDate)) {
    return NextResponse.json({ error: 'Missing or invalid required parameters (accountId, startDate, endDate)' }, { status: 400 })
  }

  // 3. Service‑role client for data queries
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 4. Build match object
  let match: any = {
    account_id: parseInt(accountId),
    company_id: companyId,
    'journal_entries.deleted_at': null,
  }
  if (projectId)  match.project_id  = parseInt(projectId)
  if (donorId)    match.donor_id    = parseInt(donorId)
  if (activityId) match.activity_id = parseInt(activityId)
  if (locationId) match.location_id = parseInt(locationId)

  // 5. Opening balance (before start date)
  const { data: openingLines, error: openingErr } = await supabaseAdmin
    .from('journal_lines')
    .select('debit, credit, journal_entries!inner(date)')
    .match(match)
    .lt('journal_entries.date', startDate)

  if (openingErr) {
    return NextResponse.json({ error: openingErr.message }, { status: 500 })
  }

  let openingBalance = 0
  openingLines?.forEach((line: any) => {
    openingBalance += (line.debit || 0) - (line.credit || 0)
  })

  // 6. Period lines
  const { data: periodLines, error: periodErr } = await supabaseAdmin
    .from('journal_lines')
    .select('id, debit, credit, journal_entries!inner(entry_no, date, description, id)')
    .match(match)
    .gte('journal_entries.date', startDate)
    .lte('journal_entries.date', endDate)
    .order('date', { foreignTable: 'journal_entries', ascending: true })

  if (periodErr) {
    return NextResponse.json({ error: periodErr.message }, { status: 500 })
  }

  // 7. Running balances
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

  // 8. Tag labels
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
}