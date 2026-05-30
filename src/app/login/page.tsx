"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Eye, EyeOff } from "lucide-react"

const PILLS = [
  "Journal Entries", "Sales & Purchase", "Balance Sheet",
  "Customers & Vendors", "PKR Native", "100% Cloud",
]

export default function LoginPage() {
  const [email,        setEmail]        = useState("")
  const [password,     setPassword]     = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState("")
  const [isSignUp,     setIsSignUp]     = useState(false)
  const router = useRouter()

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
        html, body { height: 100%; font-family: 'Plus Jakarta Sans', sans-serif; -webkit-font-smoothing: antialiased; }

        .oa-shell {
          display: flex; min-height: 100vh; min-height: 100dvh;
          background: #F0F4FF; overflow: hidden;
        }

        /* ── LEFT PANEL (compact) ── */
        .oa-left {
          width: 50%; flex-shrink: 0;
          background: linear-gradient(155deg, #04092E 0%, #071352 18%, #0F2280 40%, #1740C8 72%, #1E55E8 100%);
          display: flex; flex-direction: column; justify-content: center;
          padding: clamp(32px, 5vh, 48px) clamp(32px, 5vw, 56px);
          position: relative; overflow: hidden;
        }
        .oa-dots {
          position: absolute; inset: 0;
          background-image: radial-gradient(rgba(255,255,255,0.055) 1.2px, transparent 1.2px);
          background-size: 28px 28px; pointer-events: none; z-index: 0;
        }
        .oa-glow {
          position: absolute; top: -100px; right: -100px;
          width: clamp(200px, 26vw, 360px); height: clamp(200px, 26vw, 360px);
          border-radius: 50%;
          background: radial-gradient(circle, rgba(100,149,255,0.20) 0%, transparent 70%);
          pointer-events: none; z-index: 0;
        }
        .oa-brand { display: flex; align-items: center; gap: 14px; position: relative; z-index: 2; margin-bottom: clamp(20px, 4vh, 32px); }
        .oa-brand-logo { width: clamp(40px, 4vw, 54px); height: clamp(40px, 4vw, 54px); border-radius: 12px; object-fit: contain; flex-shrink: 0; }
        .oa-brand-name { font-size: clamp(18px, 2vw, 28px); font-weight: 800; color: white; line-height: 1.2; }
        .oa-brand-sub  { font-size: clamp(10px, 0.9vw, 13px); color: rgba(255,255,255,0.45); margin-top: 2px; }

        .oa-hero { position: relative; z-index: 2; }
        .oa-headline {
          font-size: clamp(22px, 3vw, 38px); font-weight: 800; color: white;
          line-height: 1.12; letter-spacing: -0.6px; margin-bottom: clamp(8px, 1.5vh, 14px);
        }
        .oa-headline-grad {
          background: linear-gradient(90deg, #93C5FD, #A5B4FC);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .oa-desc {
          font-size: clamp(11px, 1vw, 13px); color: rgba(255,255,255,0.58);
          line-height: 1.6; max-width: 420px; margin-bottom: clamp(12px, 2vh, 18px);
        }
        .oa-pills { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: clamp(20px, 3vh, 28px); }
        .oa-pill {
          background: rgba(255,255,255,0.09); border: 1px solid rgba(255,255,255,0.16);
          border-radius: 8px; padding: 5px 12px;
          font-size: clamp(10px, 0.8vw, 11px); color: rgba(255,255,255,0.82); font-weight: 500;
        }
        .oa-footer-txt { font-size: clamp(8px, 0.6vw, 10px); color: rgba(255,255,255,0.20); position: relative; z-index: 2; }

        /* ── RIGHT PANEL (compact card) ── */
        .oa-right {
          flex: 1; display: flex; align-items: center; justify-content: center;
          padding: clamp(24px, 4vh, 40px) clamp(20px, 4vw, 40px);
          background: #F0F4FF; overflow-y: auto;
        }
        .oa-form-wrap { width: 100%; max-width: 400px; }

        .oa-card {
          background: white; border-radius: 16px;
          border: 1px solid #E8EDF5;
          box-shadow: 0 10px 30px rgba(15,35,120,0.08), 0 2px 8px rgba(0,0,0,0.04);
          overflow: hidden;
        }
        .oa-card-head {
          padding: clamp(16px, 2.5vh, 22px) clamp(20px, 3vw, 24px) clamp(12px, 2vh, 16px);
          text-align: center; border-bottom: 1px solid #F3F4F8;
        }
        .oa-card-body { padding: clamp(14px, 2vh, 18px) clamp(20px, 3vw, 24px); }
        .oa-card-foot {
          padding: clamp(10px, 1.5vh, 14px) clamp(20px, 3vw, 24px);
          border-top: 1px solid #F3F4F8; background: #FAFBFF; text-align: center;
        }

        .oa-card-logo { width: 56px; height: 56px; border-radius: 14px; object-fit: contain; margin: 0 auto 10px; display: block; }
        .oa-secure-badge {
          display: inline-flex; align-items: center; gap: 5px;
          background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 100px;
          padding: 3px 10px; margin-bottom: 8px;
          font-size: 9px; color: #4338CA; font-weight: 700; letter-spacing: 0.04em;
        }
        .oa-title { font-size: clamp(16px, 1.8vw, 20px); font-weight: 800; color: #0F172A; letter-spacing: -0.3px; margin-bottom: 2px; }
        .oa-subtitle { font-size: clamp(11px, 1vw, 12px); color: #6B7280; }
        .oa-subtitle strong { color: #1E3A8A; font-weight: 700; }

        /* ── FORM ── */
        .oa-label { display: block; font-size: 10px; font-weight: 600; color: #6B7280; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 4px; }
        .oa-input-wrap { position: relative; margin-bottom: 12px; }
        .oa-input {
          width: 100%; height: 40px;
          border: 1.5px solid #E5EAF2; border-radius: 8px;
          padding: 0 38px 0 12px; font-size: clamp(12px, 1vw, 13px);
          font-family: inherit; color: #111827; background: #FAFBFF;
          transition: border-color 0.18s, box-shadow 0.18s; outline: none;
        }
        .oa-input:focus { border-color: #1740C8; box-shadow: 0 0 0 3px rgba(23,64,200,0.10); background: white; }
        .oa-input::placeholder { color: #C1CBDA; font-size: 12px; }
        .oa-eye { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #94A3B8; display: flex; align-items: center; padding: 4px; }

        /* ── BUTTON ── */
        .oa-btn {
          width: 100%; height: 42px;
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          border: none; border-radius: 8px;
          font-size: clamp(12px, 1vw, 13.5px); font-weight: 700; color: white;
          box-shadow: 0 3px 10px rgba(7,19,82,0.30);
          cursor: pointer; font-family: inherit;
          transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;
          margin-top: 6px;
        }
        .oa-btn:hover:not(:disabled) { background: linear-gradient(135deg, #1E55E8 0%, #0F2280 100%); transform: translateY(-1px); box-shadow: 0 5px 14px rgba(7,19,82,0.40); }
        .oa-btn:disabled { opacity: 0.7; cursor: not-allowed; }
        .oa-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.35); border-top-color: white; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── ALERTS ── */
        .oa-error   { background: #FEF2F2; border: 1px solid #FECACA; border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #B91C1C; margin-bottom: 12px; }
        .oa-success { background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #15803D; margin-bottom: 12px; }
        .oa-ssl { font-size: 10px; color: #9CA3AF; padding: 6px 0 0; text-align: center; }
        .oa-switch { background: none; border: none; font-size: 11px; color: #4F6EF7; font-weight: 600; cursor: pointer; font-family: inherit; text-decoration: underline; margin-top: 10px; display: block; text-align: center; }

        .oa-trial-btn {
          display: block; text-align: center;
          padding: 10px 0; margin-top: 12px;
          background: linear-gradient(135deg, #10B981, #047857);
          color: white; border-radius: 8px; font-weight: 700; font-size: 13px; text-decoration: none;
        }
        .oa-trial-note { font-size: 10px; color: #6B7280; margin-top: 5px; text-align: center; }

        .oa-support-links { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
        .oa-support-link {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; color: #4F6EF7; font-weight: 600;
          text-decoration: none; padding: 5px 10px; border-radius: 7px;
          background: #F5F7FF; border: 1px solid #DBEAFE; transition: all 0.15s;
        }
        .oa-support-link:hover { background: #EEF2FF; }

        /* ── RESPONSIVE ── */
        @media (max-width: 767px) {
          .oa-shell { flex-direction: column; }
          .oa-left { width: 100%; min-height: unset; padding: 16px 20px; flex-direction: row; align-items: center; gap: 12px; }
          .oa-hero, .oa-footer-txt, .oa-glow, .oa-dots { display: none; }
          .oa-brand { margin-bottom: 0; }
          .oa-right { padding: 16px; align-items: flex-start; }
        }
        @media (max-width: 480px) {
          .oa-brand-name { font-size: 16px; }
          .oa-card-head, .oa-card-body, .oa-card-foot { padding-left: 16px; padding-right: 16px; }
        }
        @media (min-width: 1400px) {
          .oa-left { padding: 48px 64px; }
          .oa-right { padding: 40px 56px; }
        }
      `}</style>

      <div className="oa-shell">
        {/* ── LEFT PANEL ── */}
        <div className="oa-left">
          <div className="oa-dots" />
          <div className="oa-glow" />

          <div className="oa-brand">
            <img src="/logo.png" alt="OneAccounts" className="oa-brand-logo" />
            <div>
              <div className="oa-brand-name">OneAccounts</div>
              <div className="oa-brand-sub">by Siqbal · PKR Suite</div>
            </div>
          </div>

          <div className="oa-hero">
            <div className="oa-headline">
              Smart Accounting,<br />
              <span className="oa-headline-grad">Stronger Business.</span>
            </div>
            <div className="oa-desc">
              Complete double‑entry accounting, invoicing, inventory &amp; financial
              reporting — purpose‑built for Pakistani businesses.
            </div>
            <div className="oa-pills">
              {PILLS.map(p => <span key={p} className="oa-pill">{p}</span>)}
            </div>
          </div>

          <div className="oa-footer-txt">© 2025 OneAccounts by Siqbal. All rights reserved.</div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="oa-right">
          <div className="oa-form-wrap">
            <div className="oa-card">
              <div className="oa-card-head">
                <img src="/logo.png" alt="OneAccounts" className="oa-card-logo" />
                <div className="oa-secure-badge">🔒 SECURE LOGIN</div>
                <div className="oa-title">{isSignUp ? "Create Account" : "Welcome back 👋"}</div>
                <div className="oa-subtitle">
                  {isSignUp ? "Sign up for your " : "Sign in to your "}
                  <strong>OneAccounts</strong> workspace
                </div>
              </div>

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
                      id="password" type={showPassword ? "text" : "password"} className="oa-input"
                      placeholder={isSignUp ? "Create a strong password" : "Enter your password"}
                      value={password} onChange={e => setPassword(e.target.value)}
                      autoComplete={isSignUp ? "new-password" : "current-password"} required
                    />
                    <button type="button" className="oa-eye" onClick={() => setShowPassword(p => !p)} tabIndex={-1}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  <button type="submit" className="oa-btn" disabled={loading}>
                    {loading
                      ? <><div className="oa-spinner" /> Please wait…</>
                      : isSignUp ? "Create Account →" : "Sign In →"
                    }
                  </button>

                  <div className="oa-ssl">🔒 256-bit SSL encrypted · Your data is safe</div>
                </form>

                <button className="oa-switch" onClick={() => { setIsSignUp(s => !s); setError("") }}>
                  {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
                </button>

                <a href="/signup" className="oa-trial-btn">
                  🚀 Start Free Trial (14 days · Professional Plan)
                </a>
                <p className="oa-trial-note">No credit card required. Create your company in seconds.</p>
              </div>

              <div className="oa-card-foot">
                <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 4 }}>Need help? We're here for you.</div>
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