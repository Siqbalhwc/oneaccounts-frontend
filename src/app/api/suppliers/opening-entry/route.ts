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

  const { supplierId, supplierName, amount } = await request.json()
  if (!supplierId || !supplierName || amount <= 0) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }

  // Find the company from user_roles
  const { data: role } = await supabase.from('user_roles').select('company_id').eq('user_id', user.id).maybeSingle()
  const companyId = role?.company_id || '00000000-0000-0000-0000-000000000001'

  const eqAcc = await supabase.from('accounts').select('id,balance').eq('code', '3000').eq('company_id', companyId).single()
  const apAcc = await supabase.from('accounts').select('id,balance').eq('code', '2000').eq('company_id', companyId).single()

  if (!eqAcc.data || !apAcc.data) {
    return NextResponse.json({ error: 'Required accounts (3000, 2000) not found' }, { status: 500 })
  }

  const entryNo = `OB-SUPP-${supplierId}-${Date.now()}`
  const description = `Opening Balance - ${supplierName}`

  // Journal entry: DR Owner's Equity (3000) / CR Accounts Payable (2000)
  const { data: entry, error: entryErr } = await supabase
    .from('journal_entries')
    .insert({
      company_id: companyId,
      entry_no: entryNo,
      date: new Date().toISOString().split('T')[0],
      description,
    })
    .select('id')
    .single()

  if (entryErr || !entry) {
    return NextResponse.json({ error: entryErr?.message || 'Failed to create journal entry' }, { status: 500 })
  }

  await supabase.from('journal_lines').insert([
    { company_id: companyId, entry_id: entry.id, account_id: eqAcc.data.id, debit: amount, credit: 0 },
    { company_id: companyId, entry_id: entry.id, account_id: apAcc.data.id, debit: 0, credit: amount },
  ])

  await supabase.from('accounts').update({ balance: eqAcc.data.balance - amount }).eq('id', eqAcc.data.id)
  await supabase.from('accounts').update({ balance: apAcc.data.balance + amount }).eq('id', apAcc.data.id)

  return NextResponse.json({ success: true, entryId: entry.id })
}