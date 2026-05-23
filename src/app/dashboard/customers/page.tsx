"use client"

import { useState, useEffect, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Eye, Search, Download, Upload, FileText } from "lucide-react"
import { usePlan } from "@/contexts/PlanContext"

export default function CustomersPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { hasFeature } = usePlan()
  const showImportExport = hasFeature("csv_import_export")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [companyId, setCompanyId] = useState("")
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    supabase
      .from("customers")
      .select("*")
      .eq("company_id", companyId)
      .order("name")
      .then(({ data }) => {
        setCustomers(data || [])
        setLoading(false)
      })
  }, [companyId])

  const filtered = search.trim()
    ? customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase()))
    : customers

  // Export CSV
  const handleExport = () => {
    if (filtered.length === 0) { alert("No data to export"); return }
    const headers = ["code", "name", "phone", "address", "email", "country_code", "payment_terms", "balance"]
    const csvRows = [headers.join(",")]
    filtered.forEach(c => {
      csvRows.push(headers.map(h => (c[h] ?? "").toString().replace(/,/g, " ")).join(","))
    })
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "customers.csv"
    a.click()
    window.URL.revokeObjectURL(url)
  }

  // Download Template
  const downloadTemplate = () => {
    const headers = ["code", "name", "phone", "address", "email", "country_code", "payment_terms", "balance"]
    const sample = ["C001", "John Doe", "0300123456", "123 Street", "john@example.com", "+92", "Net 30", "0"]
    const csvRows = [headers.join(","), sample.join(",")]
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "customer_template.csv"
    a.click()
    window.URL.revokeObjectURL(url)
  }

  // Handle file import
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setMessage("")

    const formData = new FormData()
    formData.append("file", file)
    formData.append("table", "customers")
    formData.append("company_id", companyId)

    try {
      const res = await fetch("/api/import", { method: "POST", body: formData })
      const result = await res.json()
      if (result.success) {
        setMessage(`✅ Imported ${result.count} customers successfully`)
        // Refresh list
        const { data } = await supabase.from("customers").select("*").eq("company_id", companyId).order("name")
        setCustomers(data || [])
      } else {
        setMessage(`❌ Error: ${result.error}`)
      }
    } catch (err: any) {
      setMessage(`❌ Network error: ${err.message}`)
    } finally {
      setImporting(false)
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; box-shadow: var(--shadow-sm); }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { text-align: left; padding: 10px 12px; background: var(--card-hover); font-weight: 700; color: var(--text-muted); font-size: 10px; text-transform: uppercase; }
        td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text); }
        tr:hover td { background: var(--card-hover); }
        .btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); }
        .btn:hover { background: var(--card-hover); }
        .input { width: 100%; height: 38px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 12px 0 36px; font-size: 13px; background: var(--card); color: var(--text); outline: none; }
        .input:focus { border-color: var(--primary); }
        .message { padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>👥 Customers</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Manage your customers</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {showImportExport && (
            <>
              <button className="btn" onClick={downloadTemplate} title="Download CSV template">
                <FileText size={14} /> Template
              </button>
              <label className="btn" style={{ cursor: "pointer" }}>
                <Upload size={14} /> Import
                <input type="file" accept=".csv" onChange={handleImport} ref={fileInputRef} style={{ display: "none" }} />
              </label>
              <button className="btn" onClick={handleExport} title="Export to CSV">
                <Download size={14} /> Export
              </button>
            </>
          )}
          <button className="btn" onClick={() => router.push("/dashboard/customers/new")}>
            <Plus size={16} /> New Customer
          </button>
        </div>
      </div>

      {message && (
        <div className="message" style={{ background: message.startsWith("✅") ? "#065F46" : "#7C2D12", color: "white" }}>
          {message}
        </div>
      )}

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input
          className="input"
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>No customers found.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>{c.code}</td>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>{c.phone}</td>
                  <td>PKR {(c.balance || 0).toLocaleString()}</td>
                  <td>
                    <button className="btn" style={{ padding: "4px 10px" }} onClick={() => router.push(`/dashboard/customers/${c.id}`)}>
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {importing && <div style={{ textAlign: "center", padding: 20 }}>Importing...</div>}
    </div>
  )
}