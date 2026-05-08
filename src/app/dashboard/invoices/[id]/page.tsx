"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"

export default function InvoiceDetailPage() {
  const { id } = useParams()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [invoice, setInvoice] = useState<any>(null)

  useEffect(() => {
    supabase.from("invoices").select("*").eq("id", id).single().then(r => setInvoice(r.data))
  }, [id])

  if (!invoice) return <div>Loading...</div>
  return (
    <div style={{ padding: 24, background: "#EFF4FB", minHeight: "100vh" }}>
      <h2>Invoice #{invoice.invoice_no}</h2>
      <p>Date: {invoice.date}</p>
      <p>Total: PKR {invoice.total?.toLocaleString()}</p>
      <p>Status: {invoice.status}</p>
    </div>
  )
}