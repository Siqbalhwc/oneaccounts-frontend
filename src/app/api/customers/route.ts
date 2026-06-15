import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { logDataChange } from '@/lib/audit'
import { generateNextCode } from '@/lib/generate-code'

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

  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'

  const { code, name, phone, email, address, country_code, payment_terms, opening_balance } = await request.json()

  // Auto‑generate code if missing (ignores soft‑deleted rows)
  let custCode = code || ''
  if (!custCode) {
    custCode = await generateNextCode('customers', 'CUST-', companyId)
  }

  const balanceValue = opening_balance || 0

  const { data: customer, error } = await supabase
    .from('customers')
    .insert({
      company_id: companyId,
      code: custCode,
      name,
      phone,
      email,
      address,
      country_code,
      payment_terms,
      opening_balance: balanceValue,
      balance: balanceValue,
    })
    .select('*')
    .single()

  if (error || !customer) {
    return NextResponse.json({ error: error?.message || 'Insert failed' }, { status: 500 })
  }

  // ── Create journal entry for opening balance if non‑zero ──
  if (balanceValue !== 0) {
    const serviceSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {},
        },
      }
    )

    try {
      // Get required accounts
      const { data: arAccount } = await serviceSupabase
        .from('accounts')
        .select('id, balance')
        .eq('code', '1100')
        .eq('company_id', companyId)
        .maybeSingle()

      let equityAccount = null
      const { data: eqAccount } = await serviceSupabase
        .from('accounts')
        .select('id, balance')
        .eq('code', '3000')
        .eq('company_id', companyId)
        .maybeSingle()
      equityAccount = eqAccount

      // If equity account doesn't exist, create it
      if (!equityAccount) {
        const { data: newEq } = await serviceSupabase
          .from('accounts')
          .insert({
            code: '3000',
            name: 'Opening Balance Equity',
            type: 'Equity',
            company_id: companyId,
            balance: 0,
          })
          .select('id, balance')
          .single()
        equityAccount = newEq
      }

      if (arAccount && equityAccount) {
        // Insert journal entry header
        const { data: entry } = await serviceSupabase
          .from('journal_entries')
          .insert({
            company_id: companyId,
            entry_no: `JE-OP-${customer.id}-${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            description: `Opening balance for customer ${customer.id}`,
          })
          .select('id')
          .single()

        if (entry) {
          // Insert lines with source tracking
          await serviceSupabase.from('journal_lines').insert([
            {
              entry_id: entry.id,
              account_id: arAccount.id,
              debit: balanceValue,
              credit: 0,
              company_id: companyId,
              source_type: 'opening_balance',
              source_id: customer.id,
            },
            {
              entry_id: entry.id,
              account_id: equityAccount.id,
              debit: 0,
              credit: balanceValue,
              company_id: companyId,
              source_type: 'opening_balance',
              source_id: customer.id,
            },
          ])

          // Update account balances
          await serviceSupabase
            .from('accounts')
            .update({ balance: (arAccount.balance || 0) + balanceValue })
            .eq('id', arAccount.id)
          await serviceSupabase
            .from('accounts')
            .update({ balance: (equityAccount.balance || 0) - balanceValue })
            .eq('id', equityAccount.id)
        }
      }
    } catch (e) {
      console.error('Failed to create opening balance journal entry:', e)
      // Non‑critical – customer is already created
    }
  }

  // Audit log
  await logDataChange('customers', String(customer.id), 'INSERT', undefined, customer)

  return NextResponse.json({ success: true, customer })
}

export async function PUT(request: NextRequest) {
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

  const { id, code, name, phone, email, address, country_code, payment_terms, opening_balance } = await request.json()

  // Fetch old customer values including old opening_balance
  const { data: oldCustomer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()

  if (!oldCustomer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  const oldOpeningBalance = oldCustomer.opening_balance || 0
  const newOpeningBalance = opening_balance || 0

  // Update customer record
  const { data: updatedCustomer, error: updateError } = await supabase
    .from('customers')
    .update({
      code, name, phone, email, address, country_code,
      payment_terms,
      opening_balance: newOpeningBalance,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (updateError || !updatedCustomer) {
    return NextResponse.json({ error: updateError?.message || 'Update failed' }, { status: 500 })
  }

  // Use service role for journal operations (bypass RLS)
  const serviceSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const companyId = oldCustomer.company_id

  // Helper: Get AR account (1100) and Equity account (3000)
  const getAccounts = async () => {
    let { data: arAccount } = await serviceSupabase
      .from('accounts')
      .select('id, balance')
      .eq('code', '1100')
      .eq('company_id', companyId)
      .maybeSingle()

    let { data: equityAccount } = await serviceSupabase
      .from('accounts')
      .select('id, balance')
      .eq('code', '3000')
      .eq('company_id', companyId)
      .maybeSingle()

    if (!equityAccount) {
      const { data: newEq } = await serviceSupabase
        .from('accounts')
        .insert({
          code: '3000',
          name: 'Opening Balance Equity',
          type: 'Equity',
          company_id: companyId,
          balance: 0,
        })
        .select('id, balance')
        .single()
      equityAccount = newEq
    }

    if (!arAccount || !equityAccount) {
      throw new Error('Required accounts (1100 or 3000) not found')
    }
    return { arAccount, equityAccount }
  }

  // Handle opening balance change
  if (oldOpeningBalance !== newOpeningBalance) {
    try {
      // 1. Find the old opening balance journal entry (if any)
      const { data: oldEntry } = await serviceSupabase
        .from('journal_entries')
        .select('id, entry_no, date, description')
        .eq('company_id', companyId)
        .ilike('description', `%Opening balance for customer ${id}%`)
        .maybeSingle()

      // 2. Reverse the old entry if it exists and old balance wasn't zero
      if (oldEntry && oldOpeningBalance !== 0) {
        // Get old lines
        const { data: oldLines } = await serviceSupabase
          .from('journal_lines')
          .select('*')
          .eq('entry_id', oldEntry.id)

        if (oldLines && oldLines.length === 2) {
          // Create reversal entry
          const reversalDate = new Date().toISOString().split('T')[0]
          const { data: reversalEntry, error: revError } = await serviceSupabase
            .from('journal_entries')
            .insert({
              company_id: companyId,
              entry_no: `JE-REV-${id}-${Date.now()}`,
              date: reversalDate,
              description: `Reversal of old opening balance for customer ${id}`,
            })
            .select('id')
            .single()

          if (!revError && reversalEntry) {
            // Swap debit/credit for reversal
            const reversalLines = oldLines.map(line => ({
              entry_id: reversalEntry.id,
              account_id: line.account_id,
              debit: line.credit,
              credit: line.debit,
              company_id: companyId,
              source_type: 'opening_balance',
              source_id: id,
            }))
            await serviceSupabase.from('journal_lines').insert(reversalLines)

            // Update account balances (reverse the old effect)
            const { arAccount, equityAccount } = await getAccounts()
            await serviceSupabase
              .from('accounts')
              .update({ balance: (arAccount.balance || 0) - oldOpeningBalance })
              .eq('id', arAccount.id)
            await serviceSupabase
              .from('accounts')
              .update({ balance: (equityAccount.balance || 0) + oldOpeningBalance })
              .eq('id', equityAccount.id)
          }
        }
      }

      // 3. Create new entry for the new opening balance (if non-zero)
      if (newOpeningBalance !== 0) {
        const { arAccount, equityAccount } = await getAccounts()
        const newEntryDate = new Date().toISOString().split('T')[0]

        const { data: newEntry, error: newEntryErr } = await serviceSupabase
          .from('journal_entries')
          .insert({
            company_id: companyId,
            entry_no: `JE-OP-${id}-${Date.now()}`,
            date: newEntryDate,
            description: `Opening balance for customer ${id}`,
          })
          .select('id')
          .single()

        if (newEntryErr) throw newEntryErr

        const newLines = [
          { entry_id: newEntry.id, account_id: arAccount.id, debit: newOpeningBalance, credit: 0, company_id: companyId, source_type: 'opening_balance', source_id: id },
          { entry_id: newEntry.id, account_id: equityAccount.id, debit: 0, credit: newOpeningBalance, company_id: companyId, source_type: 'opening_balance', source_id: id },
        ]
        const { error: linesErr } = await serviceSupabase.from('journal_lines').insert(newLines)
        if (linesErr) throw linesErr

        // Update account balances
        await serviceSupabase
          .from('accounts')
          .update({ balance: (arAccount.balance || 0) + newOpeningBalance })
          .eq('id', arAccount.id)
        await serviceSupabase
          .from('accounts')
          .update({ balance: (equityAccount.balance || 0) - newOpeningBalance })
          .eq('id', equityAccount.id)
      }

      // 4. Update customer's balance field to match new opening balance
      await serviceSupabase
        .from('customers')
        .update({ balance: newOpeningBalance })
        .eq('id', id)

    } catch (err) {
      console.error('Error handling opening balance change:', err)
      return NextResponse.json({ error: 'Failed to update opening balance journal entry' }, { status: 500 })
    }
  }

  // Audit log
  if (oldCustomer) {
    await logDataChange('customers', String(id), 'UPDATE', oldCustomer, updatedCustomer)
  }

  return NextResponse.json({ success: true, customer: updatedCustomer })
}

export async function DELETE(request: NextRequest) {
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

  const { id } = await request.json()

  // Fetch old values for audit
  const { data: oldCustomer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('customers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit log
  if (oldCustomer) {
    await logDataChange('customers', String(id), 'DELETE', oldCustomer, undefined)
  }

  return NextResponse.json({ success: true })
}