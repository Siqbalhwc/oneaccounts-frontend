import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { logDataChange } from '@/lib/audit'
import { generateNextCode } from '@/lib/generate-code'

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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = user.app_metadata?.company_id || '00000000-0000-0000-0000-000000000001'

  const { code, name, phone, email, address, country_code, payment_terms, opening_balance } = await request.json()

  // Auto‑generate code if missing (ignores soft‑deleted rows)
  let custCode = code || ''
  if (!custCode) {
    custCode = await generateNextCode('customers', 'CUST-', companyId)
  }

  const { data: customer, error } = await supabase
    .from('customers')
    .insert({
      company_id: companyId,
      code: custCode,
      name,
      phone,
      email,
      address,
      country_code,
      payment_terms,
      opening_balance,
      balance: opening_balance || 0,
    })
    .select('*')
    .single()

  if (error || !customer) {
    return NextResponse.json({ error: error?.message || 'Insert failed' }, { status: 500 })
  }

  // Audit log
  await logDataChange('customers', String(customer.id), 'INSERT', undefined, customer)

  return NextResponse.json({ success: true, customer })
}

export async function PUT(request: NextRequest) {
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, code, name, phone, email, address, country_code, payment_terms, opening_balance } = await request.json()

  // Fetch old values for audit
  const { data: oldCustomer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()

  const { data: updatedCustomer, error } = await supabase
    .from('customers')
    .update({
      code, name, phone, email, address, country_code,
      payment_terms, opening_balance,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error || !updatedCustomer) {
    return NextResponse.json({ error: error?.message || 'Update failed' }, { status: 500 })
  }

  // Audit log
  if (oldCustomer) {
    await logDataChange('customers', String(id), 'UPDATE', oldCustomer, updatedCustomer)
  }

  return NextResponse.json({ success: true, customer: updatedCustomer })
}

export async function DELETE(request: NextRequest) {
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await request.json()

  // Fetch old values for audit
  const { data: oldCustomer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('customers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit log
  if (oldCustomer) {
    await logDataChange('customers', String(id), 'DELETE', oldCustomer, undefined)
  }

  return NextResponse.json({ success: true })
}