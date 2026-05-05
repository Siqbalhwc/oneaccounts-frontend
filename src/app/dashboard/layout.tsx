import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClientWrapper from '@/components/DashboardClientWrapper'
import QueryProvider from '@/components/QueryProvider'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service‑role admin client (used only for reading user_roles without RLS interference)
const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

  @keyframes floaty {
    0% { transform: translateY(0px); }
    50% { transform: translateY(-4px); }
    100% { transform: translateY(0px); }
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Plus Jakarta Sans', sans-serif; background: #EFF4FB; }

  .dl-shell { display: flex; min-height: 100vh; background: #EFF4FB; }

  .dl-sidebar {
    width: 220px; min-width: 220px;
    background: linear-gradient(155deg, #04092E 0%, #071352 18%, #0F2280 40%, #1740C8 72%, #1E55E8 100%);
    display: flex; flex-direction: column;
    position: fixed; top: 0; left: 0; bottom: 0; z-index: 40;
    transition: transform 0.25s ease; overflow: hidden;
  }
  .dl-sidebar::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background-image: radial-gradient(rgba(255,255,255,0.055) 1.2px, transparent 1.2px);
    background-size: 28px 28px; pointer-events: none; z-index: 0;
  }
  .dl-sidebar-logo { display: flex; align-items: center; gap: 10px; padding: 16px 18px; border-bottom: 1px solid rgba(255,255,255,0.08); min-height: 58px; position: relative; z-index: 1; }
  .dl-sidebar-logo-img { width: 32px; height: 32px; border-radius: 8px; object-fit: contain; flex-shrink: 0; }
  .dl-sidebar-logo-name { color: white; font-size: 14px; font-weight: 700; line-height: 1.1; }
  .dl-sidebar-logo-sub { color: rgba(255,255,255,0.45); font-size: 9px; }
  .dl-sidebar-nav { flex: 1; padding: 12px 10px; overflow-y: auto; position: relative; z-index: 1; }
  .dl-nav-section { padding: 8px 8px 4px; color: rgba(255,255,255,0.35); font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }

  .dl-nav-item {
    display: flex; align-items: center; gap: 10px; padding: 8px 12px;
    border-radius: 8px; color: rgba(255,255,255,0.65); font-size: 13px; font-weight: 500;
    text-decoration: none; transition: all 0.15s; margin-bottom: 2px;
    animation: floaty 6s ease-in-out infinite;
  }
  .dl-nav-item:hover { background: rgba(255,255,255,0.06); color: white; }
  .dl-nav-item.active { background: rgba(255,255,255,0.1); color: white; font-weight: 600; }
  .dl-nav-icon { width: 18px; text-align: center; flex-shrink: 0; }
  .dl-nav-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 8px 14px; }
  .dl-sidebar-user { padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; gap: 10px; position: relative; z-index: 1; }
  .dl-sidebar-avatar { width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,0.15); color: white; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
  .dl-sidebar-email { color: rgba(255,255,255,0.7); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dl-sidebar-signout { color: rgba(255,255,255,0.4); font-size: 10px; cursor: pointer; background: none; border: none; font-family: inherit; padding: 0; margin-top: 2px; }
  .dl-sidebar-signout:hover { color: #EF4444; }

  .dl-main {
    flex: 1;
    margin-left: 220px;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    min-width: 0;
    overflow-x: hidden;
  }

  .dl-topbar {
    background: white;
    border-bottom: 1px solid #E2E8F0;
    padding: 0 16px;
    display: flex;
    align-items: center;
    min-height: 56px;
    gap: 12px;
    position: sticky;
    top: 0;
    z-index: 30;
    flex-wrap: wrap;
  }
  .dl-topbar-greeting { flex: 1; min-width: 0; }
  .dl-topbar-title { font-size: clamp(12px, 1.1vw, 14px); font-weight: 700; color: #1E293B; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dl-topbar-subtitle { font-size: clamp(10px, 0.8vw, 11px); color: #94A3B8; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dl-topbar-actions { display: flex; gap: 8px; flex-shrink: 0; }

  .dl-action-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px clamp(10px, 1.2vw, 14px); border-radius: 8px;
    font-size: clamp(10px, 0.78vw, 11.5px); font-weight: 600;
    text-decoration: none; cursor: pointer; border: 1.5px solid;
    font-family: inherit; transition: all 0.15s; white-space: nowrap; height: 34px;
    animation: floaty 6s ease-in-out infinite;
  }
  .dl-btn-invoice { background: #EEF2FF; border-color: #C7D2FE; color: #4338CA; }
  .dl-btn-bill    { background: #FEF3C7; border-color: #FCD34D; color: #92400E; }
  .dl-btn-receipt { background: #D1FAE5; border-color: #A7F3D0; color: #065F46; }
  .dl-btn-payment { background: #FEE2E2; border-color: #FECACA; color: #991B1B; }
  .dl-btn-invoice:hover { background: #E0E7FF; }
  .dl-btn-bill:hover    { background: #FEF9C3; }
  .dl-btn-receipt:hover { background: #A7F3D0; }
  .dl-btn-payment:hover { background: #FECACA; }

  .dl-hamburger { display: none; background: none; border: none; cursor: pointer; padding: 6px; flex-shrink: 0; }
  .dl-hamburger span { display: block; width: 20px; height: 2px; background: #475569; margin: 4px 0; border-radius: 2px; transition: all 0.2s; }
  .dl-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 35; }
  .dl-overlay.open { display: block; }

  .dl-main-inner {
    padding: 16px;
    background: #EFF4FB;
    min-height: 100%;
  }

  @media (max-width: 900px) {
    .dl-sidebar { width: 60px; min-width: 60px; }
    .dl-sidebar-logo-name, .dl-sidebar-logo-sub, .dl-nav-section,
    .dl-nav-item span:not(.dl-nav-icon), .dl-sidebar-email, .dl-sidebar-signout { display: none; }
    .dl-sidebar-logo { justify-content: center; padding: 14px 0; }
    .dl-nav-item { justify-content: center; padding: 10px; }
    .dl-sidebar-user { justify-content: center; }
    .dl-main { margin-left: 60px; }
  }
  @media (max-width: 640px) {
    .dl-sidebar { transform: translateX(-220px); width: 220px; min-width: 220px; }
    .dl-sidebar.mobile-open { transform: translateX(0); }
    .dl-sidebar.mobile-open .dl-sidebar-logo-name, .dl-sidebar.mobile-open .dl-sidebar-logo-sub,
    .dl-sidebar.mobile-open .dl-nav-section, .dl-sidebar.mobile-open .dl-nav-item span:not(.dl-nav-icon),
    .dl-sidebar.mobile-open .dl-sidebar-email, .dl-sidebar.mobile-open .dl-sidebar-signout { display: block; }
    .dl-sidebar.mobile-open .dl-sidebar-logo { justify-content: flex-start; padding: 16px 18px; }
    .dl-sidebar.mobile-open .dl-nav-item { justify-content: flex-start; padding: 8px 12px; }
    .dl-main { margin-left: 0; }
    .dl-hamburger { display: block; }
    .dl-topbar { padding: 0 10px; min-height: 48px; }
    .dl-topbar-actions { flex: 1 1 100%; gap: 6px; }
    .dl-action-btn { flex: 1; justify-content: center; padding: 6px 8px; font-size: 10px; }
    .dl-main-inner { padding: 12px; }
  }
  @media (max-width: 380px) {
    .dl-topbar { padding: 0 8px; }
    .dl-topbar-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
    .dl-action-btn { padding: 6px 4px; font-size: 9px; }
    .dl-main-inner { padding: 8px; }
  }
`

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const email   = user.email || ''
  const initial = email.charAt(0).toUpperCase()

  // ─── Bullet‑proof active company resolution ──────────────────
  // 1. Try the cookie (set after trial creation)
  const cookieStore = await import('next/headers').then(m => m.cookies())
  let activeCompanyId = cookieStore.get('active_company_id')?.value

  // 2. Try the JWT custom claim
  if (!activeCompanyId) {
    activeCompanyId = (user?.app_metadata as any)?.company_id
  }

  // 3. Ask the database for the last active company of this user
  if (!activeCompanyId) {
    const { data: activeRole } = await supabaseAdmin
      .from('user_roles')
      .select('company_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    activeCompanyId = activeRole?.company_id
  }

  // 4. Absolute last resort – the template company (should never happen for real users)
  if (!activeCompanyId) {
    activeCompanyId = '00000000-0000-0000-0000-000000000001'
  }
  // ─── End of active company resolution ────────────────────────

  const { data: compData } = await supabase
    .from('company_settings')
    .select('plan_id')
    .eq('id', 1)
    .single()

  let enabledFeatures: string[] = []
  if (compData?.plan_id) {
    const { data: pfData } = await supabase
      .from('plan_features')
      .select('features!inner(code)')
      .eq('plan_id', compData.plan_id)
      .eq('enabled', true)

    if (pfData) {
      enabledFeatures = pfData.map((row: any) => row.features?.code).filter(Boolean) as string[]
    }

    const { data: coData } = await supabase
      .from('company_features')
      .select('features!inner(code), enabled')
      .eq('company_id', activeCompanyId)

    if (coData) {
      for (const row of coData) {
        const code = (row as any).features?.code
        if (!code) continue
        if (row.enabled) {
          if (!enabledFeatures.includes(code)) enabledFeatures.push(code)
        } else {
          enabledFeatures = enabledFeatures.filter(c => c !== code)
        }
      }
    }
  }

  return (
    <QueryProvider>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <DashboardClientWrapper
        enabledFeatures={enabledFeatures}
        email={email}
        initial={initial}
      >
        {children}
      </DashboardClientWrapper>
    </QueryProvider>
  )
}