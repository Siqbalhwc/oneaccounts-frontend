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

  // Find the opening balance journal line for this customer
  const { data: jLine } = await supabaseAdmin
    .from('journal_lines')
    .select('entry_id, debit, credit')
    .eq('source_type', 'opening_balance')
    .eq('source_id', customerId)
    .maybeSingle()

  if (!jLine) {
    // fallback: search by description in journal_entries (older entries)
    const { data: fallbackEntry } = await supabaseAdmin
      .from('journal_entries')
      .select('id, date, description, entry_no')
      .ilike('description', `%Opening balance for customer ${customerId}%`)
      .maybeSingle()

    if (!fallbackEntry) return NextResponse.json({ entry: null })

    const { data: fallbackLines } = await supabaseAdmin
      .from('journal_lines')
      .select('debit, credit')
      .eq('entry_id', fallbackEntry.id)

    if (!fallbackLines || fallbackLines.length === 0) return NextResponse.json({ entry: null })

    const dr = fallbackLines.reduce((s: number, l: any) => s + (l.debit || 0), 0)
    const cr = fallbackLines.reduce((s: number, l: any) => s + (l.credit || 0), 0)

    return NextResponse.json({
      entry: {
        id: `opening-${fallbackEntry.id}`,
        entry_no: fallbackEntry.entry_no,
        date: fallbackEntry.date,
        description: fallbackEntry.description,
        debit: dr,
        credit: cr,
      },
    })
  }

  // Get the journal entry header
  const { data: jEntry } = await supabaseAdmin
    .from('journal_entries')
    .select('id, date, description, entry_no')
    .eq('id', jLine.entry_id)
    .single()

  if (!jEntry) return NextResponse.json({ entry: null })

  return NextResponse.json({
    entry: {
      id: `opening-${jEntry.id}`,
      entry_no: jEntry.entry_no,
      date: jEntry.date,
      description: jEntry.description,
      debit: jLine.debit || 0,
      credit: jLine.credit || 0,
    },
  })
}