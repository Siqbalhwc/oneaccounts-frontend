"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { X, AlertTriangle } from "lucide-react"

/**
 * Confirmation dialog for fully returning (reversing) a cash sale.
 * All accounting work happens in ONE database function:
 *   create_cash_sale_return_transaction(company, sale, date)
 * so it either fully succeeds or changes nothing. This dialog only collects the
 * return date and shows the database's own message if the return is blocked.
 */

export interface ReturnableCashSale {
  id: number
  sale_no: string
  date: string
  total: number
  company_id: string
}

interface Props {
  sale: ReturnableCashSale
  onClose: () => void
  onDone: (saleId: number) => void
}

function todayLocal(): string {
  // YYYY-MM-DD in the user's local time zone
  return new Date().toLocaleDateString("en-CA")
}

export default function CashSaleReturnModal({ sale, onClose, onDone }: Props) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const today = todayLocal()
  const [returnDate, setReturnDate] = useState<string>(today < sale.date ? sale.date : today)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onClose])

  const submit = async () => {
    if (busy) return
    if (!returnDate) { setError("Please choose a return date."); return }
    if (returnDate < sale.date) { setError(`Return date cannot be before the sale date (${sale.date}).`); return }

    setBusy(true)
    setError("")

    const { data, error: rpcError } = await supabase.rpc("create_cash_sale_return_transaction", {
      p_company_id: sale.company_id,
      p_sale_id: sale.id,
      p_return_date: returnDate,
    })

    if (rpcError) {
      setError(rpcError.message || "The return could not be completed. Nothing was changed.")
      setBusy(false)
      return
    }

    const result: any = data
    if (!result || !result.success) {
      setError("The return did not complete. Nothing was changed.")
      setBusy(false)
      return
    }

    // Leave 'busy' on: the caller navigates away, so a second click can never post twice.
    onDone(Number(result.cash_sale_id || sale.id))
  }

  return (
    <div
      onClick={() => { if (!busy) onClose() }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto",
          background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)",
          borderRadius: 14, boxShadow: "var(--shadow-lg)", padding: 22,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Return Cash Sale</h2>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
              {sale.sale_no} &middot; PKR {Number(sale.total || 0).toLocaleString()}
            </p>
          </div>
          <button
            onClick={() => { if (!busy) onClose() }}
            disabled={busy}
            title="Close"
            style={{ background: "transparent", border: "none", cursor: busy ? "default" : "pointer", color: "var(--text-muted)", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
          This fully reverses the cash sale in one step:
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            <li>the journal entry (sales, cost of goods and inventory)</li>
            <li>the cash / bank received: the money goes back out of the same account</li>
            <li>stock quantities (returned at the original cost) and average cost</li>
          </ul>
          <div style={{ marginTop: 6, color: "var(--text-muted)" }}>
            The original cash sale is kept and marked <b>Returned</b>.
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: 4 }}>
              Return date
            </label>
            <input
              type="date"
              value={returnDate}
              min={sale.date}
              onChange={(e) => setReturnDate(e.target.value)}
              disabled={busy}
              style={{ width: "100%", boxSizing: "border-box", height: 38, padding: "0 10px", border: "1.5px solid var(--border)", borderRadius: 8, background: "var(--card)", color: "var(--text)", fontSize: 13 }}
            />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "flex-start", background: "color-mix(in srgb, var(--danger) 12%, transparent)", border: "1px solid var(--danger)", color: "var(--danger)", borderRadius: 10, padding: 12, fontSize: 13 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{error}</div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", border: "1.5px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontFamily: "inherit" }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer", border: "none", background: busy ? "var(--border)" : "var(--danger)", color: "var(--primary-text)", fontFamily: "inherit" }}
          >
            {busy ? "Returning..." : "Return Cash Sale"}
          </button>
        </div>
      </div>
    </div>
  )
}
