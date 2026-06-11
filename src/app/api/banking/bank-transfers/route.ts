import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { logDataChange } from '@/lib/audit'

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

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = user.app_metadata?.company_id
  if (!companyId) {
    return NextResponse.json({ error: 'No company linked' }, { status: 400 })
  }

  const body = await request.json()
  let fromGLId: number | null = null
  let toGLId: number | null = null

  // 1. Resolve from account: if bank_account_id is provided, look up its linked GL account
  const fromBankId = body.from_bank_account_id || body.from_account_id // accept both naming
  const toBankId   = body.to_bank_account_id   || body.to_account_id

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Resolve from account
  if (fromBankId) {
    // First check if it's a bank_account
    const { data: bankAccount, error: bankErr } = await supabaseAdmin
      .from('bank_accounts')
      .select('account_id')
      .eq('id', fromBankId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (bankErr) {
      return NextResponse.json({ error: 'Error resolving from account' }, { status: 500 })
    }
    if (bankAccount) {
      fromGLId = bankAccount.account_id
    } else {
      // Not a bank account; try as GL account
      const { data: glAcc, error: glErr } = await supabaseAdmin
        .from('accounts')
        .select('id')
        .eq('id', fromBankId)
        .eq('company_id', companyId)
        .maybeSingle()
      if (glErr || !glAcc) {
        return NextResponse.json({ error: 'From account not found' }, { status: 404 })
      }
      fromGLId = glAcc.id
    }
  }

  // Resolve to account similarly
  if (toBankId) {
    const { data: bankAccount, error: bankErr } = await supabaseAdmin
      .from('bank_accounts')
      .select('account_id')
      .eq('id', toBankId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (bankErr) {
      return NextResponse.json({ error: 'Error resolving to account' }, { status: 500 })
    }
    if (bankAccount) {
      toGLId = bankAccount.account_id
    } else {
      const { data: glAcc, error: glErr } = await supabaseAdmin
        .from('accounts')
        .select('id')
        .eq('id', toBankId)
        .eq('company_id', companyId)
        .maybeSingle()
      if (glErr || !glAcc) {
        return NextResponse.json({ error: 'To account not found' }, { status: 404 })
      }
      toGLId = glAcc.id
    }
  }

  if (!fromGLId || !toGLId) {
    return NextResponse.json({ error: 'Missing from or to account' }, { status: 400 })
  }

  const amount = parseFloat(body.amount)
  const transferDate = body.transfer_date || new Date().toISOString().split('T')[0]
  const notes = body.notes || null

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
  }

  // 2. Fetch GL accounts
  const { data: fromGL, error: fromGLErr } = await supabaseAdmin
    .from('accounts')
    .select('id, balance, code')
    .eq('id', fromGLId)
    .eq('company_id', companyId)
    .single()

  if (fromGLErr || !fromGL) {
    return NextResponse.json({ error: 'From GL account not found' }, { status: 404 })
  }

  const { data: toGL, error: toGLErr } = await supabaseAdmin
    .from('accounts')
    .select('id, balance, code')
    .eq('id', toGLId)
    .eq('company_id', companyId)
    .single()

  if (toGLErr || !toGL) {
    return NextResponse.json({ error: 'To GL account not found' }, { status: 404 })
  }

  // 3. Update GL balances
  const newFromBalance = (fromGL.balance || 0) - amount
  const newToBalance = (toGL.balance || 0) + amount

  const { error: updateFromErr } = await supabaseAdmin
    .from('accounts')
    .update({ balance: newFromBalance })
    .eq('id', fromGL.id)

  if (updateFromErr) {
    return NextResponse.json({ error: 'Failed to update from account' }, { status: 500 })
  }

  const { error: updateToErr } = await supabaseAdmin
    .from('accounts')
    .update({ balance: newToBalance })
    .eq('id', toGL.id)

  if (updateToErr) {
    // rollback from account
    await supabaseAdmin.from('accounts').update({ balance: fromGL.balance }).eq('id', fromGL.id)
    return NextResponse.json({ error: 'Failed to update to account' }, { status: 500 })
  }

  // 4. Update linked bank accounts' balances (if exist)
  const { data: fromBank } = await supabaseAdmin
    .from('bank_accounts')
    .select('id, balance')
    .eq('account_id', fromGL.id)
    .eq('company_id', companyId)
    .maybeSingle()

  if (fromBank) {
    await supabaseAdmin.from('bank_accounts').update({ balance: newFromBalance }).eq('id', fromBank.id)
  }

  const { data: toBank } = await supabaseAdmin
    .from('bank_accounts')
    .select('id, balance')
    .eq('account_id', toGL.id)
    .eq('company_id', companyId)
    .maybeSingle()

  if (toBank) {
    await supabaseAdmin.from('bank_accounts').update({ balance: newToBalance }).eq('id', toBank.id)
  }

  // 5. Insert transfer record (store GL account IDs, but also optionally store bank IDs if needed)
  const { data: transfer, error: transferErr } = await supabaseAdmin
    .from('bank_transfers')
    .insert({
      company_id: companyId,
      from_account_id: fromGL.id,
      to_account_id: toGL.id,
      amount,
      transfer_date: transferDate,
      notes,
    })
    .select('id')
    .single()

  if (transferErr) {
    // rollback everything
    await supabaseAdmin.from('accounts').update({ balance: fromGL.balance }).eq('id', fromGL.id)
    await supabaseAdmin.from('accounts').update({ balance: toGL.balance }).eq('id', toGL.id)
    if (fromBank) await supabaseAdmin.from('bank_accounts').update({ balance: fromBank.balance }).eq('id', fromBank.id)
    if (toBank) await supabaseAdmin.from('bank_accounts').update({ balance: toBank.balance }).eq('id', toBank.id)
    return NextResponse.json({ error: transferErr.message }, { status: 500 })
  }

  // 6. Create journal entry (optional but recommended)
  const entryNo = `JE-BT-${transfer.id}`
  const { data: entry, error: entryErr } = await supabaseAdmin
    .from('journal_entries')
    .insert({
      company_id: companyId,
      entry_no: entryNo,
      date: transferDate,
      description: `Bank Transfer: ${fromGL.code || fromGL.id} → ${toGL.code || toGL.id}`,
    })
    .select('id')
    .single()

  if (entry && !entryErr) {
    const lines = [
      { company_id: companyId, entry_id: entry.id, account_id: toGL.id, debit: amount, credit: 0, source_type: 'bank_transfer', source_id: transfer.id },
      { company_id: companyId, entry_id: entry.id, account_id: fromGL.id, debit: 0, credit: amount, source_type: 'bank_transfer', source_id: transfer.id },
    ]
    await supabaseAdmin.from('journal_lines').insert(lines)
  } else {
    console.warn('Journal entry creation failed (non‑critical):', entryErr)
  }

  await logDataChange(
    'bank_transfers',
    String(transfer.id),
    'INSERT',
    undefined,
    {
      id: transfer.id,
      company_id: companyId,
      from_account_id: fromGL.id,
      to_account_id: toGL.id,
      amount,
      transfer_date: transferDate,
      notes,
    }
  )

  return NextResponse.json({ success: true, transfer_id: transfer.id })
}