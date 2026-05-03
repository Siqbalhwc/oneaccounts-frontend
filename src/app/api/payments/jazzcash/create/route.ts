import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createPaymentRequest } from '@/lib/jazzcash'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get user's company
  const { data: role } = await supabase
    .from('user_roles')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!role?.company_id) return NextResponse.json({ error: 'No company found' }, { status: 400 })

  const body = await request.json()
  const { amount, paymentType, metadata } = body

  if (!amount || !paymentType) {
    return NextResponse.json({ error: 'Missing amount or paymentType' }, { status: 400 })
  }

  try {
    const result = await createPaymentRequest({
      companyId: role.company_id,
      amount,
      paymentType,
      metadata,
    })

    return NextResponse.json({
      success: true,
      redirectUrl: result.redirectUrl,
      params: result.params,
      txnRef: result.txnRef,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}