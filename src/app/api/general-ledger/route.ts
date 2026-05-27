import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // 1. Authenticate using standard server client
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

  const { searchParams } = new URL(request.url)
  const accountId  = searchParams.get('accountId')
  const startDate  = searchParams.get('startDate')
  const endDate    = searchParams.get('endDate')

  if (!accountId || !startDate || !endDate) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  // 2. Build query using the AUTHENTICATED client (RLS enforced)
  const baseQuery = (q: any) =>
    q.eq('account_id', parseInt(accountId))
     .eq('company_id', companyId)             // explicit filter (RLS would also catch)
     .is('journal_entries.deleted_at', null)

  try {
    const { data: allLines, error: allErr } = await baseQuery(
      supabase.from('journal_lines')
        .select('id, debit, credit, journal_entries!inner(entry_no, date, description, id)')
    )

    if (allErr) throw new Error(allErr.message)
    if (!allLines || allLines.length === 0) {
      return NextResponse.json({
        openingBalance: 0,
        lines: [{
          id: 'opening',
          entry_no: '',
          entry_id: null,
          date: startDate,
          description: 'Opening Balance',
          debit: 0,
          credit: 0,
          running_balance: 0,
          isOpening: true,
        }],
      })
    }

    // 3. Sort and compute balances
    const sorted = [...allLines].sort((a: any, b: any) =>
      (a.journal_entries?.date || '').localeCompare(b.journal_entries?.date || '')
    )

    let openingBalance = 0
    const periodLines: any[] = []

    for (const line of sorted) {
      const date = line.journal_entries?.date
      if (!date) continue
      const net = (line.debit || 0) - (line.credit || 0)

      if (date < startDate) {
        openingBalance += net
      } else if (date >= startDate && date <= endDate) {
        periodLines.push({
          id: line.id,
          entry_no: line.journal_entries?.entry_no || '',
          entry_id: line.journal_entries?.id || null,
          date,
          description: line.journal_entries?.description || '',
          debit: line.debit || 0,
          credit: line.credit || 0,
        })
      }
    }

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

    for (const line of periodLines) {
      running += (line.debit || 0) - (line.credit || 0)
      line.running_balance = running
      finalLines.push({ ...line, isOpening: false })
    }

    return NextResponse.json({ openingBalance, lines: finalLines })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}