// Display helper for quantities and per-unit values.
// Shows at most 3 decimals and no trailing zeros (60.53333333333333 -> 60.533, 100.000 -> 100).
// Display only: it never changes what is stored.
export function fmtQty(value: any): string {
  if (value === null || value === undefined || value === "") return ""
  const n = Number(value)
  if (!Number.isFinite(n)) return ""
  const r = Math.round(n * 1000) / 1000
  return String(r === 0 ? 0 : r)
}
