import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export const dynamic = 'force-dynamic'

export default async function AdminPaymentsPage() {
  // Fetch all payment notifications with company name
  const { data: payments, error } = await supabaseAdmin
    .from('payment_notifications')
    .select('*, companies(name)')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div style={{ padding: 32, color: '#EF4444' }}>
        Failed to load payment notifications: {error.message}
      </div>
    )
  }

  return (
    <div style={{ padding: 24, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', marginBottom: 24 }}>
        📬 Payment Notifications
      </h1>

      {!payments || payments.length === 0 ? (
        <div style={{ background: '#F1F5F9', borderRadius: 12, padding: 24, textAlign: 'center', color: '#64748B' }}>
          No payment notifications yet.
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                <th style={thStyle}>Company</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Plan / Period</th>
                <th style={thStyle}>Top‑ups</th>
                <th style={thStyle}>Receipt</th>
                <th style={thStyle}>Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p: any) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={tdStyle}>{p.companies?.name || '—'}</td>
                  <td style={tdStyle}>PKR {p.amount?.toLocaleString()}</td>
                  <td style={tdStyle}>{p.plan_code} / {p.period}</td>
                  <td style={tdStyle}>{p.topups?.join(', ') || '—'}</td>
                  <td style={tdStyle}>
                    {p.receipt_url ? (
                      <a href={p.receipt_url} target="_blank" rel="noopener noreferrer"
                         style={{ color: '#3B82F6', textDecoration: 'underline', fontSize: 13 }}>
                        View Receipt
                      </a>
                    ) : '—'}
                  </td>
                  <td style={tdStyle}>{new Date(p.created_at).toLocaleDateString('en-PK')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  color: '#64748B',
}

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 13,
  color: '#334155',
}