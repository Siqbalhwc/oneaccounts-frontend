// Shared Qty / Rate / Total calculation for line items (Invoice, Bill, Cash Sale).
// Exactly one of the three fields is "locked" (auto-calculated) per line.
// Default lock is "total" (Total = Qty x Rate), which is the normal behaviour.
// Locked "qty"  -> Qty  = Total / Rate
// Locked "rate" -> Rate = Total / Qty
// Numbers stay in line.qty / line.unit_price / line.total (total is always a number).
// line.total_txt holds the raw text while the user types into an unlocked Total box.

export type CalcLock = "total" | "qty" | "rate"

const isBlank = (v: any) => v === "" || v === null || v === undefined
const r4 = (n: number) => Math.round(n * 10000) / 10000
const r2 = (n: number) => Math.round(n * 100) / 100
const r6 = (n: number) => Math.round(n * 1000000) / 1000000
const r3 = (n: number) => Math.round(n * 1000) / 1000

export const getLock = (line: any): CalcLock => line?.calc_lock || "total"

// Recalculate the locked field from the other two.
export function recalcLine(line: any): any {
  const next = { ...line }
  const lock = getLock(next)
  const qBlank = isBlank(next.qty)
  const rBlank = isBlank(next.unit_price)
  const tBlank = next.total_txt !== undefined
    ? next.total_txt === ""
    : false

  if (lock === "total") {
    next.total = qBlank || rBlank ? 0 : Number(next.qty) * Number(next.unit_price)
    delete next.total_txt
  } else if (lock === "qty") {
    const rate = Number(next.unit_price)
    next.qty = rBlank || !rate || tBlank ? "" : Number(next.total) / rate
  } else {
    const qty = Number(next.qty)
    next.unit_price = qBlank || !qty || tBlank ? "" : Number(next.total) / qty
  }
  return next
}

// Apply a user edit to qty / unit_price / total, then recalculate the locked field.
export function applyLineEdit(line: any, field: "qty" | "unit_price" | "total", raw: any): any {
  if (getLock(line) === field) return line
  const next = { ...line }
  if (next.calc_shadow === field) delete next.calc_shadow
  if (field === "total") {
    next.total_txt = raw === "" || raw === null || raw === undefined ? "" : String(raw)
    next.total = next.total_txt === "" ? 0 : Number(next.total_txt) || 0
  } else {
    next[field] = raw === "" || raw === null || raw === undefined ? "" : Number(raw)
  }
  return recalcLine(next)
}

// Move the lock to another field (the field that becomes editable keeps what is on screen).
export function setLineLock(line: any, lock: CalcLock): any {
  const prev = getLock(line)
  if (prev === lock) return line
  const next = { ...line }
  if (prev === "total") {
    next.total_txt = isBlank(next.qty) || isBlank(next.unit_price) ? "" : String(r6(Number(next.total)))
  } else if (prev === "qty") {
    next.calc_shadow = "qty" // keep full precision, show rounded
  } else if (prev === "rate") {
    next.calc_shadow = "unit_price"
  }
  next.calc_lock = lock
  return recalcLine(next)
}

// What to show inside each box.
export function lineDisplay(line: any, field: "qty" | "unit_price" | "total"): string | number {
  const lock = getLock(line)
  if (field === "qty") {
    if (lock === "qty" || line.calc_shadow === "qty") return isBlank(line.qty) ? "" : r3(Number(line.qty))
    return line.qty ?? ""
  }
  if (field === "unit_price") {
    if (lock === "rate" || line.calc_shadow === "unit_price") return isBlank(line.unit_price) ? "" : r3(Number(line.unit_price))
    return line.unit_price ?? ""
  }
  if (lock === "total") {
    return isBlank(line.qty) || isBlank(line.unit_price) ? "" : r2(Number(line.total) || 0)
  }
  if (line.total_txt !== undefined) return line.total_txt
  return line.total ? line.total : ""
}
