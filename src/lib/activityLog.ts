import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function logActivity(
  action: string,
  userId?: string,
  companyId?: string,
  metadata?: Record<string, any>
) {
  if (!companyId) {
    console.error('logActivity called without companyId')
    return
  }

  await supabaseAdmin.from('activity_logs').insert({
    company_id: companyId,
    user_id: userId || null,
    action,
    metadata: metadata || {},
  })
}