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
  const projectId = searchParams.get('projectId')

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'Missing startDate or endDate' }, { status: 400 })
  }

  const { data: accounts, error: acctErr } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .in('type', ['Revenue', 'Expense'])
    .eq('company_id', companyId)
    .order('code')

  if (acctErr) return NextResponse.json({ error: acctErr.message }, { status: 500 })

  let linesQuery = supabase
    .from('journal_lines')
    .select('account_id, debit, credit, journal_entries!inner(date, deleted_at)')
    .gte('journal_entries.date', startDate)
    .lte('journal_entries.date', endDate)
    .is('journal_entries.deleted_at', null)              // ← exclude soft‑deleted entries

  if (projectId) {
    linesQuery = linesQuery.eq('project_id', projectId)
  }

  const { data: lines, error: linesErr } = await linesQuery

  if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 })

  const netMap: Record<number, number> = {}
  ;(lines || []).forEach((l: any) => {
    const net = (l.credit || 0) - (l.debit || 0)
    netMap[l.account_id] = (netMap[l.account_id] || 0) + net
  })

  const result = accounts.map(a => ({
    account_id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    net: netMap[a.id] || 0,
  }))

  return NextResponse.json(result)
}