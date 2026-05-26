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

  const companyId = user.app_metadata?.company_id
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 })

  const userEmail = user.email || 'system'
  const today = new Date()
  const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`

  const { data: assets, error: assetErr } = await supabase
    .from('assets')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'Active')
    .gt('remaining_life_months', 0)

  if (assetErr) return NextResponse.json({ error: assetErr.message }, { status: 500 })

  if (!assets || assets.length === 0) {
    return NextResponse.json({ message: 'No active assets to depreciate.' })
  }

  let processed = 0
  const errors: string[] = []

  for (const asset of assets) {
    try {
      const { data: existing } = await supabase
        .from('asset_depreciation_schedule')
        .select('id')
        .eq('asset_id', asset.id)
        .eq('period', currentPeriod)
        .maybeSingle()

      if (existing) continue

      const monthlyDep = asset.depreciation_per_month || 0
      if (monthlyDep <= 0) continue

      const { data: entry, error: entryErr } = await supabase
        .from('journal_entries')
        .insert({
          company_id: companyId,
          entry_no: `JE-DEP-${asset.asset_no}-${currentPeriod}`,
          date: today.toISOString().split('T')[0],
          description: `Monthly depreciation for ${asset.name} (${asset.asset_no})`,
        })
        .select('id')
        .single()

      if (entryErr) throw new Error('JE insert failed: ' + entryErr.message)

      const lines = []
      if (asset.gl_dep_expense_account_id) {
        lines.push({ account_id: asset.gl_dep_expense_account_id, debit: monthlyDep, credit: 0 })
      } else {
        throw new Error('Missing depreciation expense account')
      }
      if (asset.gl_accum_dep_account_id) {
        lines.push({ account_id: asset.gl_accum_dep_account_id, debit: 0, credit: monthlyDep })
      } else {
        throw new Error('Missing accumulated depreciation account')
      }

      const lineRows = lines.map(l => ({
        company_id: companyId,
        entry_id: entry.id,
        account_id: l.account_id,
        debit: l.debit,
        credit: l.credit,
        source_type: 'depreciation',
        source_id: asset.id,
      }))

      const { error: linesErr } = await supabase.from('journal_lines').insert(lineRows)
      if (linesErr) throw new Error('Lines insert failed: ' + linesErr.message)

      for (const l of lines) {
        const { data: acc } = await supabase.from('accounts').select('balance').eq('id', l.account_id).single()
        if (acc) {
          const newBal = acc.balance + (l.debit || 0) - (l.credit || 0)
          await supabase.from('accounts').update({ balance: newBal }).eq('id', l.account_id)
        }
      }

      await supabase.from('asset_depreciation_schedule').insert({
        asset_id: asset.id,
        company_id: companyId,
        period: currentPeriod,
        depreciation_amount: monthlyDep,
        journal_entry_id: entry.id,
        posted: true,
        note: 'Monthly depreciation',
      })

      const newRemaining = asset.remaining_life_months - 1
      await supabase.from('assets').update({
        remaining_life_months: newRemaining,
        updated_by: userEmail,
      }).eq('id', asset.id)

      if (newRemaining <= 0) {
        await supabase.from('assets').update({ status: 'Disposed' }).eq('id', asset.id)
      }

      processed++
    } catch (err: any) {
      errors.push(`Asset ${asset.asset_no}: ${err.message}`)
    }
  }

  return NextResponse.json({
    success: true,
    processed,
    errors: errors.length > 0 ? errors : undefined,
  })
}