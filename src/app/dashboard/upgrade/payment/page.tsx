"use client"

import { useSearchParams } from "next/navigation"
import { ArrowLeft, Building2, Copy, Check } from "lucide-react"
import { useState } from "react"

export default function PaymentPage() {
  const searchParams = useSearchParams()
  const amount       = searchParams.get("amount") || "0"
  const period       = searchParams.get("period") || "yearly"
  const plan         = searchParams.get("plan") || "basic"
  const topupParam   = searchParams.get("topup")
  const topupName    = searchParams.get("topup_name")

  const periodLabel: Record<string, string> = {
    monthly:     "month",
    half_yearly: "6 months",
    yearly:      "year",
  }

  const displayPeriod = periodLabel[period] || period

  const [copiedField, setCopiedField] = useState<string | null>(null)

  const bankAccounts = [
    {
      bankName:       "Standard Chartered Bank",
      accountTitle:   "Shahid Iqbal",
      accountNumber:  "01-1659402-01",
      iban:           null,
    },
    {
      bankName:       "Meezan Bank",
      accountTitle:   "Shahid Iqbal",
      accountNumber:  "02850106669725",
      iban:           "PK40MEZN0002850106669725",
    },
  ]

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  return (
    <div style={{
      padding: 24,
      background: "#F8FAFC",
      minHeight: "100vh",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      maxWidth: 650,
      margin: "0 auto",
    }}>
      <style>{`
        .card {
          background: white; border-radius: 18px; padding: 28px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.05);
          border: 1px solid #E2E8F0; margin-bottom: 20px;
        }
        .bank-card {
          background: #F1F5F9; border-radius: 14px;
          padding: 16px; margin-bottom: 12px;
          border: 1px solid #E2E8F0;
        }
        .detail-row {
          display: flex; justify-content: space-between;
          align-items: center; padding: 8px 0;
          border-bottom: 1px solid #E2E8F0;
          font-size: 14px; color: #0F172A;
        }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { font-weight: 600; color: #475569; }
        .copy-btn {
          background: none; border: none; cursor: pointer;
          color: #3B82F6; padding: 2px; display: flex;
          align-items: center;
        }
        .btn-back {
          display: inline-flex; align-items: center; gap: 6px;
          color: #3B82F6; text-decoration: none; margin-bottom: 20px;
          font-weight: 500; font-size: 14px;
        }
      `}</style>

      <a href="/dashboard/upgrade" className="btn-back">
        <ArrowLeft size={16} /> Back to Plan
      </a>

      <div className="card">
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", display: "flex", alignItems: "center", gap: 8 }}>
          <Building2 size={24} /> Bank Transfer
        </h1>
        <p style={{ color: "#64748B", fontSize: 14, marginTop: 4 }}>
          Complete your payment to the account below. Your plan will be activated within 2 hours after verification.
        </p>

        {/* Amount box */}
        <div style={{
          marginTop: 20,
          background: "#EFF6FF",
          borderRadius: 12,
          padding: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          border: "1px solid #BFDBFE",
        }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "#1E3A8A" }}>Total Amount</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: "#0F172A" }}>
            PKR {Number(amount).toLocaleString()}
          </span>
        </div>

        {topupName && (
          <p style={{ fontSize: 13, color: "#64748B", marginTop: 8 }}>
            Including add‑on: <strong>{topupName}</strong>
          </p>
        )}
        <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
          Plan: {plan} · Billing: {displayPeriod}
        </p>
      </div>

      {/* Bank accounts */}
      {bankAccounts.map((acc, i) => (
        <div className="card" key={i} style={{ padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", marginTop: 0 }}>
            {acc.bankName}
          </h2>
          <div style={{ marginTop: 12 }}>
            <div className="detail-row">
              <span className="detail-label">Account Title</span>
              <span>{acc.accountTitle}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Account Number</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>{acc.accountNumber}</span>
                <button
                  className="copy-btn"
                  onClick={() => handleCopy(acc.accountNumber, `accnum-${i}`)}
                  title="Copy account number"
                >
                  {copiedField === `accnum-${i}` ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            {acc.iban && (
              <div className="detail-row">
                <span className="detail-label">IBAN</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13 }}>{acc.iban}</span>
                  <button
                    className="copy-btn"
                    onClick={() => handleCopy(acc.iban, `iban-${i}`)}
                    title="Copy IBAN"
                  >
                    {copiedField === `iban-${i}` ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      <div className="card" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
        <p style={{ margin: 0, fontSize: 13, color: "#92400E", lineHeight: 1.6 }}>
          📧 After transferring, please email <strong>siqbalhwc@gmail.com</strong> with your transaction ID or a screenshot.
          Your plan will be activated within 2 hours.
        </p>
      </div>

      <a
        href="/dashboard/upgrade"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "14px 0", borderRadius: 12,
          background: "#E2E8F0", color: "#475569",
          textDecoration: "none", fontWeight: 600,
        }}
      >
        I&apos;ll do it later
      </a>
    </div>
  )
}