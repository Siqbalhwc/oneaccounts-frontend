"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import {
  Eye,
  EyeOff,
  Building2,
  Package,
  Wrench,
  Factory,
  MessageCircle,
  Landmark,
  ShoppingCart,
  ReceiptText,
  Phone,
  Mail,
  Globe,
} from "lucide-react"

// ── Segment Outcome Data ──
const OUTCOME_LINE = {
  ngo: "Track donor balances, enforce budgets, and generate audit-ready reports in real time.",
  trading: "Manage inventory, receivables, and tax — without manual spreadsheets.",
  service: "Bill clients accurately and see project profitability the moment it changes.",
}

// ── Dashboard Screenshot Paths ──
const DASHBOARD_IMAGES = {
  ngo: "/screenshots/ngo-dashboard.png",
  trading: "/screenshots/trading-dashboard.png",
  service: "/screenshots/trading-dashboard.png",
  manufacturing: null,
}

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [confirmEmail, setConfirmEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [isSignUp, setIsSignUp] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [activeSegment, setActiveSegment] = useState<"ngo" | "trading" | "service">("ngo")
  const [signUpSuccess, setSignUpSuccess] = useState(false)

  // ── Invite token handling ──
  const [inviteStatus, setInviteStatus] = useState<"idle" | "processing" | "expired">("idle")

  // ── Helper: Ensure user_roles exists after authentication ──
  const ensureUserRoles = async (userId: string) => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Check if user already has a user_roles record
    const { data: existingRoles, error: checkError } = await supabase
      .from("user_roles")
      .select("company_id, role")
      .eq("user_id", userId)
      .limit(1)

    if (checkError) {
      console.error("Error checking user_roles:", checkError)
      return null
    }

    // If user_roles exists, return the company_id
    if (existingRoles && existingRoles.length > 0) {
      return existingRoles[0]
    }

    // ── No user_roles found – try to auto-create ──

    // 1. Check if there's a company where this email is the admin
    const { data: userData } = await supabase.auth.getUser()
    const userEmail = userData?.user?.email

    if (userEmail) {
      // Look for a company where this email is the admin (via user_roles)
      // First, get all user_roles for this user across all companies (should be none, but just in case)
      // We'll try a different approach: find companies where this email is the only admin

      // Since we can't query auth.users.email from the client, we'll call an API
      const response = await fetch("/api/auth/ensure-user-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email: userEmail }),
      })

      if (response.ok) {
        const result = await response.json()
        if (result.company_id) {
          // Successfully linked to a company
          return { company_id: result.company_id, role: result.role || "admin" }
        }
      }
    }

    // 2. If still nothing, return null (will show error)
    return null
  }

  useEffect(() => {
    const hash = window.location.hash.substring(1)
    if (!hash) return

    const params = new URLSearchParams(hash)
    const accessToken = params.get("access_token")
    const refreshToken = params.get("refresh_token")
    const type = params.get("type")

    if (accessToken && refreshToken && type === "invite") {
      setInviteStatus("processing")
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      supabase.auth
        .setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        .then(async ({ error }) => {
          if (error) {
            setInviteStatus("expired")
            window.history.replaceState(null, "", "/login")
          } else {
            // After setting session, ensure user_roles exists
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
              const roles = await ensureUserRoles(user.id)
              if (roles) {
                // Redirect to dashboard
                window.location.href = "/dashboard"
              } else {
                setError("⚠️ Could not link your account to a company. Please contact support.")
                setInviteStatus("idle")
              }
            }
          }
        })
    }
  }, [])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSignUpSuccess(false)

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // ── SIGN UP with email verification ──
    if (isSignUp) {
      if (email !== confirmEmail) {
        setError("Email addresses do not match. Please confirm your email.")
        setLoading(false)
        return
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + "/login",
        },
      })

      if (signUpError) {
        setError(signUpError.message || "Sign up failed. Please try again.")
        setLoading(false)
        return
      }

      setSignUpSuccess(true)
      setError("")
      setLoading(false)
      setIsSignUp(false)
      return
    }

    // ── SIGN IN ──
    const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { persistSession: rememberMe } as any,
    })

    if (authError) {
      if (authError.message.includes("Email not confirmed")) {
        setError(
          "⚠️ Please verify your email address first. Check your inbox for the confirmation link."
        )
      } else {
        setError("Incorrect email or password. Please try again.")
      }
      setLoading(false)
      return
    }

    // ── SUCCESSFUL SIGN-IN: Check and ensure user_roles ──
    const userId = signInData.user?.id
    if (userId) {
      const roles = await ensureUserRoles(userId)
      if (!roles) {
        setError("⚠️ Your account is not linked to a company. Please contact support.")
        setLoading(false)
        return
      }
    }

    fetch("/api/log-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, userAgent: navigator.userAgent }),
    }).catch(() => {})

    window.location.href = "/dashboard"
  }

  // ── REST OF YOUR UI (same as before, no changes) ──
  // (The entire JSX from your original file goes here)
  // I've omitted it for brevity – it's identical to what you already have.
  // You can keep your existing JSX unchanged.

  return (
    <div>
      {/* Your existing UI goes here – copy it from your current file */}
      <p>Your existing UI remains unchanged.</p>
    </div>
  )
}