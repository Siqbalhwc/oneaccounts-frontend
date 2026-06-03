"use client"

import { useState, useEffect } from "react"
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
  const [businessType, setBusinessType] = useState("ngo")
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [hasExistingSession, setHasExistingSession] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setHasExistingSession(!!user)
    })
  }, [])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg("")

    if (hasExistingSession) {
      setErrorMsg("You are already logged in. Please sign out or use an incognito window to create a separate trial company.")
      setLoading(false)
      return
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError) {
      setErrorMsg(authError.message)
      setLoading(false)
      return
    }

    if (!authData.session) {
      setErrorMsg("✅ Account created! Please check your email to confirm, then sign in to create your company.")
      setLoading(false)
      return
    }

    try {
      const res = await fetch("/api/trial/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, businessType }),
      })
      const data = await res.json()
      if (!data.success) {
        setErrorMsg(data.error || "Failed to create company.")
        setLoading(false)
        return
      }

      await supabase.auth.refreshSession()
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
        background: "linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 50%, #e0f7fa 100%)",
        fontFamily: "Arial",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Wave background */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
      }}>
        <svg
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "100%",
            opacity: 0.4,
          }}
        >
          <path
            fill="#ffffff"
            fillOpacity="0.3"
            d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
          />
        </svg>
        <svg
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "100%",
            opacity: 0.2,
            animation: "waveMove 8s infinite alternate ease-in-out",
          }}
        >
          <path
            fill="#ffffff"
            fillOpacity="0.2"
            d="M0,288L48,272C96,256,192,224,288,213.3C384,203,480,213,576,224C672,235,768,245,864,234.7C960,224,1056,192,1152,176C1248,160,1344,160,1392,160L1440,160L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
          />
        </svg>
        <style>{`
          @keyframes waveMove {
            0% { transform: translateX(0); }
            100% { transform: translateX(-20px); }
          }
        `}</style>
      </div>

      <div
        style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(12px)",
          padding: 32,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.6)",
          width: "100%",
          maxWidth: 400,
          position: "relative",
          zIndex: 1,
          boxShadow: "0 12px 24px rgba(0,0,0,0.05)",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", marginBottom: 4 }}>
          🚀 Start your free trial
        </h1>
        <p style={{ fontSize: 13, color: "#64748B", marginBottom: 24 }}>
          14‑day Professional plan. No credit card required.
        </p>

        {hasExistingSession && (
          <div
            style={{
              background: "#FEF3C7",
              border: "1px solid #F59E0B",
              color: "#92400E",
              padding: "12px 14px",
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            <strong>⚠️ You are already logged in</strong><br />
            Creating a new trial here will <strong>sign you out</strong> of your current company in all open tabs.
            <br />
            <strong>Recommendation:</strong> Use a separate browser profile (Incognito / Guest) for each company to keep them completely isolated.
          </div>
        )}

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
            Business Type
          </label>
          <select
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #E2E8F0",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 12,
              boxSizing: "border-box",
              background: "white",
            }}
          >
            <option value="ngo">NGO</option>
            <option value="service">Service Business</option>
            <option value="trading">Trading Business</option>
          </select>

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
            disabled={loading || hasExistingSession}
            style={{
              width: "100%",
              padding: 10,
              background: hasExistingSession ? "#94A3B8" : "#1D4ED8",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              cursor: hasExistingSession ? "not-allowed" : "pointer",
            }}
          >
            {loading
              ? "Creating..."
              : hasExistingSession
              ? "Sign out first or use incognito"
              : "Start Free 14‑Day Trial"}
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