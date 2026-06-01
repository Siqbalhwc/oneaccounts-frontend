import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tableName = searchParams.get('tableName')
  const recordId = searchParams.get('recordId')
  const companyId = searchParams.get('companyId')

  if (!tableName || !recordId || !companyId) {
    return NextResponse.json([])
  }

  const { data, error } = await supabaseAdmin
    .from('data_change_logs')
    .select('*')
    .eq('table_name', tableName)
    .eq('record_id', recordId)
    .eq('company_id', companyId)
    .order('changed_at', { ascending: false })

  if (error) {
    console.error('audit-logs fetch error:', error.message)
    return NextResponse.json([])
  }

  return NextResponse.json(data || [])
}