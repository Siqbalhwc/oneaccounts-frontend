import { createClient } from '@/lib/supabase/server'

export async function getUserCompany() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) return null

  // 1. Get the active membership
  const { data: membership, error: membershipError } = await supabase
    .from('user_roles')
    .select('company_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipError || !membership) return null

  // 2. Fetch company details from company_settings (use business_name, not company_name)
  const { data: settings } = await supabase
    .from('company_settings')
    .select('business_name, logo_url, tagline')
    .eq('company_id', membership.company_id)
    .maybeSingle()

  return {
    userId: user.id,
    email: user.email!,
    companyId: membership.company_id,
    role: membership.role,
    companyName: settings?.business_name || 'OneAccounts',
    companyLogo: settings?.logo_url || '/logo.png',
    companyTagline: settings?.tagline || 'by Siqbal',
  }
}