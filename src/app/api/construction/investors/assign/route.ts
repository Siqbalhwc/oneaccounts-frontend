import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════ POST – Assign an Investor to a Site ════════════════
//
// Creates the project_investors row (project + investor + profit-share %).
// The FIRST time a given investor is assigned to ANY site, this also
// creates their dedicated capital account (one per investor, shared
// across every site they invest in — not one per site) and links it
// on donors.capital_account_id. Every later assignment for that same
// investor reuses the existing account.
//
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

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { project_id, donor_id, profit_share_percentage } = body

  if (!project_id || !donor_id || profit_share_percentage === undefined || profit_share_percentage <= 0) {
    return NextResponse.json({ error: 'project_id, donor_id, and a positive profit_share_percentage are required' }, { status: 400 })
  }

  const companyId = user.app_metadata?.company_id
  if (!companyId) return NextResponse.json({ error: 'No company associated with this user' }, { status: 400 })

  // ── 1. Prevent duplicate assignment ──
  const { data: existing } = await supabaseAdmin
    .from('project_investors')
    .select('id')
    .eq('project_id', project_id)
    .eq('donor_id', donor_id)
    .eq('company_id', companyId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'This investor is already assigned to this site' }, { status: 400 })
  }

  // ── 2. Fetch the investor, check if they already have a capital account ──
  const { data: donor, error: donorError } = await supabaseAdmin
    .from('donors')
    .select('id, name, capital_account_id')
    .eq('id', donor_id)
    .eq('company_id', companyId)
    .single()

  if (donorError || !donor) {
    return NextResponse.json({ error: 'Investor not found' }, { status: 404 })
  }

  let capitalAccountId = donor.capital_account_id

  // ── 3. First-time-ever assignment for this investor: create their account ──
  if (!capitalAccountId) {
    // Find the next free 31xx code for this company (3100 itself is the
    // old shared account, left alone — new per-investor accounts start
    // at 3101 and count up).
    const { data: existingCodes } = await supabaseAdmin
      .from('accounts')
      .select('code')
      .eq('company_id', companyId)
      .like('code', '31%')

    let nextNum = 3101
    if (existingCodes) {
      const nums = existingCodes
        .map(a => parseInt(a.code, 10))
        .filter(n => !isNaN(n) && n >= 3101 && n < 3200)
      if (nums.length > 0) nextNum = Math.max(...nums) + 1
    }

    const { data: newAccount, error: accountError } = await supabaseAdmin
      .from('accounts')
      .insert({
        company_id: companyId,
        code: String(nextNum),
        name: `${donor.name} - Capital`,
        type: 'Equity',
        category: 'Investor Capital',
        balance: 0,
      })
      .select('id')
      .single()

    if (accountError || !newAccount) {
      return NextResponse.json({ error: 'Failed to create capital account: ' + accountError?.message }, { status: 500 })
    }

    capitalAccountId = newAccount.id

    const { error: linkError } = await supabaseAdmin
      .from('donors')
      .update({ capital_account_id: capitalAccountId })
      .eq('id', donor_id)

    if (linkError) {
      return NextResponse.json({
        error: 'Capital account created but failed to link it to the investor: ' + linkError.message,
      }, { status: 500 })
    }
  }

  // ── 4. Create the assignment ──
  const { data: assignment, error: assignError } = await supabaseAdmin
    .from('project_investors')
    .insert({
      company_id: companyId,
      project_id,
      donor_id,
      profit_share_percentage,
      capital_contributed: 0,
    })
    .select('id')
    .single()

  if (assignError || !assignment) {
    return NextResponse.json({ error: 'Failed to assign investor: ' + assignError?.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    assignment_id: assignment.id,
    capital_account_id: capitalAccountId,
  })
}