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

  // 1. Get the project's company_id
  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("company_id")
    .eq("id", projectId)
    .single()
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  const cid = project.company_id

  // 2. Fetch all relevant GL accounts (Expense + Fixed Assets 14xx)
  const { data: glAccounts } = await supabaseAdmin
    .from("accounts")
    .select("code, name")
    .eq("company_id", cid)
    .or("type.eq.Expense,and(type.eq.Asset,code.gte.1400,code.lte.1499)")
    .order("code")

  if (!glAccounts || glAccounts.length === 0) {
    return NextResponse.json({ columns: [], rows: [], columnTotals: {}, grandTotal: 0 })
  }

  const glCodes = glAccounts.map(a => a.code)

  // 3. Fetch annual budgets with activity, location, and account info
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
    .is("month", null)   // annual budgets only

  // 4. Build matrix: activity -> location -> account -> amount
  const matrix: Record<string, Record<string, Record<string, number>>> = {}

  budgets?.forEach((b: any) => {
    const actName = b.activities?.name || "Unallocated"
    const locName = b.locations?.name || "Unallocated"
    const accId = b.account_id

    // We need account code; we'll look it up later
    if (!matrix[actName]) matrix[actName] = {}
    if (!matrix[actName][locName]) matrix[actName][locName] = {}
    matrix[actName][locName][accId] = (matrix[actName][locName][accId] || 0) + (b.budgeted_amount || 0)
  })

  // 5. Build a mapping from account_id to code for all accounts used
  const usedAccountIds = new Set<string>()
  Object.values(matrix).forEach(act => Object.values(act).forEach(loc => Object.keys(loc).forEach(id => usedAccountIds.add(id))))
  const { data: accountIdToCode } = await supabaseAdmin
    .from("accounts")
    .select("id, code")
    .in("id", Array.from(usedAccountIds))
  const id2code: Record<string, string> = {}
  accountIdToCode?.forEach((a: any) => { id2code[a.id] = a.code })

  // 6. Build rows array
  const rows: any[] = []

  // Sort activities alphabetically
  const activityOrder = Object.keys(matrix).sort()
  for (const act of activityOrder) {
    const locMap = matrix[act]
    const locOrder = Object.keys(locMap).sort()

    // Activity subtotal
    let actTotal = 0
    const actSums: Record<string, number> = {}
    glCodes.forEach(code => actSums[code] = 0)

    // Location sub‑rows
    for (const loc of locOrder) {
      const accMap = locMap[loc]
      const amounts: Record<string, number> = {}
      let rowTotal = 0
      glCodes.forEach(code => {
        // Find the account_id that corresponds to this code
        let amount = 0
        for (const accId in accMap) {
          if (id2code[accId] === code) {
            amount = accMap[accId]
            break
          }
        }
        amounts[code] = amount
        rowTotal += amount
        actSums[code] += amount
      })
      actTotal += rowTotal
      rows.push({
        activity: act,
        location: loc,
        amounts,
        total: rowTotal,
        isSubtotal: false,
      })
    }

    // Activity subtotal row
    rows.push({
      activity: act,
      location: "Subtotal",
      amounts: actSums,
      total: actTotal,
      isSubtotal: true,
    })
  }

  // Grand total row
  const grandTotal = rows.filter(r => r.isSubtotal).reduce((s: number, r: any) => s + r.total, 0)
  const columnTotals: Record<string, number> = {}
  glCodes.forEach(code => {
    columnTotals[code] = rows.filter(r => r.isSubtotal).reduce((s, r) => s + (r.amounts[code] || 0), 0)
  })

  rows.push({
    activity: "",
    location: "Grand Total",
    amounts: columnTotals,
    total: grandTotal,
    isGrandTotal: true,
  })

  return NextResponse.json({
    columns: glAccounts.map(a => ({ code: a.code, name: a.name })),
    rows,
    columnTotals,
    grandTotal,
  })
}