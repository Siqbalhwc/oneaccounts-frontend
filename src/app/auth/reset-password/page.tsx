"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { ArrowLeft, Eye, EyeOff, CheckCircle } from "lucide-react"

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    // Check if we have a valid session (user came from reset email)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setError("Invalid or expired reset link. Please request a new one.")
      } else {
        setHasSession(true)
      }
    })
  }, [])

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.")
      setLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: password,
    })

    if (updateError) {
      setError(updateError.message || "Failed to update password. Please try again.")
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)

    // Auto redirect after 3 seconds
    setTimeout(() => {
      router.push("/login")
    }, 3000)
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(160deg, #060F38 0%, #0A1B5E 22%, #0E2C8C 48%, #122E78 72%, #060F38 100%)",
      padding: "24px",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{
        maxWidth: "420px",
        width: "100%",
        background: "rgba(255,255,255,0.97)",
        borderRadius: "20px",
        padding: "40px 36px",
        boxShadow: "0 24px 70px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.30)",
      }}>

        <button
          onClick={() => router.push("/login")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "none",
            border: "none",
            color: "#64748B",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            marginBottom: "20px",
          }}
        >
          <ArrowLeft size={16} /> Back to Sign In
        </button>

        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{
            width: "56px",
            height: "56px",
            borderRadius: "14px",
            background: "linear-gradient(135deg, #EEF2FF, #E0EAFE)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 12px",
          }}>
            <CheckCircle size={28} style={{ color: "#1740C8" }} />
          </div>
          <h1 style={{
            fontSize: "22px",
            fontWeight: 800,
            color: "#0F172A",
            marginBottom: "4px",
          }}>
            Set New Password
          </h1>
          <p style={{
            fontSize: "13px",
            color: "#64748B",
          }}>
            Enter your new password below.
          </p>
        </div>

        {error && (
          <div style={{
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "10px",
            padding: "10px 14px",
            fontSize: "13px",
            color: "#B91C1C",
            marginBottom: "16px",
          }}>
            {error}
          </div>
        )}

        {success ? (
          <div style={{
            background: "#F0FDF4",
            border: "1px solid #BBF7D0",
            borderRadius: "12px",
            padding: "20px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "40px", marginBottom: "8px" }}>✅</div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#065F46" }}>Password Updated!</h3>
            <p style={{ fontSize: "13px", color: "#047857", marginTop: "4px", lineHeight: "1.6" }}>
              Your password has been successfully reset.<br />
              Redirecting to sign in...
            </p>
          </div>
        ) : (
          <form onSubmit={handleReset}>
            <label style={{
              display: "block",
              fontSize: "10px",
              fontWeight: 700,
              color: "#64748B",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              marginBottom: "5px",
            }}>
              New Password
            </label>
            <div style={{
              position: "relative",
              marginBottom: "16px",
            }}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: "100%",
                  height: "44px",
                  border: "1.5px solid #E2E8F5",
                  borderRadius: "10px",
                  padding: "0 44px 0 14px",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  color: "#0F172A",
                  background: "#FBFCFF",
                  outline: "none",
                  transition: "border-color 0.18s, box-shadow 0.18s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#1740C8"
                  e.currentTarget.style.boxShadow = "0 0 0 3.5px rgba(23,64,200,0.10)"
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#E2E8F5"
                  e.currentTarget.style.boxShadow = "none"
                }}
                required
                disabled={!hasSession}
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#94A3B8",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <label style={{
              display: "block",
              fontSize: "10px",
              fontWeight: 700,
              color: "#64748B",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              marginBottom: "5px",
            }}>
              Confirm Password
            </label>
            <input
              type="password"
              placeholder="Confirm your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{
                width: "100%",
                height: "44px",
                border: "1.5px solid #E2E8F5",
                borderRadius: "10px",
                padding: "0 14px",
                fontSize: "14px",
                fontFamily: "inherit",
                color: "#0F172A",
                background: "#FBFCFF",
                outline: "none",
                transition: "border-color 0.18s, box-shadow 0.18s",
                marginBottom: "16px",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#1740C8"
                e.currentTarget.style.boxShadow = "0 0 0 3.5px rgba(23,64,200,0.10)"
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#E2E8F5"
                e.currentTarget.style.boxShadow = "none"
              }}
              required
              disabled={!hasSession}
            />

            {!hasSession && (
              <div style={{
                background: "#FEF3C7",
                border: "1px solid #F59E0B",
                borderRadius: "8px",
                padding: "10px 14px",
                fontSize: "13px",
                color: "#92400E",
                marginBottom: "16px",
              }}>
                ⚠️ Invalid or expired reset link. Please request a new password reset.
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !hasSession}
              style={{
                width: "100%",
                height: "46px",
                background: hasSession ? "linear-gradient(135deg, #1E55E8 0%, #0B1C6E 100%)" : "#94A3B8",
                border: "none",
                borderRadius: "10px",
                fontSize: "14px",
                fontWeight: 700,
                color: "white",
                cursor: hasSession ? "pointer" : "not-allowed",
                fontFamily: "inherit",
                transition: "all 0.2s",
                boxShadow: hasSession ? "0 6px 18px rgba(11,28,110,0.32)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                opacity: loading ? 0.68 : 1,
              }}
              onMouseEnter={(e) => {
                if (!loading && hasSession) {
                  e.currentTarget.style.background = "linear-gradient(135deg, #2D63F6 0%, #102590 100%)"
                  e.currentTarget.style.transform = "translateY(-1px)"
                  e.currentTarget.style.boxShadow = "0 8px 22px rgba(11,28,110,0.40)"
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "linear-gradient(135deg, #1E55E8 0%, #0B1C6E 100%)"
                e.currentTarget.style.transform = "translateY(0)"
                e.currentTarget.style.boxShadow = "0 6px 18px rgba(11,28,110,0.32)"
              }}
            >
              {loading ? (
                <>
                  <span style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,0.35)",
                    borderTopColor: "white",
                    animation: "spin 0.7s linear infinite",
                    display: "inline-block",
                  }} />
                  Updating…
                </>
              ) : (
                "Update Password →"
              )}
            </button>
          </form>
        )}

        <div style={{
          marginTop: "20px",
          paddingTop: "16px",
          borderTop: "1px solid #E3E8F5",
          textAlign: "center",
        }}>
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "6px 14px",
          }}>
            <a href="https://wa.me/923117798157" target="_blank" style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "10.5px",
              color: "#059669",
              textDecoration: "none",
              fontWeight: 600,
            }}>
              WhatsApp
            </a>
            <a href="tel:03117798157" style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "10.5px",
              color: "#475569",
              textDecoration: "none",
              fontWeight: 600,
            }}>
              0311-7798157
            </a>
            <a href="mailto:siqbalhwc@gmail.com" style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "10.5px",
              color: "#475569",
              textDecoration: "none",
              fontWeight: 600,
            }}>
              siqbalhwc@gmail.com
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}