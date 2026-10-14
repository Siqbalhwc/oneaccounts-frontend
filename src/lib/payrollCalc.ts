// Salary calculation engine - ONE place that knows how a salary is split and how a day is valued.
// Used by the payroll run generator (server) and by the screens (live preview), so they always agree.

export type CalcType = 'fixed' | 'percentage_gross' | 'percentage_basic'
export type SalaryBasis = 'gross' | 'basic'

export interface StructureLine {
  key: number | string
  name: string
  type: 'earning' | 'deduction'
  isBasic: boolean
  calcType: string // 'fixed' | 'percentage_gross' | 'percentage_basic' | legacy 'percentage' (= % of Basic)
  value: number
  glAccountId?: number | null
}

export interface LineResult extends StructureLine {
  amount: number
  problem?: string
}

export interface SalaryResult {
  lines: LineResult[]
  basic: number
  gross: number
  deductions: number
  net: number
  warnings: string[]
}

export interface PayrollSettings {
  dayBasis: number | null // null = actual days of the month
  dailyRateBase: 'gross' | 'basic'
}

export const DEFAULT_SETTINGS: PayrollSettings = { dayBasis: null, dailyRateBase: 'gross' }

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function normalizeCalcType(t: string): CalcType {
  if (t === 'fixed') return 'fixed'
  if (t === 'percentage_gross') return 'percentage_gross'
  return 'percentage_basic' // 'percentage_basic' and the old plain 'percentage'
}

export function describeCalc(calcType: string, value: number): string {
  const ct = normalizeCalcType(calcType)
  if (ct === 'fixed') return `Fixed ${value.toLocaleString()}`
  if (ct === 'percentage_gross') return `${value}% of Gross`
  return `${value}% of Basic`
}

// amount = the salary figure typed for the employee. basis says whether it is the Gross or the Basic.
// factor = share of the month the employee was employed (1 = full month). Earnings are scaled by it;
// percentage deductions follow the scaled amounts; fixed deductions are not scaled.
export function computeSalary(lines: StructureLine[], basis: SalaryBasis, amount: number, factor: number = 1): SalaryResult {
  const warnings: string[] = []
  const input = Number.isFinite(amount) && amount > 0 ? amount : 0
  const earnings = lines.filter(l => l.type === 'earning')
  const deductionLines = lines.filter(l => l.type !== 'earning')
  const basicLine = earnings.find(l => l.isBasic)

  // 1. Basic
  let basic = 0
  if (basis === 'basic') {
    basic = input
  } else if (basicLine) {
    const ct = normalizeCalcType(basicLine.calcType)
    if (ct === 'fixed') basic = basicLine.value
    else if (ct === 'percentage_gross') basic = (input * basicLine.value) / 100
  }
  basic = round2(basic)

  // 2. Earnings
  const results: LineResult[] = []
  let gross = 0
  let grossFull = 0
  for (const l of earnings) {
    const ct = normalizeCalcType(l.calcType)
    let amt = 0
    let problem: string | undefined
    if (l.isBasic) {
      amt = basic
      if (basis === 'gross' && ct === 'percentage_basic') problem = 'The Basic line cannot be a % of Basic - use % of Gross or a fixed amount'
    } else if (ct === 'fixed') {
      amt = l.value
    } else if (ct === 'percentage_basic') {
      amt = (basic * l.value) / 100
    } else {
      if (basis === 'gross') amt = (input * l.value) / 100
      else problem = '"% of Gross" earnings need a structure where the salary is entered as Gross'
    }
    const amtFull = round2(amt)
    amt = round2(amt * factor)
    gross += amt
    grossFull += amtFull
    results.push({ ...l, amount: amt, problem })
  }
  gross = round2(gross)

  // 3. Deductions (can use the Basic or the Gross just calculated)
  const basicP = round2(basic * factor)
  let deductions = 0
  for (const l of deductionLines) {
    const ct = normalizeCalcType(l.calcType)
    let amt = 0
    if (ct === 'fixed') amt = l.value
    else if (ct === 'percentage_basic') amt = (basicP * l.value) / 100
    else amt = (gross * l.value) / 100
    amt = round2(amt)
    deductions += amt
    results.push({ ...l, amount: amt })
  }
  deductions = round2(deductions)

  // 4. Warnings that help the user fix the structure
  if (!basicLine) {
    warnings.push(basis === 'basic'
      ? 'This structure has no Basic Salary line, so the basic salary itself is NOT paid.'
      : 'This structure has no Basic Salary line, so every "% of Basic" amount will be 0.')
  }
  if (basis === 'gross') {
    const pct = earnings
      .filter(l => normalizeCalcType(l.calcType) === 'percentage_gross')
      .reduce((s, l) => s + l.value, 0)
    if (earnings.some(l => normalizeCalcType(l.calcType) === 'percentage_gross') && Math.abs(pct - 100) > 0.001 && !earnings.some(l => !l.isBasic && normalizeCalcType(l.calcType) === 'fixed')) {
      warnings.push(`The "% of Gross" earnings add up to ${round2(pct)}% (they should add up to 100%).`)
    }
    if (input > 0 && Math.abs(grossFull - input) > 0.5) {
      warnings.push(`Total earnings (${grossFull.toLocaleString()}) differ from the Gross entered (${input.toLocaleString()}) by ${round2(grossFull - input).toLocaleString()}.`)
    }
  }
  for (const r of results) if (r.problem) warnings.push(`${r.name}: ${r.problem}`)

  return { lines: results, basic: basicP, gross, deductions, net: round2(gross - deductions), warnings }
}

