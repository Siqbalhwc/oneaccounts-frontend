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

  // 2. Parse request body
  const body = await request.json()
  const { from_bank_account_id, to_bank_account_id, amount, transfer_date, notes } = body

  if (!from_bank_account_id || !to_bank_account_id || !amount || amount <= 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // 3. Service‑role client (bypasses RLS)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 4. Fetch both bank accounts with their linked GL accounts
  const { data: fromAccount, error: fromErr } = await supabaseAdmin
    .from('bank_accounts')
    .select('id, balance, accounts(id, balance)')
    .eq('id', from_bank_account_id)
    .eq('company_id', companyId)
    .single()

  if (fromErr || !fromAccount) {
    return NextResponse.json({ error: 'From bank account not found' }, { status: 404 })
  }

  const { data: toAccount, error: toErr } = await supabaseAdmin
    .from('bank_accounts')
    .select('id, balance, accounts(id, balance)')
    .eq('id', to_bank_account_id)
    .eq('company_id', companyId)
    .single()

  if (toErr || !toAccount) {
    return NextResponse.json({ error: 'To bank account not found' }, { status: 404 })
  }

  // Cast the nested 'accounts' to any to access properties directly
  const fromGL = (fromAccount.accounts as any)
  const toGL   = (toAccount.accounts as any)

  // 5. Update bank_accounts.balance
  const newFromBankBalance = (fromAccount.balance || 0) - amount
  const newToBankBalance = (toAccount.balance || 0) + amount

  const { error: updateFromBankErr } = await supabaseAdmin
    .from('bank_accounts')
    .update({ balance: newFromBankBalance })
    .eq('id', from_bank_account_id)

  if (updateFromBankErr) {
    return NextResponse.json({ error: 'Failed to update from bank account: ' + updateFromBankErr.message }, { status: 500 })
  }

  const { error: updateToBankErr } = await supabaseAdmin
    .from('bank_accounts')
    .update({ balance: newToBankBalance })
    .eq('id', to_bank_account_id)

  if (updateToBankErr) {
    await supabaseAdmin.from('bank_accounts').update({ balance: fromAccount.balance }).eq('id', from_bank_account_id)
    return NextResponse.json({ error: 'Failed to update to bank account: ' + updateToBankErr.message }, { status: 500 })
  }

  // 6. Update GL account balances (this is what the bank accounts list page reads)
  const newFromGLBalance = (fromGL?.balance || 0) - amount
  const newToGLBalance = (toGL?.balance || 0) + amount

  const { error: updateFromGLErr } = await supabaseAdmin
    .from('accounts')
    .update({ balance: newFromGLBalance })
    .eq('id', fromGL?.id)

  if (updateFromGLErr) {
    await supabaseAdmin.from('bank_accounts').update({ balance: fromAccount.balance }).eq('id', from_bank_account_id)
    await supabaseAdmin.from('bank_accounts').update({ balance: toAccount.balance }).eq('id', to_bank_account_id)
    return NextResponse.json({ error: 'Failed to update from GL account: ' + updateFromGLErr.message }, { status: 500 })
  }

  const { error: updateToGLErr } = await supabaseAdmin
    .from('accounts')
    .update({ balance: newToGLBalance })
    .eq('id', toGL?.id)

  if (updateToGLErr) {
    await supabaseAdmin.from('accounts').update({ balance: fromGL?.balance || 0 }).eq('id', fromGL?.id)
    await supabaseAdmin.from('bank_accounts').update({ balance: fromAccount.balance }).eq('id', from_bank_account_id)
    await supabaseAdmin.from('bank_accounts').update({ balance: toAccount.balance }).eq('id', to_bank_account_id)
    return NextResponse.json({ error: 'Failed to update to GL account: ' + updateToGLErr.message }, { status: 500 })
  }

  // 7. Insert the bank transfer record
  const transferDate = transfer_date || new Date().toISOString().split('T')[0]

  const { data: transfer, error: transferErr } = await supabaseAdmin
    .from('bank_transfers')
    .insert({
      company_id: companyId,
      from_bank_account_id,
      to_bank_account_id,
      amount,
      transfer_date: transferDate,
      notes: notes || null,
    })
    .select('id')
    .single()

  if (transferErr) {
    await supabaseAdmin.from('accounts').update({ balance: fromGL?.balance || 0 }).eq('id', fromGL?.id)
    await supabaseAdmin.from('accounts').update({ balance: toGL?.balance || 0 }).eq('id', toGL?.id)
    await supabaseAdmin.from('bank_accounts').update({ balance: fromAccount.balance }).eq('id', from_bank_account_id)
    await supabaseAdmin.from('bank_accounts').update({ balance: toAccount.balance }).eq('id', to_bank_account_id)
    return NextResponse.json({ error: 'Failed to record transfer: ' + transferErr.message }, { status: 500 })
  }

  // 8. Create a journal entry (optional but recommended)
  const entryNo = `JE-BT-${transfer.id}`
  const { data: entry, error: entryErr } = await supabaseAdmin
    .from('journal_entries')
    .insert({
      company_id: companyId,
      entry_no: entryNo,
      date: transferDate,
      description: `Bank Transfer: ${fromGL?.id || '?'} → ${toGL?.id || '?'}`,
    })
    .select('id')
    .single()

  if (!entryErr && entry) {
    const lines = [
      {
        company_id: companyId,
        entry_id: entry.id,
        account_id: toGL?.id,
        debit: amount,
        credit: 0,
        source_type: 'bank_transfer',
        source_id: transfer.id,
      },
      {
        company_id: companyId,
        entry_id: entry.id,
        account_id: fromGL?.id,
        debit: 0,
        credit: amount,
        source_type: 'bank_transfer',
        source_id: transfer.id,
      },
    ]
    await supabaseAdmin.from('journal_lines').insert(lines)
  }

  return NextResponse.json({
    success: true,
    transfer_id: transfer.id,
    from_balance: newFromBankBalance,
    to_balance: newToBankBalance,
  })
}