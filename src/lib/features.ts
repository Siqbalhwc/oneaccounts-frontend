import { createClient } from '@supabase/supabase-js'

/**
 * Check if a specific company has access to a feature.
 * Priority:
 * 1. Company-level override (company_features)
 * 2. Plan-level entitlement (plan_features)
 * 3. Global default (features.default_enabled)
 */
export async function hasFeature(
  supabaseUrl: string,
  serviceRoleKey: string,
  companyId: string,
  featureCode: string
): Promise<boolean> {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  // 1. Check company override
  const { data: coOverride } = await supabase
    .from('company_features')
    .select('enabled, expires_at')
    .eq('company_id', companyId)
    .eq('features.code', featureCode)
    .single()

  if (coOverride) {
    if (coOverride.expires_at && new Date(coOverride.expires_at) < new Date()) {
      // expired override → fall through
    } else {
      return coOverride.enabled
    }
  }

  // 2. Get the company's plan
  const { data: company } = await supabase
    .from('company_settings')
    .select('plan_id')
    .eq('id', companyId) // assuming company_settings.id = companyId; adjust if needed
    .single()

  if (company?.plan_id) {
    const { data: planFeature } = await supabase
      .from('plan_features')
      .select('enabled')
      .eq('plan_id', company.plan_id)
      .eq('features.code', featureCode)
      .single()

    if (planFeature) return planFeature.enabled
  }

  // 3. Fallback to global default
  const { data: feature } = await supabase
    .from('features')
    .select('default_enabled')
    .eq('code', featureCode)
    .single()

  return feature?.default_enabled ?? false
}