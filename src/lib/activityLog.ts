import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!   // uses anon key, RLS will apply
)

export async function logActivity(userId: string, companyId: string, action: string, details?: Record<string, any>) {
  try {
    await supabase.from('activity_logs').insert({
      company_id: companyId || '00000000-0000-0000-0000-000000000001',
      user_id: userId,
      action,
      details: details || {},
    })
  } catch (error) {
    console.error('Activity log error:', error)
  }
}