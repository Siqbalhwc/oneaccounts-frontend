"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Eye, EyeOff } from "lucide-react"

export default function LoginPage() {
  const [email,        setEmail]        = useState("")
  const [password,     setPassword]     = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState("")
  const [isSignUp,     setIsSignUp]     = useState(false)

  // flow states
  const [flow, setFlow] = useState<"login" | "invite-processing" | "invite-expired" | "recovery">("login")

  // ── Process URL hash (invite or recovery) ───────────────────
  useEffect(() => {
    const hash = window.location.hash.substring(1)
    if (!hash) return

    const params = new URLSearchParams(hash)
    const accessToken  = params.get("access_token")
    const refreshToken = params.get("refresh_token")
    const type         = params.get("type")

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    if (accessToken && refreshToken && type === "invite") {
      setFlow("invite-processing")
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }).then(({ error }) => {
        if (error) {
          console.error("Invite setSession error:", error)
          setFlow("invite-expired")
          window.history.replaceState(null, "", "/login")
        } else {
          window.location.href = "/dashboard"
        }
      })
    } else if (accessToken && type === "recovery") {
      setFlow("recovery")
      // The user will use a form to set a new password
    }
  }, [])

  // ── Password reset request (for invited users who need to set a password) ──
  const handleSendRecovery = async () => {
    if (!email) { setError("Please enter your email address."); return }
    setLoading(true)
    setError("")
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) setError(error.message)
    else setError("✅ Password reset link sent! Check your email.")
    setLoading(false)
  }

  // ── Password update (when recovery token is present) ──
  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) { setError("Please enter a new password."); return }
    setLoading(true)
    setError("")
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(error.message)
    else {
      setError("✅ Password updated! You can now sign in.")
      setFlow("login")
      setPassword("")
    }
    setLoading(false)
  }

  // ── Normal login / sign‑up ──
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
        {/* ── Recovery flow: set new password ── */}
        {flow === "recovery" ? (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginBottom: 4, textAlign: "center" }}>
              Set New Password 🔐
            </h2>
            <p style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 16 }}>
              Choose a strong password for your account.
            </p>
            {error && (
              <div style={{
                background: error.startsWith("✅") ? "#F0FDF4" : "#FEF2F2",
                border: `1px solid ${error.startsWith("✅") ? "#BBF7D0" : "#FECACA"}`,
                borderRadius: 8, padding: 10, marginBottom: 12, color: error.startsWith("✅") ? "#15803D" : "#B91C1C", fontSize: 13
              }}>
                {error}
              </div>
            )}
            <form onSubmit={handleSetNewPassword} noValidate>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>New Password</label>
              <div style={{ position: "relative", marginBottom: 16 }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
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
                  border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer"
                }}>
                {loading ? "Please wait…" : "Update Password →"}
              </button>
            </form>
          </>
        ) : flow === "invite-processing" ? (
          <div style={{ textAlign: "center", color: "#15803D", fontSize: 13 }}>
            ⏳ Verifying your invitation… please wait.
          </div>
        ) : (
          <>
            {/* ── Invite expired message ── */}
            {flow === "invite-expired" && (
              <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <p style={{ color: "#B91C1C", fontSize: 13, margin: 0 }}>❌ This invitation link has expired or has already been used.</p>
                <p style={{ fontSize: 12, color: "#4B5563", margin: "8px 0" }}>
                  If you already accepted the invitation, you can set a password below to sign in.
                </p>
              </div>
            )}

            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginBottom: 4, textAlign: "center" }}>
              {isSignUp ? "Create Account" : "Welcome back 👋"}
            </h2>
            <p style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 16 }}>
              {isSignUp ? "Sign up for your OneAccounts workspace" : "Sign in to your OneAccounts workspace"}
            </p>

            {error && (
              <div style={{
                background: error.startsWith("✅") ? "#F0FDF4" : "#FEF2F2",
                border: `1px solid ${error.startsWith("✅") ? "#BBF7D0" : "#FECACA"}`,
                borderRadius: 8, padding: 10, marginBottom: 12, color: error.startsWith("✅") ? "#15803D" : "#B91C1C", fontSize: 13
              }}>
                {error}
              </div>
            )}

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
                <button onClick={handleSendRecovery} disabled={loading}
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