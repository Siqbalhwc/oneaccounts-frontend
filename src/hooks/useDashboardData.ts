import { useQuery } from "@tanstack/react-query"
import { createBrowserClient } from "@supabase/ssr"

interface DashboardKPIs {
  assets: number
  liabilities: number
  equity: number
  revenue: number
  expenses: number
  profit: number
  receivables: number
  payables: number
  unpaid_count: number
  total_customers: number
  total_suppliers: number
  total_products: number
  low_stock: number
}

async function fetchLiveKPIs(): Promise<DashboardKPIs> {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // ── Helper: wrap each query in a safe try/catch ───────────────────────
  const safeQuery = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn()
    } catch (err) {
      console.warn("KPI query failed, using fallback:", err)
      return fallback
    }
  }

  // Accounts totals (single query, no grouping)
  const accounts = await safeQuery(
    () => supabase.from("accounts").select("type,balance").then(r => r.data || []),
    [] as any[]
  )
  let assets = 0, liabilities = 0, equity = 0, revenue = 0, expenses = 0
  accounts.forEach((a: any) => {
    switch (a.type) {
      case "Asset": assets += a.balance; break
      case "Liability": liabilities += a.balance; break
      case "Equity": equity += a.balance; break
      case "Revenue": revenue += a.balance; break
      case "Expense": expenses += a.balance; break
    }
  })

  // Receivables (unpaid sale invoices)
  const receivablesData = await safeQuery(
    () => supabase
      .from("invoices")
      .select("total,paid")
      .eq("type", "sale")
      .neq("status", "Paid")
      .then(r => r.data || []),
    [] as any[]
  )
  const receivables = receivablesData.reduce((sum, inv) => sum + (inv.total - inv.paid), 0)

  // Payables (account 2000)
  const payablesData = await safeQuery(
    () => supabase.from("accounts").select("balance").eq("code", "2000").single().then(r => r.data),
    null
  )
  const payables = payablesData?.balance || 0

  // Counts
  const total_customers = await safeQuery(
    () => supabase.from("customers").select("*", { count: "exact", head: true }).then(r => r.count || 0),
    0
  )
  const total_suppliers = await safeQuery(
    () => supabase.from("suppliers").select("*", { count: "exact", head: true }).then(r => r.count || 0),
    0
  )
  const total_products = await safeQuery(
    () => supabase.from("products").select("*", { count: "exact", head: true }).then(r => r.count || 0),
    0
  )

  // Low stock
  const products = await safeQuery(
    () => supabase.from("products").select("qty_on_hand,reorder_level").then(r => r.data || []),
    [] as any[]
  )
  const low_stock = products.filter((p: any) => p.qty_on_hand > 0 && p.qty_on_hand <= p.reorder_level).length

  const unpaid_count = await safeQuery(
    () => supabase.from("invoices").select("*", { count: "exact", head: true }).eq("type", "sale").eq("status", "Unpaid").then(r => r.count || 0),
    0
  )

  return {
    assets,
    liabilities,
    equity,
    revenue,
    expenses,
    profit: revenue - expenses,
    receivables,
    payables,
    unpaid_count,
    total_customers,
    total_suppliers,
    total_products,
    low_stock,
  }
}

async function fetchCachedKPIs(): Promise<DashboardKPIs | null> {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  try {
    const { data } = await supabase.from("kpi_summaries").select("*").eq("id", 1).single()
    if (!data) return null

    // For live counts (customers, suppliers, products) we still fetch them fresh
    const getCount = async (table: string) => {
      try {
        const { count } = await supabase.from(table).select("*", { count: "exact", head: true })
        return count || 0
      } catch { return 0 }
    }
    const total_customers = await getCount("customers")
    const total_suppliers = await getCount("suppliers")
    const total_products = await getCount("products")

    let low_stock = 0
    try {
      const { data: prods } = await supabase.from("products").select("qty_on_hand,reorder_level")
      low_stock = (prods || []).filter((p: any) => p.qty_on_hand > 0 && p.qty_on_hand <= p.reorder_level).length
    } catch {}

    return {
      ...data,
      total_customers,
      total_suppliers,
      total_products,
      low_stock,
    }
  } catch {
    // kpi_summaries table may have RLS issues – ignore and fall back to live
    return null
  }
}

export function useDashboardData() {
  return useQuery({
    queryKey: ["dashboard-kpis"],
    queryFn: async () => {
      const cached = await fetchCachedKPIs()
      if (cached) return cached
      return fetchLiveKPIs()
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: 1,                 // only retry once to avoid spamming
  })
}