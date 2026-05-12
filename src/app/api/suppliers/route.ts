import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { logDataChange } from '@/lib/audit'

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

  const { code, name, phone, email, address, opening_balance } = await request.json()

  // Auto‑generate code if missing
  let suppCode = code || ''
  if (!suppCode) {
    const { data: last } = await supabase
      .from('suppliers')
      .select('code')
      .like('code', 'SUP-%')
      .order('code', { ascending: false })
      .limit(1)
    let nextNum = 1
    if (last && last.length > 0) {
      const parts = last[0].code.split('-')
      if (parts.length === 2) {
        const n = parseInt(parts[1])
        if (!isNaN(n)) nextNum = n + 1
      }
    }
    suppCode = `SUP-${String(nextNum).padStart(3, '0')}`
  }

  const { data: supplier, error } = await supabase
    .from('suppliers')
    .insert({
      code: suppCode,
      name,
      phone,
      email,
      address,
      opening_balance,
      balance: opening_balance || 0,
    })
    .select('*')
    .single()

  if (error || !supplier) {
    return NextResponse.json({ error: error?.message || 'Insert failed' }, { status: 500 })
  }

  // Audit log
  await logDataChange('suppliers', String(supplier.id), 'INSERT', undefined, supplier)

  return NextResponse.json({ success: true, supplier })
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

  const { id, code, name, phone, email, address, opening_balance } = await request.json()

  // Fetch old values for audit
  const { data: oldSupplier } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .single()

  const { data: updatedSupplier, error } = await supabase
    .from('suppliers')
    .update({
      code, name, phone, email, address, opening_balance,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error || !updatedSupplier) {
    return NextResponse.json({ error: error?.message || 'Update failed' }, { status: 500 })
  }

  // Audit log
  if (oldSupplier) {
    await logDataChange('suppliers', String(id), 'UPDATE', oldSupplier, updatedSupplier)
  }

  return NextResponse.json({ success: true, supplier: updatedSupplier })
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
  const { data: oldSupplier } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('suppliers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit log
  if (oldSupplier) {
    await logDataChange('suppliers', String(id), 'DELETE', oldSupplier, undefined)
  }

  return NextResponse.json({ success: true })
}