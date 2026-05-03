"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Building2, ChevronDown } from "lucide-react"

interface Company {
  id: string
  name: string
}

export default function CompanySelector() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Set current company from JWT metadata
      const metaCompanyId = user.app_metadata?.company_id as string | undefined
      if (metaCompanyId) setCurrentCompanyId(metaCompanyId)

      // Fetch companies the user belongs to
      const { data: roles } = await supabase
        .from('user_roles')
        .select('company_id, companies(id, name)')
        .eq('user_id', user.id)

      if (roles) {
        const comps = roles
          .map((r: any) => r.companies)
          .filter(Boolean)
          .filter((c: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.id === c.id) === i) // unique
        setCompanies(comps as Company[])
        if (!metaCompanyId && comps.length > 0) {
          // If no company set yet, select the first one automatically
          setCurrentCompanyId(comps[0].id)
        }
      }
    }
    fetch()
  }, [])

  const handleSelect = async (companyId: string) => {
    if (companyId === currentCompanyId) {
      setOpen(false)
      return
    }

    setSwitching(true)
    try {
      const res = await fetch('/api/select-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || 'Failed to switch company')
        return
      }

      // Refresh the session to get a new JWT with the updated company_id
      await supabase.auth.refreshSession()
      setCurrentCompanyId(companyId)
      setOpen(false)
      // Reload the page so the layout re‑fetches features, etc.
      router.refresh()
      window.location.href = '/dashboard'
    } catch {
      alert('Network error')
    } finally {
      setSwitching(false)
    }
  }

  const currentCompany = companies.find(c => c.id === currentCompanyId)

  if (companies.length <= 1) return null   // No need for selector if only one company

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        disabled={switching}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8,
          color: 'white',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <Building2 size={14} />
        <span>{switching ? 'Switching…' : currentCompany?.name || 'Select Company'}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 70 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 4px)',
              width: 240,
              background: 'white',
              borderRadius: 10,
              border: '1px solid #E2E8F0',
              boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
              zIndex: 71,
              overflow: 'hidden',
            }}
          >
            {companies.map(company => (
              <div
                key={company.id}
                onClick={() => handleSelect(company.id)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: company.id === currentCompanyId ? '#1E3A8A' : '#1E293B',
                  fontWeight: company.id === currentCompanyId ? 700 : 400,
                  borderBottom: '1px solid #F1F5F9',
                  background: company.id === currentCompanyId ? '#EEF2FF' : 'white',
                }}
              >
                {company.name}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}