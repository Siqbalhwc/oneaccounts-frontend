import { NextRequest, NextResponse } from 'next/server'
import {
  createRouteClient, resolvePayrollActor, logPayrollEvent, supabaseAdmin, forbidden,
} from '@/lib/payrollServer'
import { DEFAULT_SETTINGS, settingsFromRow } from '@/lib/payrollCalc'

// Company payroll settings: days used for the daily rate, and what the daily rate is based on.

export async function GET() {
  const supabase = await createRouteClient()
  const { actor, response } = await resolvePayrollActor(supabase)
  if (!actor) return response!

  const { data } = await supabaseAdmin
    .from('payroll_settings')
    .select('day_basis, daily_rate_base')
    .eq('company_id', actor.companyId)
    .maybeSingle()

  return NextResponse.json({ settings: data ? settingsFromRow(data) : DEFAULT_SETTINGS, saved: !!data })
}

export async function PUT(request: NextRequest) {
  const supabase = await createRouteClient()
  const { actor, response } = await resolvePayrollActor(supabase)
  if (!actor) return response!
  if (actor.role !== 'admin') return forbidden('Only an admin can change payroll settings')

  const body = await request.json().catch(() => ({}))

  let dayBasis: number | null = null
  if (body?.dayBasis !== null && body?.dayBasis !== undefined && body?.dayBasis !== '') {
    dayBasis = Number(body.dayBasis)
    if (!Number.isInteger(dayBasis) || dayBasis < 20 || dayBasis > 31) {
      return NextResponse.json({ error: 'Days must be a whole number between 20 and 31, or "days of the month"' }, { status: 400 })
    }
  }
  const dailyRateBase = body?.dailyRateBase === 'basic' ? 'basic' : 'gross'

  const { data: before } = await supabaseAdmin
    .from('payroll_settings')
    .select('day_basis, daily_rate_base')
    .eq('company_id', actor.companyId)
    .maybeSingle()

  const { error } = await supabaseAdmin
    .from('payroll_settings')
    .upsert({
      company_id: actor.companyId,
      day_basis: dayBasis,
      daily_rate_base: dailyRateBase,
      updated_by: actor.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logPayrollEvent({
    companyId: actor.companyId, userId: actor.userId, tableName: 'payroll_settings', recordId: actor.companyId,
    action: before ? 'UPDATE' : 'INSERT',
    oldValues: before ?? null, newValues: { day_basis: dayBasis, daily_rate_base: dailyRateBase },
  })

  return NextResponse.json({ success: true })
}
