"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Upload, CheckCircle, AlertTriangle, Download } from "lucide-react"
import Papa from "papaparse"
import { useRole } from "@/contexts/RoleContext"
import { usePlan } from "@/contexts/PlanContext"

const VALID_STATUSES = ["present", "absent", "leave", "half_day", "missing_punch"]

interface CsvRow {
  employee_code: string
  date: string
  month: string
  status: string
  check_in: string
  check_out: string
}

interface ValidatedRow extends CsvRow {
  rowIndex: number
  errors: string[]
  employee_id?: number
}

export default function AttendanceImportPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const { role } = useRole()
  const { hasFeature, loading: planLoading } = usePlan()
  const canView = role === "admin" || role === "accountant"
  const canEdit = role === "admin" || role === "accountant"

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [companyId, setCompanyId] = useState("")
  const [parsedRows, setParsedRows] = useState<ValidatedRow[]>([])
  const [employeeMap, setEmployeeMap] = useState<Record<string, number>>({})  // code -> id
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState("")
  const [importSummary, setImportSummary] = useState<{ success: number; failed: number } | null>(null)

  // Fetch company and active employees
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase
          .from("employees")
          .select("id, employee_code")
          .eq("company_id", cid)
          .eq("status", "active")
          .then(({ data }) => {
            if (data) {
              const map: Record<string, number> = {}
              data.forEach((emp: any) => {
                map[emp.employee_code] = emp.id
              })
              setEmployeeMap(map)
            }
            setLoadingEmployees(false)
          })
      }
    })
  }, [])

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError("")
    setFlash("")
    setImportSummary(null)

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as CsvRow[]
        const validated: ValidatedRow[] = rows.map((row, index) => {
          const errors: string[] = []
          const code = (row.employee_code || "").trim()
          const date = (row.date || "").trim()
          const month = (row.month || "").trim()
          const status = (row.status || "present").trim().toLowerCase()
          const checkIn = (row.check_in || "").trim()
          const checkOut = (row.check_out || "").trim()

          // Validate employee code
          if (!code) {
            errors.push("Missing employee_code")
          } else if (!employeeMap[code]) {
            errors.push(`Unknown or inactive employee: "${code}"`)
          }

          // Validate date format and month matching
          if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            errors.push("Invalid or missing date format (YYYY-MM-DD)")
          }

          if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            errors.push("Invalid or missing month format (YYYY-MM)")
          }

          if (date && month && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{4}-\d{2}$/.test(month)) {
            const dateMonth = date.substring(0, 7)
            if (dateMonth !== month) {
              errors.push(`Date month (${dateMonth}) does not match month column (${month})`)
            }
          }

          // Validate status
          if (status && !VALID_STATUSES.includes(status)) {
            errors.push(`Invalid status "${status}". Allowed: ${VALID_STATUSES.join(", ")}`)
          }

          return {
            ...row,
            employee_code: code,
            date,
            month,
            status,
            check_in: checkIn,
            check_out: checkOut,
            rowIndex: index + 1,   // 1-based for display
            errors,
            employee_id: employeeMap[code] || undefined,
          }
        })
        setParsedRows(validated)
      },
      error: (err: any) => {
        setError("Failed to parse CSV: " + err.message)
      },
    })
  }

  // Trigger file dialog
  const openFileDialog = () => {
    fileInputRef.current?.click()
  }

  // Count errors
  const errorCount = parsedRows.filter(r => r.errors.length > 0).length
  const validCount = parsedRows.length - errorCount

  // Import valid rows
  const handleImport = async () => {
    if (!companyId) { setError("Company not loaded"); return }
    const validRows = parsedRows.filter(r => r.errors.length === 0 && r.employee_id)
    if (validRows.length === 0) {
      setError("No valid rows to import.")
      return
    }

    setImporting(true)
    setError("")

    const records = validRows.map(row => ({
      company_id: companyId,
      employee_id: row.employee_id,
      date: row.date,
      raw_status: row.status || "present",
      check_in: row.check_in || null,
      check_out: row.check_out || null,
      source: "csv",
      verified_status: "pending",
    }))

    const { error: upsertErr } = await supabase
      .from("attendance_records")
      .upsert(records, { onConflict: "company_id,employee_id,date" })

    if (upsertErr) {
      setError(upsertErr.message)
      setImporting(false)
      return
    }

    const failed = errorCount
    setImportSummary({ success: validRows.length, failed })
    setFlash(`✅ Imported ${validRows.length} records successfully. ${failed} rows skipped due to errors.`)
    setImporting(false)
  }

  if (planLoading || loadingEmployees) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  }

  if (!hasFeature("payroll")) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>
        <h2>Payroll feature is not enabled.</h2>
        <p>Enable it in the Feature Manager.</p>
      </div>
    )
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card {
          background: var(--card); border: 1px solid var(--border); border-radius: 12px;
          padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm);
        }
        .btn {
          padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--border); font-weight: 600;
          font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: transparent; color: var(--text-muted); transition: 0.2s;
        }
        .btn:hover { background: var(--card-hover); }
        .btn-primary { background: var(--primary); color: var(--primary-text); border-color: var(--primary); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .table { width: 100%; border-collapse: collapse; }
        .table th, .table td { padding: 8px 10px; border-bottom: 1px solid var(--border); font-size: 13px; text-align: left; }
        .table th { background: var(--card-hover); font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
        .table .error-row { background: #FEE2E2; }
        .table .error-cell { color: #DC2626; font-weight: 600; }
        .upload-area {
          border: 2px dashed var(--border);
          border-radius: 12px;
          padding: 40px;
          text-align: center;
          cursor: pointer;
          background: var(--card);
          transition: background 0.2s;
        }
        .upload-area:hover { background: var(--card-hover); }
        .summary-box {
          display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap;
        }
        .summary-item {
          background: var(--card); border: 1px solid var(--border); border-radius: 8px;
          padding: 12px 16px; text-align: center;
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => router.push("/dashboard/payroll/attendance")}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>📤 Import Attendance CSV</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Upload a CSV file with columns: employee_code, date, month, status, check_in, check_out
          </p>
        </div>
        <button className="btn" onClick={() => {
          // Download sample CSV
          const sample = "employee_code,date,month,status,check_in,check_out\nEMP-0001,2026-07-05,2026-07,present,09:00,18:00\nEMP-0002,2026-07-05,2026-07,absent,,\n"
          const blob = new Blob([sample], { type: "text/csv" })
          const url = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.download = "attendance_sample.csv"
          a.click()
          URL.revokeObjectURL(url)
        }}>
          <Download size={16} /> Sample CSV
        </button>
      </div>

      {error && <div style={{ background: "var(--card)", color: "#FCA5A5", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, border: "1px solid #FECACA" }}>{error}</div>}
      {flash && <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle size={16} /> {flash}</div>}

      {/* Upload Area */}
      <div className="upload-area" onClick={openFileDialog}>
        <Upload size={32} style={{ color: "var(--text-muted)", marginBottom: 8 }} />
        <div style={{ fontWeight: 600, fontSize: 14 }}>Click to select a CSV file</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>or drag and drop</div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
      </div>

      {/* Preview & Validation */}
      {parsedRows.length > 0 && (
        <>
          <div className="summary-box" style={{ marginTop: 20 }}>
            <div className="summary-item">
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>Total Rows</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{parsedRows.length}</div>
            </div>
            <div className="summary-item">
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#10B981" }}>Valid</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#10B981" }}>{validCount}</div>
            </div>
            <div className="summary-item">
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#EF4444" }}>Errors</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#EF4444" }}>{errorCount}</div>
            </div>
            {importSummary && (
              <div className="summary-item">
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--primary)" }}>Last Import</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>✅ {importSummary.success} | ❌ {importSummary.failed}</div>
              </div>
            )}
          </div>

          <div className="card" style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Employee Code</th>
                  <th>Date</th>
                  <th>Month</th>
                  <th>Status</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.map((row, idx) => (
                  <tr key={idx} className={row.errors.length > 0 ? "error-row" : ""}>
                    <td>{row.rowIndex}</td>
                    <td>{row.employee_code}</td>
                    <td>{row.date}</td>
                    <td>{row.month}</td>
                    <td>{row.status}</td>
                    <td>{row.check_in || "—"}</td>
                    <td>{row.check_out || "—"}</td>
                    <td className={row.errors.length > 0 ? "error-cell" : ""}>
                      {row.errors.length > 0 ? row.errors.join(", ") : "✓"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={importing || validCount === 0}
            style={{ marginTop: 16 }}
          >
            <Upload size={16} /> {importing ? "Importing..." : `Import ${validCount} Valid Rows`}
          </button>
        </>
      )}
    </div>
  )
}
