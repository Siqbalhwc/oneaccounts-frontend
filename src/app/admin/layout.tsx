import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const { createServerClient } = await import('@supabase/ssr')
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    redirect('/login')
  }

  const { data: admin, error: adminError } = await supabaseAdmin
    .from('platform_admins')
    .select('id')
    .eq('email', user.email)
    .maybeSingle()

  if (adminError || !admin) {
    redirect('/dashboard')
  }

  return (
    <>
      {/* Minimal navigation bar */}
      <div style={{
        background: '#0F172A', borderBottom: '1px solid #334155',
        padding: '0 24px', height: 48, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', color: '#E2E8F0',
        fontFamily: "'Inter', sans-serif",
      }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>🛡️ Admin Panel</span>
        <Link
          href="/dashboard"
          style={{
            color: '#94A3B8', fontSize: 13, textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ← Back to Dashboard
        </Link>
      </div>
      {children}
    </>
  )
}