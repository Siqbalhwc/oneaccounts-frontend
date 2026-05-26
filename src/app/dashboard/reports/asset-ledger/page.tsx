"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Search, Download, ArrowLeft } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

interface LedgerLine {
  date: string
  description: string
  debit: number
  credit: number
  runningNBV: number
  type: string
}

export default function AssetLedgerPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialAssetId = searchParams.get("asset_id")

  const { role, loading: roleLoading } = useRole()
  const canView = role === "admin" || role === "accountant" || role === "viewer"

  const [companyId, setCompanyId] = useState("")
  const [assets, setAssets] = useState<any[]>([])
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(
    initialAssetId ? Number(initialAssetId) : null
  )
  const [ledger, setLedger] = useState<LedgerLine[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase
          .from("assets")
          .select("id, asset_no, name")
          .eq("company_id", cid)
          .order("asset_no")
          .then(r => setAssets(r.data || []))
      }
    })
  }, [])

  // Auto-load ledger when assetId changes (including initial from query param)
  useEffect(() => {
    if (selectedAssetId && companyId) {
      fetchLedger(selectedAssetId)
    } else {
      setLedger([])
    }
  }, [selectedAssetId, companyId])

  const fetchLedger = async (assetId: number) => {
    setLoading(true)
    const { data: asset } = await supabase
      .from("assets")
      .select("*")
      .eq("id", assetId)
      .eq("company_id", companyId)
      .single()

    if (!asset) {
      setLedger([])
      setLoading(false)
      return
    }

    const lines: LedgerLine[] = []
    let nbv = asset.cost_price

    // Purchase / opening
    if (asset.source_type === "opening" || asset.source_type === "manual" || asset.source_type === "purchase_bill") {
      lines.push({
        date: asset.purchase_date,
        description: `Purchase / Acquisition of ${asset.name} (${asset.asset_no})`,
        debit: asset.cost_price,
        credit: 0,
        runningNBV: nbv,
        type: "purchase",
      })
    } else {
      lines.push({
        date: asset.purchase_date,
        description: `Opening balance – ${asset.name} (${asset.asset_no})`,
        debit: asset.cost_price,
        credit: 0,
        runningNBV: nbv,
        type: "opening",
      })
    }

    // Depreciation schedule
    const { data: depRows } = await supabase
      .from("asset_depreciation_schedule")
      .select("period, depreciation_amount, posted")
      .eq("asset_id", assetId)
      .eq("company_id", companyId)
      .order("period")

    if (depRows) {
      for (const d of depRows) {
        if (d.posted) {
          nbv -= d.depreciation_amount
          lines.push({
            date: d.period.slice(0, 10),
            description: `Monthly depreciation for ${d.period.slice(0, 7)}`,
            debit: 0,
            credit: d.depreciation_amount,
            runningNBV: Math.max(nbv, 0),
            type: "depreciation",
          })
        }
      }
    }

    // Sale
    const { data: sale } = await supabase
      .from("asset_sales")
      .select("*")
      .eq("asset_id", assetId)
      .eq("company_id", companyId)
      .maybeSingle()

    if (sale) {
      lines.push({
        date: sale.sale_date,
        description: `Sale of asset – PKR ${sale.sale_amount?.toLocaleString()}`,
        debit: sale.sale_amount,
        credit: 0,
        runningNBV: 0,
        type: "sale",
      })
    }

    setLedger(lines)
    setLoading(false)
  }

  const selectedAsset = assets.find(a => a.id === selectedAssetId)

  const exportPDF = () => {
    if (!selectedAsset) return
    const doc = new jsPDF({ orientation: "landscape" })
    doc.setFontSize(14)
    doc.text(`Asset Ledger – ${selectedAsset.asset_no} (${selectedAsset.name})`, 14, 20)
    const head = [["Date", "Description", "Debit", "Credit", "Running NBV"]]
    const body = ledger.map(line => [
      line.date,
      line.description,
      line.debit > 0 ? line.debit.toLocaleString() : "",
      line.credit > 0 ? line.credit.toLocaleString() : "",
      line.runningNBV.toLocaleString(),
    ])
    autoTable(doc, { head, body, startY: 30, styles: { fontSize: 9 } })
    doc.save(`asset_ledger_${selectedAsset.asset_no}.pdf`)
  }

  if (roleLoading || !role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", background: "var(--bg)", minHeight: "100vh" }}>Loading…</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)", background: "var(--bg)", minHeight: "100vh" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      <style>{`
        .btn { display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1.5px solid var(--border);background:transparent;color:var(--text-muted);font-family:inherit;transition:all 0.15s;white-space:nowrap; }
        .btn:hover { background:var(--card-hover); }
        .select { padding:6px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--card);color:var(--text); min-width:250px; }
        table { width:100%; border-collapse:collapse; font-size:13px; }
        th { text-align:left; padding:10px 12px; border-bottom:2px solid var(--border); color:var(--text-muted); font-size:10px; text-transform:uppercase; }
        td { padding:10px 12px; border-bottom:1px solid var(--border); }
        .text-right { text-align:right; }
      `}</style>

      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24, flexWrap:"wrap" }}>
        <button className="btn" onClick={() => router.push("/dashboard/reports")}><ArrowLeft size={16} /> Back to Reports</button>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text)", margin:0 }}>📒 Asset Ledger</h1>
          <p style={{ fontSize:13, color:"var(--text-muted)", margin:0 }}>Complete history of purchase, depreciation, and disposal</p>
        </div>
      </div>

      <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:20, flexWrap:"wrap" }}>
        <div style={{ position:"relative", display:"inline-block" }}>
          <Search size={16} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--text-muted)", pointerEvents:"none" }} />
          <select
            className="select"
            style={{ paddingLeft: 36 }}
            value={selectedAssetId ?? ""}
            onChange={e => setSelectedAssetId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— Select an asset —</option>
            {assets.map(a => (
              <option key={a.id} value={a.id}>{a.asset_no} – {a.name}</option>
            ))}
          </select>
        </div>
        {selectedAssetId && (
          <button className="btn" onClick={exportPDF}><Download size={14} /> PDF</button>
        )}
      </div>

      {!selectedAssetId ? (
        <div style={{ textAlign:"center", padding:40, color:"var(--text-muted)" }}>Please select an asset to view its ledger.</div>
      ) : loading ? (
        <div style={{ textAlign:"center", padding:40, color:"var(--text-muted)" }}>Loading ledger…</div>
      ) : (
        <>
          <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:16, marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:16, color:"var(--text)" }}>{selectedAsset?.name} ({selectedAsset?.asset_no})</div>
            <div style={{ fontSize:13, color:"var(--text-muted)" }}>Cost: PKR {selectedAsset?.cost_price?.toLocaleString()} • Status: {selectedAsset?.status}</div>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                  <th className="text-right">Running NBV</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((line, idx) => (
                  <tr key={idx}>
                    <td>{line.date}</td>
                    <td>{line.description}</td>
                    <td className="text-right">{line.debit > 0 ? line.debit.toLocaleString() : ""}</td>
                    <td className="text-right">{line.credit > 0 ? line.credit.toLocaleString() : ""}</td>
                    <td className="text-right" style={{ fontWeight:600 }}>{line.runningNBV.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}