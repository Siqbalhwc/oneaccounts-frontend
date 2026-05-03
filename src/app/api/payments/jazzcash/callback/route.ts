import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCallback } from '@/lib/jazzcash'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(request: NextRequest) {
  // JazzCash sends the callback as form data (application/x-www-form-urlencoded)
  let body: Record<string, string>
  try {
    const formData = await request.formData()
    body = {}
    formData.forEach((value, key) => {
      body[key] = value.toString()
    })
  } catch {
    // Fallback: try JSON
    body = await request.json()
  }

  console.log('JazzCash callback received:', body)

  try {
    const result = await verifyCallback(body)

    if (result.isSuccess && result.paymentType === 'plan_upgrade') {
      const { plan_to } = result.metadata
      if (plan_to && result.companyId) {
        // Upgrade the company's plan
        const { data: plan } = await supabaseAdmin
          .from('plans')
          .select('id')
          .eq('code', plan_to)
          .single()

        if (plan) {
          await supabaseAdmin
            .from('companies')
            .update({ plan_id: plan.id })
            .eq('id', result.companyId)
        }
      }
    }

    // JazzCash expects a redirect back to the site
    return NextResponse.redirect(
      new URL(`/dashboard/upgrade?payment=${result.isSuccess ? 'success' : 'failed'}`, request.url)
    )
  } catch (e: any) {
    console.error('Callback error:', e)
    return NextResponse.redirect(
      new URL('/dashboard/upgrade?payment=error', request.url)
    )
  }
}