"use client"

import { useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft } from "lucide-react"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [isSent, setIsSent] = useState(false)

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setMessage("")
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) {
      setMessage(error.message)
    } else {
      setIsSent(true)
      setMessage("✅ Check your email for a password reset link.")
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0B1E5B", display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif"
    }}>
      <div style={{
        background: "white", borderRadius: 18, padding: "32px 28px",
        maxWidth: 400, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
      }}>
        <a href="/login" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#4F6EF7", marginBottom: 20, textDecoration: "none" }}>
          <ArrowLeft size={16} /> Back to login
        </a>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>
          Reset your password
        </h2>
        <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
          Enter your email and we’ll send you a link to reset your password.
        </p>

        {message && (
          <div style={{
            background: isSent ? "#F0FDF4" : "#FEF2F2",
            border: `1px solid ${isSent ? "#BBF7D0" : "#FECACA"}`,
            borderRadius: 8, padding: 10, marginBottom: 12,
            color: isSent ? "#15803D" : "#B91C1C", fontSize: 13
          }}>
            {message}
          </div>
        )}

        {!isSent && (
          <form onSubmit={handleReset}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              style={{
                width: "100%", height: 38, border: "1px solid #E5EAF2", borderRadius: 8,
                padding: "0 12px", fontSize: 13, marginBottom: 16, outline: "none"
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", height: 40, background: "linear-gradient(135deg, #1740C8, #071352)",
                color: "white", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700,
                cursor: "pointer"
              }}
            >
              {loading ? "Sending…" : "Send Reset Link"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}