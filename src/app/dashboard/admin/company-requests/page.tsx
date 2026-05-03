"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"

export default function CompanyRequestsPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    supabase
      .from("company_creation_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setRequests(data)
        setLoading(false)
      })
  }, [])

  const approve = async (reqId: string) => {
    try {
      const res = await fetch("/api/admin/approve-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: reqId }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage("Company created!")
        setRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: "approved" } : r))
      } else {
        setMessage(data.error || "Approval failed")
      }
    } catch {
      setMessage("Network error")
    }
  }

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>

  return (
    <div style={{ padding: 20, background: "#EFF4FB", minHeight: "100vh" }}>
      <h2>Pending Company Requests</h2>
      {message && <div style={{ marginBottom: 10, color: "green" }}>{message}</div>}
      {requests.length === 0 && <p>No pending requests.</p>}
      <div style={{ display: "grid", gap: 10 }}>
        {requests.map((r: any) => (
          <div key={r.id} style={{ background: "white", border: "1px solid #E2E8F0", borderRadius: 8, padding: 16 }}>
            <p><strong>Company:</strong> {r.company_name}</p>
            <p>Plan: {r.plan_code} | Amount: PKR {r.amount}</p>
            <p>Reference: {r.reference_code}</p>
            {r.evidence_url && <a href={r.evidence_url} target="_blank">View Receipt</a>}
            <p>Status: {r.status}</p>
            {r.status === "pending" && (
              <button
                onClick={() => approve(r.id)}
                style={{ marginTop: 8, padding: "6px 12px", background: "#10B981", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
              >
                Approve & Create Company
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}