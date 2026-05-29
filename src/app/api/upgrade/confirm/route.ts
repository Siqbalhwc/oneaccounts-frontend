import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('receipt') as File
  const amount = formData.get('amount') as string
  const period = formData.get('period') as string
  const planCode = formData.get('plan') as string
  const topups = formData.get('topups') as string   // comma-separated

  if (!file || !amount) {
    return NextResponse.json({ error: 'Missing file or amount' }, { status: 400 })
  }

  // 1. Get the user's company_id
  const { data: role } = await supabaseAdmin
    .from('user_roles')
    .select('company_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!role?.company_id) {
    return NextResponse.json({ error: 'No company found' }, { status: 400 })
  }

  const companyId = role.company_id

  // 2. Upload the receipt to Supabase Storage
  const fileExt = file.name.split('.').pop() || 'png'
  const filePath = `${user.id}/${Date.now()}-receipt.${fileExt}`
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error: uploadError } = await supabaseAdmin
    .storage
    .from('receipts')
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    console.error('Upload error:', uploadError)
    return NextResponse.json({ error: 'Failed to upload receipt' }, { status: 500 })
  }

  // 3. Get public URL (even though bucket is private, we can create a signed URL)
  const { data: signedUrlData } = await supabaseAdmin
    .storage
    .from('receipts')
    .createSignedUrl(filePath, 60 * 60 * 24 * 7) // valid for 7 days

  const receiptUrl = signedUrlData?.signedUrl || filePath

  // 4. Update subscription to active
  const now = new Date()
  const endDate = new Date()
  if (period === 'monthly') endDate.setMonth(endDate.getMonth() + 1)
  else if (period === 'half_yearly') endDate.setMonth(endDate.getMonth() + 6)
  else if (period === 'yearly') endDate.setFullYear(endDate.getFullYear() + 1)

  await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'active',
      payment_status: 'paid',
      start_date: now.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      payment_reference: receiptUrl,
    })
    .eq('company_id', companyId)

  // 5. Activate selected top‑ups (if any)
  if (topups && topups.trim() !== '') {
    const topupCodes = topups.split(',').filter(Boolean)
    // Get subscription id
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('company_id', companyId)
      .single()

    if (sub) {
      for (const code of topupCodes) {
        // Get feature id
        const { data: feature } = await supabaseAdmin
          .from('features')
          .select('id')
          .eq('code', code)
          .single()

        if (feature) {
          // Enable in company_features
          await supabaseAdmin.from('company_features')
            .upsert({ company_id: companyId, feature_id: feature.id, enabled: true }, { onConflict: 'company_id,feature_id' })

          // Insert top‑up record
          await supabaseAdmin.from('subscription_topups')
            .insert({
              subscription_id: sub.id,
              feature_code: code,
              start_date: now.toISOString().split('T')[0],
              end_date: endDate.toISOString().split('T')[0],
              price_per_user: 500, // you can adjust
              status: 'active',
            })
        }
      }
    }
  }

  // 6. Create notification for super‑admin
  await supabaseAdmin.from('payment_notifications').insert({
    company_id: companyId,
    user_id: user.id,
    amount: parseFloat(amount),
    period,
    plan_code: planCode,
    topups: topups ? topups.split(',') : [],
    receipt_url: receiptUrl,
  })

  return NextResponse.json({ success: true, message: 'Payment submitted! Your plan is now active.' })
}