import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCallback } from '@/lib/jazzcash'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(request: NextRequest) {
  let body: Record<string, string>
  try {
    const formData = await request.formData()
    body = {}
    formData.forEach((value, key) => {
      body[key] = value.toString()
    })
  } catch {
    body = await request.json()
  }

  console.log('JazzCash callback received:', body)

  try {
    const result = await verifyCallback(body)

    if (result.isSuccess) {
      const { paymentType, companyId, metadata } = result

      if (paymentType === 'plan_upgrade') {
        const { plan_to } = metadata
        if (plan_to && companyId) {
          const { data: plan } = await supabaseAdmin
            .from('plans')
            .select('id')
            .eq('code', plan_to)
            .single()
          if (plan) {
            await supabaseAdmin
              .from('companies')
              .update({ plan_id: plan.id })
              .eq('id', companyId)
          }
        }
      } else if (paymentType === 'create_company') {
        const { company_name, plan_code } = metadata
        if (company_name && plan_code) {
          const { data: plan } = await supabaseAdmin
            .from('plans')
            .select('id')
            .eq('code', plan_code)
            .single()
          if (plan) {
            // Create the company
            const { data: newCompany, error: createError } = await supabaseAdmin
              .from('companies')
              .insert({
                name: company_name,
                plan_id: plan.id,
                trial_ends_at: null, // no trial
              })
              .select('id')
              .single()
            if (!createError && newCompany) {
              // Seed accounts
              await supabaseAdmin.rpc('seed_accounts_for_company', {
                target_company_id: newCompany.id,
              })
              // Assign admin role – need user from payment history? We stored user_id in metadata
              const userId = metadata.user_id // ensure we pass user_id in metadata
              if (userId) {
                await supabaseAdmin.from('user_roles').insert({
                  user_id: userId,
                  company_id: newCompany.id,
                  role: 'admin',
                })
                // Refresh JWT
                await supabaseAdmin.functions.invoke('custom-claims', {
                  body: { userId },
                })
              }
            }
          }
        }
      }
    }

    return NextResponse.redirect(
      new URL(`/dashboard/upgrade?payment=${result.isSuccess ? 'success' : 'failed'}`, request.url)
    )
  } catch (e: any) {
    console.error('Callback error:', e)
    return NextResponse.redirect(new URL('/dashboard/upgrade?payment=error', request.url))
  }
}