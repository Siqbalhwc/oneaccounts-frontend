import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
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

  const { customerId, customerName, amount } = await request.json()
  if (!customerId || !customerName || amount <= 0) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }

  // Fetch required accounts
  const arAcc = await supabase.from('accounts').select('id,balance').eq('code', '1100').single()
  const eqAcc = await supabase.from('accounts').select('id,balance').eq('code', '3000').single()

  if (!arAcc.data || !eqAcc.data) {
    return NextResponse.json({ error: 'Required accounts (1100, 3000) not found' }, { status: 500 })
  }

  const entryNo = `OB-CUST-${customerId}-${Date.now()}`
  const description = `Opening Balance - ${customerName}`

  // Create journal entry
  const { data: entry, error: entryErr } = await supabase
    .from('journal_entries')
    .insert({
      entry_no: entryNo,
      date: new Date().toISOString().split('T')[0],
      description,
    })
    .select('id')
    .single()

  if (entryErr || !entry) {
    return NextResponse.json({ error: entryErr?.message || 'Failed to create journal entry' }, { status: 500 })
  }

  // Insert lines
  await supabase.from('journal_lines').insert([
    { entry_id: entry.id, account_id: arAcc.data.id, debit: amount, credit: 0 },
    { entry_id: entry.id, account_id: eqAcc.data.id, debit: 0, credit: amount },
  ])

  // Update account balances
  await supabase.from('accounts').update({ balance: arAcc.data.balance + amount }).eq('id', arAcc.data.id)
  await supabase.from('accounts').update({ balance: eqAcc.data.balance + amount }).eq('id', eqAcc.data.id)

  return NextResponse.json({ success: true, entryId: entry.id })
}