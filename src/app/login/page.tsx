"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "signin" | "signup";

// ─── Feature pills shown on left panel ───────────────────────────────────────
const PILLS = [
  "Journal Entries", "Sales & Purchase", "Inventory",
  "Balance Sheet", "Customers & Vendors", "PKR Native", "100% Cloud",
];

const STATS = [
  { value: "14+",   label: "Modules"   },
  { value: "100%",  label: "Cloud"     },
  { value: "PKR",   label: "Currency"  },
  { value: "Live",  label: "Real-time" },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [tab,         setTab]         = useState<Tab>("signin");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState<string | null>(null);
  const [showPass,    setShowPass]    = useState(false);

  // ── Sign In ────────────────────────────────────────────────────────────────
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) { setError("Please enter your email and password."); return; }
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      router.push("/dashboard");
    } catch {
      setError("Incorrect email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Sign Up ────────────────────────────────────────────────────────────────
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) { setError("Please fill in all fields."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) throw authError;
      setSuccess("Account created! Check your email to confirm, then ask an admin to assign your role.");
    } catch {
      setError("Sign up failed — this email may already be registered.");
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (t: Tab) => { setTab(t); setError(null); setSuccess(null); setEmail(""); setPassword(""); };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; font-family: 'Plus Jakarta Sans', sans-serif; -webkit-font-smoothing: antialiased; }

        /* ── LAYOUT ── */
        .oa-shell {
          display: flex;
          min-height: 100vh;
          min-height: 100dvh;
          background: #F0F4FF;
        }

        /* ── LEFT PANEL ── */
        .oa-left {
          width: 52%;
          background: linear-gradient(155deg, #04092E 0%, #071352 18%, #0F2280 40%, #1740C8 72%, #1E55E8 100%);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: clamp(28px, 5vh, 60px) clamp(28px, 4vw, 64px);
          position: relative;
          overflow: hidden;
          flex-shrink: 0;
        }
        .oa-left-glow1 {
          position: absolute; top: -120px; right: -120px;
          width: clamp(200px, 28vw, 380px); height: clamp(200px, 28vw, 380px);
          border-radius: 50%;
          background: radial-gradient(circle, rgba(100,149,255,0.20) 0%, transparent 70%);
          pointer-events: none;
        }
        .oa-left-glow2 {
          position: absolute; bottom: -80px; left: -60px;
          width: clamp(160px, 22vw, 300px); height: clamp(160px, 22vw, 300px);
          border-radius: 50%;
          background: radial-gradient(circle, rgba(100,149,255,0.12) 0%, transparent 70%);
          pointer-events: none;
        }
        .oa-dots {
          position: absolute; inset: 0;
          background-image: radial-gradient(rgba(255,255,255,0.055) 1.2px, transparent 1.2px);
          background-size: 28px 28px;
          pointer-events: none;
        }
        .oa-brand {
          display: flex; align-items: center; gap: 14px;
          position: relative; z-index: 2;
        }
        .oa-brand-logo {
          width: clamp(36px, 4vw, 52px);
          height: clamp(36px, 4vw, 52px);
          border-radius: 12px;
          object-fit: contain;
          flex-shrink: 0;
        }
        .oa-brand-logo-fallback {
          width: clamp(36px, 4vw, 52px);
          height: clamp(36px, 4vw, 52px);
          border-radius: 12px;
          background: rgba(255,255,255,0.18);
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; font-weight: 800; color: white; flex-shrink: 0;
        }
        .oa-brand-name {
          font-size: clamp(16px, 1.8vw, 26px);
          font-weight: 800; color: white;
          line-height: 1.2; letter-spacing: -0.4px;
        }
        .oa-brand-sub {
          font-size: clamp(10px, 0.9vw, 13px);
          color: rgba(255,255,255,0.45);
          font-weight: 400; margin-top: 2px;
        }
        .oa-hero { position: relative; z-index: 2; flex: 1; display: flex; flex-direction: column; justify-content: center; padding: clamp(24px, 4vh, 52px) 0; }
        .oa-badge {
          display: inline-flex; align-items: center; gap: 7px;
          background: rgba(255,255,255,0.10);
          border: 1px solid rgba(255,255,255,0.20);
          border-radius: 100px; padding: 5px 14px;
          margin-bottom: clamp(12px, 2.2vh, 24px);
          width: fit-content;
        }
        .oa-badge-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #60A5FA;
          box-shadow: 0 0 0 3px rgba(96,165,250,0.30);
          flex-shrink: 0;
        }
        .oa-badge-text {
          font-size: clamp(9px, 0.7vw, 11px);
          font-weight: 600; letter-spacing: 0.08em;
          text-transform: uppercase; color: rgba(255,255,255,0.85);
        }
        .oa-headline {
          font-size: clamp(22px, 3vw, 46px);
          font-weight: 800; color: white;
          line-height: 1.10; letter-spacing: -0.6px;
          margin-bottom: clamp(8px, 1.6vh, 18px);
        }
        .oa-headline-gradient {
          background: linear-gradient(90deg, #93C5FD, #818CF8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .oa-desc {
          font-size: clamp(11px, 1vw, 14.5px);
          color: rgba(255,255,255,0.60);
          line-height: 1.72; max-width: 400px;
          margin-bottom: clamp(16px, 2.8vh, 32px);
        }
        .oa-pills { display: flex; flex-wrap: wrap; gap: 8px; }
        .oa-pill {
          background: rgba(255,255,255,0.09);
          border: 1px solid rgba(255,255,255,0.16);
          border-radius: 8px; padding: 6px 13px;
          font-size: clamp(10px, 0.85vw, 12px);
          color: rgba(255,255,255,0.84); font-weight: 500;
        }
        .oa-stats {
          position: relative; z-index: 2;
          border-top: 1px solid rgba(255,255,255,0.12);
          padding-top: clamp(14px, 2.4vh, 22px);
          margin-bottom: clamp(10px, 1.8vh, 18px);
          display: flex; gap: clamp(16px, 3vw, 44px); flex-wrap: wrap;
        }
        .oa-stat-val { font-size: clamp(20px, 2.2vw, 30px); font-weight: 800; color: white; line-height: 1; }
        .oa-stat-lbl { font-size: clamp(8px, 0.65vw, 10px); color: rgba(255,255,255,0.38); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 5px; }
        .oa-footer-txt { font-size: clamp(9px, 0.7vw, 11px); color: rgba(255,255,255,0.20); position: relative; z-index: 2; }

        /* ── RIGHT PANEL ── */
        .oa-right {
          width: 48%;
          display: flex; align-items: center; justify-content: center;
          padding: clamp(24px, 4vh, 48px) clamp(20px, 3vw, 52px);
          background: #F0F4FF;
          min-height: 100%;
          overflow-y: auto;
        }
        .oa-form-wrap { width: 100%; max-width: 400px; }

        /* ── CARD ── */
        .oa-card {
          background: white;
          border-radius: 16px;
          border: 1px solid #E8EDF5;
          box-shadow: 0 12px 40px rgba(15,35,120,0.12), 0 4px 12px rgba(0,0,0,0.06);
          overflow: hidden;
        }
        .oa-card-head { padding: clamp(20px, 3vh, 28px) clamp(20px, 2.5vw, 28px) clamp(16px, 2.5vh, 20px); border-bottom: 1px solid #F3F4F8; }
        .oa-card-body { padding: clamp(16px, 2.5vh, 22px) clamp(20px, 2.5vw, 28px); }
        .oa-card-foot { padding: clamp(12px, 2vh, 16px) clamp(20px, 2.5vw, 28px) clamp(16px, 2.5vh, 22px); border-top: 1px solid #F3F4F8; background: #FAFBFF; }

        .oa-secure-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: linear-gradient(135deg, #EEF2FF, #E8EFFE);
          border: 1px solid #C7D2FE; border-radius: 100px;
          padding: 5px 13px; margin-bottom: 14px; width: fit-content;
        }
        .oa-secure-txt { font-size: 10.5px; color: #4338CA; font-weight: 700; letter-spacing: 0.05em; }
        .oa-title { font-size: clamp(18px, 2vw, 24px); font-weight: 800; color: #0F172A; letter-spacing: -0.4px; line-height: 1.25; margin-bottom: 5px; }
        .oa-subtitle { font-size: clamp(12px, 1vw, 13.5px); color: #6B7280; font-weight: 400; line-height: 1.5; }
        .oa-subtitle strong { color: #1E3A8A; font-weight: 700; }

        /* ── TABS ── */
        .oa-tabs { display: flex; background: #ECEEF5; border-radius: 9px; padding: 3px; gap: 2px; border: 1px solid #E2E6F0; margin-bottom: 18px; }
        .oa-tab {
          flex: 1; text-align: center; padding: 7px 12px;
          border-radius: 7px; font-size: clamp(12px, 1vw, 13.5px);
          font-weight: 600; color: #6B7280; cursor: pointer;
          border: none; background: transparent;
          font-family: inherit; transition: all 0.15s;
        }
        .oa-tab:hover { background: rgba(255,255,255,0.5); color: #374151; }
        .oa-tab.active {
          background: white; color: #0F2280;
          box-shadow: 0 1px 4px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.05);
          font-weight: 700;
        }

        /* ── FORM ELEMENTS ── */
        .oa-label {
          display: block; font-size: 11px; font-weight: 600;
          color: #6B7280; letter-spacing: 0.06em;
          text-transform: uppercase; margin-bottom: 5px;
        }
        .oa-input-wrap { position: relative; margin-bottom: 14px; }
        .oa-input {
          width: 100%; height: clamp(38px, 4.5vh, 44px);
          border: 1.5px solid #E5EAF2; border-radius: 9px;
          padding: 0 14px; padding-right: 42px;
          font-size: clamp(12px, 1vw, 13.5px);
          font-family: inherit; color: #111827;
          background: #FAFBFF;
          box-shadow: 0 1px 2px rgba(0,0,0,0.03);
          transition: border-color 0.18s, box-shadow 0.18s;
          outline: none;
        }
        .oa-input:focus {
          border-color: #1740C8;
          box-shadow: 0 0 0 3px rgba(23,64,200,0.10), 0 1px 2px rgba(0,0,0,0.04);
          background: white;
        }
        .oa-input::placeholder { color: #C1CBDA; font-size: 13px; font-weight: 400; }
        .oa-eye {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          cursor: pointer; color: #94A3B8; font-size: 16px; user-select: none;
          border: none; background: none; padding: 4px; line-height: 1;
        }
        .oa-forgot { text-align: right; margin-top: -8px; margin-bottom: 12px; }
        .oa-forgot a { font-size: 12px; color: #4F6EF7; font-weight: 600; text-decoration: none; }
        .oa-forgot a:hover { text-decoration: underline; }

        /* ── PRIMARY BUTTON ── */
        .oa-btn-primary {
          width: 100%; height: clamp(40px, 4.8vh, 46px);
          background: linear-gradient(135deg, #1740C8 0%, #071352 100%);
          border: none; border-radius: 9px;
          font-size: clamp(13px, 1.1vw, 14.5px); font-weight: 700;
          color: white; letter-spacing: 0.02em;
          box-shadow: 0 4px 14px rgba(7,19,82,0.35), 0 1px 4px rgba(0,0,0,0.12);
          cursor: pointer; font-family: inherit;
          transition: all 0.2s cubic-bezier(0.4,0,0.2,1);
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .oa-btn-primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #1E55E8 0%, #0F2280 100%);
          box-shadow: 0 6px 20px rgba(7,19,82,0.45), 0 2px 6px rgba(0,0,0,0.14);
          transform: translateY(-1px);
        }
        .oa-btn-primary:active { transform: translateY(0); }
        .oa-btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }

        /* ── ALERTS ── */
        .oa-error {
          background: #FEF2F2; border: 1px solid #FECACA;
          border-radius: 8px; padding: 10px 14px;
          font-size: 12.5px; color: #B91C1C; margin-bottom: 14px;
          display: flex; align-items: flex-start; gap: 8px;
        }
        .oa-success {
          background: #F0FDF4; border: 1px solid #BBF7D0;
          border-radius: 8px; padding: 10px 14px;
          font-size: 12.5px; color: #15803D; margin-bottom: 14px;
          display: flex; align-items: flex-start; gap: 8px;
        }
        .oa-ssl {
          display: flex; align-items: center; justify-content: center; gap: 5px;
          padding: 8px 0 2px; font-size: 11px; color: #9CA3AF; font-weight: 500;
        }

        /* ── SUPPORT LINKS ── */
        .oa-support { text-align: center; }
        .oa-support p { font-size: 11px; color: #9CA3AF; margin-bottom: 10px; font-weight: 400; }
        .oa-support-links { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; }
        .oa-support-link {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: clamp(11px, 0.9vw, 12px); color: #4F6EF7; font-weight: 600;
          text-decoration: none; padding: 7px 13px; border-radius: 8px;
          background: #F5F7FF; border: 1px solid #DBEAFE;
          transition: all 0.15s;
        }
        .oa-support-link:hover { background: #EEF2FF; border-color: #A5B4FC; }

        /* ── SPINNER ── */
        .oa-spinner {
          width: 16px; height: 16px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: white;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ════════════════════════════════════════════════════════════════════
           RESPONSIVE BREAKPOINTS
           ════════════════════════════════════════════════════════════════════ */

        /* ── Tablet landscape & small desktop (768px–1024px) ── */
        @media (max-width: 1024px) {
          .oa-left { width: 46%; }
          .oa-right { width: 54%; }
          .oa-desc { max-width: 100%; }
        }

        /* ── Tablet portrait (600px–767px): stack vertically ── */
        @media (max-width: 767px) {
          .oa-shell { flex-direction: column; }
          .oa-left {
            width: 100%;
            min-height: unset;
            padding: clamp(20px, 4vw, 32px) clamp(20px, 5vw, 32px);
            flex-direction: row;
            align-items: center;
            gap: 20px;
          }
          .oa-hero { display: none; }
          .oa-stats { display: none; }
          .oa-footer-txt { display: none; }
          .oa-left-glow1, .oa-left-glow2 { display: none; }
          .oa-right {
            width: 100%;
            padding: clamp(20px, 4vw, 36px) clamp(16px, 5vw, 32px);
            align-items: flex-start;
          }
          .oa-form-wrap { max-width: 100%; }
        }

        /* ── Mobile (≤480px): compact top bar ── */
        @media (max-width: 480px) {
          .oa-left { padding: 14px 16px; gap: 12px; }
          .oa-brand-name { font-size: 15px; }
          .oa-brand-sub { font-size: 10px; }
          .oa-brand-logo, .oa-brand-logo-fallback { width: 32px; height: 32px; }
          .oa-card-head, .oa-card-body, .oa-card-foot { padding-left: 16px; padding-right: 16px; }
          .oa-right { padding: 16px; }
        }

        /* ── Large screens (1440px+): max-width cap ── */
        @media (min-width: 1440px) {
          .oa-left { padding: 60px clamp(52px, 4vw, 80px); }
          .oa-right { padding: 48px clamp(52px, 4vw, 80px); }
          .oa-form-wrap { max-width: 440px; }
        }

        /* ── Ultra-wide (2560px+): prevent left panel from being too wide ── */
        @media (min-width: 2560px) {
          .oa-shell { justify-content: center; }
          .oa-left { max-width: 800px; flex-shrink: 0; }
          .oa-right { max-width: 700px; flex-shrink: 0; }
        }
      `}</style>

      <div className="oa-shell">

        {/* ── LEFT PANEL ── */}
        <div className="oa-left">
          <div className="oa-glow1" />
          <div className="oa-glow2" />
          <div className="oa-dots" />

          {/* Brand */}
          <div className="oa-brand">
            <div className="oa-brand-logo-fallback">OA</div>
            <div>
              <div className="oa-brand-name">OneAccounts</div>
              <div className="oa-brand-sub">by Siqbal &nbsp;·&nbsp; PKR Suite</div>
            </div>
          </div>

          {/* Hero */}
          <div className="oa-hero">
            <div className="oa-badge">
              <div className="oa-badge-dot" />
              <span className="oa-badge-text">Cloud Accounting Platform</span>
            </div>
            <div className="oa-headline">
              Smart Accounting,<br />
              <span className="oa-headline-gradient">Stronger Business.</span>
            </div>
            <div className="oa-desc">
              Complete double-entry accounting, invoicing, inventory &amp; financial
              reporting — purpose-built for Pakistani businesses.
            </div>
            <div className="oa-pills">
              {PILLS.map(p => <span key={p} className="oa-pill">{p}</span>)}
            </div>
          </div>

          {/* Stats */}
          <div>
            <div className="oa-stats">
              {STATS.map(s => (
                <div key={s.label}>
                  <div className="oa-stat-val">{s.value}</div>
                  <div className="oa-stat-lbl">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="oa-footer-txt">
              © 2025 OneAccounts by Siqbal. All rights reserved.
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="oa-right">
          <div className="oa-form-wrap">
            <div className="oa-card">

              {/* Card Head */}
              <div className="oa-card-head">
                <div className="oa-secure-badge">
                  <span>🔒</span>
                  <span className="oa-secure-txt">SECURE LOGIN</span>
                </div>
                <div className="oa-title">Welcome back 👋</div>
                <div className="oa-subtitle">
                  Sign in to your&nbsp;
                  <strong>OneAccounts</strong>&nbsp;workspace
                </div>
              </div>

              {/* Card Body */}
              <div className="oa-card-body">

                {/* Tabs */}
                <div className="oa-tabs">
                  <button className={`oa-tab${tab === "signin" ? " active" : ""}`} onClick={() => switchTab("signin")}>Sign In</button>
                  <button className={`oa-tab${tab === "signup" ? " active" : ""}`} onClick={() => switchTab("signup")}>Sign Up</button>
                </div>

                {/* Alerts */}
                {error   && <div className="oa-error">⚠️ {error}</div>}
                {success && <div className="oa-success">✅ {success}</div>}

                {/* Sign In Form */}
                {tab === "signin" && (
                  <form onSubmit={handleSignIn} noValidate>
                    <label className="oa-label" htmlFor="si-email">Email Address</label>
                    <div className="oa-input-wrap">
                      <input id="si-email" type="email" className="oa-input"
                        placeholder="you@company.com"
                        value={email} onChange={e => setEmail(e.target.value)}
                        autoComplete="email" autoFocus
                      />
                    </div>

                    <label className="oa-label" htmlFor="si-pass">Password</label>
                    <div className="oa-input-wrap">
                      <input id="si-pass" type={showPass ? "text" : "password"} className="oa-input"
                        placeholder="Enter your password"
                        value={password} onChange={e => setPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                      <button type="button" className="oa-eye" onClick={() => setShowPass(p => !p)} tabIndex={-1}>
                        {showPass ? "🙈" : "👁"}
                      </button>
                    </div>

                    <div className="oa-forgot">
                      <a href="/forgot-password">Forgot password?</a>
                    </div>

                    <button type="submit" className="oa-btn-primary" disabled={loading}>
                      {loading ? <><div className="oa-spinner" /> Signing in…</> : <>Sign In &nbsp;→</>}
                    </button>

                    <div className="oa-ssl">🔒 256-bit SSL encrypted &nbsp;·&nbsp; Your data is safe</div>
                  </form>
                )}

                {/* Sign Up Form */}
                {tab === "signup" && (
                  <form onSubmit={handleSignUp} noValidate>
                    <label className="oa-label" htmlFor="su-email">Email Address</label>
                    <div className="oa-input-wrap">
                      <input id="su-email" type="email" className="oa-input"
                        placeholder="you@company.com"
                        value={email} onChange={e => setEmail(e.target.value)}
                        autoComplete="email" autoFocus
                      />
                    </div>

                    <label className="oa-label" htmlFor="su-pass">Password</label>
                    <div className="oa-input-wrap">
                      <input id="su-pass" type={showPass ? "text" : "password"} className="oa-input"
                        placeholder="Create a strong password (min 8 chars)"
                        value={password} onChange={e => setPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                      <button type="button" className="oa-eye" onClick={() => setShowPass(p => !p)} tabIndex={-1}>
                        {showPass ? "🙈" : "👁"}
                      </button>
                    </div>

                    <button type="submit" className="oa-btn-primary" disabled={loading}>
                      {loading ? <><div className="oa-spinner" /> Creating account…</> : <>Create Account &nbsp;→</>}
                    </button>

                    <div className="oa-ssl">🔒 256-bit SSL encrypted &nbsp;·&nbsp; Your data is safe</div>
                  </form>
                )}
              </div>

              {/* Card Footer */}
              <div className="oa-card-foot">
                <div className="oa-support">
                  <p>Need help? Our support team is here for you.</p>
                  <div className="oa-support-links">
                    <a href="tel:03117798157" className="oa-support-link">📞 0311-7798157</a>
                    <a href="mailto:siqbalhwc@gmail.com" className="oa-support-link">✉ siqbalhwc@gmail.com</a>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
