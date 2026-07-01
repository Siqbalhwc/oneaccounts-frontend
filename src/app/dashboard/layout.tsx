// app/dashboard/layout.tsx
import { getUserCompany } from '@/lib/get-user-company'
import DashboardLayoutClient from '@/components/dashboard/DashboardLayoutClient'

const styles = `...`   // ← same long style block you already have, unchanged

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getUserCompany()

  if (!tenant) {
    return (
      <html lang="en">
        <body style={{ margin: 0, background: '#0B1120', color: '#E2E8F0', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>No Company Linked</h1>
            <p style={{ color: '#94A3B8', marginBottom: 16 }}>Your account is not linked to a company. Please contact your administrator.</p>
            <a href="/login" style={{ color: '#60A5FA', fontSize: 14 }}>← Back to login</a>
          </div>
        </body>
      </html>
    )
  }

  const email = tenant.email
  const initial = email.charAt(0).toUpperCase()

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <DashboardLayoutClient tenant={tenant} email={email} initial={initial}>
        {children}
      </DashboardLayoutClient>
    </>
  )
}