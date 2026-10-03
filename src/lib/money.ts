// Shared money helpers - OneAccounts rounding & display policy.
//
//  * Amounts (money) always have exactly 2 decimals. Round each line when it is
//    calculated (round2), not only when it is shown, so screen = database.
//  * Quantities and rates show at most 3 decimals (see fmtQty in format-number.ts).
//  * Amounts are shown with fmtMoney: fixed locale, 2 decimals, thousands commas.
//  * "PKR" is NOT repeated on every figure: it goes once in a column header, or once
//    next to the grand total (use <CurrencyTag /> from components/CurrencyTag.tsx).
//  * Splitting a total into parts (months, partners, installments): round every part
//    with round2 and give the leftover to the LAST part (see splitAmount).

// Round to 2 decimals, half away from zero (same as Postgres ROUND(x, 2)).
export function round2(value: any): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  const sign = n < 0 ? -1 : 1
  const r = sign * (Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100)
  return r === 0 ? 0 : r
}

// One fixed locale so every device shows the same thing.
// To switch to lakh grouping (12,34,567.00) change "en-US" to "en-IN" here only.
const MONEY_LOCALE = "en-US"
const moneyFmt = new Intl.NumberFormat(MONEY_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rateFmt = new Intl.NumberFormat(MONEY_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 3 })

// 1234.5 -> "1,234.50"   (blank / invalid -> "0.00")
export function fmtMoney(value: any): string {
  const n = round2(value)
  return moneyFmt.format(n)
}

// Per-unit price: at least 2, at most 3 decimals. 56.6667 -> "56.667", 600 -> "600.00"
export function fmtRate(value: any): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return "0.00"
  return rateFmt.format(Math.round(n * 1000) / 1000)
}

// Split a total into `parts` equal 2-decimal amounts; the rounding leftover goes to the last part.
// splitAmount(100, 3) -> [33.33, 33.33, 33.34]
export function splitAmount(total: number, parts: number): number[] {
  const count = Math.max(1, Math.floor(parts))
  const base = Math.floor((round2(total) * 100) / count) / 100
  const out: number[] = []
  let used = 0
  for (let i = 0; i < count - 1; i++) { out.push(base); used = round2(used + base) }
  out.push(round2(round2(total) - used))
  return out
}

// Compact figure for dashboard cards and charts: 1234567 -> "1.2M", 12345 -> "12.3K", 450 -> "450".
// No currency text here: cards show a small <CurrencyTag />, sentences add "PKR " themselves.
export function fmtCompact(value: any): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return "0"
  const sign = n < 0 ? "-" : ""
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`
  return `${sign}${Math.round(abs).toLocaleString(MONEY_LOCALE)}`
}
