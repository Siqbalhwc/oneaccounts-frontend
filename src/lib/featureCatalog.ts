// One list of paid modules, used by the Upgrade page (and Super Admin later).
// Add a module here once and it appears everywhere.

export type BillingPeriod = 'monthly' | 'half_yearly' | 'yearly'
export const PERIODS: BillingPeriod[] = ['monthly', 'half_yearly', 'yearly']

export const PERIOD_META: Record<BillingPeriod, { label: string; unit: string; months: number }> = {
  monthly:     { label: 'Monthly',   unit: 'month',    months: 1 },
  half_yearly: { label: '6 months',  unit: '6 months', months: 6 },
  yearly:      { label: '12 months', unit: 'year',     months: 12 },
}

// Fallback base prices (used when the plan row has no price)
export const PLAN_PRICING: Record<string, Record<BillingPeriod, number>> = {
  service: { monthly: 3000, half_yearly: 16000, yearly: 30000 },
  trading: { monthly: 3000, half_yearly: 16000, yearly: 30000 },
  ngo:     { monthly: 5000, half_yearly: 28000, yearly: 50000 },
}

// Each module costs Rs 500 per user per month (list price). Longer periods get the same discount as the plan.
// An extra user costs the same as the plan's price per user for the chosen period.
export const ADDON_PRICE_MONTHLY = 500

/** Add-on price per user for the chosen period (same discount as the base plan) */
export function addonPrice(period: BillingPeriod): number {
  if (period === 'monthly') return ADDON_PRICE_MONTHLY
  if (period === 'half_yearly') return Math.round(ADDON_PRICE_MONTHLY * 6 * (16000 / 18000))
  return Math.round(ADDON_PRICE_MONTHLY * 12 * (30000 / 36000))
}

export interface CatalogFeature {
  code: string
  name: string
  short: string          // one short line
  bestFor?: string[]     // business types this suits best (never hides the module)
}

export const FEATURES: CatalogFeature[] = [
  { code: 'payroll',              name: 'Payroll',               short: 'Salaries and payslips' },
  { code: 'whatsapp_invoice',     name: 'WhatsApp',              short: 'Send invoices on WhatsApp' },
  { code: 'inventory',            name: 'Inventory',             short: 'Stock and products',        bestFor: ['trading'] },
  { code: 'material_management',  name: 'Material management',   short: 'Gate pass and store',       bestFor: ['trading', 'construction'] },
  { code: 'purchase_orders',      name: 'Purchase orders',       short: 'Orders and receiving' },
  { code: 'tax_management',       name: 'Tax management',        short: 'Tax codes and WHT' },
  { code: 'asset_management',     name: 'Fixed assets',          short: 'Depreciation and disposal' },
  { code: 'invoice_automation',   name: 'Invoice automation',    short: 'Recurring invoices' },
  { code: 'investors',            name: 'Investors',             short: 'Capital and returns',       bestFor: ['trading', 'construction'] },
  { code: 'profit_allocation',    name: 'Profit allocation',     short: 'Share profit among partners', bestFor: ['trading', 'construction'] },
  { code: 'email_reports',        name: 'Email reports',         short: 'Reports by email' },
  { code: 'csv_import_export',    name: 'CSV import and export', short: 'Bulk upload and download' },
  { code: 'payment_reminders',    name: 'Payment reminders',     short: 'Chase overdue payments' },
]

export const FEATURE_CODES = FEATURES.map(f => f.code)

export function featureName(code: string): string {
  const f = FEATURES.find(x => x.code === code)
  if (f) return f.name
  const s = code.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const TYPE_LABEL: Record<string, string> = {
  trading: 'Trading', construction: 'Construction', ngo: 'NGO', service: 'Service',
}
export function bestForLabel(f: CatalogFeature): string | null {
  if (!f.bestFor || f.bestFor.length === 0) return null
  return 'Best for ' + f.bestFor.map(t => TYPE_LABEL[t] || t).join(' and ')
}

export const SUPPORT = {
  whatsappNumber: '923716853677',
  whatsappDisplay: '+92 371 6853677',
  email: 'siqbalhwc@gmail.com',
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

// Competitor entry prices, billed yearly, USD per month (Odoo at its Pakistan price).
// Checked October 2026. Refresh these numbers from time to time.
export const COMPETITORS = {
  asOf: 'Oct 2026',
  usdToPkr: 277,
  items: [
    { name: 'Zoho Books',  usd: 15,    note: 'Standard plan, 3 users included' },
    { name: 'Odoo',        usd: 17,    note: 'Standard plan, all apps, per user (Pakistan price)' },
    { name: 'QuickBooks',  usd: 38,    note: 'Simple Start, 1 user' },
  ],
}
export function competitorPkr(usd: number): number {
  return Math.round((usd * COMPETITORS.usdToPkr) / 50) * 50
}