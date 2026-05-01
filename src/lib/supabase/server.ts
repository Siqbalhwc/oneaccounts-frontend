import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        // setAll is intentionally omitted here.
        // Cookie writing is handled exclusively in middleware.ts.
        // Putting setAll in a Server Component layout causes:
        // "Cookies can only be modified in a Server Action or Route Handler"
        setAll() {},
      },
    }
  )
}
