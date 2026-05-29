"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { ArrowLeft, Building2, Copy, Check, Upload, ShieldCheck, Clock, RefreshCw } from "lucide-react"
import { useState, useRef } from "react"

const BANK_DETAILS = {
  "Account Title": "Shahid Iqbal",
  "Bank Name":     "Habib Bank Limited (HBL)",
  "Account Number": "1234-5678-9012-3456",
  "IBAN":          "PK12HBL0001234567890123",
}

// Raw values for clipboard (no dashes)
const BANK_COPY_VALUES: Record<string, string> = {
  "Account Title":  "Shahid Iqbal",
  "Bank Name":      "Habib Bank Limited (HBL)",
  "Account Number": "123456789012456",
  "IBAN":           "PK12HBL0001234567890123",
}

const PERIOD_LABELS: Record<string, string> = {
  monthly:     "month",
  half_yearly: "6 months",
  yearly:      "year",
}

export default function PaymentPage() {
  const searchParams = useSearchParams()
  const router       = useRouter()

  const rawAmount = searchParams.get("amount") || "0"
  const period    = searchParams.get("period") || "yearly"
  const plan      = searchParams.get("plan")   || "basic"

  // FIX: topup params — when coming from topup activation flow
  const topupCode = searchParams.get("topup")      || ""
  const topupName = searchParams.get("topup_name") || ""
  const isTopup   = !!topupCode

  const amount      = Number(rawAmount)
  const periodLabel = PERIOD_LABELS[period] || period

  // FIX: per-field copy state instead of a single shared boolean
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // FIX: file upload state
  const [uploadedFile, setUploadedFile]   = useState<File | null>(null)
  const [isDragOver, setIsDragOver]       = useState(false)
  const fileInputRef                       = useRef<HTMLInputElement>(null)

  // FIX: submission confirmation state
  const [submitted, setSubmitted] = useState(false)

  const handleCopy = (field: string) => {
    navigator.clipboard.writeText(BANK_COPY_VALUES[field] || BANK_DETAILS[field as keyof typeof BANK_DETAILS])
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleFileChange = (file: File | null) => {
    if (!file) return
    const allowed = ["image/jpeg", "image/png", "application/pdf"]
    if (!allowed.includes(file.type)) {
      alert("Please upload a JPG, PNG, or PDF file.")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("File must be under 5 MB.")
      return
    }
    setUploadedFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    handleFileChange(file || null)
  }

  const handleSubmit = () => {
    // In production: POST to your API with the file + transaction details
    // For now, just show confirmation state
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div
        style={{
          padding: 24,
          background: "#F8FAFC",
          minHeight: "100vh",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: 18,
            padding: 40,
            textAlign: "center",
            maxWidth: 460,
            border: "1px solid #E2E8F0",
            boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "#DCFCE7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <Check size={28} color="#16A34A" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>
            Transfer confirmed!
          </h2>
          <p style={{ fontSize: 14, color: "#64748B", marginBottom: 24, lineHeight: 1.6 }}>
            Thank you. We've received your transfer notification
            {uploadedFile ? " and your receipt" : ""}. Your account will be
            activated within <strong>2 hours</strong>.
          </p>
          <p style={{ fontSize: 13, color: "#94A3B8", marginBottom: 24 }}>
            Questions? Email us at{" "}
            <a href="mailto:siqbalhwc@gmail.com" style={{ color: "#3B82F6", textDecoration: "none" }}>
              siqbalhwc@gmail.com
            </a>
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            style={{
              background: "linear-gradient(135deg, #1740C8, #071352)",
              color: "white",
              border: "none",
              padding: "12px 28px",
              borderRadius: 10,
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: 24,
        background: "#F8FAFC",
        minHeight: "100vh",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        maxWidth: 600,
        margin: "0 auto",
      }}
    >
      <style>{`
        .detail-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 11px 0; border-bottom: 1px solid #F1F5F9; font-size: 14px;
        }
        .detail-row:last-child { border-bottom: none; }
        .copy-btn {
          background: none; border: none; cursor: pointer;
          color: #94A3B8; padding: 4px; border-radius: 6px;
          display: flex; align-items: center; transition: color 0.15s, background 0.15s;
        }
        .copy-btn:hover { color: #3B82F6; background: #EFF6FF; }
        .upload-zone {
          border: 2px dashed #CBD5E1; border-radius: 12px;
          padding: 28px; text-align: center; cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
          background: #F8FAFC;
        }
        .upload-zone:hover, .upload-zone.drag-over {
          border-color: #3B82F6; background: #EFF6FF;
        }
        .upload-zone.has-file {
          border-color: #10B981; background: #F0FDF4;
        }
        .btn-primary {
          background: linear-gradient(135deg, #1740C8, #071352);
          color: white; border: none; padding: 14px 24px;
          border-radius: 12px; font-weight: 700; cursor: pointer;
          width: 100%; font-size: 15px; display: flex;
          align-items: center; justify-content: center; gap: 8px;
          transition: opacity 0.2s;
        }
        .btn-primary:hover { opacity: 0.88; }
        .btn-later {
          width: 100%; padding: 11px; background: none;
          color: #94A3B8; border: 1px solid #E2E8F0;
          border-radius: 10px; font-weight: 500; cursor: pointer;
          font-size: 14px; transition: background 0.15s;
        }
        .btn-later:hover { background: #F1F5F9; color: #475569; }
        .trust-row {
          display: flex; gap: 20px; justify-content: center;
          flex-wrap: wrap; margin-top: 14px;
        }
        .trust-item {
          display: flex; align-items: center; gap: 5px;
          font-size: 12px; color: #94A3B8;
        }
      `}</style>

      {/* Back link */}
      <button
        onClick={() => router.push("/dashboard/upgrade")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "#3B82F6",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontWeight: 500,
          fontSize: 14,
          padding: 0,
          marginBottom: 20,
        }}
      >
        <ArrowLeft size={16} /> Back to Plan
      </button>

      <div
        style={{
          background: "white",
          borderRadius: 18,
          padding: 28,
          boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
          border: "1px solid #E2E8F0",
        }}
      >
        {/* Header */}
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#0F172A",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Building2 size={22} /> Bank Transfer
        </h1>
        <p style={{ color: "#64748B", fontSize: 14, marginTop: 4, marginBottom: 24 }}>
          Complete your payment using the details below.
        </p>

        {/* FIX: order summary card with proper breakdown */}
        <div
          style={{
            background: "#F8FAFC",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 24,
            border: "1px solid #E2E8F0",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#94A3B8",
              marginBottom: 10,
            }}
          >
            Order summary
          </div>

          <div className="detail-row" style={{ padding: "7px 0" }}>
            <span style={{ color: "#64748B" }}>Plan</span>
            <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{plan}</span>
          </div>

          {/* FIX: show topup name when it's a topup payment */}
          {isTopup && (
            <div className="detail-row" style={{ padding: "7px 0" }}>
              <span style={{ color: "#64748B" }}>Add-on</span>
              <span style={{ fontWeight: 600 }}>{topupName || topupCode}</span>
            </div>
          )}

          <div className="detail-row" style={{ padding: "7px 0" }}>
            <span style={{ color: "#64748B" }}>Billing period</span>
            <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{periodLabel}</span>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 10,
              marginTop: 6,
              borderTop: "1px solid #E2E8F0",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 15, color: "#0F172A" }}>Total</span>
            {/* FIX: show "Contact us" when amount is 0 instead of "PKR 0" */}
            {amount > 0 ? (
              <span style={{ fontSize: 22, fontWeight: 800, color: "#0F172A" }}>
                PKR {amount.toLocaleString()}
              </span>
            ) : (
              <span style={{ fontSize: 16, fontWeight: 700, color: "#94A3B8" }}>
                Contact support
              </span>
            )}
          </div>
        </div>

        {/* Bank account details */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#94A3B8",
            marginBottom: 8,
          }}
        >
          Bank account details
        </div>

        <div style={{ marginBottom: 24 }}>
          {Object.entries(BANK_DETAILS).map(([label, value]) => (
            <div key={label} className="detail-row">
              <span style={{ color: "#475569" }}>{label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 600, color: "#0F172A" }}>{value}</span>
                {/* FIX: per-field copy state */}
                <button
                  className="copy-btn"
                  onClick={() => handleCopy(label)}
                  title={`Copy ${label}`}
                >
                  {copiedField === label ? (
                    <Check size={14} color="#10B981" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* FIX: upload zone for transaction screenshot */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#94A3B8",
            marginBottom: 8,
          }}
        >
          Upload receipt / screenshot
        </div>

        <input
          type="file"
          ref={fileInputRef}
          accept="image/jpeg,image/png,application/pdf"
          style={{ display: "none" }}
          onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
        />

        <div
          className={`upload-zone ${isDragOver ? "drag-over" : ""} ${uploadedFile ? "has-file" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          style={{ marginBottom: 20 }}
        >
          {uploadedFile ? (
            <>
              <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#065F46" }}>
                {uploadedFile.name}
              </div>
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                Click to replace
              </div>
            </>
          ) : (
            <>
              <Upload size={24} color="#94A3B8" style={{ margin: "0 auto 8px" }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>
                Upload transaction screenshot
              </div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
                Drag &amp; drop or click — JPG, PNG, PDF up to 5 MB
              </div>
            </>
          )}
        </div>

        {/* Info box */}
        <div
          style={{
            fontSize: 13,
            color: "#475569",
            background: "#FEF3C7",
            padding: "10px 14px",
            borderRadius: 8,
            marginBottom: 20,
            lineHeight: 1.6,
          }}
        >
          After transferring, email us at{" "}
          <strong>siqbalhwc@gmail.com</strong> with your transaction ID or upload
          your receipt above. Your account will be activated within{" "}
          <strong>2 hours</strong>.
        </div>

        {/* FIX: primary CTA is "I've transferred", "later" is demoted */}
        <button className="btn-primary" onClick={handleSubmit}>
          <Check size={16} /> I&apos;ve made the transfer
        </button>
        <div style={{ height: 8 }} />
        <button
          className="btn-later"
          onClick={() => router.push("/dashboard/upgrade")}
        >
          I&apos;ll do it later
        </button>

        {/* Trust row */}
        <div className="trust-row">
          <span className="trust-item"><ShieldCheck size={13} /> Secure</span>
          <span className="trust-item"><Clock size={13} /> Activated in 2 hrs</span>
          <span className="trust-item"><RefreshCw size={13} /> 7-day refund policy</span>
        </div>
      </div>
    </div>
  )
}
