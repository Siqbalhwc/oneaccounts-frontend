"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Eye, EyeOff, Building2 } from "lucide-react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [isSignUp, setIsSignUp] = useState(false)
  const router = useRouter()

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { error: authError } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (isSignUp) {
      setError("Account created! Check your email to confirm, then sign in.")
      setIsSignUp(false)
      setLoading(false)
      return
    }

    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="min-h-screen flex">
      {/* Left - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_60%)]" />
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="flex items-center gap-3 mb-8">
            <Building2 className="w-10 h-10" />
            <div>
              <h1 className="text-2xl font-bold">OneAccounts</h1>
              <p className="text-sm text-blue-200">by Siqbal</p>
            </div>
          </div>
          <h2 className="text-4xl font-bold mb-4 leading-tight">
            Smart Accounting,<br />
            <span className="text-blue-300">Stronger Business.</span>
          </h2>
          <p className="text-blue-200 text-lg leading-relaxed">
            Complete double-entry accounting, invoicing, inventory &amp; 
            financial reporting — built for Pakistani businesses.
          </p>
          <div className="mt-12 flex gap-6 text-sm text-blue-300">
            <span>✓ Journal Entries</span>
            <span>✓ Sales & Purchase</span>
            <span>✓ Balance Sheet</span>
          </div>
        </div>
      </div>

      {/* Right - Login Form */}
      <div className="flex-1 flex items-center justify-center px-6 bg-gray-50">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <Building2 className="w-8 h-8 text-blue-700" />
            <span className="text-xl font-bold text-blue-900">OneAccounts</span>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <img
                src="/logo.png"
                alt="OneAccounts"
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 12,
                  objectFit: "contain",
                  display: "block",
                  margin: "0 auto 16px",
                }}
              />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              {isSignUp ? 'Create Account' : 'Welcome back 👋'}
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {isSignUp
                ? 'Sign up for OneAccounts workspace'
                : 'Sign in to your OneAccounts workspace'}
            </p>

            {error && (
              <div className={`p-3 rounded-lg text-sm mb-4 ${
                error.includes('created') 
                  ? 'bg-green-50 text-green-700 border border-green-200' 
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {error}
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-700 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-800 transition disabled:opacity-50"
              >
                {loading ? 'Please wait...' : isSignUp ? 'Create Account →' : 'Sign In →'}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => { setIsSignUp(!isSignUp); setError('') }}
                className="text-sm text-blue-600 hover:underline"
              >
                {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            🔒 256-bit SSL encrypted · Your data is safe
          </p>
        </div>
      </div>
    </div>
  )
}