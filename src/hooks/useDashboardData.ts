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

  // ── Helper: wrap each query in a safe try/catch ──
  const safeQuery = async <T>(fn: () => PromiseLike<T>, fallback: T): Promise<T> => {
    try {
      return await fn()
    } catch (err) {
      console.warn("KPI query failed, using fallback:", err)
      return fallback
    }
  }

  // Accounts totals
  const accounts = await safeQuery(
    async () => {
      const { data } = await supabase.from("accounts").select("type,balance")
      return data || []
    },
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

  // Receivables
  const receivablesData = await safeQuery(
    async () => {
      const { data } = await supabase
        .from("invoices")
        .select("total,paid")
        .eq("type", "sale")
        .neq("status", "Paid")
      return data || []
    },
    [] as any[]
  )
  const receivables = receivablesData.reduce((sum, inv) => sum + (inv.total - inv.paid), 0)

  // Payables
  const payablesData = await safeQuery(
    async () => {
      const { data } = await supabase.from("accounts").select("balance").eq("code", "2000").single()
      return data
    },
    null
  )
  const payables = payablesData?.balance || 0

  // Counts
  const total_customers = await safeQuery(
    async () => {
      const { count } = await supabase.from("customers").select("*", { count: "exact", head: true })
      return count || 0
    },
    0
  )
  const total_suppliers = await safeQuery(
    async () => {
      const { count } = await supabase.from("suppliers").select("*", { count: "exact", head: true })
      return count || 0
    },
    0
  )
  const total_products = await safeQuery(
    async () => {
      const { count } = await supabase.from("products").select("*", { count: "exact", head: true })
      return count || 0
    },
    0
  )

  // Low stock
  const products = await safeQuery(
    async () => {
      const { data } = await supabase.from("products").select("qty_on_hand,reorder_level")
      return data || []
    },
    [] as any[]
  )
  const low_stock = products.filter((p: any) => p.qty_on_hand > 0 && p.qty_on_hand <= p.reorder_level).length

  const unpaid_count = await safeQuery(
    async () => {
      const { count } = await supabase.from("invoices").select("*", { count: "exact", head: true }).eq("type", "sale").eq("status", "Unpaid")
      return count || 0
    },
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
    staleTime: 2 * 60 * 1000,
    retry: 1,
  })
}