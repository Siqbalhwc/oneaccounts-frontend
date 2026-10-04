// Shared helpers for company access dates.
// All dates are plain "YYYY-MM-DD" strings (Pakistan calendar dates).
// "Last working day" = the last day the company may use the system (inclusive).

export const GRACE_DAYS_PAID = 10

/** Today's date in Pakistan as YYYY-MM-DD */
export function todayPK(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date())
}

function parts(d: string): [number, number, number] {
  const [y, m, day] = d.split('-').map(Number)
  return [y, m, day]
}

function toStr(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function isValidDateStr(d: unknown): d is string {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  const [y, m, day] = parts(d)
  const dt = new Date(Date.UTC(y, m - 1, day))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === day
}

export function addDaysStr(d: string, days: number): string {
  const [y, m, day] = parts(d)
  const dt = new Date(Date.UTC(y, m - 1, day + days))
  return toStr(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

/** Add months; if the day does not exist in the target month, use the month's last day (31 Jan + 1 month = 28 Feb). */
export function addMonthsStr(d: string, months: number): string {
  const [y, m, day] = parts(d)
  const total = (m - 1) + months
  const ny = y + Math.floor(total / 12)
  const nm = ((total % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
  return toStr(ny, nm + 1, Math.min(day, lastDay))
}

/** 14 Apr 2027 (Wed) */
export function fmtLongDate(d: string | null | undefined): string {
  if (!d || !isValidDateStr(d)) return '-'
  const [y, m, day] = parts(d)
  const dt = new Date(Date.UTC(y, m - 1, day))
  return dt.toLocaleDateString('en-GB', {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

/**
 * Where a renewal starts counting from:
 * the later of today and the current last working day.
 * (Still-active company: extends from its end date. Already-ended: from today.)
 */
export function renewalBase(currentAccessUntil: string | null | undefined): string {
  const today = todayPK()
  if (currentAccessUntil && isValidDateStr(currentAccessUntil) && currentAccessUntil > today) {
    return currentAccessUntil
  }
  return today
}

export interface AccessStatus {
  state: 'active' | 'grace' | 'trial_expired' | 'subscription_expired' | 'suspended' | 'no_company' | 'not_found'
  blocked: boolean
  is_trial?: boolean
  access_until?: string | null
  grace_until?: string | null
  days_left?: number | null
  grace_days_left?: number | null
  suspended_reason?: string | null
}

export const QUICK_PERIODS: { label: string; days?: number; months?: number }[] = [
  { label: '15 days', days: 15 },
  { label: '1 month', months: 1 },
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '1 year', months: 12 },
]

export function applyQuickPeriod(base: string, p: { days?: number; months?: number }): string {
  return p.days ? addDaysStr(base, p.days) : addMonthsStr(base, p.months || 0)
}