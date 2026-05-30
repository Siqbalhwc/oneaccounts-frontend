"use client"

import { useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Eye, EyeOff } from "lucide-react"

const PILLS = [
  "Journal Entries", "Sales & Purchase", "Balance Sheet",
  "Customers & Vendors", "PKR Native", "100% Cloud",
]
const STATS = [
  { value: "14+",  label: "Modules"   },
  { value: "100%", label: "Cloud"     },
  { value: "PKR",  label: "Currency"  },
  { value: "Live", label: "Real-time" },
]

export default function LoginPage() {
  const [email,        setEmail]        = useState("")
  const [password,     setPassword]     = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState("")
  const [isSignUp,     setIsSignUp]     = useState(false)

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
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body {
          height: 100%;
          font-family: 'Plus Jakarta Sans', sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        /* ═══════════════════════════════════════
           SHELL
        ═══════════════════════════════════════ */
        .oa-shell {
          display: flex;
          min-height: 100vh;
          min-height: 100dvh;
          background: #EEF2FB;
        }

        /* ═══════════════════════════════════════
           LEFT PANEL
        ═══════════════════════════════════════ */
        .oa-left {
          width: 52%;
          flex-shrink: 0;
          background: linear-gradient(155deg,
            #04092E 0%, #071352 18%, #0F2280 42%, #1740C8 74%, #1E55E8 100%);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 44px 52px;
          position: relative;
          overflow: hidden;
        }

        /* background texture */
        .oa-dots {
          position: absolute; inset: 0;
          background-image: radial-gradient(rgba(255,255,255,0.055) 1.2px, transparent 1.2px);
          background-size: 28px 28px;
          pointer-events: none; z-index: 0;
        }
        .oa-glow {
          position: absolute; top: -130px; right: -130px;
          width: 420px; height: 420px; border-radius: 50%;
          background: radial-gradient(circle, rgba(100,149,255,0.22) 0%, transparent 68%);
          pointer-events: none; z-index: 0;
        }
        .oa-glow2 {
          position: absolute; bottom: -100px; left: -60px;
          width: 300px; height: 300px; border-radius: 50%;
          background: radial-gradient(circle, rgba(55,80,200,0.18) 0%, transparent 68%);
          pointer-events: none; z-index: 0;
        }

        /* brand */
        .oa-brand {
          display: flex; align-items: center; gap: 14px;
          position: relative; z-index: 2;
        }
        .oa-brand-logo {
          width: 48px; height: 48px;
          border-radius: 12px; object-fit: contain; flex-shrink: 0;
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        }
        .oa-brand-name {
          font-size: 22px; font-weight: 800; color: white; line-height: 1.2;
        }
        .oa-brand-sub {
          font-size: 11px; color: rgba(255,255,255,0.42); margin-top: 2px;
        }

        /* badge */
        .oa-badge {
          display: inline-flex; align-items: center; gap: 7px;
          background: rgba(255,255,255,0.10);
          border: 1px solid rgba(255,255,255,0.20);
          border-radius: 100px; padding: 5px 14px;
          margin-bottom: 18px; width: fit-content;
        }
        .oa-badge-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #60A5FA;
          box-shadow: 0 0 0 3px rgba(96,165,250,0.28);
          flex-shrink: 0;
          animation: badgePulse 2.4s ease-in-out infinite;
        }
        @keyframes badgePulse {
          0%,100% { box-shadow: 0 0 0 3px rgba(96,165,250,0.28); }
          50%      { box-shadow: 0 0 0 6px rgba(96,165,250,0.10); }
        }
        .oa-badge-txt {
          font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
          text-transform: uppercase; color: rgba(255,255,255,0.82);
        }

        /* hero */
        .oa-hero {
          position: relative; z-index: 2;
          flex: 1; display: flex; flex-direction: column;
          justify-content: center; padding: 32px 0;
        }
        .oa-headline {
          font-size: 42px; font-weight: 800; color: white;
          line-height: 1.10; letter-spacing: -0.8px;
          margin-bottom: 14px;
        }
        .oa-headline-grad {
          background: linear-gradient(90deg, #93C5FD, #818CF8);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .oa-desc {
          font-size: 13.5px; color: rgba(255,255,255,0.56);
          line-height: 1.72; max-width: 400px; margin-bottom: 22px; font-weight: 400;
        }
        .oa-pills { display: flex; flex-wrap: wrap; gap: 8px; }
        .oa-pill {
          background: rgba(255,255,255,0.09);
          border: 1px solid rgba(255,255,255,0.16);
          border-radius: 8px; padding: 6px 13px;
          font-size: 11.5px; color: rgba(255,255,255,0.82); font-weight: 500;
        }

        /* stats */
        .oa-stats {
          position: relative; z-index: 2;
          border-top: 1px solid rgba(255,255,255,0.12);
          padding-top: 20px;
          display: grid; grid-template-columns: repeat(4, 1fr);
          gap: 0;
        }
        .oa-stat { padding-right: 16px; }
        .oa-stat + .oa-stat {
          padding-left: 16px;
          border-left: 1px solid rgba(255,255,255,0.10);
        }
        .oa-stat-val {
          font-size: 26px; font-weight: 800; color: white; line-height: 1;
        }
        .oa-stat-lbl {
          font-size: 10px; color: rgba(255,255,255,0.36);
          text-transform: uppercase; letter-spacing: 0.10em; margin-top: 5px;
        }
        .oa-footer-txt {
          font-size: 10px; color: rgba(255,255,255,0.18);
          position: relative; z-index: 2; margin-top: 14px;
        }

        /* ═══════════════════════════════════════
           RIGHT PANEL
        ═══════════════════════════════════════ */
        .oa-right {
          flex: 1;
          display: flex; align-items: center; justify-content: center;
          padding: 40px 48px;
          background: #EEF2FB;
          overflow-y: auto;
        }
        .oa-form-wrap { width: 100%; max-width: 400px; }

        /* ═══════════════════════════════════════
           CARD
        ═══════════════════════════════════════ */
        .oa-card {
          background: white; border-radius: 18px;
          border: 1px solid #DDE4F2;
          box-shadow:
            0 20px 60px rgba(15,35,120,0.13),
            0 6px 18px rgba(0,0,0,0.06);
          overflow: hidden;
        }
        .oa-card-head {
          padding: 26px 28px 20px;
          border-bottom: 1px solid #F0F2F9;
          text-align: center;
        }
        .oa-card-body { padding: 22px 28px; }
        .oa-card-foot {
          padding: 16px 28px 20px;
          border-top: 1px solid #F0F2F9;
          background: #F8FAFF;
          text-align: center;
        }

        /* card head content */
        .oa-card-logo {
          width: 62px; height: 62px; border-radius: 14px;
          object-fit: contain; margin: 0 auto 12px; display: block;
        }
        .oa-secure-badge {
          display: inline-flex; align-items: center; gap: 5px;
          background: linear-gradient(135deg, #EEF2FF, #E8EFFE);
          border: 1px solid #C7D2FE; border-radius: 100px;
          padding: 4px 12px; margin-bottom: 10px;
          font-size: 10px; color: #4338CA; font-weight: 700; letter-spacing: 0.05em;
        }
        .oa-title {
          font-size: 21px; font-weight: 800; color: #0F172A;
          letter-spacing: -0.4px; margin-bottom: 4px;
        }
        .oa-subtitle { font-size: 12.5px; color: #6B7280; }
        .oa-subtitle strong { color: #1E3A8A; font-weight: 700; }

        /* ═══════════════════════════════════════
           FORM FIELDS
        ═══════════════════════════════════════ */
        .oa-label {
          display: block; font-size: 10.5px; font-weight: 600;
          color: #6B7280; letter-spacing: 0.07em; text-transform: uppercase;
          margin-bottom: 5px;
        }
        .oa-input-wrap { position: relative; margin-bottom: 14px; }
        .oa-input {
          width: 100%; height: 42px;
          border: 1.5px solid #E5EAF2; border-radius: 9px;
          padding: 0 40px 0 13px;
          font-size: 13px; font-family: inherit;
          color: #111827; background: #FAFBFF;
          transition: border-color 0.18s, box-shadow 0.18s;
          outline: none;
        }
        .oa-input:focus {
          border-color: #1740C8;
          box-shadow: 0 0 0 3px rgba(23,64,200,0.10);
          background: white;
        }
        .oa-input::placeholder { color: #C1CBDA; font-size: 12.5px; }
        .oa-eye {
          position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: #94A3B8; display: flex; align-items: center; padding: 4px;
        }
        .oa-eye:hover { color: #64748B; }

        /* forgot */
        .oa-forgot-row {
          display: flex; justify-content: flex-end;
          margin-top: -8px; margin-bottom: 16px;
        }
        .oa-forgot {
          font-size: 11.5px; color: #4F6EF7; font-weight: 500;
          text-decoration: none; background: none; border: none;
          cursor: pointer; font-family: inherit;
        }
        .oa-forgot:hover { text-decoration: underline; }

        /* ═══════════════════════════════════════
           BUTTONS
        ═══════════════════════════════════════ */
        .oa-btn {
          width: 100%; height: 44px;
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          border: none; border-radius: 9px;
          font-size: 14px; font-weight: 700; color: white;
          font-family: inherit; cursor: pointer;
          box-shadow: 0 4px 14px rgba(7,19,82,0.34);
          transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .oa-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #1E55E8 0%, #0F2280 100%);
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(7,19,82,0.44);
        }
        .oa-btn:disabled { opacity: 0.68; cursor: not-allowed; }

        .oa-spinner {
          width: 15px; height: 15px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: white;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .oa-ssl {
          font-size: 10.5px; color: #9CA3AF;
          padding: 8px 0 2px; text-align: center;
        }

        /* divider */
        .oa-divider {
          display: flex; align-items: center; gap: 10px;
          margin: 14px 0;
        }
        .oa-div-line { flex: 1; height: 1px; background: #E8EDF5; }
        .oa-div-txt  { font-size: 11px; color: #A0AEC0; font-weight: 500; }

        /* trial button */
        .oa-trial-btn {
          display: flex; align-items: center; justify-content: center;
          width: 100%; height: 44px;
          background: linear-gradient(135deg, #10B981 0%, #047857 100%);
          border: none; border-radius: 9px;
          font-size: 13px; font-weight: 700; color: white;
          font-family: inherit; cursor: pointer; text-decoration: none;
          box-shadow: 0 4px 12px rgba(5,150,105,0.28);
          transition: all 0.2s;
        }
        .oa-trial-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(5,150,105,0.38);
        }
        .oa-trial-note {
          font-size: 10.5px; color: #9CA3AF;
          margin-top: 6px; text-align: center;
        }

        /* switch + alerts */
        .oa-switch-row { text-align: center; margin-top: 12px; }
        .oa-switch {
          background: none; border: none;
          font-size: 12px; color: #4F6EF7; font-weight: 600;
          cursor: pointer; font-family: inherit; text-decoration: underline;
        }
        .oa-error {
          background: #FEF2F2; border: 1px solid #FECACA;
          border-radius: 8px; padding: 10px 13px;
          font-size: 12.5px; color: #B91C1C; margin-bottom: 14px;
        }
        .oa-success {
          background: #F0FDF4; border: 1px solid #BBF7D0;
          border-radius: 8px; padding: 10px 13px;
          font-size: 12.5px; color: #15803D; margin-bottom: 14px;
        }

        /* support links */
        .oa-support-lbl { font-size: 11px; color: #9CA3AF; margin-bottom: 8px; }
        .oa-support-links {
          display: flex; align-items: center; justify-content: center;
          gap: 8px; flex-wrap: wrap;
        }
        .oa-support-link {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11.5px; color: #4F6EF7; font-weight: 600;
          text-decoration: none; padding: 6px 13px;
          border-radius: 8px; background: #F5F7FF;
          border: 1px solid #DBEAFE; transition: all 0.15s;
        }
        .oa-support-link:hover { background: #EEF2FF; }

        /* ═══════════════════════════════════════
           RESPONSIVE — Tablet (768–1023px)
        ═══════════════════════════════════════ */
        @media (max-width: 1023px) and (min-width: 768px) {
          .oa-left { width: 46%; padding: 32px 32px; }
          .oa-headline { font-size: 30px; }
          .oa-glow { width: 280px; height: 280px; }
          .oa-right { padding: 32px 24px; }
        }

        /* ═══════════════════════════════════════
           RESPONSIVE — Mobile (<768px)
           Left panel collapses to a top bar
        ═══════════════════════════════════════ */
        @media (max-width: 767px) {
          .oa-shell { flex-direction: column; }

          .oa-left {
            width: 100%; flex-shrink: 0;
            flex-direction: row; align-items: center;
            padding: 14px 18px; gap: 12px;
            min-height: unset;
          }
          /* hide hero, stats, footer on mobile */
          .oa-hero, .oa-stats, .oa-footer-txt,
          .oa-glow, .oa-glow2, .oa-dots { display: none; }
          .oa-brand { margin: 0; }
          .oa-brand-logo { width: 36px; height: 36px; }
          .oa-brand-name { font-size: 16px; }
          .oa-brand-sub  { font-size: 10px; }

          .oa-right {
            padding: 20px 14px;
            align-items: flex-start;
            background: #EEF2FB;
          }
          .oa-card-head, .oa-card-body, .oa-card-foot {
            padding-left: 18px; padding-right: 18px;
          }
          .oa-headline { font-size: 26px; }
        }

        /* ═══════════════════════════════════════
           RESPONSIVE — Small mobile (<400px)
        ═══════════════════════════════════════ */
        @media (max-width: 400px) {
          .oa-right { padding: 14px 10px; }
          .oa-card { border-radius: 14px; }
          .oa-card-head, .oa-card-body, .oa-card-foot {
            padding-left: 14px; padding-right: 14px;
          }
          .oa-title { font-size: 18px; }
          .oa-support-links { flex-direction: column; align-items: stretch; }
          .oa-support-link { justify-content: center; }
        }

        /* ═══════════════════════════════════════
           RESPONSIVE — Large (1400px+)
        ═══════════════════════════════════════ */
        @media (min-width: 1400px) {
          .oa-left { padding: 56px 68px; }
          .oa-right { padding: 48px 72px; }
          .oa-headline { font-size: 48px; }
          .oa-desc { font-size: 14.5px; }
          .oa-form-wrap { max-width: 420px; }
        }

        /* ═══════════════════════════════════════
           RESPONSIVE — 4K / Ultra-wide (1920px+)
        ═══════════════════════════════════════ */
        @media (min-width: 1920px) {
          .oa-left { padding: 72px 88px; }
          .oa-right { padding: 60px 96px; }
          .oa-headline { font-size: 56px; }
          .oa-brand-name { font-size: 26px; }
          .oa-brand-logo { width: 58px; height: 58px; }
          .oa-form-wrap { max-width: 460px; }
          .oa-title { font-size: 24px; }
          .oa-btn, .oa-trial-btn { height: 50px; font-size: 15px; }
          .oa-input { height: 48px; font-size: 14px; }
          .oa-stat-val { font-size: 30px; }
        }
      `}</style>

      <div className="oa-shell">

        {/* ══ LEFT PANEL ══ */}
        <div className="oa-left">
          <div className="oa-dots" />
          <div className="oa-glow" />
          <div className="oa-glow2" />

          {/* Brand */}
          <div className="oa-brand">
            <img src="/logo.png" alt="OneAccounts" className="oa-brand-logo" />
            <div>
              <div className="oa-brand-name">OneAccounts</div>
              <div className="oa-brand-sub">by Siqbal · PKR Suite</div>
            </div>
          </div>

          {/* Hero */}
          <div className="oa-hero">
            <div className="oa-badge">
              <div className="oa-badge-dot" />
              <span className="oa-badge-txt">Cloud Accounting Platform</span>
            </div>
            <div className="oa-headline">
              Smart Accounting,<br />
              <span className="oa-headline-grad">Stronger Business.</span>
            </div>
            <div className="oa-desc">
              Complete double-entry accounting, invoicing, inventory &amp; financial
              reporting — purpose-built for Pakistani businesses.
            </div>
            <div className="oa-pills">
              {PILLS.map(p => <span key={p} className="oa-pill">{p}</span>)}
            </div>
          </div>

          {/* Stats + Footer */}
          <div>
            <div className="oa-stats">
              {STATS.map(s => (
                <div key={s.label} className="oa-stat">
                  <div className="oa-stat-val">{s.value}</div>
                  <div className="oa-stat-lbl">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="oa-footer-txt">© 2025 OneAccounts by Siqbal. All rights reserved.</div>
          </div>
        </div>

        {/* ══ RIGHT PANEL ══ */}
        <div className="oa-right">
          <div className="oa-form-wrap">
            <div className="oa-card">

              {/* Card Head */}
              <div className="oa-card-head">
                <img src="/logo.png" alt="OneAccounts" className="oa-card-logo" />
                <div className="oa-secure-badge">🔒 SECURE LOGIN</div>
                <div className="oa-title">{isSignUp ? "Create Account" : "Welcome back 👋"}</div>
                <div className="oa-subtitle">
                  {isSignUp ? "Sign up for your " : "Sign in to your "}
                  <strong>OneAccounts</strong> workspace
                </div>
              </div>

              {/* Card Body */}
              <div className="oa-card-body">

                {error && (
                  <div className={error.startsWith("✅") ? "oa-success" : "oa-error"}>
                    {error}
                  </div>
                )}

                <form onSubmit={handleAuth} noValidate>
                  <label className="oa-label" htmlFor="email">Email Address</label>
                  <div className="oa-input-wrap">
                    <input
                      id="email" type="email" className="oa-input"
                      placeholder="you@company.com"
                      value={email} onChange={e => setEmail(e.target.value)}
                      autoComplete="email" autoFocus required
                    />
                  </div>

                  <label className="oa-label" htmlFor="password">Password</label>
                  <div className="oa-input-wrap">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      className="oa-input"
                      placeholder={isSignUp ? "Create a strong password" : "Enter your password"}
                      value={password} onChange={e => setPassword(e.target.value)}
                      autoComplete={isSignUp ? "new-password" : "current-password"} required
                    />
                    <button
                      type="button" className="oa-eye"
                      onClick={() => setShowPassword(p => !p)} tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>

                  {!isSignUp && (
                    <div className="oa-forgot-row">
                      <a href="/forgot-password" className="oa-forgot">Forgot password?</a>
                    </div>
                  )}

                  <button type="submit" className="oa-btn" disabled={loading}>
                    {loading
                      ? <><div className="oa-spinner" /> Please wait…</>
                      : isSignUp ? "Create Account →" : "Sign In →"
                    }
                  </button>

                  <div className="oa-ssl">🔒 256-bit SSL encrypted · Your data is safe</div>
                </form>

                <div className="oa-switch-row">
                  <button
                    className="oa-switch"
                    onClick={() => { setIsSignUp(s => !s); setError("") }}
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
                  🚀 Start Free Trial (14 days · Professional Plan)
                </a>
                <p className="oa-trial-note">No credit card required. Create your company in seconds.</p>

              </div>

              {/* Card Foot */}
              <div className="oa-card-foot">
                <div className="oa-support-lbl">Need help? We're here for you.</div>
                <div className="oa-support-links">
                  <a href="tel:03117798157"            className="oa-support-link">📞 0311-7798157</a>
                  <a href="mailto:siqbalhwc@gmail.com" className="oa-support-link">✉ siqbalhwc@gmail.com</a>
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>
    </>
  )
}