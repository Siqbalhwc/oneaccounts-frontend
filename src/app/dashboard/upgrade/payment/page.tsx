"use client"

import { useSearchParams } from "next/navigation"
import { ArrowLeft, Building2, Copy, Check } from "lucide-react"
import { useState } from "react"

export default function PaymentPage() {
  const searchParams = useSearchParams()
  const amount = searchParams.get("amount") || "0"
  const period = searchParams.get("period") || "yearly"
  const plan = searchParams.get("plan") || "basic"

  const periodLabel = period === "monthly" ? "month" : period === "half_yearly" ? "6 months" : "year"

  const [copied, setCopied] = useState(false)

  const bankDetails = {
    accountTitle: "Shahid Iqbal",
    bankName: "Habib Bank Limited (HBL)",
    accountNumber: "1234-5678-9012-3456",
    iban: "PK12HBL0001234567890123",
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ padding: 24, background: "#F8FAFC", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif", maxWidth: 600, margin: "0 auto" }}>
      <a href="/dashboard/upgrade" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#3B82F6", textDecoration: "none", marginBottom: 20, fontWeight: 500 }}>
        <ArrowLeft size={16} /> Back to Plan
      </a>

      <div style={{ background: "white", borderRadius: 18, padding: 28, boxShadow: "0 10px 30px rgba(0,0,0,0.05)", border: "1px solid #E2E8F0" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", display: "flex", alignItems: "center", gap: 8 }}>
          <Building2 size={24} /> Bank Transfer
        </h1>
        <p style={{ color: "#64748B", fontSize: 14, marginTop: 4 }}>Complete your payment using the details below.</p>

        <div style={{ marginTop: 24, background: "#F1F5F9", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Total Amount</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: "#0F172A" }}>PKR {Number(amount).toLocaleString()}</span>
          </div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
            Plan: {plan} · Billing: {periodLabel}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>Bank Account Details</label>
          <div style={{ marginTop: 8 }}>
            {Object.entries(bankDetails).map(([key, value]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #E2E8F0", fontSize: 14 }}>
                <span style={{ color: "#475569", textTransform: "capitalize" }}>
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 500 }}>{value}</span>
                  <button onClick={() => handleCopy(value)} style={{ background: "none", border: "none", cursor: "pointer", color: "#3B82F6", padding: 2 }}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 24, fontSize: 13, color: "#475569", background: "#FEF3C7", padding: "10px 14px", borderRadius: 8 }}>
          After transferring, please email us at <strong>siqbalhwc@gmail.com</strong> with your transaction ID or screenshot. Your account will be activated within 2 hours.
        </div>

        <a
          href="/dashboard/upgrade"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "100%", marginTop: 20, padding: "12px 0", background: "#E2E8F0", color: "#475569", borderRadius: 10, textDecoration: "none", fontWeight: 600 }}
        >
          I'll do it later
        </a>
      </div>
    </div>
  )
}