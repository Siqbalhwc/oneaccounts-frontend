import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { logDataChange } from '@/lib/audit'

// ── Helpers ───────────────────────────────────────────────────────────
async function getAccount(supabase: any, code: string, companyId: string) {
  const { data } = await supabase.from('accounts')
    .select('id,balance').eq('code', code).eq('company_id', companyId).maybeSingle()
  return data
}

// ── Generate sequential receipt number: REC/YYYYMM/0001 ───────────────
async function generateReceiptNo(supabase: any, companyId: string): Promise<string> {
  const now = new Date()
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`
  const prefix = `REC/${ym}/`
  const { data } = await supabase
    .from('receipts')
    .select('receipt_no')
    .eq('company_id', companyId)
    .like('receipt_no', `${prefix}%`)
    .order('receipt_no', { ascending: false })
    .limit(1)
  let nextNum = 1
  if (data && data.length > 0) {
    const match = data[0].receipt_no.match(/\/(\d+)$/)
    if (match) nextNum = parseInt(match[1], 10) + 1
  }
  return `${prefix}${String(nextNum).padStart(4, "0")}`
}

// ═══════════════════ POST – Create Receipt ═══════════════════
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

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!roleData?.company_id) return NextResponse.json({ error: 'No company found' }, { status: 400 })
  const companyId = roleData.company_id

  const {
    party_id, amount, payment_method, bank_account_id,
    income_account_id, date, reference, notes
  } = await request.json()

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Amount is required' }, { status: 400 })
  }

  // ── Generate unique receipt number with retry ────────────────────────
  let recNo = ''
  let receipt: any = null

  for (let attempt = 0; attempt < 3; attempt++) {
    recNo = await generateReceiptNo(supabase, companyId)

    const result = await supabase.from("receipts").insert({
      company_id: companyId,
      receipt_no: recNo,
      party_id: party_id || null,
      date: date || new Date().toISOString().split('T')[0],
      amount,
      payment_method: payment_method || 'Bank Transfer',
      bank_account_id: bank_account_id || null,
      income_account_id: income_account_id || null,
      reference,
      notes,
      created_by: user?.email || null,
      updated_by: user?.email || null,
    }).select('*').single()

    if (!result.error) {
      receipt = result.data
      break
    }

    if (result.error.message?.includes('duplicate key') && attempt < 2) {
      continue
    }
    return NextResponse.json({ error: result.error?.message || 'Insert failed' }, { status: 500 })
  }

  if (!receipt) {
    return NextResponse.json({ error: 'Failed to create receipt after multiple attempts.' }, { status: 500 })
  }

  // ── Update customer balance ────────────────────────────────────────
  if (party_id) {
    const { data: cust } = await supabase.from('customers')
      .select('balance').eq('id', party_id).eq('company_id', companyId).single()
    if (cust) {
      await supabase.from('customers')
        .update({ balance: (cust.balance || 0) - amount })
        .eq('id', party_id).eq('company_id', companyId)
    }
  }

  // ── Determine the bank's GL account ────────────────────────────────
  let bankGlAccountId: number | null = null
  if (bank_account_id) {
    const { data: bank } = await supabase.from('bank_accounts')
      .select('account_id')
      .eq('id', bank_account_id)
      .eq('company_id', companyId)
      .single()
    if (bank) bankGlAccountId = bank.account_id
  }
  if (!bankGlAccountId) {
    const cashFallback = await getAccount(supabase, '1000', companyId)
    if (cashFallback) bankGlAccountId = cashFallback.id
  }
  if (!bankGlAccountId) {
    return NextResponse.json({ error: 'No bank GL account found.' }, { status: 500 })
  }

  // ── Journal Entry ──────────────────────────────────────────────────
  const jeLines: any[] = []
  // Always Debit Bank, Credit AR (or specific income account)
  jeLines.push({ account_id: bankGlAccountId, debit: amount, credit: 0 })

  if (income_account_id) {
    // Direct income receipt
    jeLines.push({ account_id: income_account_id, debit: 0, credit: amount })
  } else if (party_id) {
    // Customer receipt: Credit AR (code 1100 or first receivable)
    const arAcc = await getAccount(supabase, '1100', companyId)
    if (arAcc) {
      jeLines.push({ account_id: arAcc.id, debit: 0, credit: amount })
    } else {
      // Fallback to any receivable account
      const { data: anyRec } = await supabase.from('accounts')
        .select('id').eq('type', 'Asset').like('code', '11%')
        .eq('company_id', companyId).limit(1).maybeSingle()
      if (anyRec) jeLines.push({ account_id: anyRec.id, debit: 0, credit: amount })
      else return NextResponse.json({ error: 'No receivable account found' }, { status: 500 })
    }
  } else {
    return NextResponse.json({ error: 'Either customer or income account required' }, { status: 400 })
  }

  // Insert journal entry
  const { data: entry, error: entryErr } = await supabase.from('journal_entries').insert({
    company_id: companyId,
    entry_no: `JE-REC-${recNo}`,
    date: date || new Date().toISOString().split('T')[0],
    description: `Receipt - ${recNo}`,
  }).select('id').single()

  if (entryErr || !entry) {
    return NextResponse.json({ error: entryErr?.message || 'JE insert failed' }, { status: 500 })
  }

  const lineRows = jeLines.map(l => ({
    ...l,
    entry_id: entry.id,
    company_id: companyId,
    source_type: 'receipt',
    source_id: receipt.id,
  }))
  await supabase.from('journal_lines').insert(lineRows)

  // Update account balances
  for (const l of jeLines) {
    const { data: acc } = await supabase.from('accounts')
      .select('balance').eq('id', l.account_id).eq('company_id', companyId).single()
    if (acc) {
      const newBal = acc.balance + (l.debit || 0) - (l.credit || 0)
      await supabase.from('accounts').update({ balance: newBal }).eq('id', l.account_id).eq('company_id', companyId)
    }
  }

  // Audit log
  await supabase.from("data_change_logs").insert({
    table_name: "receipts",
    record_id: String(receipt.id),
    action: "INSERT",
    old_data: null,
    new_data: receipt,
    changed_by: user?.email || user?.id || null,
    changed_at: new Date().toISOString(),
  })

  return NextResponse.json({ success: true, receipt_no: recNo, receipt })
}