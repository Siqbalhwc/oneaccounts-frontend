"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { X, AlertTriangle } from "lucide-react"

/**
 * Receives (or edits) a payment against a cash sale's outstanding balance.
 * Two database functions, chosen by `mode`:
 *   receive_cash_sale_balance(company, cash_sale, amount, date, bank_account, reference)
 *   edit_cash_sale_balance_payment(payment_id, company, amount, date, bank_account, reference)
 * Each posts its own clean, independent journal entry — the original cash sale
 * entry is never touched, and (for edit) the prior balance-payment entry is
 * reversed and reposted, never edited in place.
 */

export interface BalancePaymentSale {
  id: number
  sale_no: string
  company_id: string
  due: number // amount currently outstanding — for "edit" mode, pass due EXCLUDING the payment being edited
}

export interface ExistingBalancePayment {
  id: number
  amount: number
  payment_date: string
  bank_account_id: number | null
  reference: string | null
}

interface BankAccount {
  id: number
  bank_name: string
  account_number?: string
}

interface Props {
  mode: "receive" | "edit"
  sale: BalancePaymentSale
  payment?: ExistingBalancePayment // required when mode === "edit"
  bankAccounts: BankAccount[]
  onClose: () => void
  onDone: () => void
}

function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA")
}

export default function CashSaleBalancePaymentModal({ mode, sale, payment, bankAccounts, onClose, onDone }: Props) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [amount, setAmount] = useState<number | "">(mode === "edit" && payment ? payment.amount : sale.due)
  const [paymentDate, setPaymentDate] = useState<string>(mode === "edit" && payment ? payment.payment_date : todayLocal())
  const [bankAccountId, setBankAccountId] = useState<number | null>(mode === "edit" && payment ? payment.bank_account_id : null)
  const [reference, setReference] = useState<string>(mode === "edit" && payment ? (payment.reference || "") : "")
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
    if (amount === "" || Number(amount) <= 0) { setError("Enter an amount greater than zero."); return }
    if (Number(amount) > sale.due) { setError(`Amount cannot exceed the balance due (PKR ${sale.due.toLocaleString()}).`); return }
    if (!paymentDate) { setError("Please choose a date."); return }

    setBusy(true)
    setError("")

    const { data: { user } } = await supabase.auth.getUser()

    const rpcResult = mode === "receive"
      ? await supabase.rpc("receive_cash_sale_balance", {
          p_company_id: sale.company_id,
          p_cash_sale_id: sale.id,
          p_amount: Number(amount),
          p_payment_date: paymentDate,
          p_bank_account_id: bankAccountId,
          p_reference: reference || "",
          p_user_email: user?.email || "system",
        })
      : await supabase.rpc("edit_cash_sale_balance_payment", {
          p_payment_id: payment!.id,
          p_company_id: sale.company_id,
          p_amount: Number(amount),
          p_payment_date: paymentDate,
          p_bank_account_id: bankAccountId,
          p_reference: reference || "",
          p_user_email: user?.email || "system",
        })

    if (rpcResult.error) {
      setError(rpcResult.error.message || "This could not be saved. Nothing was changed.")
      setBusy(false)
      return
    }

    const result: any = rpcResult.data
    if (!result || !result.success) {
      setError("This did not complete. Nothing was changed.")
      setBusy(false)
      return
    }

    onDone()
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
          width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto",
          background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)",
          borderRadius: 14, boxShadow: "var(--shadow-lg)", padding: 22,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{mode === "receive" ? "Receive Balance" : "Edit Payment"}</h2>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
              {sale.sale_no} &middot; Due PKR {sale.due.toLocaleString()}
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

        {mode === "edit" && (
          <div style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, fontSize: 12, lineHeight: 1.5, marginBottom: 14, color: "var(--text-muted)" }}>
            Saving reverses the original payment entry and posts a new, corrected one — nothing is edited in place, so the full history stays visible.
          </div>
        )}

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: 4 }}>
              Amount
            </label>
            <input
              type="number"
              min={0}
              max={sale.due}
              value={amount}
              onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={busy}
              style={{ width: "100%", boxSizing: "border-box", height: 38, padding: "0 10px", border: "1.5px solid var(--border)", borderRadius: 8, background: "var(--card)", color: "var(--text)", fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: 4 }}>
              Date
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              disabled={busy}
              style={{ width: "100%", boxSizing: "border-box", height: 38, padding: "0 10px", border: "1.5px solid var(--border)", borderRadius: 8, background: "var(--card)", color: "var(--text)", fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: 4 }}>
              Received Into
            </label>
            <select
              value={bankAccountId ?? ""}
              onChange={(e) => setBankAccountId(e.target.value ? Number(e.target.value) : null)}
              disabled={busy}
              style={{ width: "100%", boxSizing: "border-box", height: 38, padding: "0 10px", border: "1.5px solid var(--border)", borderRadius: 8, background: "var(--card)", color: "var(--text)", fontSize: 13 }}
            >
              <option value="">Cash (default)</option>
              {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.bank_name}{b.account_number ? ` — ${b.account_number}` : ""}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: 4 }}>
              Reference (optional)
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
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
            style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer", border: "none", background: busy ? "var(--border)" : "var(--primary)", color: "var(--primary-text)", fontFamily: "inherit" }}
          >
            {busy ? "Saving..." : (mode === "receive" ? "Receive Payment" : "Save Correction")}
          </button>
        </div>
      </div>
    </div>
  )
}