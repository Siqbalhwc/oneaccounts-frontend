"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"

const INACTIVITY_LIMIT = 60 * 60 * 1000 // 60 minutes

export function SessionMonitor({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      await supabase.auth.signOut()
      router.push("/login")
    }, INACTIVITY_LIMIT)
  }

  useEffect(() => {
    const events = ["mousedown", "keydown", "scroll", "touchstart", "click", "mousemove"]
    events.forEach(event => window.addEventListener(event, resetTimer))
    resetTimer()

    return () => {
      events.forEach(event => window.removeEventListener(event, resetTimer))
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return <>{children}</>
}