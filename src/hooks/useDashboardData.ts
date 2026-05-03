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

  const { data: accounts } = await supabase.from("accounts").select("type,balance")
  let assets = 0, liabilities = 0, equity = 0, revenue = 0, expenses = 0
  accounts?.forEach((a: any) => {
    switch (a.type) {
      case "Asset": assets += a.balance; break
      case "Liability": liabilities += a.balance; break
      case "Equity": equity += a.balance; break
      case "Revenue": revenue += a.balance; break
      case "Expense": expenses += a.balance; break
    }
  })

  const { data: receivablesData } = await supabase
    .from("invoices")
    .select("total,paid")
    .eq("type", "sale")
    .neq("status", "Paid")
  const receivables = receivablesData?.reduce((sum, inv) => sum + (inv.total - inv.paid), 0) || 0

  const { data: payablesData } = await supabase.from("accounts").select("balance").eq("code", "2000").single()

  const { count: total_customers } = await supabase.from("customers").select("*", { count: "exact", head: true })
  const { count: total_suppliers } = await supabase.from("suppliers").select("*", { count: "exact", head: true })
  const { count: total_products } = await supabase.from("products").select("*", { count: "exact", head: true })

  const { data: products } = await supabase.from("products").select("qty_on_hand,reorder_level")
  const low_stock = products?.filter((p: any) => p.qty_on_hand > 0 && p.qty_on_hand <= p.reorder_level).length || 0

  const { count: unpaid_count } = await supabase.from("invoices").select("*", { count: "exact", head: true }).eq("type", "sale").eq("status", "Unpaid")

  return {
    assets,
    liabilities,
    equity,
    revenue,
    expenses,
    profit: revenue - expenses,
    receivables,
    payables: payablesData?.balance || 0,
    unpaid_count: unpaid_count || 0,
    total_customers: total_customers || 0,
    total_suppliers: total_suppliers || 0,
    total_products: total_products || 0,
    low_stock,
  }
}

async function fetchCachedKPIs(): Promise<DashboardKPIs | null> {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data } = await supabase.from("kpi_summaries").select("*").eq("id", 1).single()
  if (!data) return null

  const { count: total_customers } = await supabase.from("customers").select("*", { count: "exact", head: true })
  const { count: total_suppliers } = await supabase.from("suppliers").select("*", { count: "exact", head: true })
  const { count: total_products } = await supabase.from("products").select("*", { count: "exact", head: true })
  const { data: products } = await supabase.from("products").select("qty_on_hand,reorder_level")
  const low_stock = products?.filter((p: any) => p.qty_on_hand > 0 && p.qty_on_hand <= p.reorder_level).length || 0

  return {
    ...data,
    total_customers: total_customers || 0,
    total_suppliers: total_suppliers || 0,
    total_products: total_products || 0,
    low_stock,
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
  })
}