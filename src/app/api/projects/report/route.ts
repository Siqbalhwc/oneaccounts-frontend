import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId")
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 })

  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("company_id")
    .eq("id", projectId)
    .single()
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  const cid = project.company_id

  // 1. Get all relevant GL accounts (Expense 5xxx, Fixed Assets 14xx)
  const { data: glAccounts } = await supabaseAdmin
    .from("accounts")
    .select("code, name")
    .eq("company_id", cid)
    .or("type.eq.Expense,and(type.eq.Asset,code.gte.1400,code.lte.1499)")
    .order("code")

  if (!glAccounts) return NextResponse.json({ error: "No GL accounts found" }, { status: 500 })

  // 2. Fetch annual budgets (month IS NULL) with activity and location
  const { data: budgets } = await supabaseAdmin
    .from("budgets")
    .select(`
      budgeted_amount,
      activity_id,
      location_id,
      account_id,
      activities ( name ),
      locations ( name )
    `)
    .eq("company_id", cid)
    .eq("project_id", projectId)
    .is("month", null)

  // Build a map: activity -> location -> account -> sum
  // activity and location might be null if not set; we'll treat null as "Unallocated"
  const matrixMap: Record<string, Record<string, Record<string, number>>> = {}

  budgets?.forEach((b: any) => {
    const actName = b.activities?.name || "Unallocated"
    const locName = b.locations?.name || "Unallocated"
    const accCode = b.account_id   // we need to map account_id to code; we'll fetch later
    // But we don't have account code directly; we have account_id. We'll load account codes in a second pass.
    // For efficiency, we'll group by account_id and later map to code.
    const actKey = actName
    const locKey = locName
    if (!matrixMap[actKey]) matrixMap[actKey] = {}
    if (!matrixMap[actKey][locKey]) matrixMap[actKey][locKey] = {}
    matrixMap[actKey][locKey][b.account_id] = (matrixMap[actKey][locKey][b.account_id] || 0) + (b.budgeted_amount || 0)
  })

  // Fetch account code mapping
  const accountIds = [...new Set(budgets?.map((b: any) => b.account_id) || [])]
  let accountMap: Record<string, string> = {}
  if (accountIds.length > 0) {
    const { data: accs } = await supabaseAdmin
      .from("accounts")
      .select("id, code")
      .in("id", accountIds)
    accs?.forEach((a: any) => { accountMap[a.id] = a.code })
  }

  // Build rows: each activity-location combination with amounts per GL column
  const rows: any[] = []
  const activityOrder = Object.keys(matrixMap).sort()
  const glCodes = glAccounts.map(a => a.code)

  for (const act of activityOrder) {
    const locMap = matrixMap[act]
    const locOrder = Object.keys(locMap).sort()
    let actTotal = 0
    // For each location under this activity
    for (const loc of locOrder) {
      const accAmounts = locMap[loc]
      const rowAmounts: Record<string, number> = {}
      let rowTotal = 0
      glCodes.forEach(code => {
        // Find account_id for this code? We have accountMap but it maps id->code. We need reverse map? Better: we can iterate over accAmounts keys (which are account_ids) and map to code.
        // Simpler: we'll build a code->amount map for the row.
        const amount = Object.entries(accAmounts).reduce((sum, [accId, amt]) => {
          const codeFromId = accountMap[accId]
          if (codeFromId === code) return sum + amt
          return sum
        }, 0)
        rowAmounts[code] = amount
        rowTotal += amount
      })
      rows.push({
        activity: act,
        location: loc,
        amounts: rowAmounts,
        total: rowTotal,
      })
      actTotal += rowTotal
    }
    // Activity subtotal row
    rows.push({
      activity: act,
      location: "Subtotal",
      isSubtotal: true,
      amounts: glCodes.reduce((obj, code) => {
        // sum of all locations for this activity and code
        obj[code] = locOrder.reduce((sum, loc) => sum + (matrixMap[act][loc][code] || 0), 0)
        return obj
      }, {} as Record<string, number>),
      total: actTotal,
    })
  }

  // Grand total row
  const grandTotal = rows.filter(r => r.isSubtotal).reduce((s, r) => s + r.total, 0)
  rows.push({
    activity: "",
    location: "Grand Total",
    isGrandTotal: true,
    amounts: glCodes.reduce((obj, code) => {
      obj[code] = rows.filter(r => r.isSubtotal).reduce((s, r) => s + (r.amounts[code] || 0), 0)
      return obj
    }, {} as Record<string, number>),
    total: grandTotal,
  })

  // Column totals (for footer)
  const columnTotals: Record<string, number> = {}
  glCodes.forEach(code => {
    columnTotals[code] = rows.filter(r => r.isGrandTotal)[0]?.amounts[code] || 0
  })

  return NextResponse.json({
    columns: glAccounts.map(a => ({ code: a.code, name: a.name })),
    rows,
    columnTotals,
    grandTotal,
  })
}