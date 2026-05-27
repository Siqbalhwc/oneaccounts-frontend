import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // 1. Authenticate
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

  // 2. Service‑role client (bypasses RLS)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const baseQuery = (q: any) =>
    q.eq('account_id', parseInt(accountId))
     .eq('company_id', companyId)
     .is('journal_entries.deleted_at', null)

  try {
    // 3. Fetch ALL lines for this account (no date filter for opening balance)
    const { data: allLines, error: allErr } = await baseQuery(
      supabaseAdmin.from('journal_lines')
        .select('id, debit, credit, journal_entries!inner(entry_no, date, description, id)')
    )

    if (allErr) throw new Error(allErr.message)
    if (!allLines || allLines.length === 0) {
      // No lines at all – empty ledger
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

    // 4. Sort by date (critical – API ordering was unreliable)
    const sorted = [...allLines].sort((a: any, b: any) => {
      const dateA = a.journal_entries?.date || ''
      const dateB = b.journal_entries?.date || ''
      return dateA.localeCompare(dateB)
    })

    // 5. Compute opening balance (before start date)
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
          date: date,
          description: line.journal_entries?.description || '',
          debit: line.debit || 0,
          credit: line.credit || 0,
          // running_balance will be filled next
        })
      }
    }

    // 6. Build final lines with running balances
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