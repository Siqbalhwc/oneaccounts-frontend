"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; font-family: 'Plus Jakarta Sans', sans-serif; -webkit-font-smoothing: antialiased; }

        .oa-shell { display: flex; min-height: 100vh; min-height: 100dvh; background: #F0F4FF; }

        /* ── LEFT PANEL ── */
        .oa-left {
          width: 52%; flex-shrink: 0;
          background: linear-gradient(155deg, #04092E 0%, #071352 18%, #0F2280 40%, #1740C8 72%, #1E55E8 100%);
          display: flex; flex-direction: column; justify-content: space-between;
          padding: clamp(28px,5vh,60px) clamp(28px,4vw,64px);
          position: relative; overflow: hidden;
        }
        .oa-dots {
          position: absolute; inset: 0;
          background-image: radial-gradient(rgba(255,255,255,0.055) 1.2px, transparent 1.2px);
          background-size: 28px 28px; pointer-events: none; z-index: 0;
        }
        .oa-glow {
          position: absolute; top: -120px; right: -120px;
          width: clamp(200px,28vw,380px); height: clamp(200px,28vw,380px);
          border-radius: 50%;
          background: radial-gradient(circle, rgba(100,149,255,0.20) 0%, transparent 70%);
          pointer-events: none; z-index: 0;
        }
        .oa-brand { display: flex; align-items: center; gap: 14px; position: relative; z-index: 2; }
        .oa-brand-logo { width: clamp(36px,4vw,50px); height: clamp(36px,4vw,50px); border-radius: 12px; object-fit: contain; flex-shrink: 0; }
        .oa-brand-name { font-size: clamp(16px,1.8vw,24px); font-weight: 800; color: white; line-height: 1.2; }
        .oa-brand-sub  { font-size: clamp(10px,0.9vw,13px); color: rgba(255,255,255,0.45); margin-top: 2px; }

        .oa-hero { position: relative; z-index: 2; flex: 1; display: flex; flex-direction: column; justify-content: center; padding: clamp(24px,4vh,48px) 0; }
        .oa-badge {
          display: inline-flex; align-items: center; gap: 7px;
          background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.20);
          border-radius: 100px; padding: 5px 14px; margin-bottom: clamp(12px,2vh,20px); width: fit-content;
        }
        .oa-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #60A5FA; box-shadow: 0 0 0 3px rgba(96,165,250,0.30); }
        .oa-badge-txt { font-size: clamp(9px,0.7vw,11px); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.85); }
        .oa-headline {
          font-size: clamp(22px,3vw,44px); font-weight: 800; color: white;
          line-height: 1.10; letter-spacing: -0.6px; margin-bottom: clamp(8px,1.5vh,16px);
        }
        .oa-headline-grad {
          background: linear-gradient(90deg, #93C5FD, #818CF8);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .oa-desc {
          font-size: clamp(11px,1vw,14px); color: rgba(255,255,255,0.60);
          line-height: 1.72; max-width: 400px; margin-bottom: clamp(16px,2.5vh,28px);
        }
        .oa-pills { display: flex; flex-wrap: wrap; gap: 8px; }
        .oa-pill {
          background: rgba(255,255,255,0.09); border: 1px solid rgba(255,255,255,0.16);
          border-radius: 8px; padding: 6px 13px;
          font-size: clamp(10px,0.85vw,12px); color: rgba(255,255,255,0.84); font-weight: 500;
        }
        .oa-stats {
          position: relative; z-index: 2;
          border-top: 1px solid rgba(255,255,255,0.12);
          padding-top: clamp(14px,2vh,20px);
          display: flex; gap: clamp(16px,3vw,44px); flex-wrap: wrap;
        }
        .oa-stat-val { font-size: clamp(20px,2.2vw,28px); font-weight: 800; color: white; line-height: 1; }
        .oa-stat-lbl { font-size: clamp(8px,0.65vw,10px); color: rgba(255,255,255,0.38); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px; }
        .oa-footer-txt { font-size: clamp(9px,0.7vw,11px); color: rgba(255,255,255,0.20); position: relative; z-index: 2; margin-top: clamp(10px,1.5vh,16px); }

        /* ── RIGHT PANEL ── */
        .oa-right {
          flex: 1; display: flex; align-items: center; justify-content: center;
          padding: clamp(24px,4vh,48px) clamp(20px,3vw,52px);
          background: #F0F4FF; overflow-y: auto;
        }
        .oa-form-wrap { width: 100%; max-width: 400px; }

        /* ── CARD ── */
        .oa-card { background: white; border-radius: 16px; border: 1px solid #E8EDF5; box-shadow: 0 12px 40px rgba(15,35,120,0.12), 0 4px 12px rgba(0,0,0,0.06); overflow: hidden; }
        .oa-card-head { padding: clamp(20px,3vh,28px) clamp(20px,2.5vw,28px) clamp(16px,2vh,20px); border-bottom: 1px solid #F3F4F8; text-align: center; }
        .oa-card-body { padding: clamp(16px,2.5vh,22px) clamp(20px,2.5vw,28px); }
        .oa-card-foot { padding: clamp(12px,2vh,16px) clamp(20px,2.5vw,28px) clamp(16px,2vh,22px); border-top: 1px solid #F3F4F8; background: #FAFBFF; text-align: center; }

        /* Logo in card */
        .oa-card-logo { width: 64px; height: 64px; border-radius: 14px; object-fit: contain; margin: 0 auto 12px; display: block; }
        .oa-secure-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: linear-gradient(135deg, #EEF2FF, #E8EFFE);
          border: 1px solid #C7D2FE; border-radius: 100px;
          padding: 4px 12px; margin-bottom: 10px;
          font-size: 10px; color: #4338CA; font-weight: 700; letter-spacing: 0.05em;
        }
        .oa-title { font-size: clamp(18px,2vw,22px); font-weight: 800; color: #0F172A; letter-spacing: -0.3px; margin-bottom: 4px; }
        .oa-subtitle { font-size: clamp(12px,1vw,13px); color: #6B7280; }
        .oa-subtitle strong { color: #1E3A8A; font-weight: 700; }

        /* ── FORM ── */
        .oa-label { display: block; font-size: 11px; font-weight: 600; color: #6B7280; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 5px; }
        .oa-input-wrap { position: relative; margin-bottom: 14px; }
        .oa-input {
          width: 100%; height: clamp(38px,4.5vh,44px);
          border: 1.5px solid #E5EAF2; border-radius: 9px;
          padding: 0 42px 0 14px; font-size: clamp(12px,1vw,13.5px);
          font-family: inherit; color: #111827; background: #FAFBFF;
          transition: border-color 0.18s, box-shadow 0.18s; outline: none;
        }
        .oa-input:focus { border-color: #1740C8; box-shadow: 0 0 0 3px rgba(23,64,200,0.10); background: white; }
        .oa-input::placeholder { color: #C1CBDA; font-size: 13px; }
        .oa-eye { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #94A3B8; display: flex; align-items: center; padding: 4px; }

        /* ── BUTTON ── */
        .oa-btn {
          width: 100%; height: clamp(40px,4.8vh,46px);
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          border: none; border-radius: 9px;
          font-size: clamp(13px,1.1vw,14.5px); font-weight: 700; color: white;
          box-shadow: 0 4px 14px rgba(7,19,82,0.35);
          cursor: pointer; font-family: inherit;
          transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .oa-btn:hover:not(:disabled) { background: linear-gradient(135deg, #1E55E8 0%, #0F2280 100%); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(7,19,82,0.45); }
        .oa-btn:disabled { opacity: 0.7; cursor: not-allowed; }
        .oa-spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.35); border-top-color: white; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── ALERTS ── */
        .oa-error   { background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 10px 14px; font-size: 12.5px; color: #B91C1C; margin-bottom: 14px; }
        .oa-success { background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 10px 14px; font-size: 12.5px; color: #15803D; margin-bottom: 14px; }
        .oa-ssl { font-size: 11px; color: #9CA3AF; padding: 8px 0 2px; text-align: center; }
        .oa-switch { background: none; border: none; font-size: 12px; color: #4F6EF7; font-weight: 600; cursor: pointer; font-family: inherit; text-decoration: underline; }
        .oa-support-links { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
        .oa-support-link {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11.5px; color: #4F6EF7; font-weight: 600;
          text-decoration: none; padding: 6px 12px; border-radius: 8px;
          background: #F5F7FF; border: 1px solid #DBEAFE; transition: all 0.15s;
        }
        .oa-support-link:hover { background: #EEF2FF; }

        /* ── RESPONSIVE ── */
        @media (max-width: 767px) {
          .oa-shell { flex-direction: column; }
          .oa-left { width: 100%; min-height: unset; flex-direction: row; align-items: center; gap: 16px; padding: 14px 16px; }
          .oa-hero, .oa-stats, .oa-footer-txt, .oa-glow { display: none; }
          .oa-right { padding: clamp(16px,4vw,24px); align-items: flex-start; }
        }
        @media (max-width: 480px) {
          .oa-brand-name { font-size: 15px; }
          .oa-card-head, .oa-card-body, .oa-card-foot { padding-left: 16px; padding-right: 16px; }
        }
        @media (min-width: 1440px) {
          .oa-left { padding: 60px clamp(52px,4vw,80px); }
          .oa-right { padding: 48px clamp(52px,4vw,80px); }
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

          <div>
            <div className="oa-stats">
              {STATS.map(s => (
                <div key={s.label}>
                  <div className="oa-stat-val">{s.value}</div>
                  <div className="oa-stat-lbl">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="oa-footer-txt">© 2025 OneAccounts by Siqbal. All rights reserved.</div>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="oa-right">
          <div className="oa-form-wrap">
            <div className="oa-card">

              {/* Card Head — Logo + Title */}
              <div className="oa-card-head">
                <img src="/logo.png" alt="OneAccounts" className="oa-card-logo" />
                <div className="oa-secure-badge">🔒 SECURE LOGIN</div>
                <div className="oa-title">{isSignUp ? "Create Account" : "Welcome back 👋"}</div>
                <div className="oa-subtitle">
                  {isSignUp ? "Sign up for your " : "Sign in to your "}
                  <strong>OneAccounts</strong> workspace
                </div>
              </div>

              {/* Card Body — Form */}
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

                <div style={{ textAlign: "center", marginTop: 12 }}>
                  <button className="oa-switch" onClick={() => { setIsSignUp(s => !s); setError("") }}>
                    {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
                  </button>
                </div>
                <div style={{ textAlign: "center", marginTop: 14, borderTop: "1px solid #E8EDF5", paddingTop: 14 }}>
                  <a href="/signup"
                     style={{
                       display: "inline-block",
                       padding: "10px 24px",
                       background: "linear-gradient(135deg, #10B981, #047857)",
                       color: "white",
                       borderRadius: 8,
                       fontWeight: 700,
                       fontSize: 13,
                       textDecoration: "none",
                     }}
                  >
                    🚀 Start Free Trial (14 days · Professional Plan)
                  </a>
                  <p style={{ fontSize: 11, color: "#6B7280", marginTop: 6 }}>
                    No credit card required. Create your company in seconds.
                  </p>
                </div>
              </div>

              {/* Card Foot — Support */}
              <div className="oa-card-foot">
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 6 }}>Need help? We're here for you.</div>
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
