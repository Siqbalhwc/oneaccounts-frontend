// Budget period helpers (NGO / Construction).
//
// A project budget is saved as MONTHLY rows. In those rows `month` is the
// project month number (1 = the project's start month), NOT a calendar month.
// These helpers turn that into calendar periods, so a screen that shows
// "year 2027" gets the budget of the months that fall inside 2027.

const PAGE_SIZE = 1000

// Reads every page of a Supabase query (the API returns max 1000 rows per request).
export async function fetchAllFromBuilder(query: any): Promise<{ data: any[]; error: any }> {
  const all: any[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query.order("id").range(from, from + PAGE_SIZE - 1)
    if (error) return { data: [], error }
    all.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return { data: all, error: null }
}

// Calendar year that a monthly budget row falls in.
// Start month comes from the project's start date (YYYY-MM-DD). A project with no
// start date is counted from January of the year the budget was saved under.
export function monthlyRowCalendarYear(row: any, startDateByProject: Record<string, string | null>): number | null {
  const month = Number(row.month)
  if (!month || month < 1) return null
  const m = /^(\d{4})-(\d{2})/.exec(startDateByProject[String(row.project_id)] || "")
  let baseYear: number
  let baseMonth: number // 0-11
  if (m) {
    baseYear = Number(m[1])
    baseMonth = Number(m[2]) - 1
  } else if (row.fiscal_year) {
    baseYear = Number(row.fiscal_year)
    baseMonth = 0
  } else {
    return null
  }
  return baseYear + Math.floor((baseMonth + (month - 1)) / 12)
}

// Sums monthly rows that fall inside `year` into one row per
// project + activity + account + location + donor. Output rows keep the
// same shape as the old annual rows (budgeted_amount = total for that year).
export function aggregateBudgetForYear(rows: any[], startDateByProject: Record<string, string | null>, year: number): any[] {
  const out = new Map<string, any>()
  for (const r of rows) {
    if (monthlyRowCalendarYear(r, startDateByProject) !== year) continue
    const key = [r.project_id, r.activity_id, r.account_id, r.location_id, r.donor_id].join("|")
    let agg = out.get(key)
    if (!agg) {
      agg = { ...r, month: null, budgeted_amount: 0 }
      out.set(key, agg)
    }
    agg.budgeted_amount += Number(r.budgeted_amount) || 0
  }
  return Array.from(out.values())
}

// Takes a ready-made query on the budgets table that selects MONTHLY rows
// (month is not null, must include project_id, month, fiscal_year), reads all pages,
// drops rows of deleted projects, and returns the budget for the calendar `year`.
export async function loadYearBudgetRows(query: any, supabase: any, companyId: string, year: number): Promise<{ data: any[]; error: any }> {
  const [rows, projRes] = await Promise.all([
    fetchAllFromBuilder(query),
    supabase.from("projects").select("id, start_date").eq("company_id", companyId).is("deleted_at", null),
  ])
  if (rows.error) return { data: [], error: rows.error }
  const startMap: Record<string, string | null> = {}
  const live = new Set<string>()
  for (const p of projRes.data || []) {
    startMap[String(p.id)] = p.start_date
    live.add(String(p.id))
  }
  const liveRows = rows.data.filter((r: any) => live.has(String(r.project_id)))
  return { data: aggregateBudgetForYear(liveRows, startMap, year), error: null }
}
