import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { logDataChange } from '@/lib/audit'

// ── Helpers ─────────────────────────────────────────────────────────────
async function getAccount(supabase: any, code: string, companyId: string) {
  const { data } = await supabase.from('accounts')
    .select('id,balance').eq('code', code).eq('company_id', companyId).maybeSingle()
  return data
}

async function createJE(
  supabase: any,
  companyId: string,
  date: string,
  description: string,
  lines: any[],
  sourceType: string = 'manual_journal',
  sourceId: number | null = null,
) {
  const { data: entry } = await supabase.from('journal_entries').insert({
    company_id: companyId,
    entry_no: `JE-RET-${Date.now()}`,
    date,
    description,
  }).select('id').single()
  if (!entry) throw new Error('Journal entry creation failed')

  const lineRows = lines.map(l => ({
    ...l,
    entry_id: entry.id,
    company_id: companyId,
    source_type: sourceType,
    source_id: sourceId,
  }))
  await supabase.from('journal_lines').insert(lineRows)

  // Update balances (optional – using RPC if exists)
  const accountUpdates = lines.reduce((acc, l) => {
    const key = l.account_id
    const existing = acc.find((u: any) => u.account_id === key)
    if (existing) {
      existing.delta += (l.debit || 0) - (l.credit || 0)
    } else {
      acc.push({ account_id: key, delta: (l.debit || 0) - (l.credit || 0) })
    }
    return acc
  }, [] as { account_id: number; delta: number }[])

  if (accountUpdates.length > 0) {
    try {
      await supabase.rpc('bulk_update_account_balances', { data: accountUpdates })
    } catch {}
  }
}

