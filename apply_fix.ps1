$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

# ============ FIX 1: assign/route.ts (full replacement, adds PUT for % edit) ============
$path1 = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\api\construction\investors\assign\route.ts"
$backup1 = "$path1.backup_$timestamp"
Copy-Item $path1 $backup1
Write-Host "Backup saved: $backup1"

$newContent1 = @'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// ===================== POST - Assign an Investor to a Site =====================
//
// Creates the project_investors row (project + investor + profit-share %).
// The FIRST time a given investor is assigned to ANY site, this also
// creates their dedicated capital account (one per investor, shared
// across every site they invest in - not one per site) and links it
// on donors.capital_account_id. Every later assignment for that same
// investor reuses the existing account.
//
// ===================== PUT - Edit an existing assignment's % =====================
//
// Updates profit_share_percentage only. No GL impact, no journal entries,
// no change to capital_contributed - purely a profit-share % correction.
// Validated against the same 100%-across-all-investors rule used on create.
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

  const { data: roleRow } = await supabase.from('user_roles').select('company_id').eq('user_id', user.id).eq('is_active', true).maybeSingle()
  const companyId = roleRow?.company_id
  if (!companyId) return NextResponse.json({ error: 'No active company found for this user' }, { status: 400 })

  // -- 1. Prevent duplicate assignment --
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

  // -- 2. Fetch the investor, check if they already have a capital account --
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

  // -- 3. First-time-ever assignment for this investor: create their account --
  if (!capitalAccountId) {
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

  // -- 4. Create the assignment --
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

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { assignment_id, new_percentage } = body

  if (!assignment_id || new_percentage === undefined || new_percentage <= 0) {
    return NextResponse.json({ error: 'assignment_id and a positive new_percentage are required' }, { status: 400 })
  }

  const { data: roleRow } = await supabase.from('user_roles').select('company_id').eq('user_id', user.id).eq('is_active', true).maybeSingle()
  const companyId = roleRow?.company_id
  if (!companyId) return NextResponse.json({ error: 'No active company found for this user' }, { status: 400 })

  // -- 1. Fetch the assignment being edited --
  const { data: assignment, error: fetchError } = await supabaseAdmin
    .from('project_investors')
    .select('id, project_id, donor_id, profit_share_percentage')
    .eq('id', assignment_id)
    .eq('company_id', companyId)
    .single()

  if (fetchError || !assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  // -- 2. Validate against the 100%-across-all-investors rule, excluding this row's own current % --
  const { data: siblings } = await supabaseAdmin
    .from('project_investors')
    .select('id, profit_share_percentage')
    .eq('project_id', assignment.project_id)
    .eq('company_id', companyId)

  const othersTotal = (siblings || [])
    .filter((s: any) => s.id !== assignment.id)
    .reduce((sum: number, s: any) => sum + (s.profit_share_percentage || 0), 0)

  if (new_percentage + othersTotal > 100) {
    const remaining = Math.max(0, 100 - othersTotal)
    return NextResponse.json({
      error: `This would put the site over 100%. Maximum allowed for this investor is ${remaining}%.`,
    }, { status: 400 })
  }

  // -- 3. Update the percentage only - no GL impact, no capital_contributed change --
  const { error: updateError } = await supabaseAdmin
    .from('project_investors')
    .update({ profit_share_percentage: new_percentage, updated_at: new Date().toISOString() })
    .eq('id', assignment_id)
    .eq('company_id', companyId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update percentage: ' + updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, assignment_id: assignment.id, new_percentage })
}
'@

[System.IO.File]::WriteAllText($path1, $newContent1, [System.Text.Encoding]::UTF8)
Write-Host "SUCCESS: assign/route.ts replaced with PUT handler added." -ForegroundColor Green

Write-Host ""
Write-Host "=== Done with Fix 1. Fix 2 (UI) will be a separate script after you confirm this looks right. ===" -ForegroundColor Cyan