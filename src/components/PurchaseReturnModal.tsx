"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { X, AlertTriangle } from "lucide-react"

/**
 * Confirmation dialog for fully returning (reversing) a purchase bill.
 * All accounting work happens in ONE database function:
 *   create_purchase_return_transaction(company, bill, date, reason)
 * so it either fully succeeds or changes nothing. This dialog only collects
 * the return date + reason and shows the database's own message if the return
 * is blocked (paid bill, fixed-asset item, stock would go negative, ...).
 */

export interface ReturnableBill {
  id: number
  invoice_no: string
  date: string
  total: number
  company_id: string
}

interface Props {
  bill: ReturnableBill
  onClose: () => void
  onDone: (returnId: number, returnNo: string) => void
}

function todayLocal(): string {
  // YYYY-MM-DD in the user's local time zone
  return new Date().toLocaleDateString("en-CA")
}

export default function PurchaseReturnModal({ bill, onClose, onDone }: Props) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const today = todayLocal()
  const [returnDate, setReturnDate] = useState<string>(today < bill.date ? bill.date : today)
  const [reason, setReason] = useState("")
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
    if (returnDate < bill.date) { setError(`Return date cannot be before the bill date (${bill.date}).`); return }

    setBusy(true)
    setError("")

    const { data, error: rpcError } = await supabase.rpc("create_purchase_return_transaction", {
      p_company_id: bill.company_id,
      p_bill_id: bill.id,
      p_return_date: returnDate,
      p_reason: reason.trim(),
    })

    if (rpcError) {
      setError(rpcError.message || "The return could not be completed. Nothing was changed.")
      setBusy(false)
      return
    }

    const result: any = data
    if (!result || !result.success || !result.return_id) {
      setError("The return did not complete. Nothing was changed.")
      setBusy(false)
      return
    }

    // Leave 'busy' on: the caller navigates away, so a second click can never post twice.
    onDone(Number(result.return_id), String(result.return_no || ""))
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
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Return Purchase Bill</h2>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
              {bill.invoice_no} &middot; PKR {Number(bill.total || 0).toLocaleString()}
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
          This fully reverses the bill in one step:
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            <li>the journal entry (all accounts and project / site / activity tags)</li>
            <li>the supplier balance and Vendor Ledger</li>
            <li>all stock quantities and average cost</li>
          </ul>
          <div style={{ marginTop: 6, color: "var(--text-muted)" }}>
            The original bill is kept and marked <b>Returned</b>. A return document is created and linked to it.
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
              min={bill.date}
              onChange={(e) => setReturnDate(e.target.value)}
              disabled={busy}
              style={{ width: "100%", boxSizing: "border-box", height: 38, padding: "0 10px", border: "1.5px solid var(--border)", borderRadius: 8, background: "var(--card)", color: "var(--text)", fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: 4 }}>
              Reason (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              rows={3}
              placeholder="e.g. wrong rate, goods rejected, entered by mistake"
              style={{ width: "100%", boxSizing: "border-box", padding: 10, border: "1.5px solid var(--border)", borderRadius: 8, background: "var(--card)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", resize: "vertical" }}
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
            {busy ? "Returning..." : "Return Bill"}
          </button>
        </div>
      </div>
    </div>
  )
}
