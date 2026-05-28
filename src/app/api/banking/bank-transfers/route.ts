import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
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

  // 2. Parse request body – use GL account IDs, not bank_account IDs
  const body = await request.json()
  const { from_account_id, to_account_id, amount, transfer_date, notes } = body

  if (!from_account_id || !to_account_id || !amount || amount <= 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // 3. Service‑role client
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 4. Fetch both GL accounts
  const { data: fromGL, error: fromGLErr } = await supabaseAdmin
    .from('accounts')
    .select('id, balance, code')
    .eq('id', from_account_id)
    .eq('company_id', companyId)
    .single()

  if (fromGLErr || !fromGL) {
    return NextResponse.json({ error: 'From account not found' }, { status: 404 })
  }

  const { data: toGL, error: toGLErr } = await supabaseAdmin
    .from('accounts')
    .select('id, balance, code')
    .eq('id', to_account_id)
    .eq('company_id', companyId)
    .single()

  if (toGLErr || !toGL) {
    return NextResponse.json({ error: 'To account not found' }, { status: 404 })
  }

  // 5. Update GL account balances
  const newFromBalance = (fromGL.balance || 0) - amount
  const newToBalance   = (toGL.balance || 0) + amount

  const { error: updateFromGLErr } = await supabaseAdmin
    .from('accounts')
    .update({ balance: newFromBalance })
    .eq('id', fromGL.id)

  if (updateFromGLErr) {
    return NextResponse.json({ error: 'Failed to update from account' }, { status: 500 })
  }

  const { error: updateToGLErr } = await supabaseAdmin
    .from('accounts')
    .update({ balance: newToBalance })
    .eq('id', toGL.id)

  if (updateToGLErr) {
    // rollback from account
    await supabaseAdmin.from('accounts').update({ balance: fromGL.balance }).eq('id', fromGL.id)
    return NextResponse.json({ error: 'Failed to update to account' }, { status: 500 })
  }

  // 6. Also update the linked bank_accounts.balance if they exist
  const { data: fromBank } = await supabaseAdmin
    .from('bank_accounts')
    .select('id, balance')
    .eq('account_id', fromGL.id)
    .eq('company_id', companyId)
    .maybeSingle()

  if (fromBank) {
    await supabaseAdmin
      .from('bank_accounts')
      .update({ balance: newFromBalance })
      .eq('id', fromBank.id)
  }

  const { data: toBank } = await supabaseAdmin
    .from('bank_accounts')
    .select('id, balance')
    .eq('account_id', toGL.id)
    .eq('company_id', companyId)
    .maybeSingle()

  if (toBank) {
    await supabaseAdmin
      .from('bank_accounts')
      .update({ balance: newToBalance })
      .eq('id', toBank.id)
  }

  // 7. Insert the bank transfer record (using GL account IDs)
  const transferDate = transfer_date || new Date().toISOString().split('T')[0]

  const { data: transfer, error: transferErr } = await supabaseAdmin
    .from('bank_transfers')
    .insert({
      company_id: companyId,
      from_account_id,       // GL account ID
      to_account_id,         // GL account ID
      amount,
      transfer_date: transferDate,
      notes: notes || null,
    })
    .select('id')
    .single()

  if (transferErr) {
    // rollback everything
    await supabaseAdmin.from('accounts').update({ balance: fromGL.balance }).eq('id', fromGL.id)
    await supabaseAdmin.from('accounts').update({ balance: toGL.balance }).eq('id', toGL.id)
    if (fromBank) await supabaseAdmin.from('bank_accounts').update({ balance: fromBank.balance }).eq('id', fromBank.id)
    if (toBank)   await supabaseAdmin.from('bank_accounts').update({ balance: toBank.balance }).eq('id', toBank.id)
    return NextResponse.json({ error: transferErr.message }, { status: 500 })
  }

  // 8. Create journal entry (optional)
  const entryNo = `JE-BT-${transfer.id}`
  const { data: entry } = await supabaseAdmin
    .from('journal_entries')
    .insert({
      company_id: companyId,
      entry_no: entryNo,
      date: transferDate,
      description: `Bank Transfer: ${fromGL.code || fromGL.id} → ${toGL.code || toGL.id}`,
    })
    .select('id')
    .single()

  if (entry) {
    const lines = [
      { company_id: companyId, entry_id: entry.id, account_id: toGL.id, debit: amount, credit: 0, source_type: 'bank_transfer', source_id: transfer.id },
      { company_id: companyId, entry_id: entry.id, account_id: fromGL.id, debit: 0, credit: amount, source_type: 'bank_transfer', source_id: transfer.id },
    ]
    await supabaseAdmin.from('journal_lines').insert(lines)
  }

  return NextResponse.json({ success: true, transfer_id: transfer.id })
}