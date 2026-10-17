"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import {
  Eye,
  EyeOff,
  Building2,
  Package,
  Wrench,
  House,
  MessageCircle,
  Landmark,
  ShoppingCart,
  ReceiptText,
  Phone,
  Mail,
  Globe,
  Lock,
  MailCheck,
  CircleAlert,
} from "lucide-react"

// One place to change the support mailbox.
const SUPPORT_EMAIL = "siqbalhwc@gmail.com"

type Segment = "ngo" | "property" | "trading" | "service"

const SEGMENTS: { key: Segment; title: string; desc: string; Icon: typeof Building2 }[] = [
  { key: "ngo", title: "NGOs & Development", desc: "Donors, budgets, fund utilization", Icon: Building2 },
  { key: "property", title: "Property Management", desc: "Rent, deposits, owner statements", Icon: House },
  { key: "trading", title: "Trading Businesses", desc: "Inventory, taxes, cash flow", Icon: Package },
  { key: "service", title: "Service Organizations", desc: "Projects, billing, profitability", Icon: Wrench },
]

// ── Segment Outcome Data ──
const OUTCOME_LINE: Record<Segment, string> = {
  ngo: "Track donor balances, enforce budgets, and generate audit-ready reports in real time.",
  property: "Invoice rent, hold deposits and settle owner statements in the same books.",
  trading: "Manage inventory, receivables, and tax — without manual spreadsheets.",
  service: "Bill clients accurately and see project profitability the moment it changes.",
}

