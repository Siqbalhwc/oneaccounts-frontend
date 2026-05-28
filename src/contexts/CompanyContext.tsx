"use client"

import { createContext, useContext, ReactNode } from "react"

interface CompanyData {
  companyId: string          // ← new
  companyName: string
  companyTagline: string
  logoUrl: string | null
}

const CompanyContext = createContext<CompanyData>({
  companyId: "",
  companyName: "",
  companyTagline: "",
  logoUrl: null,
})

export function CompanyProvider({
  children,
  value,
}: {
  children: ReactNode
  value: CompanyData
}) {
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
}

export function useCompany() {
  return useContext(CompanyContext)
}