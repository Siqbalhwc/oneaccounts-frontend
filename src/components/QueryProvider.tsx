"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,           // 30 seconds – data considered fresh
            gcTime: 5 * 60 * 1000,          // keep cache for 5 minutes
            refetchOnWindowFocus: false,    // no refetch when you switch tabs
            retry: 1,
          },
        },
      })
  )
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}