import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { FEATURE_CODES, PERIODS } from '@/lib/featureCatalog'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const MAX_FILE = 8 * 1024 * 1024
const REF_PATTERN = /^[A-Z0-9]{2,6}-\d{4}-\d{4}$/

// Records a bank-transfer payment as PENDING.
// It does NOT change the plan, add-ons or the company's access dates.
// A super admin verifies the transfer and then updates the account.
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const { data: role } = await supabaseAdmin
      .from('user_roles')
      .select('company_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (!role?.company_id) return NextResponse.json({ error: 'No active company found' }, { status: 400 })
    const companyId = role.company_id as string

    const form = await request.formData()
    const file = form.get('receipt')
    const amount = Number(form.get('amount') || 0)
    const period = String(form.get('period') || '')
    const planCode = String(form.get('plan_code') || '')
    const users = Math.max(0, Math.min(100, parseInt(String(form.get('users') || '0'), 10) || 0))
    const topups = String(form.get('topups') || '').split(',').filter(c => FEATURE_CODES.includes(c))
    let reference = String(form.get('reference') || '').toUpperCase()

    if (!(file instanceof File)) return NextResponse.json({ error: 'Please attach your transfer receipt.' }, { status: 400 })
    if (file.size > MAX_FILE) return NextResponse.json({ error: 'The receipt file is too large (max 8 MB).' }, { status: 400 })
    if (!/^(image\/|application\/pdf)/.test(file.type)) return NextResponse.json({ error: 'Receipt must be an image or a PDF.' }, { status: 400 })
    if (!(amount > 0)) return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 })
    if (!(PERIODS as string[]).includes(period)) return NextResponse.json({ error: 'Invalid billing period.' }, { status: 400 })

    if (!REF_PATTERN.test(reference)) {
      reference = `OA-${new Date().toISOString().slice(2, 4)}${new Date().toISOString().slice(5, 7)}-${Math.floor(1000 + Math.random() * 9000)}`
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${companyId}/${Date.now()}-${safeName}`
    const { error: upErr } = await supabaseAdmin.storage
      .from('receipts')
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
    if (upErr) return NextResponse.json({ error: 'Could not upload the receipt: ' + upErr.message }, { status: 500 })

    const { data: signed } = await supabaseAdmin.storage.from('receipts').createSignedUrl(path, 60 * 60 * 24 * 30)

    const { error: insErr } = await supabaseAdmin.from('payment_notifications').insert({
      company_id: companyId,
      user_id: user.id,
      amount,
      period,
      plan_code: planCode || null,
      topups,
      additional_users: users,
      receipt_url: signed?.signedUrl || path,
      reference,
      status: 'pending',
    })
    if (insErr) {
      const dup = /duplicate|unique/i.test(insErr.message)
      return NextResponse.json(
        { error: dup ? 'This reference is already used. Please go back and try again.' : 'Could not record your payment: ' + insErr.message },
        { status: dup ? 409 : 500 }
      )
    }

    return NextResponse.json({ success: true, reference })
  } catch (e: any) {
    console.error('upgrade/confirm failed:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}