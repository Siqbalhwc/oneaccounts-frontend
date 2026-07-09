"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Eye, EyeOff } from "lucide-react"
import { normalizePhone } from "@/lib/whatsapp"

export default function SignupPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [companyName, setCompanyName] = useState("")
  const [businessType, setBusinessType] = useState("ngo")
  const [phone, setPhone] = useState("")
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [hasExistingSession, setHasExistingSession] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [signupSuccess, setSignupSuccess] = useState(false)

  const validatePakistanPhone = (raw: string): boolean => {
    const normalized = normalizePhone(raw)
    return /^3\d{9}$/.test(normalized)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setHasExistingSession(!!user)
    })
  }, [])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg("")

    if (!phone) {
      setErrorMsg("Phone number is required.")
      setLoading(false)
      return
    }
    if (!validatePakistanPhone(phone)) {
      setErrorMsg("Please enter a valid Pakistan mobile number (e.g., 0311-1234567 or +92311-1234567)")
      setLoading(false)
      return
    }

    const normalizedPhone = "03" + normalizePhone(phone)

    if (hasExistingSession) {
      setErrorMsg("You are already logged in. Please sign out or use an incognito window.")
      setLoading(false)
      return
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + "/auth/callback",
        data: {
          company_name: companyName,
          business_type: businessType,
          phone: normalizedPhone,
        },
      },
    })

    if (authError) {
      if (authError.message.toLowerCase().includes("already registered")) {
        setErrorMsg("An account with this email already exists. Please log in instead.")
      } else {
        setErrorMsg(authError.message)
      }
      setLoading(false)
      return
    }

    if (!authData.user) {
      setErrorMsg("Something went wrong creating your account. Please try again.")
      setLoading(false)
      return
    }

    try {
      const res = await fetch("/api/trial/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: authData.user.id,
          email,
          companyName,
          businessType,
          phone: normalizedPhone,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        console.error("Company creation error:", data.error)
        setErrorMsg(
          "Your account was created, but we couldn't finish setting up your company. Please contact support and mention this email: " +
            email
        )
        setLoading(false)
        return
      }
    } catch (e) {
      console.error("Failed to create company:", e)
      setErrorMsg(
        "Your account was created, but we couldn't reach our servers to finish setup. Please contact support."
      )
      setLoading(false)
      return
    }

    setSignupSuccess(true)
    setLoading(false)
  }

  // ── Success screen ──
  if (signupSuccess) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{
          background: "var(--card)",
          padding: 40,
          borderRadius: 12,
          border: "1px solid var(--border)",
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>
            Check Your Email
          </h2>
          <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 8 }}>
            We sent a confirmation link to <strong>{email}</strong>.
          </p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 24 }}>
            Please click the link in your email to verify your address and activate your free trial.
          </p>
          <button
            onClick={() => router.push("/login")}
            style={{
              background: "var(--primary)",
              color: "var(--primary-text)",
              border: "none",
              borderRadius: 8,
              padding: "10px 32px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Go to Login
          </button>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 16 }}>
            Didn't receive the email? Check your spam folder.
          </p>
        </div>
      </div>
    )
  }

  // ── Loading overlay ──
  if (isCreating) {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999, fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{
          background: "var(--card)", borderRadius: 16, padding: "32px 40px",
          textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          maxWidth: 360, width: "90%",
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            border: "4px solid var(--border)", borderTopColor: "var(--primary)",
            animation: "spin 0.8s linear infinite", margin: "0 auto 16px",
          }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: "0 0 8px" }}>
            Creating your company…
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            Setting up accounts, budget templates, and more.
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          background: "var(--card)",
          padding: 32,
          borderRadius: 12,
          border: "1px solid var(--border)",
          width: "100%",
          maxWidth: 400,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>
          🚀 Start your free trial
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
          10‑day Professional plan. No credit card required.
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
            Please sign out or use incognito mode to create a separate trial.
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
            {errorMsg.includes("already exists") && (
              <div style={{ marginTop: 6 }}>
                <a href="/login" style={{ color: "var(--primary)", fontWeight: 600 }}>
                  Go to Login →
                </a>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSignup}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4, color: "var(--text)" }}>
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
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 12,
              boxSizing: "border-box",
              background: "var(--bg)",
              color: "var(--text)",
              fontFamily: "inherit",
            }}
          />

          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4, color: "var(--text)" }}>
            Business Type
          </label>
          <select
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 12,
              boxSizing: "border-box",
              background: "var(--bg)",
              color: "var(--text)",
              fontFamily: "inherit",
              appearance: "none",
              WebkitAppearance: "none",
              MozAppearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 12px center",
              paddingRight: 32,
            }}
          >
            <option value="ngo">NGO</option>
            <option value="service">Service Business</option>
            <option value="trading">Trading Business</option>
          </select>

          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4, color: "var(--text)" }}>
            Phone Number <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>(Pakistan, for WhatsApp follow-up)</span>
          </label>
          <input
            type="tel"
            placeholder="0311-1234567 or +92311-1234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 12,
              boxSizing: "border-box",
              background: "var(--bg)",
              color: "var(--text)",
              fontFamily: "inherit",
            }}
          />

          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4, color: "var(--text)" }}>
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
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 12,
              boxSizing: "border-box",
              background: "var(--bg)",
              color: "var(--text)",
              fontFamily: "inherit",
            }}
          />

          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4, color: "var(--text)" }}>
            Password
          </label>
          <div style={{ position: "relative", marginBottom: 18 }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              style={{
                width: "100%",
                padding: "8px 40px 8px 12px",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 13,
                boxSizing: "border-box",
                background: "var(--bg)",
                color: "var(--text)",
                fontFamily: "inherit",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(prev => !prev)}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                padding: 4,
                display: "flex",
                alignItems: "center",
              }}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || hasExistingSession}
            style={{
              width: "100%",
              padding: 10,
              background: hasExistingSession ? "var(--text-muted)" : "var(--primary)",
              color: "var(--primary-text)",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              cursor: hasExistingSession ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {loading ? "Creating..." : hasExistingSession ? "Sign out first or use incognito" : "Start Free 10‑Day Trial"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--text-muted)" }}>
          Already have an account?{" "}
          <a href="/login" style={{ color: "var(--primary)", fontWeight: 600 }}>
            Log in
          </a>
        </p>
      </div>
    </div>
  )
}