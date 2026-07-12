"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { ArrowLeft, Truck, DollarSign } from "lucide-react"
import RecordHistory from "@/components/RecordHistory"
import { useCompany } from "@/contexts/CompanyContext"

const STATUS_COLORS: Record<string, string> = {
  Active: "#22c55e",
  Sold: "#f59e0b",
  Disposed: "#ef4444",
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || "#94a3b8"
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "100px",
        fontSize: 11,
        fontWeight: 600,
        background: `${color}22`,
        color: color,
        border: `1px solid ${color}44`,
      }}
    >
      {status}
    </span>
  )
}

export default function AssetDetailPage() {
  const router = useRouter()
  const params = useParams()
  const assetId = params?.id as string
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { companyId } = useCompany()

  const [asset, setAsset] = useState<any>(null)
  const [depSchedule, setDepSchedule] = useState<any[]>([])
  const [journalLines, setJournalLines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!companyId || !assetId) return

    const loadData = async () => {
      setLoading(true)
      setError("")

      try {
        const [
          assetRes,
          scheduleRes,
          journalRes,
        ] = await Promise.all([
          supabase
            .from("assets")
            .select("*, locations(name), personnel:responsible_person_id(name)")
            .eq("id", assetId)
            .eq("company_id", companyId)
            .single(),
          supabase
            .from("asset_depreciation_schedule")
            .select("*")
            .eq("asset_id", assetId)
            .order("period", { ascending: true }),
          supabase
            .from("journal_lines")
            .select("id, debit, credit, source_type, source_id, journal_entries(date, description, entry_no), accounts(code, name)")
            .eq("company_id", companyId)
            .eq("source_id", assetId)
            .order("entry_id", { ascending: true }),
        ])

        if (assetRes.error) {
          setError("Failed to load asset: " + assetRes.error.message)
          setLoading(false)
          return
        }
        if (!assetRes.data) {
          setError("Asset not found.")
          setLoading(false)
          return
        }

        setAsset(assetRes.data)
        setDepSchedule(scheduleRes.data || [])
        setJournalLines(journalRes.data || [])
      } catch (err: any) {
        setError(err.message || "Something went wrong")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [companyId, assetId])

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
        Loading asset…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#FCA5A5", background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
        {error}
      </div>
    )
  }

  if (!asset) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
        Asset not found
      </div>
    )
  }

  // ── Stored values from the asset record (source of truth) ──
  const cost = Number(asset.cost_price ?? 0)
  const salvage = Number(asset.salvage_value ?? 0)
  const life = Number(asset.life_months ?? 0)
  const accumDep = Number(asset.accumulated_depreciation ?? 0)
  const nbv = Number(asset.net_book_value ?? Math.max(cost - accumDep, salvage))
  const remainingLife = Number(asset.remaining_life_months ?? Math.max(life - depSchedule.length, 0))
  const depreciable = cost - salvage

  // ── Progress bar percentage (safe division) ──────────
  const progressPct = depreciable > 0
    ? Math.min((accumDep / depreciable) * 100, 100)
    : 0

  const formatDate = (d: string | null) => {
    if (!d) return "—"
    const date = new Date(d)
    return isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-PK", { year:"numeric", month:"short", day:"numeric" })
  }

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .row { display: flex; margin-bottom: 10px; font-size: 14px; align-items: center; }
        .label { width: 160px; color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; }
        .value { color: var(--text); font-weight: 500; }
        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--border); background: transparent; color: var(--text-muted); font-family: inherit; transition: all 0.15s; }
        .btn:hover { background: var(--card-hover); }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { text-align: left; padding: 10px 12px; background: var(--card-hover); font-weight: 700; color: var(--text-muted); font-size: 10px; text-transform: uppercase; border-bottom: 1px solid var(--border); }
        td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; }
        .progress-bar { width: 100%; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; margin-top: 8px; }
        .progress-fill { height: 100%; background: var(--primary); border-radius: 4px; transition: width 0.3s; }
        .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-width: 1000px; }
        .kpi-row { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; max-width: 1000px; }
        .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px 20px; flex: 1; min-width: 160px; box-shadow: var(--shadow-sm); }
        .kpi-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 6px; }
        .kpi-value { font-size: 22px; font-weight: 800; color: var(--text); }
        @media (max-width: 900px) {
          .detail-grid { grid-template-columns: 1fr; }
          .label { width: 130px; }
          .kpi-row { flex-direction: column; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => router.push("/dashboard/assets")}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>{asset.name}</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{asset.asset_no}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {asset.status === "Active" && (
            <>
              <button className="btn" onClick={() => router.push(`/dashboard/assets/${assetId}/transfer`)}><Truck size={14} /> Transfer</button>
              <button className="btn" onClick={() => router.push(`/dashboard/assets/${assetId}/sell`)}><DollarSign size={14} /> Sell</button>
            </>
          )}
          <button className="btn" onClick={() => router.push(`/dashboard/assets/${assetId}/edit`)}>✏️ Edit</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Original Cost</div>
          <div className="kpi-value">PKR {cost.toLocaleString()}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Accum. Depreciation</div>
          <div className="kpi-value" style={{ color: "#A78BFA" }}>PKR {accumDep.toLocaleString()}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Net Book Value</div>
          <div className="kpi-value" style={{ color: nbv > 0 ? "#10B981" : "#EF4444" }}>PKR {nbv.toLocaleString()}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Remaining Life</div>
          <div className="kpi-value">{remainingLife} months</div>
        </div>
      </div>

      {/* Details and Status */}
      <div className="detail-grid">
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Details</h3>
          <div className="row"><span className="label">Asset No</span><span className="value">{asset.asset_no}</span></div>
          <div className="row"><span className="label">Name</span><span className="value">{asset.name}</span></div>
          <div className="row"><span className="label">Category</span><span className="value">{asset.category || "—"}</span></div>
          <div className="row"><span className="label">Purchase Date</span><span className="value">{formatDate(asset.purchase_date)}</span></div>
          <div className="row"><span className="label">Location</span><span className="value">{asset.locations?.name || "—"}</span></div>
          <div className="row"><span className="label">Responsible</span><span className="value">{asset.personnel?.name || "—"}</span></div>
          {asset.notes && <div className="row"><span className="label">Notes</span><span className="value">{asset.notes}</span></div>}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Status & Value</h3>
          <div className="row">
            <span className="label">Status</span>
            <span className="value"><StatusBadge status={asset.status} /></span>
          </div>
          <div className="row"><span className="label">Salvage Value</span><span className="value">PKR {salvage.toLocaleString()}</span></div>
          <div className="row"><span className="label">Depreciable Value</span><span className="value">PKR {depreciable.toLocaleString()}</span></div>
          <div className="row"><span className="label">Depreciation %</span><span className="value">{progressPct.toFixed(1)}%</span></div>
          <div className="row"><span className="label">Remaining Life</span><span className="value">{remainingLife} months</span></div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      {/* Depreciation Schedule */}
      <div style={{ maxWidth: 1000, marginTop: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, marginBottom: 12 }}>📆 Depreciation Schedule</h3>
          {depSchedule.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No depreciation entries yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Note</th>
                  <th>Posted</th>
                </tr>
              </thead>
              <tbody>
                {depSchedule.map(entry => (
                  <tr key={entry.id}>
                    <td>{entry.period}</td>
                    <td style={{ textAlign: "right" }}>PKR {Number(entry.depreciation_amount).toLocaleString()}</td>
                    <td>{entry.note || "—"}</td>
                    <td>{entry.posted ? "✅" : "❌"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Journal Entries */}
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, marginBottom: 12 }}>📒 Journal Entries</h3>
          {journalLines.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No journal entries found.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Description</th>
                  <th style={{ textAlign: "right" }}>Debit</th>
                  <th style={{ textAlign: "right" }}>Credit</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {journalLines.map(line => (
                  <tr key={line.id}>
                    <td>{formatDate(line.journal_entries?.date)}</td>
                    <td>{line.accounts?.code} – {line.accounts?.name}</td>
                    <td>{line.journal_entries?.description || "—"}</td>
                    <td style={{ textAlign: "right", color: line.debit > 0 ? "#EF4444" : "var(--text-muted)" }}>
                      {line.debit > 0 ? `PKR ${line.debit.toLocaleString()}` : "—"}
                    </td>
                    <td style={{ textAlign: "right", color: line.credit > 0 ? "#10B981" : "var(--text-muted)" }}>
                      {line.credit > 0 ? `PKR ${line.credit.toLocaleString()}` : "—"}
                    </td>
                    <td>{line.journal_entries?.entry_no || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Change History */}
      <div style={{ maxWidth: 1000, marginTop: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700, marginBottom: 12 }}>📝 Change History</h3>
          <RecordHistory tableName="assets" recordId={String(asset.id)} />
        </div>
      </div>
    </div>
  )
}