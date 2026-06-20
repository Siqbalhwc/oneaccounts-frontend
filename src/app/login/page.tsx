"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Eye, EyeOff } from "lucide-react"

// ── Login page for OneAccounts ──

// ── Segment Outcome Data ──
const OUTCOME_DATA = {
  ngo: {
    label: "With OneAccounts, NGOs can",
    items: [
      "Track donor balances and fund utilization in real time across 100+ projects simultaneously.",
      "Prevent budget overruns before they happen — with approval workflows and budget engine.",
      "Generate donor reports, audit-ready financials in minutes.",
      "Replace Excel sheets and manual processes with one secure cloud platform.",
      "Stay compliant with complete audit logs and role-based access control.",
    ],
  },
  trading: {
    label: "With OneAccounts, trading businesses can",
    items: [
      "Manage 500+ SKUs with real-time stock levels, and purchase orders.",
      "Control receivables and payables — see exactly who owes what and when it is due.",
      "Calculate WHT and Sales Tax automatically — no manual spreadsheet reconciliation.",
      "Track cash flow in real time and prevent overdue invoice surprises.",
      "Generate profit & loss, balance sheet, in one click.",
    ],
  },
  service: {
    label: "With OneAccounts, service organizations can",
    items: [
      "Track costs, and profitability across multiple clients simultaneously.",
      "Invoice customers accurately with time, expense, and milestone-based billing.",
      "Monitor overdue payments and send reminders without leaving the platform.",
      "Generate management accounts and client profitability reports instantly.",
    ],
  },
}

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [isSignUp, setIsSignUp] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [activeSegment, setActiveSegment] = useState<"ngo" | "trading" | "service">("ngo")

  // ── Invite token handling ──
  const [inviteStatus, setInviteStatus] = useState<"idle" | "processing" | "expired">("idle")

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
        .then(({ error }) => {
          if (error) {
            setInviteStatus("expired")
            window.history.replaceState(null, "", "/login")
          } else {
            window.location.href = "/dashboard"
          }
        })
    }
  }, [])

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
      : await supabase.auth.signInWithPassword({
          email,
          password,
          options: { persistSession: rememberMe } as any,
        })

    if (authError) {
      setError(
        isSignUp
          ? "Sign up failed — this email may already be registered."
          : "Incorrect email or password. Please try again."
      )
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

  // ── Render ──
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body {
          height: 100%;
          font-family: 'Plus Jakarta Sans', sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        /* ═══════════════════════════════════════
           BACKGROUND — deeper, richer navy-to-indigo
        ═══════════════════════════════════════ */
        .oa-shell {
          display: flex;
          min-height: 100vh;
          min-height: 100dvh;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
          overflow: hidden;
          background: #060F38;
        }

        .oa-water-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          background:
            linear-gradient(160deg,
              #060F38 0%,
              #0A1B5E 22%,
              #0E2C8C 48%,
              #122E78 72%,
              #060F38 100%);
        }

        .oa-water-bg::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 70% 38% at 18% 18%, rgba(99,140,255,0.22) 0%, transparent 60%),
            radial-gradient(ellipse 55% 30% at 85% 30%, rgba(56,189,248,0.14) 0%, transparent 55%),
            radial-gradient(ellipse 90% 46% at 50% 92%, rgba(20,40,140,0.35) 0%, transparent 65%);
          animation: waterShimmer 9s ease-in-out infinite alternate;
        }

        .oa-water-bg::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 60px,
              rgba(255,255,255,0.016) 60px,
              rgba(255,255,255,0.016) 61px
            ),
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 80px,
              rgba(255,255,255,0.01) 80px,
              rgba(255,255,255,0.01) 81px
            );
          animation: waterRipple 12s linear infinite;
        }

        .oa-waves {
          position: fixed;
          bottom: 0;
          left: 0;
          width: 100%;
          z-index: 0;
          opacity: 0.16;
        }
        .oa-waves .wave1 { animation: waveMove 7s linear infinite; }
        .oa-waves .wave2 { animation: waveMove 10s linear infinite reverse; opacity: 0.6; }
        .oa-waves .wave3 { animation: waveMove 13s linear infinite; opacity: 0.4; }

        @keyframes waterShimmer {
          0%   { opacity: 0.6; transform: scale(1); }
          100% { opacity: 1;   transform: scale(1.04); }
        }
        @keyframes waterRipple {
          0%   { transform: translateY(0); }
          100% { transform: translateY(61px); }
        }
        @keyframes waveMove {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        .oa-particle {
          position: fixed;
          border-radius: 50%;
          background: rgba(125, 211, 252, 0.14);
          animation: particleFloat linear infinite;
          z-index: 0;
          pointer-events: none;
        }
        @keyframes particleFloat {
          0%   { transform: translateY(100vh) scale(0); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.6; }
          100% { transform: translateY(-10vh) scale(1); opacity: 0; }
        }

        /* ═══════════════════════════════════════
           COLUMNS — balanced ratio, no dead space
        ═══════════════════════════════════════ */
        .oa-columns {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: stretch;
          gap: 4px;
          width: 100%;
          max-width: 1140px;
          border-radius: 22px;
        }

        .oa-left {
          flex: 1.85;
          background: rgba(8, 20, 74, 0.86);
          backdrop-filter: blur(18px) saturate(1.4);
          -webkit-backdrop-filter: blur(18px) saturate(1.4);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 22px;
          box-shadow:
            0 24px 70px rgba(0,0,0,0.45),
            0 4px 16px rgba(0,0,0,0.30);
          display: flex;
          flex-direction: column;
          padding: 30px 38px;
          position: relative;
          overflow: hidden;
        }

        .oa-left .oa-scroll {
          overflow-y: auto;
          flex: 1;
          padding-right: 4px;
        }
        .oa-left .oa-scroll::-webkit-scrollbar { width: 3px; }
        .oa-left .oa-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.15);
          border-radius: 4px;
        }

        .oa-dots {
          position: absolute; inset: 0;
          background-image: radial-gradient(rgba(255,255,255,0.04) 1.2px, transparent 1.2px);
          background-size: 28px 28px;
          pointer-events: none; z-index: 0;
        }
        .oa-glow {
          position: absolute; top: -100px; right: -100px;
          width: 380px; height: 380px; border-radius: 50%;
          background: radial-gradient(circle, rgba(56,189,248,0.18) 0%, transparent 68%);
          pointer-events: none; z-index: 0;
        }
        .oa-glow2 {
          position: absolute; bottom: -80px; left: -50px;
          width: 280px; height: 280px; border-radius: 50%;
          background: radial-gradient(circle, rgba(99,140,255,0.16) 0%, transparent 68%);
          pointer-events: none; z-index: 0;
        }

        /* Brand */
        .oa-brand {
          display: flex; align-items: center; gap: 14px;
          position: relative; z-index: 2;
          margin-bottom: 18px;
        }
        .oa-brand-logo {
          width: 46px; height: 46px;
          border-radius: 12px; object-fit: contain; flex-shrink: 0;
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        }
        .oa-brand-name {
          font-size: 21px; font-weight: 800; color: white; line-height: 1.2;
        }
        .oa-brand-sub {
          font-size: 11px; color: rgba(255,255,255,0.42); margin-top: 2px;
        }

        /* Badge */
        .oa-badge {
          display: inline-flex; align-items: center; gap: 7px;
          background: rgba(56,189,248,0.12);
          border: 1px solid rgba(56,189,248,0.28);
          border-radius: 100px; padding: 4px 13px;
          margin-bottom: 16px; width: fit-content;
        }
        .oa-badge-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #38BDF8;
          box-shadow: 0 0 0 3px rgba(56,189,248,0.28);
          flex-shrink: 0;
          animation: badgePulse 2.4s ease-in-out infinite;
        }
        @keyframes badgePulse {
          0%,100% { box-shadow: 0 0 0 3px rgba(56,189,248,0.28); }
          50%      { box-shadow: 0 0 0 6px rgba(56,189,248,0.10); }
        }
        .oa-badge-txt {
          font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; color: #BAE6FD;
        }
        /* Hero */
        .oa-hero { position: relative; z-index: 2; }
        .oa-headline {
          font-size: 30px; font-weight: 800; color: white;
          line-height: 1.12; letter-spacing: -0.8px;
          margin-bottom: 22px;
        }
        .oa-headline-grad {
          background: linear-gradient(90deg, #7DD3FC, #A5B4FC);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* Segments */
        .oa-seg-label {
          font-size: 10px; color: rgba(255,255,255,0.42);
          font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
          margin-bottom: 7px; display: block;
        }
        .oa-segments {
          display: grid; grid-template-columns: repeat(4, 1fr);
          gap: 8px; margin-bottom: 18px;
        }
        .oa-seg {
          background: rgba(255,255,255,0.045);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 10px; padding: 10px 8px;
          cursor: pointer; transition: all 0.2s;
          position: relative;
        }
        .oa-seg:hover { border-color: rgba(56,189,248,0.35); background: rgba(255,255,255,0.07); }
        .oa-seg.active {
          border-color: #38BDF8; background: rgba(56,189,248,0.13);
          box-shadow: 0 0 24px rgba(56,189,248,0.10);
        }
        .oa-seg.coming { opacity: 0.4; cursor: default; }
        .oa-seg.coming:hover { border-color: rgba(255,255,255,0.09); background: rgba(255,255,255,0.045); }
        .oa-seg-badge {
          position: absolute; top: 4px; right: 5px;
          font-size: 7px; font-weight: 700;
          color: rgba(255,255,255,0.35);
          background: rgba(255,255,255,0.07);
          padding: 1px 6px; border-radius: 4px;
        }
        .oa-seg-icon i { font-size: 18px; color: #7DD3FC; }
        .oa-seg-title {
          font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.92);
          margin-top: 5px; margin-bottom: 1px;
        }
        .oa-seg-desc { font-size: 9px; color: rgba(255,255,255,0.38); line-height: 1.3; }
        .oa-seg.coming .oa-seg-title { color: rgba(255,255,255,0.3); }
        .oa-seg.coming .oa-seg-icon i { color: rgba(255,255,255,0.2); }

        /* Outcomes */
        .oa-outcomes-section { margin-bottom: 20px; }
        .oa-outcomes-label {
          font-size: 10px; color: rgba(255,255,255,0.42);
          font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
          margin-bottom: 8px; display: block;
        }
        .oa-outcomes { display: flex; flex-direction: column; gap: 6px; }
        .oa-outcome {
          display: flex; align-items: flex-start; gap: 7px;
          font-size: 12px; color: rgba(255,255,255,0.66); line-height: 1.55;
        }
        .oa-outcome i { color: #4ADE80; font-size: 13px; margin-top: 1px; flex-shrink: 0; }

        /* Why Cards */
        .oa-why-label {
          font-size: 10px; color: rgba(255,255,255,0.42);
          font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
          margin-bottom: 9px; display: block;
        }
        .oa-why-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-bottom: 18px; }
        .oa-why {
          display: flex; align-items: flex-start; gap: 9px;
          padding: 12px 13px;
          background: rgba(255,255,255,0.04);
          border-left: 2.5px solid #38BDF8;
          border-top: 0.5px solid rgba(255,255,255,0.06);
          border-right: 0.5px solid rgba(255,255,255,0.06);
          border-bottom: 0.5px solid rgba(255,255,255,0.06);
          border-radius: 0 8px 8px 0;
        }
        .oa-why i { font-size: 15px; color: #7DD3FC; flex-shrink: 0; margin-top: 1px; }
        .oa-why-title { font-size: 11.5px; font-weight: 700; color: rgba(255,255,255,0.88); margin-bottom: 2px; }
        .oa-why-desc { font-size: 9.5px; color: rgba(255,255,255,0.4); line-height: 1.45; }

        .oa-switch-row-bottom {
          display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
          padding: 9px 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 8px;
        }
        .oa-switch-label { font-size: 10px; color: rgba(255,255,255,0.62); font-weight: 500; }
        .oa-switch-pill {
          font-size: 9px; color: rgba(255,255,255,0.82);
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
          padding: 2px 8px; border-radius: 4px; font-weight: 500;
        }
        .oa-switch-arrow { color: rgba(255,255,255,0.22); font-size: 9px; }
        .oa-switch-note { font-size: 9px; color: rgba(255,255,255,0.42); margin-left: 2px; }

        .oa-footer-txt {
          font-size: 9px; color: rgba(255,255,255,0.16);
          position: relative; z-index: 2; margin-top: 12px;
        }

        /* ═══════════════════════════════════════
           RIGHT PANEL — single card, contains EVERYTHING
        ═══════════════════════════════════════ */
        .oa-right {
          flex: 1;
          display: flex;
          background: linear-gradient(165deg, #f7f9ff 0%, #eef2fb 100%);
          border-radius: 22px;
          box-shadow:
            0 24px 70px rgba(0,0,0,0.45),
            0 4px 16px rgba(0,0,0,0.30);
          overflow: hidden;
        }

        .oa-form-wrap {
          width: 100%;
          display: flex;
          flex-direction: column;
        }

        .oa-card {
          background: transparent;
          display: flex;
          flex-direction: column;
          flex: 1;
          height: 100%;
        }
        .oa-card-head {
          padding: 32px 34px 18px;
          text-align: center;
          flex-shrink: 0;
        }
        .oa-card-body {
          padding: 4px 34px 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .oa-card-foot {
          padding: 16px 34px 18px;
          border-top: 1px solid #E3E8F5;
          background: rgba(23,64,200,0.025);
          text-align: center;
          flex-shrink: 0;
        }

        .oa-card-logo {
          width: 44px; height: 44px; border-radius: 12px;
          object-fit: contain; margin: 0 auto 10px; display: block;
        }
        .oa-secure-badge {
          display: inline-flex; align-items: center; gap: 5px;
          background: linear-gradient(135deg, #EEF2FF, #E0EAFE);
          border: 1px solid #C7D2FE; border-radius: 100px;
          padding: 3px 11px; margin-bottom: 9px;
          font-size: 9.5px; color: #3730A3; font-weight: 700; letter-spacing: 0.05em;
        }
        .oa-title {
          font-size: 21px; font-weight: 800; color: #0F172A;
          letter-spacing: -0.4px; margin-bottom: 4px;
        }
        .oa-subtitle { font-size: 12.5px; color: #64748B; }
        .oa-subtitle strong { color: #1740C8; font-weight: 700; }

        .oa-label {
          display: block; font-size: 10px; font-weight: 700;
          color: #64748B; letter-spacing: 0.07em; text-transform: uppercase;
          margin-bottom: 5px;
        }
        .oa-input-wrap { position: relative; margin-bottom: 13px; }
        .oa-input {
          width: 100%; height: 42px;
          border: 1.5px solid #E2E8F5; border-radius: 10px;
          padding: 0 40px 0 14px;
          font-size: 13.5px; font-family: inherit;
          color: #0F172A; background: #FBFCFF;
          transition: border-color 0.18s, box-shadow 0.18s;
          outline: none;
        }
        .oa-input:focus {
          border-color: #1740C8;
          box-shadow: 0 0 0 3.5px rgba(23,64,200,0.10);
          background: white;
        }
        .oa-input::placeholder { color: #C1CBDA; font-size: 12.5px; }
        .oa-eye {
          position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: #94A3B8; display: flex; align-items: center; padding: 4px;
        }
        .oa-eye:hover { color: #475569; }

        .oa-forgot-row {
          display: flex; justify-content: space-between; align-items: center;
          margin-top: -5px; margin-bottom: 15px;
        }
        .oa-forgot {
          font-size: 11.5px; color: #1740C8; font-weight: 600;
          text-decoration: none; background: none; border: none;
          cursor: pointer; font-family: inherit;
        }
        .oa-forgot:hover { text-decoration: underline; }

        .oa-btn {
          width: 100%; height: 44px;
          background: linear-gradient(135deg, #1E55E8 0%, #0B1C6E 100%);
          border: none; border-radius: 10px;
          font-size: 14px; font-weight: 700; color: white;
          font-family: inherit; cursor: pointer;
          box-shadow: 0 6px 18px rgba(11,28,110,0.32);
          transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .oa-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #2D63F6 0%, #102590 100%);
          transform: translateY(-1px);
          box-shadow: 0 8px 22px rgba(11,28,110,0.40);
        }
        .oa-btn:disabled { opacity: 0.68; cursor: not-allowed; }

        .oa-spinner {
          width: 14px; height: 14px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: white;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .oa-ssl { font-size: 10px; color: #94A3B8; padding: 7px 0 0; text-align: center; }

        .oa-divider { display: flex; align-items: center; gap: 10px; margin: 14px 0; }
        .oa-div-line { flex: 1; height: 1px; background: #E3E8F5; }
        .oa-div-txt { font-size: 10.5px; color: #98A6BD; font-weight: 600; }

        .oa-trial-btn {
          display: flex; align-items: center; justify-content: center;
          width: 100%; height: 44px;
          background: linear-gradient(135deg, #10B981 0%, #047857 100%);
          border: none; border-radius: 10px;
          font-size: 12.5px; font-weight: 700; color: white;
          font-family: inherit; cursor: pointer; text-decoration: none;
          box-shadow: 0 6px 16px rgba(5,150,105,0.30);
          transition: all 0.2s;
        }
        .oa-trial-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(5,150,105,0.40);
        }
        .oa-trial-note { font-size: 10px; color: #94A3B8; margin-top: 6px; text-align: center; }

        .oa-switch-row { text-align: center; margin-top: 11px; }
        .oa-switch {
          background: none; border: none;
          font-size: 12px; color: #1740C8; font-weight: 600;
          cursor: pointer; font-family: inherit; text-decoration: underline;
        }

        .oa-error {
          background: #FEF2F2; border: 1px solid #FECACA;
          border-radius: 8px; padding: 9px 12px;
          font-size: 12px; color: #B91C1C; margin-bottom: 12px;
        }
        .oa-success {
          background: #F0FDF4; border: 1px solid #BBF7D0;
          border-radius: 8px; padding: 9px 12px;
          font-size: 12px; color: #15803D; margin-bottom: 12px;
        }

        /* Urgency banner — inside the card body, not floating below it */
        .oa-urgency {
          display: flex; align-items: center; gap: 7px;
          background: linear-gradient(135deg, rgba(245,158,11,0.10), rgba(217,119,6,0.06));
          border: 1px solid rgba(217,119,6,0.22);
          border-radius: 9px;
          padding: 8px 13px;
          font-size: 10.5px; color: #92400E; font-weight: 600;
          margin-top: 22px;
          margin-bottom: 14px;
        }
        .oa-urgency i { font-size: 14px; color: #D97706; flex-shrink: 0; }

        .oa-steps-block { padding: 0 0 14px; }
        .oa-steps-label {
          font-size: 9px; color: #94A3B8;
          font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
          text-align: center; margin-bottom: 8px;
        }
        .oa-steps { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
        .oa-step { display: flex; align-items: center; gap: 6px; }
        .oa-step-num {
          width: 20px; height: 20px; border-radius: 50%;
          background: linear-gradient(135deg, #1740C8, #0B1C6E);
          display: flex; align-items: center; justify-content: center;
          font-size: 9px; font-weight: 700; color: #fff; flex-shrink: 0;
        }
        .oa-step-text { font-size: 9.5px; color: #64748B; font-weight: 600; white-space: nowrap; }
        .oa-step-arrow { color: #94A3B8; font-size: 13px; flex-shrink: 0; }

        /* Card Foot — single contact set, no duplication */
        .oa-card-contact {
          display: flex; flex-wrap: wrap; justify-content: center;
          gap: 6px 14px;
          margin-top: 2px;
        }
        .oa-card-contact a {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10.5px; color: #475569; text-decoration: none;
          font-weight: 600;
          transition: color 0.15s;
        }
        .oa-card-contact a:hover { color: #1E293B; }
        .oa-card-contact .wa { color: #059669; }
        .oa-card-contact .wa:hover { color: #047857; }
        .oa-card-contact i { font-size: 13px; margin-right: 2px; }

        /* ═══════════════════════════════════════
           RESPONSIVE
        ═══════════════════════════════════════ */
        @media (max-width: 1023px) and (min-width: 768px) {
          .oa-columns { max-width: 900px; }
          .oa-left { padding: 24px 24px; flex: 1.3; }
          .oa-headline { font-size: 24px; }
          .oa-glow { width: 200px; height: 200px; }
          .oa-segments { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 767px) {
          .oa-shell { padding: 0; align-items: flex-start; }
          .oa-columns { flex-direction: column; max-width: 100%; gap: 0; border-radius: 0; }

          .oa-left { flex: unset; width: 100%; padding: 16px 18px; border-radius: 0; box-shadow: none; }
          .oa-left .oa-scroll { max-height: none; overflow-y: visible; }
          .oa-brand { margin-bottom: 8px; }
          .oa-brand-logo { width: 32px; height: 32px; }
          .oa-brand-name { font-size: 16px; }
          .oa-brand-sub { font-size: 9px; }
          .oa-headline { font-size: 21px; }
          .oa-segments { grid-template-columns: repeat(2, 1fr); }
          .oa-why-grid { grid-template-columns: 1fr; }
          .oa-glow, .oa-glow2, .oa-dots { display: none; }

          .oa-right { padding: 0; flex: unset; border-radius: 0; box-shadow: none; }
          .oa-card-head, .oa-card-body, .oa-card-foot { padding-left: 18px; padding-right: 18px; }
          .oa-card-head { padding-top: 22px; }
          .oa-steps .oa-step-text { font-size: 8px; }
          .oa-switch-row-bottom { padding: 7px 10px; }
          .oa-card-contact { gap: 5px 10px; }
          .oa-card-contact a { font-size: 9.5px; }
        }

        @media (max-width: 480px) {
          .oa-segments { grid-template-columns: 1fr 1fr; }
          .oa-why-grid { grid-template-columns: 1fr; }
          .oa-headline { font-size: 19px; }
          .oa-left { padding: 14px 16px; }
        }

        @media (min-width: 1400px) {
          .oa-columns { max-width: 1220px; }
          .oa-left { padding: 38px 50px; }
          .oa-headline { font-size: 38px; }
        }

        @media (min-width: 1920px) {
          .oa-columns { max-width: 1560px; }
          .oa-left { padding: 50px 66px; }
          .oa-headline { font-size: 46px; }
          .oa-brand-name { font-size: 25px; }
          .oa-brand-logo { width: 54px; height: 54px; }
          .oa-title { font-size: 25px; }
          .oa-btn, .oa-trial-btn { height: 50px; font-size: 15px; }
          .oa-input { height: 48px; font-size: 14px; }
        }
      `}</style>

      {/* ══ WATER BACKGROUND ══ */}
      <div className="oa-water-bg" />

      {/* Floating particles */}
      {[
        { left: "10%", size: 4, duration: "12s", delay: "0s" },
        { left: "25%", size: 6, duration: "16s", delay: "3s" },
        { left: "42%", size: 3, duration: "10s", delay: "6s" },
        { left: "60%", size: 5, duration: "14s", delay: "1s" },
        { left: "75%", size: 4, duration: "18s", delay: "4s" },
        { left: "88%", size: 6, duration: "11s", delay: "8s" },
      ].map((p, i) => (
        <div
          key={i}
          className="oa-particle"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animationDuration: p.duration,
            animationDelay: p.delay,
          }}
        />
      ))}

      {/* Water wave SVG */}
      <svg className="oa-waves" viewBox="0 0 1440 160" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path className="wave1" d="M0,80 C240,20 480,140 720,80 C960,20 1200,140 1440,80 L1440,80 C1200,140 960,20 720,80 C480,140 240,20 0,80 Z M1440,80 C1680,20 1920,140 2160,80 C2400,20 2640,140 2880,80 L2880,80 C2640,140 2400,20 2160,80 C1920,140 1680,20 1440,80 Z" fill="rgba(100,160,255,0.4)" />
        <path className="wave2" d="M0,100 C360,40 720,160 1080,100 C1440,40 1800,160 2160,100 L2160,160 L0,160 Z M2160,100 C2520,40 2880,160 3240,100 L3240,160 L2160,160 Z" fill="rgba(70,130,220,0.3)" />
        <path className="wave3" d="M0,120 C480,80 960,160 1440,120 C1920,80 2400,160 2880,120 L2880,160 L0,160 Z" fill="rgba(50,100,200,0.25)" />
      </svg>

      {/* ══ MAIN LAYOUT ══ */}
      <div className="oa-shell">
        <div className="oa-columns">

          {/* ══ LEFT PANEL — Marketing content ══ */}
          <div className="oa-left">
            <div className="oa-dots" />
            <div className="oa-glow" />
            <div className="oa-glow2" />

            <div className="oa-scroll">

              {/* Brand */}
              <div className="oa-brand">
                <img src="/logo.png" alt="OneAccounts" className="oa-brand-logo" />
                <div>
                  <div className="oa-brand-name">OneAccounts</div>
                  <div className="oa-brand-sub">by Siqbal · PKR Suite</div>
                </div>
              </div>

              {/* Badge */}
              <div className="oa-badge">
                <div className="oa-badge-dot" />
                <span className="oa-badge-txt">Cloud Finance &amp; ERP · Built for Pakistan</span>
              </div>

              {/* Hero */}
              <div className="oa-hero">
                <div className="oa-headline">
                  Control Your Finances.<br />
                  <span className="oa-headline-grad">Grow Your Organization.</span>
                </div>
              </div>

              {/* Segments */}
              <span className="oa-seg-label">Who is it for — select your organization</span>
              <div className="oa-segments">
                <div
                  className={`oa-seg ${activeSegment === "ngo" ? "active" : ""}`}
                  onClick={() => setActiveSegment("ngo")}
                >
                  <div className="oa-seg-icon"><i className="ti ti-building-community" aria-hidden="true"></i></div>
                  <div className="oa-seg-title">NGOs &amp; Development</div>
                  <div className="oa-seg-desc">Donors, budgets, fund utilization</div>
                </div>
                <div
                  className={`oa-seg ${activeSegment === "trading" ? "active" : ""}`}
                  onClick={() => setActiveSegment("trading")}
                >
                  <div className="oa-seg-icon"><i className="ti ti-package" aria-hidden="true"></i></div>
                  <div className="oa-seg-title">Trading Businesses</div>
                  <div className="oa-seg-desc">Inventory, taxes, cash flow</div>
                </div>
                <div
                  className={`oa-seg ${activeSegment === "service" ? "active" : ""}`}
                  onClick={() => setActiveSegment("service")}
                >
                  <div className="oa-seg-icon"><i className="ti ti-tool" aria-hidden="true"></i></div>
                  <div className="oa-seg-title">Service Organizations</div>
                  <div className="oa-seg-desc">Projects, billing, profitability</div>
                </div>
                <div className="oa-seg coming">
                  <span className="oa-seg-badge">Soon</span>
                  <div className="oa-seg-icon"><i className="ti ti-building-factory" aria-hidden="true"></i></div>
                  <div className="oa-seg-title">Manufacturing</div>
                  <div className="oa-seg-desc">Production, costing, MRP</div>
                </div>
              </div>

              {/* Outcomes */}
              <div className="oa-outcomes-section">
                <span className="oa-outcomes-label">{OUTCOME_DATA[activeSegment].label}</span>
                <div className="oa-outcomes">
                  {OUTCOME_DATA[activeSegment].items.map((item, idx) => (
                    <div key={idx} className="oa-outcome">
                      <i className="ti ti-circle-check" aria-hidden="true" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              {/* Why Cards */}
              <span className="oa-why-label">Why organizations choose OneAccounts</span>
              <div className="oa-why-grid">
                <div className="oa-why">
                  <i className="ti ti-map-pin" aria-hidden="true" />
                  <div>
                    <div className="oa-why-title">Built for Pakistan</div>
                    <div className="oa-why-desc">Local tax workflows — WHT, Sales Tax, and business processes designed for Pakistani organizations.</div>
                  </div>
                </div>
                <div className="oa-why">
                  <i className="ti ti-cash" aria-hidden="true" />
                  <div>
                    <div className="oa-why-title">Budget control built-in</div>
                    <div className="oa-why-desc">Prevent overspending before it happens. PO approvals, budget engine, and real-time alerts included.</div>
                  </div>
                </div>
                <div className="oa-why">
                  <i className="ti ti-bolt" aria-hidden="true" />
                  <div>
                    <div className="oa-why-title">No implementation required</div>
                    <div className="oa-why-desc">Sign up and start using immediately. Import your existing data via Excel or CSV.</div>
                  </div>
                </div>
                <div className="oa-why">
                  <i className="ti ti-dashboard" aria-hidden="true" />
                  <div>
                    <div className="oa-why-title">Real-time visibility</div>
                    <div className="oa-why-desc">Monitor receivables, payables, donor balances, and project profitability on one dashboard.</div>
                  </div>
                </div>
              </div>

              {/* Switching from */}
              <div className="oa-switch-row-bottom">
                <span className="oa-switch-label">Switching from</span>
                <span className="oa-switch-pill">Excel</span>
                <span className="oa-switch-arrow">→</span>
                <span className="oa-switch-pill">QuickBooks</span>
                <span className="oa-switch-arrow">→</span>
                <span className="oa-switch-pill">Odoo</span>
                <span className="oa-switch-arrow">→</span>
                <span className="oa-switch-pill">Zoho</span>
                <span className="oa-switch-arrow">→</span>
                <span className="oa-switch-pill">Manual accounting</span>
                <span className="oa-switch-note">Import existing data in minutes.</span>
              </div>

              <div className="oa-footer-txt">© 2026 OneAccounts by Siqbal. All rights reserved.</div>

            </div>
          </div>

          {/* ══ RIGHT PANEL — login card. Everything lives inside this card now. ══ */}
          <div className="oa-right">
            <div className="oa-form-wrap">
              <div className="oa-card">

                {/* Head */}
                <div className="oa-card-head">
                  <img src="/logo.png" alt="OneAccounts" className="oa-card-logo" />
                  <div className="oa-secure-badge">🔒 SECURE LOGIN</div>
                  <div className="oa-title">{isSignUp ? "Create Account" : "Welcome back 👋"}</div>
                  <div className="oa-subtitle">
                    {isSignUp ? "Sign up for your " : "Sign in to your "}
                    <strong>OneAccounts</strong> workspace
                  </div>
                </div>

                {/* Body */}
                <div className="oa-card-body">

                  {inviteStatus === "processing" && (
                    <div className="oa-success">⏳ Verifying your invitation… please wait.</div>
                  )}
                  {inviteStatus === "expired" && (
                    <div className="oa-error">
                      ❌ This invitation link has expired or has already been used.<br />
                      <span style={{ fontSize: 11 }}>
                        Please use <strong>Forgot password?</strong> to set a password for your account.
                      </span>
                    </div>
                  )}

                  {error && (
                    <div className={error.startsWith("✅") ? "oa-success" : "oa-error"}>
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleAuth} noValidate>
                    <label className="oa-label" htmlFor="email">Email Address</label>
                    <div className="oa-input-wrap">
                      <input
                        id="email"
                        type="email"
                        className="oa-input"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        autoFocus
                        required
                      />
                    </div>

                    <label className="oa-label" htmlFor="password">Password</label>
                    <div className="oa-input-wrap">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        className="oa-input"
                        placeholder={isSignUp ? "Create a strong password" : "Enter your password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={isSignUp ? "new-password" : "current-password"}
                        required
                      />
                      <button
                        type="button"
                        className="oa-eye"
                        onClick={() => setShowPassword((p) => !p)}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>

                    {!isSignUp && (
                      <div className="oa-forgot-row">
                        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#64748B", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            style={{ width: "14px", height: "14px", accentColor: "#1740C8", cursor: "pointer" }}
                          />
                          Remember me
                        </label>
                        <a href="/forgot-password" className="oa-forgot">Forgot password?</a>
                      </div>
                    )}

                    <button type="submit" className="oa-btn" disabled={loading}>
                      {loading ? (
                        <>
                          <div className="oa-spinner" /> Please wait…
                        </>
                      ) : isSignUp ? (
                        "Create Account →"
                      ) : (
                        "Sign In →"
                      )}
                    </button>

                    <div className="oa-ssl">🔒 256-bit SSL encrypted · Your data is safe</div>
                  </form>

                  <div className="oa-switch-row">
                    <button
                      className="oa-switch"
                      onClick={() => {
                        setIsSignUp((s) => !s)
                        setError("")
                      }}
                    >
                      {isSignUp
                        ? "Already have an account? Sign in"
                        : "Don't have an account? Sign up"}
                    </button>
                  </div>

                  <div className="oa-divider">
                    <div className="oa-div-line" />
                    <span className="oa-div-txt">or</span>
                    <div className="oa-div-line" />
                  </div>

                  <a href="/signup" className="oa-trial-btn">
                    🚀 Start Free Trial (10 days · Professional Plan)
                  </a>
                  <p className="oa-trial-note">No credit card required. Create your company in seconds.</p>

                  {/* Urgency banner — now inside the card, not floating below it */}
                  <div className="oa-urgency">
                    <i className="ti ti-clock" aria-hidden="true" />
                    <span>Founding offer — first 50 organizations get 3 months free on any plan.</span>
                  </div>

                  {/* Steps — now inside the card */}
                  <div className="oa-steps-block">
                    <div className="oa-steps-label">How it works</div>
                    <div className="oa-steps">
                      <div className="oa-step">
                        <div className="oa-step-num">1</div>
                        <span className="oa-step-text">Sign up free</span>
                      </div>
                      <span className="oa-step-arrow">→</span>
                      <div className="oa-step">
                        <div className="oa-step-num">2</div>
                        <span className="oa-step-text">Import your data</span>
                      </div>
                      <span className="oa-step-arrow">→</span>
                      <div className="oa-step">
                        <div className="oa-step-num">3</div>
                        <span className="oa-step-text">Go live today</span>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Foot — single contact set, duplicate phone number removed */}
                <div className="oa-card-foot">
                  <div style={{ fontSize: "10.5px", color: "#64748B", marginBottom: "6px", fontWeight: 600 }}>
                    Need help? We're here for you.
                  </div>
                  <div className="oa-card-contact">
                    <a href="https://wa.me/923117798157" target="_blank" className="wa">
                      <i className="ti ti-brand-whatsapp" aria-hidden="true"></i> WhatsApp
                    </a>
                    <a href="tel:03117798157">
                      <i className="ti ti-phone" aria-hidden="true"></i> 0311-7798157
                    </a>
                    <a href="mailto:siqbalhwc@gmail.com">
                      <i className="ti ti-mail" aria-hidden="true"></i> siqbalhwc@gmail.com
                    </a>
                    <a href="https://www.oneaccountsbysiqbal.com" target="_blank">
                      <i className="ti ti-world" aria-hidden="true"></i> oneaccountsbysiqbal.com
                    </a>
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}