// ── Illustrative example (not real customer data) ──
const EXAMPLES: Record<Segment, { entry: string; rows: [string, string][]; result: [string, string] }> = {
  ngo: {
    entry: "Donor grant received",
    rows: [["Grant received", "Rs 500,000"], ["Spent on project", "Rs 120,000"]],
    result: ["Fund balance left", "Rs 380,000"],
  },
  property: {
    entry: "Monthly rent collected",
    rows: [["Rent received", "Rs 85,000"], ["Management fee (10%)", "Rs 8,500"]],
    result: ["Owner statement", "Rs 76,500"],
  },
  trading: {
    entry: "Sale of 40 units",
    rows: [["Sales invoice", "Rs 184,000"], ["Cost of goods", "Rs 120,000"]],
    result: ["Gross profit", "Rs 64,000"],
  },
  service: {
    entry: "Project invoice raised",
    rows: [["Invoice to client", "Rs 150,000"], ["Direct project cost", "Rs 90,000"]],
    result: ["Project profit", "Rs 60,000"],
  },
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
  const [activeSegment, setActiveSegment] = useState<Segment>("ngo")
  const [signUpSuccess, setSignUpSuccess] = useState(false)

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
    setSignUpSuccess(false)

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // ── SIGN UP with email verification ──
    if (isSignUp) {
      // Check if emails match
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

      // Show success message and keep user on login page
      setSignUpSuccess(true)
      setError("")
      setLoading(false)
      setIsSignUp(false) // Switch back to sign-in mode
      return
    }

    // ── SIGN IN ──
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { persistSession: rememberMe } as any,
    })

    if (authError) {
      if (authError.message.includes("Email not confirmed")) {
        setError(
          "Please verify your email address first. Check your inbox for the confirmation link."
        )
      } else {
        setError("Incorrect email or password. Please try again.")
      }
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

  const ex = EXAMPLES[activeSegment]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Sora:wght@500;600;700&display=swap');

        .oa-page{--navy:#0B0A5C;--navy-deep:#07063A;--cream:#FAF8F4;--gold:#C9862F;--peach:#F3CFA6;--ink:#20202C;--ink-soft:#5B5A6B;--line:#E4DFD5;
          min-height:100vh;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);background:var(--cream);color:var(--ink);font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
        .oa-page *{box-sizing:border-box}
        .oa-page h1,.oa-page h2,.oa-page .oa-display{font-family:'Sora','Inter',sans-serif}
        .oa-page a{color:inherit}
        .oa-page :focus-visible{outline:3px solid var(--gold);outline-offset:2px}

        /* Left (brand) panel */
        .oa-left{background:linear-gradient(160deg,var(--navy) 0%,var(--navy-deep) 100%);color:#fff;padding:48px clamp(28px,5vw,72px);display:flex;flex-direction:column;gap:26px}
        .oa-brand{display:flex;align-items:center;gap:14px}
        .oa-logo-tile{width:48px;height:48px;border-radius:50%;background:var(--cream);display:grid;place-items:center;flex:none}
        .oa-logo-tile img{width:32px;height:32px;object-fit:contain}
        .oa-brand-name{font-family:'Sora',sans-serif;font-weight:700;font-size:20px;line-height:1.1}
        .oa-brand-sub{font-size:12px;color:rgba(255,255,255,.7);margin-top:3px}
        .oa-kicker{align-self:flex-start;border:1px solid rgba(201,134,47,.6);color:var(--peach);background:rgba(201,134,47,.12);border-radius:999px;padding:6px 14px;font-size:12px;font-weight:500;letter-spacing:.02em}
        .oa-headline{font-family:'Sora',sans-serif;font-weight:700;font-size:clamp(30px,3.6vw,46px);line-height:1.12;margin:0;letter-spacing:-.01em}
        .oa-headline span{display:block;color:var(--peach)}
        .oa-label-top{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.65);margin:0 0 -10px}
        .oa-segs{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .oa-seg{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;gap:4px;padding:13px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.04);transition:background .15s,border-color .15s}
        .oa-seg:hover{background:rgba(255,255,255,.09)}
        .oa-seg[aria-pressed="true"]{border-color:var(--gold);background:rgba(201,134,47,.16)}
        .oa-seg:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
        .oa-seg-top{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px}
        .oa-seg-top svg{color:var(--peach);flex:none}
        .oa-seg-desc{font-size:12px;color:rgba(255,255,255,.68);line-height:1.4}
        .oa-outcome{margin:0;font-size:15px;line-height:1.6;color:rgba(255,255,255,.88);min-height:48px}

        .oa-example{background:var(--cream);color:var(--ink);border-radius:12px;padding:20px 22px;border-left:5px double var(--gold)}
        .oa-ex-kick{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--gold)}
        .oa-ex-title{font-family:'Sora',sans-serif;font-weight:600;font-size:17px;margin:4px 0 12px}
        .oa-ex-row{display:flex;justify-content:space-between;gap:12px;font-size:14px;padding:7px 0;border-bottom:1px dashed var(--line);color:var(--ink-soft)}
        .oa-ex-row b{color:var(--ink);font-weight:600;white-space:nowrap}
        .oa-ex-result{display:flex;justify-content:space-between;gap:12px;padding-top:11px;font-weight:600;font-size:15px;color:var(--navy)}
        .oa-ex-note{margin:10px 0 0;font-size:11px;color:var(--ink-soft)}

        .oa-how{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;font-size:13px;color:rgba(255,255,255,.82)}
        .oa-how strong{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.6);font-weight:600}
        .oa-how span.n{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--gold);color:var(--navy-deep);font-weight:700;font-size:12px;margin-right:6px}
        .oa-copy{margin-top:auto;font-size:12px;color:rgba(255,255,255,.55)}

        /* Right (form) panel */
        .oa-right{display:flex;align-items:center;justify-content:center;padding:40px clamp(20px,4vw,56px)}
        .oa-card{width:100%;max-width:460px;background:#fff;border-radius:14px;border-left:5px double var(--gold);box-shadow:0 18px 48px rgba(11,10,92,.10);padding:34px 32px}
        .oa-secure{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--gold)}
        .oa-title{font-family:'Sora',sans-serif;font-weight:700;font-size:26px;margin:10px 0 4px;color:var(--navy)}
        .oa-sub{margin:0 0 22px;font-size:14px;color:var(--ink-soft)}
        .oa-msg{display:flex;gap:10px;align-items:flex-start;border-radius:8px;padding:12px 14px;font-size:13.5px;line-height:1.5;margin-bottom:16px}
        .oa-error{background:#FDF0EE;color:#8F2A1D;border:1px solid #F1C9C2}
        .oa-success{background:#EEF6EF;color:#245A31;border:1px solid #C7E0CB}
        .oa-msg svg{flex:none;margin-top:2px}
        .oa-confirm{text-align:center;background:#EEF6EF;border:1px solid #C7E0CB;border-radius:10px;padding:18px 16px;margin-bottom:18px;color:#245A31}
        .oa-confirm h2{margin:8px 0 4px;font-size:17px}
        .oa-confirm p{margin:0;font-size:13.5px;line-height:1.55}
        .oa-field{margin-bottom:16px}
        .oa-field label{display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:var(--ink)}
        .oa-input-wrap{position:relative}
        .oa-input{width:100%;height:46px;border:1px solid #CFC9BC;border-radius:8px;padding:0 14px;font:inherit;font-size:15px;color:var(--ink);background:#fff}
        .oa-input:focus{outline:3px solid rgba(201,134,47,.45);outline-offset:0;border-color:var(--gold)}
        .oa-input.has-toggle{padding-right:70px}
        .oa-toggle{all:unset;box-sizing:border-box;position:absolute;right:6px;top:6px;height:34px;padding:0 10px;display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:12.5px;font-weight:600;color:var(--navy);border-radius:6px}
        .oa-toggle:hover{background:var(--cream)}
        .oa-toggle:focus-visible{outline:3px solid var(--gold)}
        .oa-row{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:-2px 0 18px;font-size:13px}
        .oa-remember{display:flex;align-items:center;gap:8px;color:var(--ink-soft);cursor:pointer}
        .oa-remember input{width:16px;height:16px;accent-color:var(--navy);cursor:pointer}
        .oa-forgot{color:var(--navy);font-weight:600;text-decoration:none}
        .oa-forgot:hover{text-decoration:underline}
        .oa-btn{width:100%;height:50px;border:0;border-radius:8px;background:var(--navy);color:#fff;font-family:'Sora',sans-serif;font-weight:600;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:background .15s}
        .oa-btn:hover:not(:disabled){background:var(--navy-deep)}
        .oa-btn:disabled{opacity:.75;cursor:wait}
        .oa-spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:oa-spin .7s linear infinite}
        @keyframes oa-spin{to{transform:rotate(360deg)}}
        .oa-secure-note{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:12px;font-size:12px;color:var(--ink-soft)}
        .oa-switch-row{text-align:center;margin-top:14px}
        .oa-switch{all:unset;cursor:pointer;font-size:13.5px;color:var(--ink-soft)}
        .oa-switch strong{color:var(--navy);text-decoration:underline;text-underline-offset:3px}
        .oa-switch:focus-visible{outline:3px solid var(--gold);outline-offset:3px;border-radius:4px}
        .oa-or{display:flex;align-items:center;gap:12px;margin:20px 0 14px;font-size:12px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.08em}
        .oa-or::before,.oa-or::after{content:"";flex:1;height:1px;background:var(--line)}
        .oa-trial{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;height:auto;min-height:48px;padding:10px 14px;border:2px solid var(--gold);border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;color:var(--navy);background:#fff}
        .oa-trial:hover{background:#FFF8EE}
        .oa-trial-tag{font-size:11px;font-weight:600;letter-spacing:.05em;color:#fff;background:var(--gold);border-radius:999px;padding:3px 9px}
        .oa-note{margin:8px 0 0;text-align:center;font-size:12.5px;color:var(--ink-soft)}
        .oa-prop{margin:16px 0 0;text-align:center;font-size:13px;color:var(--ink-soft)}
        .oa-prop a{color:var(--navy);font-weight:600}
        .oa-addons{margin-top:22px;padding-top:16px;border-top:1px solid var(--line);font-size:12.5px;color:var(--ink-soft);line-height:1.6}
        .oa-addons b{color:var(--ink);font-weight:600}
        .oa-addon-list{display:flex;flex-wrap:wrap;gap:6px 14px;margin:6px 0 4px}
        .oa-addon-list span{display:inline-flex;align-items:center;gap:6px}
        .oa-addon-list svg{color:var(--gold)}
        .oa-help{margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}
        .oa-help p{margin:0 0 8px;font-size:12.5px;font-weight:600;color:var(--ink)}
        .oa-contact{display:flex;flex-wrap:wrap;gap:8px 16px}
        .oa-contact a{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--navy);text-decoration:none}
        .oa-contact a:hover{text-decoration:underline}

        @media (max-width:960px){
          .oa-page{grid-template-columns:1fr}
          .oa-right{order:-1;padding:24px 16px 8px}
          .oa-left{padding:32px 20px 28px}
          .oa-card{padding:26px 20px}
        }
        @media (max-width:420px){
          .oa-segs{grid-template-columns:1fr}
          .oa-title{font-size:23px}
        }
        @media (prefers-reduced-motion:reduce){
          .oa-spinner{animation-duration:2s}
          .oa-seg,.oa-btn{transition:none}
        }
      `}</style>

      <main className="oa-page">
        {/* ══ LEFT: brand and sector panel ══ */}
        <section className="oa-left" aria-label="About OneAccounts">
          <div className="oa-brand">
            <div className="oa-logo-tile">
              <img src="/logo.png" alt="" width={32} height={32} />
            </div>
            <div>
              <div className="oa-brand-name">OneAccounts</div>
              <div className="oa-brand-sub">by Siqbal · PKR Suite</div>
            </div>
          </div>

          <div className="oa-kicker">Cloud finance and ERP · Built for Pakistan</div>

          <h1 className="oa-headline">
            Simple by design.
            <span>Professional by nature.</span>
          </h1>

          <p className="oa-label-top">Who is it for</p>
          <div className="oa-segs" role="group" aria-label="Choose your kind of organization">
            {SEGMENTS.map(({ key, title, desc, Icon }) => (
              <button
                type="button"
                key={key}
                className="oa-seg"
                aria-pressed={activeSegment === key}
                onClick={() => setActiveSegment(key)}
              >
                <span className="oa-seg-top"><Icon size={18} strokeWidth={1.8} aria-hidden="true" />{title}</span>
                <span className="oa-seg-desc">{desc}</span>
              </button>
            ))}
          </div>

          <p className="oa-outcome" aria-live="polite">{OUTCOME_LINE[activeSegment]}</p>

          <div className="oa-example">
            <div className="oa-ex-kick">Follow one entry through the books</div>
            <div className="oa-ex-title">{ex.entry}</div>
            {ex.rows.map(([label, value]) => (
              <div className="oa-ex-row" key={label}><span>{label}</span><b>{value}</b></div>
            ))}
            <div className="oa-ex-result"><span>{ex.result[0]}</span><span>{ex.result[1]}</span></div>
            <p className="oa-ex-note">Illustrative figures, not real customer data.</p>
          </div>

          <div className="oa-how">
            <strong>How it works</strong>
            <span><span className="n">1</span>Sign up free</span>
            <span><span className="n">2</span>Import your data</span>
            <span><span className="n">3</span>Go live today</span>
          </div>

          <div className="oa-copy">© 2026 OneAccounts by Siqbal. All rights reserved.</div>
        </section>

        {/* ══ RIGHT: sign-in ══ */}
        <section className="oa-right" aria-label="Sign in">
          <div className="oa-card">
            <div className="oa-secure"><Lock size={13} aria-hidden="true" /> Secure sign-in</div>
            <h2 className="oa-title">{isSignUp ? "Create your account" : "Sign in to your workspace"}</h2>
            <p className="oa-sub">
              {isSignUp ? "Sign up for your " : "Welcome back to "}
              <strong>OneAccounts</strong>.
            </p>

            {inviteStatus === "processing" && (
              <div className="oa-msg oa-success" role="status">Verifying your invitation… please wait.</div>
            )}
            {inviteStatus === "expired" && (
              <div className="oa-msg oa-error" role="alert">
                <CircleAlert size={16} aria-hidden="true" />
                <div>
                  This invitation link has expired or has already been used.<br />
                  <span style={{ fontSize: 12 }}>
                    Please use <strong>Forgot password?</strong> to set a password for your account.
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className={`oa-msg ${error.startsWith("✅") ? "oa-success" : "oa-error"}`} role="alert">
                {!error.startsWith("✅") && <CircleAlert size={16} aria-hidden="true" />}
                <div>{error}</div>
              </div>
            )}

            {signUpSuccess && (
              <div className="oa-confirm" role="status">
                <MailCheck size={28} aria-hidden="true" />
                <h2>Check your email</h2>
                <p>
                  We sent a confirmation link to <strong>{email}</strong>.<br />
                  Please click the link to verify your email address, then sign in.
                </p>
              </div>
            )}

            <form onSubmit={handleAuth} noValidate>
              <div className="oa-field">
                <label htmlFor="email">Email address</label>
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

              {isSignUp && (
                <div className="oa-field">
                  <label htmlFor="confirmEmail">Confirm email address</label>
                  <input
                    id="confirmEmail"
                    type="email"
                    className="oa-input"
                    placeholder="Confirm your email address"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    autoComplete="off"
                    required
                  />
                </div>
              )}

              <div className="oa-field">
                <label htmlFor="password">Password</label>
                <div className="oa-input-wrap">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="oa-input has-toggle"
                    placeholder={isSignUp ? "Create a strong password (min 6 chars)" : "Enter your password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    required
                  />
                  <button
                    type="button"
                    className="oa-toggle"
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((p) => !p)}
                  >
                    {showPassword ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {!isSignUp && (
                <div className="oa-row">
                  <label className="oa-remember">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    Remember me
                  </label>
                  <a href="/forgot-password" className="oa-forgot">Forgot password?</a>
                </div>
              )}

              <button type="submit" className="oa-btn" disabled={loading}>
                {loading ? (
                  <>
                    <span className="oa-spinner" aria-hidden="true" /> Please wait…
                  </>
                ) : isSignUp ? (
                  "Create account"
                ) : (
                  "Sign in"
                )}
              </button>

              <div className="oa-secure-note"><Lock size={12} aria-hidden="true" /> Encrypted connection</div>
            </form>

            <div className="oa-switch-row">
              <button
                type="button"
                className="oa-switch"
                onClick={() => {
                  setIsSignUp((s) => !s)
                  setError("")
                  setSignUpSuccess(false)
                  setConfirmEmail("")
                }}
              >
                {isSignUp ? (
                  <>Already have an account? <strong>Sign in</strong></>
                ) : (
                  <>New to OneAccounts? <strong>Create an account</strong></>
                )}
              </button>
            </div>

            {!isSignUp && (
              <>
                <div className="oa-or">or</div>
                <a href="/signup" className="oa-trial">
                  Start a free trial
                  <span className="oa-trial-tag">10 DAYS · NO CARD</span>
                </a>
                <p className="oa-note">Create your company in seconds.</p>
              </>
            )}

            <p className="oa-prop">
              Managing buildings and tenants?{" "}
              <a href="https://properties.oneaccountsbysiqbal.com/login">Sign in to Property Management</a>
            </p>

            <div className="oa-addons">
              <b>Available add-ons</b>
              <div className="oa-addon-list">
                <span><MessageCircle size={14} strokeWidth={1.8} aria-hidden="true" /> WhatsApp Integration</span>
                <span><Landmark size={14} strokeWidth={1.8} aria-hidden="true" /> Fixed Assets</span>
                <span><ShoppingCart size={14} strokeWidth={1.8} aria-hidden="true" /> Purchase Order</span>
                <span><ReceiptText size={14} strokeWidth={1.8} aria-hidden="true" /> Tax Module</span>
              </div>
              <a href="https://www.oneaccountsbysiqbal.com/pricing" style={{ color: "var(--navy)", fontWeight: 600 }}>See pricing</a>
            </div>

            <div className="oa-help">
              <p>Need help? We&apos;re here for you.</p>
              <div className="oa-contact">
                <a href="https://wa.me/923716853677" target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={13} strokeWidth={1.8} aria-hidden="true" /> WhatsApp
                </a>
                <a href="tel:+923716853677">
                  <Phone size={13} strokeWidth={1.8} aria-hidden="true" /> +92 371 6853677
                </a>
                <a href={`mailto:${SUPPORT_EMAIL}`}>
                  <Mail size={13} strokeWidth={1.8} aria-hidden="true" /> {SUPPORT_EMAIL}
                </a>
                <a href="https://www.oneaccountsbysiqbal.com" target="_blank" rel="noopener noreferrer">
                  <Globe size={13} strokeWidth={1.8} aria-hidden="true" /> oneaccountsbysiqbal.com
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
