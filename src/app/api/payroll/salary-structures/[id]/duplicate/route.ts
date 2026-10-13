import { NextResponse } from 'next/server'
import {
  createRouteClient, resolvePayrollActor, logPayrollEvent,
} from '@/lib/payrollServer'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createRouteClient()

  // Must be a logged-in admin/accountant of a company that has Payroll enabled
  const { actor, response } = await resolvePayrollActor(supabase)
  if (!actor) return response!
  const companyId = actor.companyId

  const { id } = await params
  const structureId = Number(id)
  if (!structureId) return NextResponse.json({ error: 'Invalid structure ID' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const name = String(body?.name || '').trim()
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  // The structure must belong to THIS company
  const { data: structure, error: structErr } = await supabase
    .from('salary_structures')
    .select('id, company_id, salary_basis')
    .eq('id', structureId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (structErr || !structure) {
    return NextResponse.json({ error: 'Structure not found' }, { status: 404 })
  }

  const { data: components, error: compErr } = await supabase
    .from('salary_structure_components')
    .select('salary_component_id, calculation_type, value')
    .eq('salary_structure_id', structureId)

  if (compErr) {
    return NextResponse.json({ error: 'Failed to fetch components' }, { status: 500 })
  }

  const { data: newStructure, error: insertErr } = await supabase
    .from('salary_structures')
    .insert({
      company_id: companyId,
      name,
      salary_basis: structure.salary_basis || 'gross',
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (insertErr || !newStructure) {
    return NextResponse.json({ error: insertErr?.message || 'Failed to duplicate structure' }, { status: 500 })
  }

  if (components && components.length > 0) {
    const newComponents = components.map((c: any) => ({
      salary_structure_id: newStructure.id,
      salary_component_id: c.salary_component_id,
      calculation_type: c.calculation_type,
      value: c.value,
    }))

    const { error: compInsertErr } = await supabase
      .from('salary_structure_components')
      .insert(newComponents)

    if (compInsertErr) {
      // Do not leave an empty half-copy behind
      await supabase.from('salary_structures').delete().eq('id', newStructure.id).eq('company_id', companyId)
      return NextResponse.json({ error: 'Could not copy components: ' + compInsertErr.message }, { status: 500 })
    }
  }

  await logPayrollEvent({
    companyId, userId: actor.userId, tableName: 'salary_structures', recordId: String(newStructure.id), action: 'INSERT',
    newValues: { name, copied_from: structureId },
  })

  return NextResponse.json(newStructure)
}