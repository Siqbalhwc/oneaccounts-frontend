"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowRight } from "lucide-react"

const PLAN_PRICES: Record<string, number> = {
  basic: 1999,
  pro: 4999,
  enterprise: 0,
}

const BANK_DETAILS = {
  accounts: [
    {
      bank: "Standard Chartered Bank",
      accountNo: "01-1659402-01",
      title: "Shahid Iqbal",
    },
    {
      bank: "Meezan Bank (IBAN)",
      accountNo: "02850106669725",
      iban: "PK40MEZN0002850106669725",
      title: "SHAHID IQBAL",
    },
  ],
  mobile: "0321-4315665",
  email: "siqbalhwc@gmail.com",
}

export default function NewCompanyPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [companyName, setCompanyName] = useState("")
  const [selectedPlan, setSelectedPlan] = useState("basic")
  const [paymentMethod, setPaymentMethod] = useState<"jazzcash" | "bank">("jazzcash")
  const [loadingJazzCash, setLoadingJazzCash] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  // Bank transfer fields
  const [reference, setReference] = useState("")
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null)
  const [submittingBank, setSubmittingBank] = useState(false)

  // ─── JazzCash Payment ────────────────────────────────
  const handleJazzCash = async () => {
    if (!companyName.trim()) return
    setLoadingJazzCash(true)
    setErrorMsg("")

    const price = PLAN_PRICES[selectedPlan]
    if (!price) {
      window.location.href = `mailto:siqbalhwc@gmail.com?subject=Enterprise Plan for ${companyName.trim()}`
      return
    }

    try {
      const res = await fetch("/api/payments/jazzcash/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: price,
          paymentType: "create_company",
          metadata: {
            company_name: companyName.trim(),
            plan_code: selectedPlan,
          },
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setErrorMsg(data.error || "Payment setup failed")
        setLoadingJazzCash(false)
        return
      }

      const form = document.createElement("form")
      form.method = "POST"
      form.action = data.redirectUrl
      Object.entries(data.params).forEach(([key, value]) => {
        const input = document.createElement("input")
        input.type = "hidden"
        input.name = key
        input.value = value as string
        form.appendChild(input)
      })
      document.body.appendChild(form)
      form.submit()
    } catch (e) {
      setErrorMsg("Network error")
      setLoadingJazzCash(false)
    }
  }

  // ─── Bank Transfer Submission ─────────────────────────
  const handleBankSubmit = async () => {
    if (!companyName.trim()) return
    if (!reference.trim() && !evidenceFile) {
      setErrorMsg("Please enter the transaction reference or upload the transfer receipt.")
      return
    }
    setSubmittingBank(true)
    setErrorMsg("")

    let evidenceUrl = ""
    if (evidenceFile) {
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("reports")
        .upload(`bank-proofs/${Date.now()}-${evidenceFile.name}`, evidenceFile, {
          cacheControl: "3600",
          upsert: false,
        })
      if (uploadErr) {
        setErrorMsg("Failed to upload evidence.")
        setSubmittingBank(false)
        return
      }
      const { data: pubData } = supabase.storage
        .from("reports")
        .getPublicUrl(uploadData.path)
      evidenceUrl = pubData.publicUrl
    }

    const res = await fetch("/api/companies/request-bank-transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_name: companyName.trim(),
        plan_code: selectedPlan,
        reference_code: reference.trim(),
        evidence_url: evidenceUrl,
      }),
    })
    const data = await res.json()
    if (!data.success) {
      setErrorMsg(data.error || "Request failed")
      setSubmittingBank(false)
      return
    }

    setSubmittingBank(false)
    alert("Your request has been submitted. We will verify the payment and create your company shortly.")
    router.push("/dashboard")
  }

  return (
    <div style={{ maxWidth: 500, margin: "30px auto", background: "white", padding: 24, borderRadius: 12, border: "1px solid #E2E8F0" }}>
      <h2 style={{ marginBottom: 4, fontSize: 20, fontWeight: 800 }}>Add New Company</h2>
      <p style={{ fontSize: 13, color: "#64748B", marginBottom: 18 }}>
        Choose a plan and payment method.
      </p>

      {/* Company Name */}
      <input
        type="text"
        placeholder="Company Name"
        value={companyName}
        onChange={e => setCompanyName(e.target.value)}
        style={{
          width: "100%", padding: "8px 12px", border: "1px solid #E2E8F0",
          borderRadius: 6, fontSize: 13, marginBottom: 16, boxSizing: "border-box",
        }}
      />

      {/* Plan Selection */}
      <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Select Plan</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["basic", "pro", "enterprise"].map(code => (
          <button
            key={code}
            onClick={() => setSelectedPlan(code)}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 8,
              border: selectedPlan === code ? "2px solid #1D4ED8" : "1px solid #E2E8F0",
              background: selectedPlan === code ? "#EEF2FF" : "white",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {code.charAt(0).toUpperCase() + code.slice(1)}
          </button>
        ))}
      </div>

      {/* Payment Method */}
      <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Payment Method</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setPaymentMethod("jazzcash")}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 8,
            border: paymentMethod === "jazzcash" ? "2px solid #1D4ED8" : "1px solid #E2E8F0",
            background: paymentMethod === "jazzcash" ? "#EEF2FF" : "white",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          💳 JazzCash
        </button>
        <button
          onClick={() => setPaymentMethod("bank")}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 8,
            border: paymentMethod === "bank" ? "2px solid #1D4ED8" : "1px solid #E2E8F0",
            background: paymentMethod === "bank" ? "#EEF2FF" : "white",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          🏦 Bank Transfer
        </button>
      </div>

      {errorMsg && (
        <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: "6px 10px", borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
          {errorMsg}
        </div>
      )}

      {/* ── JazzCash Section ── */}
      {paymentMethod === "jazzcash" && (
        <div>
          <p style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>
            You will be redirected to JazzCash to pay{" "}
            <strong>PKR {PLAN_PRICES[selectedPlan]?.toLocaleString() || "Custom"}</strong> for the first month.
          </p>
          <button
            onClick={handleJazzCash}
            disabled={loadingJazzCash || !companyName.trim()}
            style={{
              width: "100%",
              padding: 10,
              background: "#1D4ED8",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {loadingJazzCash ? "Processing..." : "Pay with JazzCash"}
          </button>
        </div>
      )}

      {/* ── Bank Transfer Section ── */}
      {paymentMethod === "bank" && (
        <div style={{ background: "#F8FAFC", padding: 14, borderRadius: 8, fontSize: 12 }}>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Bank Details</p>

          {BANK_DETAILS.accounts.map((acc, idx) => (
            <div key={idx} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: idx < BANK_DETAILS.accounts.length - 1 ? "1px solid #E2E8F0" : "none" }}>
              <p><strong>{acc.bank}</strong></p>
              <p>Account No: <strong>{acc.accountNo}</strong></p>
              {acc.iban && <p>IBAN: <strong>{acc.iban}</strong></p>}
              <p>Title: <strong>{acc.title}</strong></p>
            </div>
          ))}

          <p style={{ marginTop: 8 }}>Mobile: <strong>{BANK_DETAILS.mobile}</strong></p>
          <p>Email: <strong>{BANK_DETAILS.email}</strong></p>

          <p style={{ marginTop: 8, fontWeight: 600 }}>
            Amount: PKR {PLAN_PRICES.basic.toLocaleString()} (Basic only)
          </p>
          <p style={{ marginTop: 8, color: "#B91C1C" }}>
            After transfer, enter the transaction reference and attach the receipt below.
          </p>

          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginTop: 10 }}>Transaction Reference</label>
          <input
            type="text"
            placeholder="e.g. TID 1234567890"
            value={reference}
            onChange={e => setReference(e.target.value)}
            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #E2E8F0", fontSize: 12, marginBottom: 8 }}
          />

          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginTop: 6 }}>Transfer Receipt (optional)</label>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={e => setEvidenceFile(e.target.files?.[0] || null)}
            style={{ fontSize: 12, marginBottom: 12 }}
          />

          <button
            onClick={handleBankSubmit}
            disabled={submittingBank || !companyName.trim()}
            style={{
              width: "100%",
              padding: 10,
              background: "#10B981",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {submittingBank ? "Submitting..." : "Submit for Verification"}
          </button>
        </div>
      )}
    </div>
  )
}