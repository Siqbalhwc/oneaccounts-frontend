import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { customerId, amount, date } = await request.json()
  if (!customerId || !amount || amount <= 0) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }

  const companyId = (user?.app_metadata as any)?.company_id
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 })

  // Find AR account (1100)
  const { data: arAccount } = await supabase
    .from('accounts')
    .select('id,balance')
    .eq('code', '1100')
    .eq('company_id', companyId)
    .maybeSingle()

  // Find or create Opening Balance Equity account (3000)
  let { data: equityAccount } = await supabase
    .from('accounts')
    .select('id,balance')
    .eq('code', '3000')
    .eq('company_id', companyId)
    .maybeSingle()

  if (!equityAccount) {
    const { data: newEq } = await supabase
      .from('accounts')
      .insert({
        code: '3000',
        name: 'Opening Balance Equity',
        type: 'Equity',
        company_id: companyId,
        balance: 0,
      })
      .select('id,balance')
      .single()
    equityAccount = newEq
  }

  if (!arAccount || !equityAccount) {
    return NextResponse.json({ error: 'Required accounts not found' }, { status: 500 })
  }

  // Create journal entry
  const { data: entry, error: entryErr } = await supabase
    .from('journal_entries')
    .insert({
      company_id: companyId,
      entry_no: `JE-OP-${customerId}-${Date.now()}`,
      date,
      description: `Opening balance for customer ${customerId}`,
    })
    .select('id')
    .single()

  if (entryErr) return NextResponse.json({ error: entryErr.message }, { status: 500 })

  // Insert lines
  const lines = [
    { entry_id: entry.id, account_id: arAccount.id, debit: amount, credit: 0, company_id: companyId },
    { entry_id: entry.id, account_id: equityAccount.id, debit: 0, credit: amount, company_id: companyId },
  ]

  const { error: linesErr } = await supabase.from('journal_lines').insert(lines)
  if (linesErr) {
    await supabase.from('journal_entries').delete().eq('id', entry.id)
    return NextResponse.json({ error: linesErr.message }, { status: 500 })
  }

  // Update account balances
  await supabase
    .from('accounts')
    .update({ balance: (arAccount.balance || 0) + amount })
    .eq('id', arAccount.id)

  await supabase
    .from('accounts')
    .update({ balance: (equityAccount.balance || 0) - amount })
    .eq('id', equityAccount.id)

  return NextResponse.json({ success: true })
}