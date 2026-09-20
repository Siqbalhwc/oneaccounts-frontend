"use client"

import { useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"

// Sales returns are now created from the invoice page (Return button), which runs the
// all-or-nothing database function. Any old link to this page is sent there.
function RedirectToInvoice() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const id = params.get("original_invoice_id")
    router.replace(id ? `/dashboard/invoices/${id}` : "/dashboard/invoices")
  }, [params, router])

  return (
    <div style={{ padding: 24, textAlign: "center", background: "var(--bg)", minHeight: "100vh", color: "var(--text-muted)" }}>
      Sales returns are now created from the invoice page. Redirecting...
    </div>
  )
}

export default function NewSalesReturnRedirectPage() {
  return (
    <Suspense fallback={null}>
      <RedirectToInvoice />
    </Suspense>
  )
}
