"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function NewCompanyPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleCreate = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/companies/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: name }),
      })
      const data = await res.json()
      if (data.success) {
        router.push("/dashboard")
      } else {
        setError(data.error || "Creation failed")
      }
    } catch (e) {
      setError("Network error. Please try again.")
    }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 400, margin: "40px auto", background: "white", padding: 24, borderRadius: 12, border: "1px solid #E2E8F0" }}>
      <h2 style={{ marginBottom: 4 }}>Start a Free Trial</h2>
      <p style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>
        14‑day trial with all features. No card required.
      </p>

      {error && (
        <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: "8px 12px", borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <input
        type="text"
        placeholder="Company Name"
        value={name}
        onChange={e => setName(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 12px",
          border: "1px solid #E2E8F0",
          borderRadius: 6,
          fontSize: 13,
          marginBottom: 12,
          boxSizing: "border-box",
        }}
      />

      <button
        onClick={handleCreate}
        disabled={loading || !name.trim()}
        style={{
          width: "100%",
          padding: 10,
          background: "#1D4ED8",
          color: "white",
          border: "none",
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        {loading ? "Creating..." : "Start Free Trial"}
      </button>
    </div>
  )
}