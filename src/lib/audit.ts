import { createClient } from '@/lib/supabase/server'

export async function logDataChange(
  tableName: string,
  recordId: string,
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  oldValues?: any,
  newValues?: any,
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const companyId = (user?.app_metadata as any)?.company_id
    if (!companyId) return

    await supabase.from('data_change_logs').insert({
      table_name: tableName,
      record_id: recordId,
      action,
      old_values: oldValues || null,
      new_values: newValues || null,
      changed_by: user.email || user.id,
      company_id: companyId,          // ← added
    })
  } catch (e) {
    console.error('Audit log failed:', e)
  }
}