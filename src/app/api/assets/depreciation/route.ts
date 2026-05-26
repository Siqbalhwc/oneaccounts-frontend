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
  const body = await request.json()
  const { asset_ids, start_month } = body  // start_month: "YYYY-MM"

  if (!start_month) {
    return NextResponse.json({ error: 'Start month is required.' }, { status: 400 })
  }

  const startDate = new Date(start_month + "-01")
  if (isNaN(startDate.getTime())) {
    return NextResponse.json({ error: 'Invalid start month format.' }, { status: 400 })
  }

  // Current month first day
  const today = new Date()
  const currentDate = new Date(today.getFullYear(), today.getMonth(), 1)

  // Fetch assets (all active with remaining life > 0, filtered by asset_ids if provided)
  let query = supabase
    .from('assets')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'Active')
    .gt('remaining_life_months', 0)

  if (asset_ids && asset_ids.length > 0) {
    query = query.in('id', asset_ids)
  }

  const { data: assets, error: assetErr } = await query

  if (assetErr) return NextResponse.json({ error: assetErr.message }, { status: 500 })
  if (!assets || assets.length === 0) {
    return NextResponse.json({ message: 'No active assets to depreciate.' })
  }

  let totalProcessed = 0
  const errors: string[] = []

  for (const asset of assets) {
    try {
      // Determine months from asset's purchase_date to current, but not before start_month
      const assetStart = new Date(asset.purchase_date)
      const effectiveStart = assetStart > startDate ? assetStart : startDate
      // Align to first of month
      const start = new Date(effectiveStart.getFullYear(), effectiveStart.getMonth(), 1)

      let cursor = new Date(start)
      let monthsProcessedForAsset = 0

      while (cursor <= currentDate) {
        const period = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-01`
        // Check if already posted
        const { data: existing } = await supabase
          .from('asset_depreciation_schedule')
          .select('id')
          .eq('asset_id', asset.id)
          .eq('period', period)
          .maybeSingle()

        if (!existing) {
          const monthlyDep = asset.depreciation_per_month || 0
          if (monthlyDep <= 0) { cursor.setMonth(cursor.getMonth() + 1); continue }

          // Create journal entry
          const { data: entry, error: entryErr } = await supabase
            .from('journal_entries')
            .insert({
              company_id: companyId,
              entry_no: `JE-DEP-${asset.asset_no}-${period}`,
              date: `${period}T00:00:00`,
              description: `Monthly depreciation for ${asset.name} (${asset.asset_no})`,
            })
            .select('id')
            .single()

          if (entryErr) throw new Error(`JE insert failed for ${period}: ${entryErr.message}`)

          const lines: any[] = []
          if (asset.gl_dep_expense_account_id) {
            lines.push({ account_id: asset.gl_dep_expense_account_id, debit: monthlyDep, credit: 0 })
          } else {
            throw new Error(`Missing depreciation expense account for ${asset.asset_no}`)
          }
          if (asset.gl_accum_dep_account_id) {
            lines.push({ account_id: asset.gl_accum_dep_account_id, debit: 0, credit: monthlyDep })
          } else {
            throw new Error(`Missing accumulated depreciation account for ${asset.asset_no}`)
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
          if (linesErr) throw new Error(`Lines insert failed for ${period}: ${linesErr.message}`)

          // Update account balances
          for (const l of lines) {
            const { data: acc } = await supabase.from('accounts').select('balance').eq('id', l.account_id).single()
            if (acc) {
              const newBal = acc.balance + (l.debit || 0) - (l.credit || 0)
              await supabase.from('accounts').update({ balance: newBal }).eq('id', l.account_id)
            }
          }

          // Insert schedule record
          await supabase.from('asset_depreciation_schedule').insert({
            asset_id: asset.id,
            company_id: companyId,
            period,
            depreciation_amount: monthlyDep,
            journal_entry_id: entry.id,
            posted: true,
            note: 'Monthly depreciation',
          })

          // Decrement remaining life by 1
          const newRemaining = asset.remaining_life_months - 1
          await supabase.from('assets').update({
            remaining_life_months: newRemaining,
            updated_by: userEmail,
          }).eq('id', asset.id)
          asset.remaining_life_months = newRemaining

          if (newRemaining <= 0) {
            await supabase.from('assets').update({ status: 'Disposed' }).eq('id', asset.id)
            break // stop processing further months for this asset
          }

          monthsProcessedForAsset++
          totalProcessed++
        }

        cursor.setMonth(cursor.getMonth() + 1)
      }
    } catch (err: any) {
      errors.push(`Asset ${asset.asset_no}: ${err.message}`)
    }
  }

  return NextResponse.json({
    success: errors.length === 0,
    processed: totalProcessed,
    errors: errors.length > 0 ? errors : undefined,
  })
}