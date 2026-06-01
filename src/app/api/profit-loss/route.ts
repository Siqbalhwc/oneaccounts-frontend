import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
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
  if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = user.app_metadata?.company_id
  if (!companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 })

  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate')
  const endDate   = searchParams.get('endDate')
  const projectId = searchParams.get('projectId')  // optional

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'Missing startDate or endDate' }, { status: 400 })
  }

  // If a project filter is active, we calculate account balances manually
  if (projectId) {
    // Fetch all Revenue/Expense accounts for the company
    const { data: accounts, error: acctErr } = await supabase
      .from('accounts')
      .select('id, code, name, type')
      .in('type', ['Revenue', 'Expense'])
      .eq('company_id', companyId)
      .order('code')

    if (acctErr) return NextResponse.json({ error: acctErr.message }, { status: 500 })

    // Fetch journal lines for the project within the date range
    const { data: lines, error: linesErr } = await supabase
      .from('journal_lines')
      .select('account_id, debit, credit, journal_entries!inner(date)')
      .eq('project_id', projectId)
      .gte('journal_entries.date', startDate)
      .lte('journal_entries.date', endDate)

    if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 })

    // Aggregate net (credit - debit) per account
    const netMap: Record<number, number> = {}
    ;(lines || []).forEach((l: any) => {
      const net = (l.credit || 0) - (l.debit || 0)
      netMap[l.account_id] = (netMap[l.account_id] || 0) + net
    })

    // Build result rows
    const result = accounts.map(a => ({
      account_id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      net: netMap[a.id] || 0,
    }))

    return NextResponse.json(result)
  }

  // No project filter – use the existing RPC (faster)
  const { data, error } = await supabase.rpc('get_profit_loss_accounts', {
    cid: companyId,
    start_d: startDate,
    end_d: endDate,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data || [])
}