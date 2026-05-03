"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"

export default function SignupPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg("")

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError) {
      setErrorMsg(authError.message)
      setLoading(false)
      return
    }

    // If email confirmation is required, inform the user
    if (!authData.session) {
      setErrorMsg(
        "✅ Account created! Please check your email to confirm, then sign in to create your company."
      )
      setLoading(false)
      return
    }

    // 2. User is logged in — create the company via trial API
    try {
      const res = await fetch("/api/trial/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName }),
      })
      const data = await res.json()
      if (!data.success) {
        setErrorMsg(data.error || "Failed to create company.")
        setLoading(false)
        return
      }
      // 3. Redirect to dashboard — JWT has the new company_id
      router.push("/dashboard")
    } catch (e) {
      setErrorMsg("Network error. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#EFF4FB",
        fontFamily: "Arial",
      }}
    >
      <div
        style={{
          background: "white",
          padding: 32,
          borderRadius: 12,
          border: "1px solid #E2E8F0",
          width: "100%",
          maxWidth: 400,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", marginBottom: 4 }}>
          🚀 Start your free trial
        </h1>
        <p style={{ fontSize: 13, color: "#64748B", marginBottom: 24 }}>
          14‑day Professional plan. No credit card required.
        </p>

        {errorMsg && (
          <div
            style={{
              background: errorMsg.startsWith("✅") ? "#F0FDF4" : "#FEF2F2",
              color: errorMsg.startsWith("✅") ? "#15803D" : "#B91C1C",
              padding: "8px 12px",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSignup}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
            Company Name
          </label>
          <input
            type="text"
            placeholder="Your Business Name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #E2E8F0",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 12,
              boxSizing: "border-box",
            }}
          />

          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
            Email
          </label>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #E2E8F0",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 12,
              boxSizing: "border-box",
            }}
          />

          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
            Password
          </label>
          <input
            type="password"
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #E2E8F0",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 18,
              boxSizing: "border-box",
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: 10,
              background: "#1D4ED8",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {loading ? "Creating..." : "Start Free 14‑Day Trial"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#64748B" }}>
          Already have an account?{" "}
          <a href="/login" style={{ color: "#1D4ED8", fontWeight: 600 }}>
            Log in
          </a>
        </p>
      </div>
    </div>
  )
}