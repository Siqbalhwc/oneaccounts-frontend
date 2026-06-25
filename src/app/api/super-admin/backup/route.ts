import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// Important tables for a complete operational backup
const BACKUP_TABLES = [
  'accounts',
  'customers',
  'suppliers',
  'products',
  'invoices',
  'invoice_items',
  'journal_entries',
  'journal_lines',
  'payments',
  'receipts',
  'payment_allocations',
  'receipt_allocations',
  'stock_moves',
  'bill_withholding',
  'budgets',
  'projects',
  'donors',
  'activities',
  'locations',
  'user_roles',
  'company_settings',
  'tax_codes',
  'company_tax_settings',
]

export async function GET(request: NextRequest) {
  // 1. Authenticate using Supabase client (server-side)
  const authHeader = request.headers.get('authorization')
  let userId: string | null = null

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (!error && user) userId = user.id
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Check super admin
  const { data: superAdmin } = await supabaseAdmin
    .from('super_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!superAdmin) {
    return NextResponse.json({ error: 'Only super admin can export backups' }, { status: 403 })
  }

  // 3. Get company ID from query
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('companyId')
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  // 4. Fetch data from all tables
  const workbook = XLSX.utils.book_new()

  try {
    for (const table of BACKUP_TABLES) {
      // Fetch all rows for this company
      const { data, error } = await supabaseAdmin
        .from(table)
        .select('*')
        .eq('company_id', companyId)

      if (error) {
        console.warn(`Skipping ${table}:`, error.message)
        continue
      }

      if (data && data.length > 0) {
        // Convert to worksheet and add to workbook
        const worksheet = XLSX.utils.json_to_sheet(data)
        // Use table name as sheet name (max 31 chars, Excel limit)
        XLSX.utils.book_append_sheet(workbook, worksheet, table.substring(0, 31))
      }
    }

    // 5. Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    // 6. Return as downloadable file
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .single()

    const companyName = company?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'company'
    const fileName = `backup_${companyName}_${new Date().toISOString().split('T')[0]}.xlsx`

    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (err: any) {
    console.error('Backup error:', err)
    return NextResponse.json({ error: 'Backup generation failed: ' + err.message }, { status: 500 })
  }
}