// How many days the monthly salary is divided by to value one day.
export function daysDivisor(s: PayrollSettings, daysInMonth: number): number {
  return s.dayBasis && s.dayBasis > 0 ? s.dayBasis : daysInMonth
}

// Value of one day (not rounded; round the final deduction).
export function dailyRate(s: PayrollSettings, daysInMonth: number, gross: number, basic: number): number {
  const base = s.dailyRateBase === 'basic' ? basic : gross
  return base > 0 ? base / daysDivisor(s, daysInMonth) : 0
}

// Weekly off days (JS getDay: 0 = Sunday, 6 = Saturday). 22-day basis means Saturday and Sunday are off.
export function weeklyOffDays(s: PayrollSettings): number[] {
  return s.dayBasis === 22 ? [0, 6] : [0]
}

export function weeklyOffText(s: PayrollSettings): string {
  return s.dayBasis === 22 ? 'Saturday and Sunday are off' : 'Sunday is off'
}

// Working days (weekly offs excluded) between two dates, inclusive. Dates are 'YYYY-MM-DD'.
export function countWorkingDays(from: string, to: string, s: PayrollSettings): number {
  const off = weeklyOffDays(s)
  const f = new Date(from + 'T00:00:00Z')
  const t = new Date(to + 'T00:00:00Z')
  if (isNaN(f.getTime()) || isNaN(t.getTime()) || f > t) return 0
  let n = 0
  for (const d = new Date(f); d <= t; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!off.includes(d.getUTCDay())) n++
  }
  return n
}

// Share of the month an employee was employed (joined or left part-way). Dates are 'YYYY-MM-DD'.
// 1 = the whole month, 0 = not employed at all. Counting follows the company day rule:
// a divisor below 28 (22, 26...) counts working days (weekly offs excluded); otherwise calendar days.
export function prorationFactor(s: PayrollSettings, monthStart: string, monthEnd: string, joining?: string | null, exit?: string | null): number {
  const effStart = joining && joining > monthStart ? joining : monthStart
  const effEnd = exit && exit < monthEnd ? exit : monthEnd
  if (effStart > effEnd) return 0
  if (effStart === monthStart && effEnd === monthEnd) return 1
  const daysInMonth = Number(monthEnd.slice(8, 10))
  const divisor = daysDivisor(s, daysInMonth)
  let employed: number
  if (divisor < 28) {
    employed = countWorkingDays(effStart, effEnd, s)
  } else {
    const f = new Date(effStart + 'T00:00:00Z')
    const t = new Date(effEnd + 'T00:00:00Z')
    employed = Math.round((t.getTime() - f.getTime()) / 86400000) + 1
  }
  return Math.min(1, employed / divisor)
}

// Parse a settings row coming from the database.
export function settingsFromRow(row: any): PayrollSettings {
  const d = row && row.day_basis ? Number(row.day_basis) : null
  return {
    dayBasis: d && d > 0 ? d : null,
    dailyRateBase: row && row.daily_rate_base === 'basic' ? 'basic' : 'gross',
  }
}
