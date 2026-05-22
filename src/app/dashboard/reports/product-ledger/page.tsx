"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft } from "lucide-react"

export default function ProductLedgerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const productId = searchParams.get("productId")
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [product, setProduct] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!productId) return
    supabase.from("products").select("*").eq("id", productId).single().then(({ data }) => setProduct(data))

    // Fetch invoice items where this product was used
    Promise.all([
      supabase
        .from("invoice_items")
        .select("id, invoice_id, qty, unit_price, total, invoices!inner(invoice_no, date, type, party_id)")
        .eq("product_id", productId)
        .order("id", { ascending: false }),
    ]).then(([itemsRes]) => {
      const items = itemsRes.data || []
      // Also fetch suppliers/customers for names? For simplicity we'll just show invoice details
      setTransactions(items.map((item: any) => ({
        id: item.id,
        invoice_no: item.invoices?.invoice_no,
        date: item.invoices?.date,
        type: item.invoices?.type,
        qty: item.qty,
        unit_price: item.unit_price,
        total: item.total,
      })))
      setLoading(false)
    })
  }, [productId])

  if (!productId) return <div style={{ padding: 40, textAlign: "center" }}>No product selected.</div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { text-align: left; padding: 10px 12px; background: var(--card-hover); font-weight: 700; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border); }
        td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text); }
        .btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-family: inherit; text-decoration: none; }
        .btn:hover { background: var(--card-hover); }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn" onClick={() => router.push("/dashboard/products")}><ArrowLeft size={16} /></button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>
            📦 Product Ledger: {product?.code} – {product?.name}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Transactions involving this product</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading...</div>
      ) : transactions.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No transactions found for this product.</div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Type</th>
                <th style={{ textAlign: "right" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Unit Price</th>
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id}>
                  <td>{t.invoice_no}</td>
                  <td>{t.date}</td>
                  <td>{t.type === "sale" ? "Sale" : "Purchase"}</td>
                  <td style={{ textAlign: "right" }}>{t.qty}</td>
                  <td style={{ textAlign: "right" }}>PKR {t.unit_price?.toLocaleString()}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>PKR {t.total?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}