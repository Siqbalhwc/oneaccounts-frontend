import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const supplierId = searchParams.get('supplierId')
  if (!supplierId) return NextResponse.json({ error: 'Missing supplierId' }, { status: 400 })

  // 1. Find opening balance journal entry for this supplier via source_type
  const { data: jLines } = await supabaseAdmin
    .from('journal_lines')
    .select('entry_id, debit, credit, accounts(code)')
    .eq('source_type', 'opening_balance')
    .eq('source_id', supplierId)

  if (jLines && jLines.length > 0) {
    // For supplier opening balance: Cr AP (2000), Dr Equity (3000)
    // We want the credit line (AP side) – that's what affects the vendor ledger
    const apLine = jLines.find((l: any) => l.accounts?.code === '2000')
    if (apLine) {
      const { data: jEntry } = await supabaseAdmin
        .from('journal_entries')
        .select('id, date, description, entry_no')
        .eq('id', apLine.entry_id)
        .single()

      if (jEntry) {
        return NextResponse.json({
          entry: {
            id: `opening-${jEntry.id}`,
            entry_no: jEntry.entry_no,
            date: jEntry.date,
            description: jEntry.description,
            debit: apLine.debit || 0,
            credit: apLine.credit || 0,
          },
        })
      }
    }
  }

  // 2. Fallback: search by description (older entries)
  const { data: fallbackEntry } = await supabaseAdmin
    .from('journal_entries')
    .select('id, date, description, entry_no')
    .ilike('description', `%Opening balance for supplier ${supplierId}%`)
    .maybeSingle()

  if (fallbackEntry) {
    const { data: fallbackLines } = await supabaseAdmin
      .from('journal_lines')
      .select('debit, credit, accounts(code)')
      .eq('entry_id', fallbackEntry.id)

    if (fallbackLines && fallbackLines.length > 0) {
      const apLine = fallbackLines.find((l: any) => l.accounts?.code === '2000')
      if (apLine) {
        return NextResponse.json({
          entry: {
            id: `opening-${fallbackEntry.id}`,
            entry_no: fallbackEntry.entry_no,
            date: fallbackEntry.date,
            description: fallbackEntry.description,
            debit: apLine.debit || 0,
            credit: apLine.credit || 0,
          },
        })
      }
      // fallback: use first line
      const first = fallbackLines[0]
      return NextResponse.json({
        entry: {
          id: `opening-${fallbackEntry.id}`,
          entry_no: fallbackEntry.entry_no,
          date: fallbackEntry.date,
          description: fallbackEntry.description,
          debit: first.debit || 0,
          credit: first.credit || 0,
        },
      })
    }
  }

  return NextResponse.json({ entry: null })
}