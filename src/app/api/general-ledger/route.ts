/**
 * /api/general-ledger/route.ts
 *
 * Fixes:
 *  1. Replaced broken .match() with explicit .eq() + .is() chains so
 *     deleted_at, tag filters, and company_id are applied correctly.
 *  2. Date range filtering on a joined table (journal_entries.date) now
 *     uses the correct PostgREST embedded filter syntax via .filter().
 *  3. Opening balance and period lines use identical filter chains so
 *     the two numbers are always consistent.
 */

import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const token = cookieStore.get("sb-access-token")?.value
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = user.app_metadata?.company_id
  if (!companyId) return NextResponse.json({ error: "No company linked" }, { status: 400 })

  // ── Query params ─────────────────────────────────────────────────
  const { searchParams } = new URL(request.url)
  const accountId  = searchParams.get("accountId")
  const startDate  = searchParams.get("startDate")
  const endDate    = searchParams.get("endDate")
  const projectId  = searchParams.get("projectId")  || null
  const donorId    = searchParams.get("donorId")    || null
  const activityId = searchParams.get("activityId") || null
  const locationId = searchParams.get("locationId") || null

  if (!accountId || !startDate || !endDate) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
  }

  // ── Shared query builder helper ──────────────────────────────────
  // Builds a journal_lines query with all static filters pre-applied.
  // Caller adds only the date condition that differs between OB and period.
  const baseQuery = (selectCols: string) => {
    let q = supabaseAdmin
      .from("journal_lines")
      .select(selectCols)
      // Direct columns on journal_lines
      .eq("account_id", parseInt(accountId))
      .eq("company_id", companyId)
      // Require the parent journal_entry to exist and not be deleted
      // !inner ensures rows without a matching parent are excluded
      .not("journal_entries", "is", null)
      .filter("journal_entries.deleted_at", "is", null)

    // Optional tag filters (columns on journal_lines)
    if (projectId)  q = q.eq("project_id",  parseInt(projectId))
    if (donorId)    q = q.eq("donor_id",     parseInt(donorId))
    if (activityId) q = q.eq("activity_id",  parseInt(activityId))
    if (locationId) q = q.eq("location_id",  parseInt(locationId))

    return q
  }

  // ── 1. Opening balance (all lines before startDate) ───────────────
  const { data: openingLines, error: openingError } = await baseQuery(
    "debit, credit, journal_entries!inner(date)"
  ).filter("journal_entries.date", "lt", startDate)

  if (openingError) {
    return NextResponse.json({ error: openingError.message }, { status: 500 })
  }

  // Debit-normal: positive = debit balance, negative = credit balance
  let openingBalance = 0
  openingLines?.forEach((line: any) => {
    openingBalance += (line.debit || 0) - (line.credit || 0)
  })

  // ── 2. Period lines (startDate ≤ date ≤ endDate) ─────────────────
  const { data: periodLines, error: periodError } = await baseQuery(
    "id, debit, credit, journal_entries!inner(entry_no, date, description)"
  )
    .filter("journal_entries.date", "gte", startDate)
    .filter("journal_entries.date", "lte", endDate)
    .order("date", { foreignTable: "journal_entries", ascending: true })
    .order("id",   { ascending: true }) // stable tie-breaker same date

  if (periodError) {
    return NextResponse.json({ error: periodError.message }, { status: 500 })
  }

  // ── 3. Build response with running balance ────────────────────────
  let running = openingBalance

  const finalLines: any[] = [
    {
      id: "opening",
      entry_no: "",
      date: startDate,
      description: "Opening Balance",
      // Display: positive OB = debit-normal balance → show in debit col
      debit:  openingBalance > 0 ? openingBalance : 0,
      credit: openingBalance < 0 ? -openingBalance : 0,
      running_balance: openingBalance,
      isOpening: true,
    },
  ]

  periodLines?.forEach((line: any) => {
    running += (line.debit || 0) - (line.credit || 0)
    finalLines.push({
      id:          line.id,
      entry_no:    line.journal_entries?.entry_no    || "",
      date:        line.journal_entries?.date        || "",
      description: line.journal_entries?.description || "",
      debit:       line.debit  || 0,
      credit:      line.credit || 0,
      running_balance: running,
      isOpening: false,
    })
  })

  // ── 4. Active tag labels for PDF (resolve names from IDs) ─────────
  // We fetch names here so the PDF can display "Project: Relief Fund" etc.
  const tagLabels: Record<string, string> = {}

  const resolveTag = async (table: string, id: string | null, key: string) => {
    if (!id) return
    const { data } = await supabaseAdmin
      .from(table)
      .select("name")
      .eq("id", parseInt(id))
      .single()
    if (data?.name) tagLabels[key] = data.name
  }

  await Promise.all([
    resolveTag("projects",   projectId,  "project"),
    resolveTag("donors",     donorId,    "donor"),
    resolveTag("activities", activityId, "activity"),
    resolveTag("locations",  locationId, "location"),
  ])

  return NextResponse.json({
    openingBalance,
    lines: finalLines,
    tagLabels, // { project: "Relief Fund", donor: "USAID", ... }
  })
}