async function generateReturnNo(supabase: any, companyId: string, prefix: string): Promise<string> {
  const now = new Date()
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`
  const fullPrefix = `${prefix}/${ym}/`

  const { data: last } = await supabase
    .from("invoices")
    .select("invoice_no")
    .eq("company_id", companyId)
    .like("invoice_no", `${fullPrefix}%`)
    .order("invoice_no", { ascending: false })
    .limit(1)

  let nextNum = 1
  if (last && last.length > 0) {
    const match = last[0].invoice_no.match(/\/(\d+)$/)
    if (match) nextNum = parseInt(match[1], 10) + 1
  }
  return `${fullPrefix}${String(nextNum).padStart(4, "0")}`
}

async function recordStockMoves(
  supabase: any, companyId: string, items: any[], sourceType: string, sourceId: number, direction: 'in' | 'out'
) {
  const moves = items
    .filter((item: any) => item.product_id)
    .map((item: any) => ({
      company_id: companyId,
      product_id: item.product_id,
      move_type: sourceType === 'purchase_return' ? 'purchase_return' : 'sale_return',
      qty: direction === 'in' ? item.qty : -item.qty,
      date: new Date().toISOString(),
      ref: `${sourceType === 'sale_return' ? 'SR' : 'PR'}-${sourceId}`,
      reason: `${sourceType}`,
      source_type: 'return',
      source_id: sourceId,
    }))
  if (moves.length > 0) {
    const { error } = await supabase.from('stock_moves').insert(moves)
    if (error) console.error('Failed to insert stock_moves:', error)
  }
}

// ═══════════════════ GET – List Sales Returns ═════════════════════════
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'
  const { searchParams } = new URL(request.url)
  const sortField = searchParams.get('sort') || 'date'
  const sortDir = searchParams.get('dir') || 'desc'

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('company_id', companyId)
    .eq('type', 'sale_return')
    .is('deleted_at', null)
    .order(sortField, { ascending: sortDir === 'asc' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ returns: data })
}

// ═══════════════════ POST – Create Sales Return ═══════════════════════
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { party_id, original_invoice_id, invoice_date, due_date, items, reference, notes } = body
  if (!party_id || !items || items.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'
  const userEmail = user.email || 'system'

  // Generate return number
  const returnNo = await generateReturnNo(supabase, companyId, 'SR')

  // Insert return header
  const { data: returnInv, error: headerError } = await supabase
    .from('invoices')
    .insert({
      invoice_no: returnNo,
      type: 'sale_return',
      party_id,
      original_invoice_id: original_invoice_id || null,
      date: invoice_date || new Date().toISOString().split('T')[0],
      due_date: due_date || new Date().toISOString().split('T')[0],
      total: 0,
      paid: 0,
      status: 'Unpaid',   // or 'Returned' – you can adjust
      reference,
      notes,
      company_id: companyId,
      created_by: userEmail,
      updated_by: userEmail,
    })
    .select('*')
    .single()

  if (headerError || !returnInv) {
    return NextResponse.json({ error: headerError?.message || 'Failed to create return' }, { status: 500 })
  }

  // Insert items (positive amounts – reversal will happen in journal)
  const itemRows = items.map((item: any) => {
    const qty = Number(item.qty || 0)
    const unit_price = Number(item.unit_price || 0)
    const lineTotal = qty * unit_price
    return {
      invoice_id: returnInv.id,
      description: item.description,
      qty,
      unit_price,
      total: lineTotal,
      product_id: item.product_id || null,
      company_id: companyId,
    }
  })

  if (itemRows.length > 0) {
    const { error: itemsError } = await supabase.from('invoice_items').insert(itemRows)
    if (itemsError) {
      await supabase.from('invoices').delete().eq('id', returnInv.id)
      return NextResponse.json({ error: 'Failed to save items: ' + itemsError.message }, { status: 500 })
    }
  }

  // Update total
  const totalAmount = itemRows.reduce((s, i) => s + i.total, 0)
  await supabase.from('invoices').update({ total: totalAmount }).eq('id', returnInv.id)

  // Stock moves (inward)
  await recordStockMoves(supabase, companyId, items, 'sale_return', returnInv.id, 'in')

  // Customer balance: reduce AR (since customer is returning goods)
  const { data: custBal } = await supabase.from('customers').select('balance').eq('id', party_id).single()
  if (custBal) {
    await supabase.from('customers').update({ balance: custBal.balance - totalAmount }).eq('id', party_id)
  }

  // Journal Entry – reversal of original or generic reversal
  try {
    let jeLines: any[] = []

    if (original_invoice_id) {
      // Fetch original journal lines and reverse them
      const { data: originalJELines } = await supabase
        .from('journal_lines')
        .select('account_id, debit, credit, project_id, donor_id, activity_id, location_id')
        .eq('source_type', 'sale_invoice')
        .eq('source_id', original_invoice_id)
        .eq('company_id', companyId)

      if (originalJELines && originalJELines.length > 0) {
        jeLines = originalJELines.map(l => ({
          account_id: l.account_id,
          debit: l.credit,    // swap
          credit: l.debit,
          project_id: l.project_id,
          donor_id: l.donor_id,
          activity_id: l.activity_id,
          location_id: l.location_id,
        }))
      }
    } else {
      // Generic reversal: Debit Sales Returns (or Revenue), Credit AR
      const arAccount = await getAccount(supabase, '1100', companyId)
      const revenueAccount = await getAccount(supabase, '4000', companyId)
      if (!arAccount || !revenueAccount) throw new Error('Accounts not found')

      jeLines.push({
        account_id: revenueAccount.id, // Debit revenue (or sales returns)
        debit: totalAmount,
        credit: 0,
      })
      jeLines.push({
        account_id: arAccount.id,
        debit: 0,
        credit: totalAmount,
      })

      // COGS reversal if items have cost_price
      const cogsAccount = await getAccount(supabase, '5000', companyId)
      const inventoryAccount = await getAccount(supabase, '1200', companyId)
      if (cogsAccount && inventoryAccount) {
        let totalCOGS = 0
        for (const item of items) {
          if (!item.product_id || !item.cost_price) continue
          totalCOGS += (item.qty || 0) * (item.cost_price || 0)
        }
        if (totalCOGS > 0) {
          jeLines.push({
            account_id: inventoryAccount.id, // Debit inventory
            debit: totalCOGS,
            credit: 0,
          })
          jeLines.push({
            account_id: cogsAccount.id,      // Credit COGS
            debit: 0,
            credit: totalCOGS,
          })
        }
      }
    }

    await createJE(supabase, companyId, invoice_date || new Date().toISOString().split('T')[0],
      `Sales Return ${returnNo}`, jeLines, 'sale_return', returnInv.id)

  } catch (e: any) {
    // Rollback
    await supabase.from('invoice_items').delete().eq('invoice_id', returnInv.id)
    await supabase.from('invoices').delete().eq('id', returnInv.id)
    if (custBal) {
      await supabase.from('customers').update({ balance: custBal.balance + totalAmount }).eq('id', party_id)
    }
    return NextResponse.json({ error: 'Journal entry failed: ' + e.message }, { status: 500 })
  }

  await logDataChange('invoices', String(returnInv.id), 'INSERT', undefined, returnInv)
  return NextResponse.json({ success: true, return: returnInv })
}