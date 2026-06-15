import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const customerId = searchParams.get('customerId')
  if (!customerId) return NextResponse.json({ error: 'Missing customerId' }, { status: 400 })

  // Find the opening balance journal entry for this customer
  // Method 1: via source_type on journal_lines
  const { data: jLines } = await supabaseAdmin
    .from('journal_lines')
    .select('entry_id, debit, credit, accounts(code)')
    .eq('source_type', 'opening_balance')
    .eq('source_id', customerId)

  if (jLines && jLines.length > 0) {
    // Find the AR line (account code 1100) – that's the customer's side
    const arLine = jLines.find((l: any) => l.accounts?.code === '1100')
    if (arLine) {
      const { data: jEntry } = await supabaseAdmin
        .from('journal_entries')
        .select('id, date, description, entry_no')
        .eq('id', arLine.entry_id)
        .single()

      if (jEntry) {
        return NextResponse.json({
          entry: {
            id: `opening-${jEntry.id}`,
            entry_no: jEntry.entry_no,
            date: jEntry.date,
            description: jEntry.description,
            debit: arLine.debit || 0,
            credit: arLine.credit || 0,
          },
        })
      }
    }
    // If no AR line found, fallback to first line (unlikely)
    const first = jLines[0]
    const { data: jEntry } = await supabaseAdmin
      .from('journal_entries')
      .select('id, date, description, entry_no')
      .eq('id', first.entry_id)
      .single()
    if (jEntry) {
      return NextResponse.json({
        entry: {
          id: `opening-${jEntry.id}`,
          entry_no: jEntry.entry_no,
          date: jEntry.date,
          description: jEntry.description,
          debit: first.debit || 0,
          credit: first.credit || 0,
        },
      })
    }
  }

  // Method 2: search by description (older entries without source_type)
  const { data: fallbackEntry } = await supabaseAdmin
    .from('journal_entries')
    .select('id, date, description, entry_no')
    .ilike('description', `%Opening balance for customer ${customerId}%`)
    .maybeSingle()

  if (fallbackEntry) {
    const { data: fallbackLines } = await supabaseAdmin
      .from('journal_lines')
      .select('debit, credit, accounts(code)')
      .eq('entry_id', fallbackEntry.id)

    if (fallbackLines && fallbackLines.length > 0) {
      const arLine = fallbackLines.find((l: any) => l.accounts?.code === '1100')
      if (arLine) {
        return NextResponse.json({
          entry: {
            id: `opening-${fallbackEntry.id}`,
            entry_no: fallbackEntry.entry_no,
            date: fallbackEntry.date,
            description: fallbackEntry.description,
            debit: arLine.debit || 0,
            credit: arLine.credit || 0,
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