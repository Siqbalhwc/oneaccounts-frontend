import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

/**
 * Generates the next sequential code for any entity.
 * Filters out soft‑deleted rows automatically.
 *
 * @param table      - The database table name (e.g. 'suppliers')
 * @param prefix     - The code prefix (e.g. 'SUP-')
 * @param companyId  - The company_id to scope the search
 * @returns          - The next code (e.g. 'SUP-002')
 */
export async function generateNextCode(
  table: string,
  prefix: string,
  companyId: string
): Promise<string> {
  // Fetch the highest existing code that is NOT soft‑deleted
  const { data: last } = await supabaseAdmin
    .from(table)
    .select('code')
    .like('code', `${prefix}%`)
    .eq('company_id', companyId)
    .is('deleted_at', null)           // ← key change: ignore deleted rows
    .order('code', { ascending: false })
    .limit(1)

  let nextNum = 1
  if (last && last.length > 0) {
    const parts = last[0].code.split('-')
    if (parts.length >= 2) {
      const n = parseInt(parts[parts.length - 1])
      if (!isNaN(n)) nextNum = n + 1
    }
  }

  return `${prefix}${String(nextNum).padStart(3, '0')}`
}