import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function POST(request: Request) {
  const { companyId, config } = await request.json()
  if (!companyId || !config) {
    return NextResponse.json({ error: 'Missing companyId or config' }, { status: 400 })
  }

  // Upsert with explicit conflict target to avoid duplicate key error
  const { error } = await supabaseAdmin
    .from('company_settings')
    .upsert(
      {
        company_id: companyId,
        invoice_automation_config: config,
      },
      { onConflict: 'company_id' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}