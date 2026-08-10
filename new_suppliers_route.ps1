$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$dir = "src\app\api\suppliers"
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$path = "$dir\route.ts"

if (Test-Path $path) {
    Write-Host "ABORT: File already exists: $path - will not overwrite. Delete manually first if you want to replace it." -ForegroundColor Red
    return
}

$fileContent = @'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { logDataChange } from '@/lib/audit'
import { generateNextCode } from '@/lib/generate-code'

const COUNTRY_CODES = ['+971', '+966', '+92', '+1', '+44', '+91', '+86', '+81', '+49', '+33', '+61', '+27']
const PHONE_LENGTHS: Record<string, number> = {
  '+92': 10, '+1': 10, '+44': 10, '+971': 9,
  '+966': 9, '+91': 10, '+86': 11, '+81': 10,
  '+49': 10, '+33': 9, '+61': 9, '+27': 9,
}

function validatePhone(phone: string | null | undefined): string | null {
  if (!phone) return 'Phone number is required'
  const matchedCode = COUNTRY_CODES.slice().sort((a, b) => b.length - a.length).find(c => phone.startsWith(c))
  if (!matchedCode) return 'Phone number must start with a recognized country code'
  const digits = phone.slice(matchedCode.length).replace(/\D/g, '')
  const expectedLength = PHONE_LENGTHS[matchedCode]
  if (expectedLength && digits.length !== expectedLength) {
    return `Phone must be ${expectedLength} digits for ${matchedCode}. Currently ${digits.length} digits.`
  }
  return null
}

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

  const companyId = (user?.app_metadata as any)?.company_id
  if (!companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 })

  const {
    code, name, phone, email, address, country_code, payment_terms, opening_balance,
    default_project_id, default_location_id, default_activity_id,
  } = await request.json()

  const phoneError = validatePhone(phone)
  if (phoneError) {
    return NextResponse.json({ error: phoneError }, { status: 400 })
  }

  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
  }

  let supCode = code || ''
  if (!supCode) {
    supCode = await generateNextCode('suppliers', 'SUP-', companyId)
  }

  const balanceValue = opening_balance || 0
  const userEmail = user.email || 'system'

  const { data: supplier, error: insertErr } = await supabase
    .from('suppliers')
    .insert({
      company_id: companyId,
      code: supCode,
      name: String(name).trim(),
      phone,
      email,
      address,
      country_code,
      payment_terms,
      opening_balance: balanceValue,
      balance: balanceValue,
      default_project_id: default_project_id || null,
      default_location_id: default_location_id || null,
      default_activity_id: default_activity_id || null,
      created_by: userEmail,
      updated_by: userEmail,
    })
    .select('*')
    .single()

  if (insertErr || !supplier) {
    return NextResponse.json({ error: insertErr?.message || 'Insert failed' }, { status: 500 })
  }

  if (balanceValue !== 0) {
    try {
      const serviceSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
      )

      const { data: apAcc } = await serviceSupabase
        .from('accounts').select('id,balance').eq('code', '2000').eq('company_id', companyId).maybeSingle()
      let { data: eqAcc } = await serviceSupabase
        .from('accounts').select('id,balance').eq('code', '3000').eq('company_id', companyId).maybeSingle()

      if (!eqAcc) {
        const { data: newEq } = await serviceSupabase
          .from('accounts')
          .insert({ code: '3000', name: 'Owner Equity', type: 'Equity', company_id: companyId, balance: 0 })
          .select('id,balance').single()
        eqAcc = newEq
      }

      if (apAcc && eqAcc) {
        const absAmount = Math.abs(balanceValue)
        const { data: entry } = await serviceSupabase
          .from('journal_entries')
          .insert({
            company_id: companyId,
            entry_no: `OB-SUPP-${supplier.id}-${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            description: `Opening Balance - ${supplier.name}`,
          })
          .select('id').single()

        if (entry) {
          const lines = balanceValue > 0
            ? [
                { company_id: companyId, entry_id: entry.id, account_id: eqAcc.id, debit: absAmount, credit: 0, source_type: 'supplier_opening', source_id: supplier.id },
                { company_id: companyId, entry_id: entry.id, account_id: apAcc.id, debit: 0, credit: absAmount, source_type: 'supplier_opening', source_id: supplier.id },
              ]
            : [
                { company_id: companyId, entry_id: entry.id, account_id: apAcc.id, debit: absAmount, credit: 0, source_type: 'supplier_opening', source_id: supplier.id },
                { company_id: companyId, entry_id: entry.id, account_id: eqAcc.id, debit: 0, credit: absAmount, source_type: 'supplier_opening', source_id: supplier.id },
              ]
          await serviceSupabase.from('journal_lines').insert(lines)

          if (balanceValue > 0) {
            await serviceSupabase.from('accounts').update({ balance: (eqAcc.balance || 0) + absAmount }).eq('id', eqAcc.id)
            await serviceSupabase.from('accounts').update({ balance: (apAcc.balance || 0) - absAmount }).eq('id', apAcc.id)
          } else {
            await serviceSupabase.from('accounts').update({ balance: (apAcc.balance || 0) + absAmount }).eq('id', apAcc.id)
            await serviceSupabase.from('accounts').update({ balance: (eqAcc.balance || 0) - absAmount }).eq('id', eqAcc.id)
          }
        }
      }
    } catch (e) {
      console.error('Failed to create supplier opening balance journal entry:', e)
    }
  }

  await logDataChange('suppliers', String(supplier.id), 'INSERT', undefined, supplier)

  return NextResponse.json({ success: true, supplier })
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

  const {
    id, code, name, phone, email, address, country_code, payment_terms, opening_balance,
    default_project_id, default_location_id, default_activity_id,
  } = await request.json()

  const phoneError = validatePhone(phone)
  if (phoneError) {
    return NextResponse.json({ error: phoneError }, { status: 400 })
  }

  const { data: oldSupplier } = await supabase
    .from('suppliers').select('*').eq('id', id).single()

  if (!oldSupplier) {
    return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
  }

  const companyId = oldSupplier.company_id
  const oldOpeningBalance = oldSupplier.opening_balance || 0
  const newOpeningBalance = opening_balance || 0
  const userEmail = user.email || 'system'

  // NOTE: balance is deliberately NOT included here - it's only touched below,
  // inside the opening-balance-change block, so unrelated edits (phone, address,
  // etc.) never overwrite the supplier's running balance.
  const { data: updatedSupplier, error: updateErr } = await supabase
    .from('suppliers')
    .update({
      code, name, phone, email, address, country_code, payment_terms,
      opening_balance: newOpeningBalance,
      default_project_id: default_project_id || null,
      default_location_id: default_location_id || null,
      default_activity_id: default_activity_id || null,
      updated_by: userEmail,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (updateErr || !updatedSupplier) {
    return NextResponse.json({ error: updateErr?.message || 'Update failed' }, { status: 500 })
  }

  if (oldOpeningBalance !== newOpeningBalance) {
    try {
      const serviceSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
      )

      const getAccounts = async () => {
        const { data: apAcc } = await serviceSupabase
          .from('accounts').select('id,balance').eq('code', '2000').eq('company_id', companyId).maybeSingle()
        let { data: eqAcc } = await serviceSupabase
          .from('accounts').select('id,balance').eq('code', '3000').eq('company_id', companyId).maybeSingle()
        if (!eqAcc) {
          const { data: newEq } = await serviceSupabase
            .from('accounts')
            .insert({ code: '3000', name: 'Owner Equity', type: 'Equity', company_id: companyId, balance: 0 })
            .select('id,balance').single()
          eqAcc = newEq
        }
        if (!apAcc || !eqAcc) throw new Error('Required accounts (2000 or 3000) not found')
        return { apAcc, eqAcc }
      }

      // 1. Find the most recent opening-balance entry for this supplier, single
      //    consistent tag used throughout this route (no tag-mismatch risk).
      const { data: latestLine } = await serviceSupabase
        .from('journal_lines')
        .select('entry_id')
        .eq('company_id', companyId)
        .eq('source_type', 'supplier_opening')
        .eq('source_id', id)
        .order('entry_id', { ascending: false })
        .limit(1)
        .maybeSingle()

      // 2. Reverse it if it exists and the old balance wasn't zero
      if (latestLine && oldOpeningBalance !== 0) {
        const { data: oldLines } = await serviceSupabase
          .from('journal_lines').select('*').eq('entry_id', latestLine.entry_id)

        if (oldLines && oldLines.length === 2) {
          const { data: reversalEntry } = await serviceSupabase
            .from('journal_entries')
            .insert({
              company_id: companyId,
              entry_no: `OB-SUPP-REV-${id}-${Date.now()}`,
              date: new Date().toISOString().split('T')[0],
              description: `Reversal of old opening balance - ${updatedSupplier.name}`,
            })
            .select('id').single()

          if (reversalEntry) {
            const reversalLines = oldLines.map(line => ({
              entry_id: reversalEntry.id,
              account_id: line.account_id,
              debit: line.credit,
              credit: line.debit,
              company_id: companyId,
              source_type: 'supplier_opening',
              source_id: id,
            }))
            await serviceSupabase.from('journal_lines').insert(reversalLines)

            const { apAcc, eqAcc } = await getAccounts()
            for (const line of reversalLines) {
              const delta = (line.debit || 0) - (line.credit || 0)
              if (line.account_id === apAcc.id) {
                await serviceSupabase.from('accounts').update({ balance: (apAcc.balance || 0) + delta }).eq('id', apAcc.id)
              } else if (line.account_id === eqAcc.id) {
                await serviceSupabase.from('accounts').update({ balance: (eqAcc.balance || 0) + delta }).eq('id', eqAcc.id)
              }
            }
          }
        }
      }

      // 3. Create the new entry for the new opening balance, if non-zero
      if (newOpeningBalance !== 0) {
        const { apAcc, eqAcc } = await getAccounts()
        // re-fetch fresh balances post-reversal
        const { data: freshAp } = await serviceSupabase.from('accounts').select('id,balance').eq('id', apAcc.id).single()
        const { data: freshEq } = await serviceSupabase.from('accounts').select('id,balance').eq('id', eqAcc.id).single()

        const absAmount = Math.abs(newOpeningBalance)
        const { data: newEntry } = await serviceSupabase
          .from('journal_entries')
          .insert({
            company_id: companyId,
            entry_no: `OB-SUPP-EDIT-${id}-${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            description: `Opening Balance - ${updatedSupplier.name} (edited)`,
          })
          .select('id').single()

        if (newEntry) {
          const newLines = newOpeningBalance > 0
            ? [
                { company_id: companyId, entry_id: newEntry.id, account_id: (freshEq || eqAcc).id, debit: absAmount, credit: 0, source_type: 'supplier_opening', source_id: id },
                { company_id: companyId, entry_id: newEntry.id, account_id: (freshAp || apAcc).id, debit: 0, credit: absAmount, source_type: 'supplier_opening', source_id: id },
              ]
            : [
                { company_id: companyId, entry_id: newEntry.id, account_id: (freshAp || apAcc).id, debit: absAmount, credit: 0, source_type: 'supplier_opening', source_id: id },
                { company_id: companyId, entry_id: newEntry.id, account_id: (freshEq || eqAcc).id, debit: 0, credit: absAmount, source_type: 'supplier_opening', source_id: id },
              ]
          await serviceSupabase.from('journal_lines').insert(newLines)

          if (newOpeningBalance > 0) {
            await serviceSupabase.from('accounts').update({ balance: ((freshEq || eqAcc).balance || 0) + absAmount }).eq('id', (freshEq || eqAcc).id)
            await serviceSupabase.from('accounts').update({ balance: ((freshAp || apAcc).balance || 0) - absAmount }).eq('id', (freshAp || apAcc).id)
          } else {
            await serviceSupabase.from('accounts').update({ balance: ((freshAp || apAcc).balance || 0) + absAmount }).eq('id', (freshAp || apAcc).id)
            await serviceSupabase.from('accounts').update({ balance: ((freshEq || eqAcc).balance || 0) - absAmount }).eq('id', (freshEq || eqAcc).id)
          }
        }
      }

      // 4. Only now touch suppliers.balance - kept isolated to this block on purpose
      await serviceSupabase.from('suppliers').update({ balance: newOpeningBalance }).eq('id', id)

    } catch (err) {
      console.error('Error handling supplier opening balance change:', err)
      return NextResponse.json({ error: 'Failed to update opening balance journal entry' }, { status: 500 })
    }
  }

  await logDataChange('suppliers', String(id), 'UPDATE', oldSupplier, updatedSupplier)

  return NextResponse.json({ success: true, supplier: updatedSupplier })
}
'@

[System.IO.File]::WriteAllText($path, $fileContent, $utf8NoBom)
Write-Host "CREATED: $path" -ForegroundColor Green