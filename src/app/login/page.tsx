"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Eye, EyeOff } from "lucide-react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const [email,        setEmail]        = useState("")
  const [password,     setPassword]     = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState("")
  const [isSignUp,     setIsSignUp]     = useState(false)
  const [inviteStatus, setInviteStatus] = useState<"idle" | "processing" | "success" | "expired">("idle")
  const router = useRouter()

  // ── Handle invite token from URL hash ───────────────────
  useEffect(() => {
    const hash = window.location.hash.substring(1)
    if (!hash) return

    const params = new URLSearchParams(hash)
    const accessToken  = params.get("access_token")
    const refreshToken = params.get("refresh_token")
    const type         = params.get("type")

    if (accessToken && refreshToken && type === "invite") {
      setInviteStatus("processing")
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      supabase.auth.setSession({
        access_token:  accessToken,
        refresh_token: refreshToken,
      }).then(({ error }) => {
        if (error) {
          console.error("Invite setSession error:", error)
          setInviteStatus("expired")
          // Clean the URL so the user can try manual login
          window.history.replaceState(null, "", "/login")
        } else {
          setInviteStatus("success")
          // The user is now signed in – redirect to dashboard
          window.location.href = "/dashboard"
        }
      })
    }
  }, [])

  // ── Handle password setup for invited users ────────────
  const handleSetPassword = async () => {
    if (!email) {
      setError("Please enter your email address first.")
      return
    }
    setLoading(true)
    setError("")
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) {
      setError(error.message)
    } else {
      setError("✅ Password reset link sent! Check your email.")
    }
    setLoading(false)
  }

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
      setError(isSignUp
        ? "Sign up failed — this email may already be registered."
        : "Incorrect email or password. Please try again.")
      setLoading(false)
      return
    }
    if (isSignUp) {
      setError("✅ Account created! Check your email to confirm, then sign in.")
      setIsSignUp(false)
      setLoading(false)
      return
    }

    fetch("/api/log-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, userAgent: navigator.userAgent }),
    }).catch(() => {})

    window.location.href = "/dashboard"
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B1E5B", fontFamily: "'Inter', sans-serif" }}>
      <div style={{
        background: "white", borderRadius: 18, padding: "32px 28px",
        maxWidth: 400, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
      }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginBottom: 4, textAlign: "center" }}>
          {isSignUp ? "Create Account" : "Welcome back 👋"}
        </h2>
        <p style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 16 }}>
          {isSignUp ? "Sign up for your OneAccounts workspace" : "Sign in to your OneAccounts workspace"}
        </p>

        {inviteStatus === "processing" && (
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: 10, marginBottom: 12, textAlign: "center", color: "#15803D", fontSize: 13 }}>
            ⏳ Verifying your invitation… please wait.
          </div>
        )}

        {inviteStatus === "expired" && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: 10, marginBottom: 12 }}>
            <p style={{ color: "#B91C1C", fontSize: 13, margin: 0 }}>
              ❌ This invitation link has expired or has already been used.
            </p>
            <p style={{ fontSize: 12, color: "#4B5563", margin: "8px 0" }}>
              Please request a new invitation from your administrator, or set a password for your account below.
            </p>
          </div>
        )}

        {error && (
          <div style={{
            background: error.startsWith("✅") ? "#F0FDF4" : "#FEF2F2",
            border: `1px solid ${error.startsWith("✅") ? "#BBF7D0" : "#FECACA"}`,
            borderRadius: 8, padding: 10, marginBottom: 12, color: error.startsWith("✅") ? "#15803D" : "#B91C1C", fontSize: 13
          }}>
            {error}
          </div>
        )}

        {inviteStatus !== "processing" && (
          <>
            <form onSubmit={handleAuth} noValidate>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                style={{
                  width: "100%", height: 38, border: "1px solid #E5EAF2", borderRadius: 8, padding: "0 12px",
                  fontSize: 13, marginBottom: 12, outline: "none"
                }}
              />
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>Password</label>
              <div style={{ position: "relative", marginBottom: 16 }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={isSignUp ? "Create a strong password" : "Enter your password"}
                  required
                  style={{
                    width: "100%", height: 38, border: "1px solid #E5EAF2", borderRadius: 8, padding: "0 40px 0 12px",
                    fontSize: 13, outline: "none"
                  }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{ position: "absolute", right: 10, top: 10, background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              <button type="submit" disabled={loading}
                style={{
                  width: "100%", height: 40, background: "linear-gradient(135deg, #1740C8, #071352)", color: "white",
                  border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 8
                }}>
                {loading ? "Please wait…" : isSignUp ? "Create Account →" : "Sign In →"}
              </button>
            </form>

            {!isSignUp && (
              <div style={{ textAlign: "center", marginBottom: 8 }}>
                <button onClick={handleSetPassword} disabled={loading}
                  style={{ background: "none", border: "none", color: "#4F6EF7", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
                  Forgot password? / Set your password
                </button>
              </div>
            )}

            <div style={{ textAlign: "center", marginTop: 8 }}>
              <button
                onClick={() => { setIsSignUp(!isSignUp); setError("") }}
                style={{ background: "none", border: "none", color: "#4F6EF7", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
                {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}