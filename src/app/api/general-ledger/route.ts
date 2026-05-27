import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // ── Authenticate user via session cookie ────────────────────────
  const cookieStore = await cookies()
  const token = cookieStore.get('sb-access-token')?.value
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Create an admin client to bypass RLS
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = user.app_metadata?.company_id
  if (!companyId) {
    return NextResponse.json({ error: 'No company linked' }, { status: 400 })
  }

  // ── Parse query parameters ───────────────────────────────────────
  const { searchParams } = new URL(request.url)
  const accountId      = searchParams.get('accountId')
  const startDate      = searchParams.get('startDate')
  const endDate        = searchParams.get('endDate')
  const projectId      = searchParams.get('projectId')      || null
  const donorId        = searchParams.get('donorId')        || null
  const activityId     = searchParams.get('activityId')     || null
  const locationId     = searchParams.get('locationId')     || null

  if (!accountId || !startDate || !endDate) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
  }

  // ── Build the WHERE clause dynamically ──────────────────────────
  let match: any = {
    account_id: parseInt(accountId),
    company_id: companyId,
    'journal_entries.deleted_at': null,
  }

  // Add optional tag filters if provided
  if (projectId)   match.project_id = parseInt(projectId)
  if (donorId)     match.donor_id   = parseInt(donorId)
  if (activityId)  match.activity_id = parseInt(activityId)
  if (locationId)  match.location_id = parseInt(locationId)

  // ── 1. Calculate opening balance ─────────────────────────────────
  const { data: openingLines, error: openingError } = await supabaseAdmin
    .from('journal_lines')
    .select('debit, credit, journal_entries!inner(date)')
    .match(match)
    .lt('journal_entries.date', startDate)

  if (openingError) {
    return NextResponse.json({ error: openingError.message }, { status: 500 })
  }

  let openingBalance = 0
  openingLines?.forEach((line: any) => {
    openingBalance += (line.debit || 0) - (line.credit || 0)
  })

  // ── 2. Fetch period lines ────────────────────────────────────────
  const { data: periodLines, error: periodError } = await supabaseAdmin
    .from('journal_lines')
    .select('id, debit, credit, journal_entries!inner(entry_no, date, description)')
    .match(match)
    .gte('journal_entries.date', startDate)
    .lte('journal_entries.date', endDate)
    .order('date', { foreignTable: 'journal_entries', ascending: true })

  if (periodError) {
    return NextResponse.json({ error: periodError.message }, { status: 500 })
  }

  // ── 3. Compute running balances ──────────────────────────────────
  let running = openingBalance
  const finalLines: any[] = [
    {
      id: 'opening',
      entry_no: '',
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
      date: line.journal_entries?.date,
      description: line.journal_entries?.description || '',
      debit: line.debit || 0,
      credit: line.credit || 0,
      running_balance: running,
      isOpening: false,
    })
  })

  return NextResponse.json({
    openingBalance,
    lines: finalLines,
  })
}