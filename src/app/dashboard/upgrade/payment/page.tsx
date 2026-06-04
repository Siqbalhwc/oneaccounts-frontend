"use client"

import { useSearchParams } from "next/navigation"
import { ArrowLeft, Building2, Copy, Check, Upload, Loader2 } from "lucide-react"
import { useState, useRef } from "react"

export default function PaymentPage() {
  const searchParams = useSearchParams()
  const amount       = searchParams.get("amount") || "0"
  const period       = searchParams.get("period") || "yearly"
  const plan         = searchParams.get("plan") || "basic"
  const topups       = searchParams.get("topups") || ""

  const periodLabel: Record<string, string> = {
    monthly:     "month",
    half_yearly: "6 months",
    yearly:      "year",
  }
  const displayPeriod = periodLabel[period] || period

  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0])
    }
  }

  const handleSubmit = async () => {
    if (!selectedFile) return
    setUploading(true)

    const formData = new FormData()
    formData.append("receipt", selectedFile)
    formData.append("amount", amount)
    formData.append("period", period)
    formData.append("plan", plan)
    formData.append("topups", topups)

    const res = await fetch("/api/upgrade/confirm", {
      method: "POST",
      body: formData,
    })
    const data = await res.json()

    if (data.success) {
      setSuccess(true)
    } else {
      alert(data.error || "Something went wrong")
    }
    setUploading(false)
  }

  // Success state
  if (success) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", minHeight: "60vh", gap: 16,
        fontFamily: "'Inter', sans-serif", padding: 24,
        background: "var(--bg)", color: "var(--text)",
      }}>
        <div style={{ fontSize: 48 }}>✅</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Payment Submitted!</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", maxWidth: 400, lineHeight: 1.6 }}>
          Your plan is now active. You will receive a confirmation email at your registered email address shortly.
        </p>
        <a
          href="/dashboard"
          style={{
            background: "var(--primary)", color: "var(--primary-text)", padding: "12px 24px",
            borderRadius: 10, textDecoration: "none", fontWeight: 700,
          }}
        >
          Go to Dashboard
        </a>
      </div>
    )
  }

  // Normal checkout page
  return (
    <div style={{
      padding: 24, background: "var(--bg)", minHeight: "100vh",
      fontFamily: "'Inter', sans-serif", maxWidth: 650, margin: "0 auto",
      color: "var(--text)",
    }}>
      <a
        href="/dashboard/upgrade"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          color: "var(--primary)", textDecoration: "none", marginBottom: 20,
          fontWeight: 500,
        }}
      >
        <ArrowLeft size={16} /> Back to Plan
      </a>

      {/* Payment header card */}
      <div style={{
        background: "var(--card)", borderRadius: 18, padding: 28,
        boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)",
        marginBottom: 20,
      }}>
        <h1 style={{
          fontSize: 22, fontWeight: 800, display: "flex", alignItems: "center", gap: 8,
          color: "var(--text)", margin: 0,
        }}>
          <Building2 size={24} /> Bank Transfer
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 4 }}>
          Complete your payment to one of the accounts below, then upload the transfer receipt.
        </p>

        <div style={{
          marginTop: 20, background: "var(--bg-soft)", borderRadius: 12, padding: 16,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          border: "1px solid var(--border)",
        }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--primary)" }}>Total Amount</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: "var(--text)" }}>
            PKR {Number(amount).toLocaleString()}
          </span>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          Plan: {plan} · Billing: {displayPeriod}
        </p>
      </div>

      {/* Bank accounts */}
      {bankAccounts.map((acc, i) => (
        <div
          key={i}
          style={{
            background: "var(--card)", borderRadius: 18, padding: 20,
            boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)",
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: 0 }}>{acc.bankName}</h2>
          <div style={{ marginTop: 12 }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 14,
            }}>
              <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>Account Title</span>
              <span style={{ color: "var(--text)" }}>{acc.accountTitle}</span>
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 14,
            }}>
              <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>Account Number</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--text)" }}>{acc.accountNumber}</span>
                <button
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--primary)",
                  }}
                  onClick={() => handleCopy(acc.accountNumber, `acc-${i}`)}
                >
                  {copiedField === `acc-${i}` ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            {acc.iban && (
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 0", fontSize: 14,
              }}>
                <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>IBAN</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "var(--text)" }}>{acc.iban}</span>
                  <button
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--primary)",
                    }}
                    onClick={() => handleCopy(acc.iban, `iban-${i}`)}
                  >
                    {copiedField === `iban-${i}` ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Upload section */}
      <div style={{
        background: "var(--card)", borderRadius: 18, padding: 28,
        boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)",
        marginBottom: 20,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--text)" }}>
          📎 Attach Payment Receipt
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Upload a screenshot or photo of the transfer confirmation.
        </p>

        <input
          type="file"
          accept="image/*,.pdf"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {selectedFile ? (
          <div style={{
            marginTop: 12, display: "flex", alignItems: "center", gap: 10,
            background: "var(--bg)", padding: 10, borderRadius: 10,
            border: "1px solid var(--border)",
          }}>
            <span style={{ fontSize: 13, color: "var(--text)", flex: 1 }}>
              {selectedFile.name}
            </span>
            <button
              onClick={() => setSelectedFile(null)}
              style={{
                background: "none", border: "none", color: "#EF4444",
                cursor: "pointer", fontSize: 13, fontWeight: 600,
              }}
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              marginTop: 12, padding: "12px 20px", borderRadius: 10,
              border: "2px dashed var(--border)", background: "var(--bg)",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
              fontSize: 14, color: "var(--text-muted)", width: "100%", justifyContent: "center",
            }}
          >
            <Upload size={16} /> Choose file
          </button>
        )}

        <button
          onClick={handleSubmit}
          disabled={!selectedFile || uploading}
          style={{
            marginTop: 16, width: "100%", padding: 14, borderRadius: 12,
            background: uploading ? "var(--text-muted)" : "var(--primary)",
            color: uploading ? "#fff" : "var(--primary-text)",
            border: "none", fontSize: 15, fontWeight: 700,
            cursor: uploading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {uploading ? (
            <><Loader2 size={16} className="animate-spin" /> Processing...</>
          ) : (
            "Submit Payment & Activate Plan"
          )}
        </button>
      </div>

      {/* Info note */}
      <div style={{
        background: "var(--bg-soft)", border: "1px solid var(--border)",
        borderRadius: 12, padding: 14, fontSize: 13, color: "var(--text-muted)",
        lineHeight: 1.6,
      }}>
        📧 A confirmation email will be sent to your registered email address. Activation is immediate.
      </div>
    </div>
  )
}