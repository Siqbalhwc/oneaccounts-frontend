import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"

export function useFiscalYear() {
  const [startMonth, setStartMonth] = useState(1) // default Jan
  const [loading, setLoading] = useState(true)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    const getSetting = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const cid = (user?.app_metadata as any)?.company_id
      if (!cid) return

      const { data } = await supabase
        .from("company_settings")
        .select("fiscal_year_start_month")
        .eq("company_id", cid)
        .maybeSingle()

      if (data?.fiscal_year_start_month) {
        setStartMonth(data.fiscal_year_start_month)
      }
      setLoading(false)
    }
    getSetting()
  }, [])

  // Compute the current fiscal year range
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1   // JS months are 0‑based

  let fiscalYearStart: Date
  if (currentMonth >= startMonth) {
    fiscalYearStart = new Date(currentYear, startMonth - 1, 1)
  } else {
    fiscalYearStart = new Date(currentYear - 1, startMonth - 1, 1)
  }

  const fiscalYearEnd = new Date(fiscalYearStart)
  fiscalYearEnd.setFullYear(fiscalYearEnd.getFullYear() + 1)
  fiscalYearEnd.setMonth(fiscalYearEnd.getMonth() - 1)
  fiscalYearEnd.setDate(0)   // last day of previous month

  return {
    startMonth,
    fiscalYearStart: fiscalYearStart.toISOString().split("T")[0],
    fiscalYearEnd: fiscalYearEnd.toISOString().split("T")[0],
    loading,
  }
}