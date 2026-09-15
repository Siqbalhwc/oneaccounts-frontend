"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Link2, X, Search } from "lucide-react"

type PartyType = "customer" | "supplier"

interface PartyRecord {
  id: number
  name: string
  phone?: string | null
  balance?: number | null
  linked_supplier_id?: number | null
  linked_customer_id?: number | null
}

interface Props {
  partyType: PartyType
  party: PartyRecord
  companyId: string
  counterparts: PartyRecord[]
  onUpdated: () => void
  /** Render the trigger as a full-width labeled row (for use inside RowActionsMenu) instead of a bare icon button. Defaults to false — existing usages are unaffected. */
  asMenuItem?: boolean
}

export default function CustomerVendorLink({ partyType, party, companyId, counterparts, onUpdated, asMenuItem = false }: Props) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [modal, setModal] = useState<"none" | "link" | "net">("none")
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const linkedId = partyType === "customer" ? party.linked_supplier_id : party.linked_customer_id
  const counterpart = linkedId ? counterparts.find(c => c.id === linkedId) || null : null

  const normalize = (s: string) => (s || "").trim().toLowerCase()
  const normalizePhone = (s: string) => (s || "").replace(/\D/g, "")

  const suggestedMatch = !linkedId
    ? counterparts.find(c => {
        const alreadyLinked = partyType === "customer" ? c.linked_customer_id : c.linked_supplier_id
        if (alreadyLinked) return false
        const nameMatch = normalize(c.name) === normalize(party.name)
        const phoneMatch = party.phone && c.phone && normalizePhone(party.phone) === normalizePhone(c.phone)
        return nameMatch || phoneMatch
      })
    : null

  useEffect(() => {
    if (modal === "net" && linkedId) {
      setHistoryLoading(true)
      const customerId = partyType === "customer" ? party.id : linkedId
      const supplierId = partyType === "customer" ? linkedId : party.id
      supabase
        .from("customer_vendor_offsets")
        .select("*")
        .eq("company_id", companyId)
        .eq("customer_id", customerId)
        .eq("supplier_id", supplierId)
        .order("id", { ascending: false })
        .then(({ data }) => {
          setHistory(data || [])
          setHistoryLoading(false)
        })
    }
  }, [modal, linkedId])

  const availableToLink = counterparts.filter(c => {
    const alreadyLinked = partyType === "customer" ? c.linked_customer_id : c.linked_supplier_id
    if (alreadyLinked) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return c.name?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q)
  })

  const doLink = async (counterpartId: number) => {
    setBusy(true)
    setError("")
    try {
      if (partyType === "customer") {
        const { error: e1 } = await supabase.from("customers").update({ linked_supplier_id: counterpartId }).eq("id", party.id).eq("company_id", companyId)
        if (e1) throw e1
        const { error: e2 } = await supabase.from("suppliers").update({ linked_customer_id: party.id }).eq("id", counterpartId).eq("company_id", companyId)
        if (e2) throw e2
      } else {
        const { error: e1 } = await supabase.from("suppliers").update({ linked_customer_id: counterpartId }).eq("id", party.id).eq("company_id", companyId)
        if (e1) throw e1
        const { error: e2 } = await supabase.from("customers").update({ linked_supplier_id: party.id }).eq("id", counterpartId).eq("company_id", companyId)
        if (e2) throw e2
      }
      setModal("none")
      onUpdated()
    } catch (err: any) {
      setError(err.message || "Failed to link.")
    }
    setBusy(false)
  }

  const doUnlink = async () => {
    if (!linkedId) return
    setBusy(true)
    setError("")
    try {
      if (partyType === "customer") {
        await supabase.from("customers").update({ linked_supplier_id: null }).eq("id", party.id).eq("company_id", companyId)
        await supabase.from("suppliers").update({ linked_customer_id: null }).eq("id", linkedId).eq("company_id", companyId)
      } else {
        await supabase.from("suppliers").update({ linked_customer_id: null }).eq("id", party.id).eq("company_id", companyId)
        await supabase.from("customers").update({ linked_supplier_id: null }).eq("id", linkedId).eq("company_id", companyId)
      }
      setModal("none")
      onUpdated()
    } catch (err: any) {
      setError(err.message || "Failed to unlink.")
    }
    setBusy(false)
  }

  const customerBalance = partyType === "customer" ? (party.balance || 0) : (counterpart?.balance || 0)
  const supplierBalance = partyType === "customer" ? (counterpart?.balance || 0) : (party.balance || 0)
  const canSettle = customerBalance > 0 && supplierBalance > 0

  const doSettle = async () => {
    if (!counterpart) return
    setBusy(true)
    setError("")
    try {
      const customerId = partyType === "customer" ? party.id : counterpart.id
      const supplierId = partyType === "customer" ? counterpart.id : party.id
      const { error: rpcError } = await supabase.rpc("create_customer_vendor_offset", {
        p_company_id: companyId,
        p_customer_id: customerId,
        p_supplier_id: supplierId,
        p_date: new Date().toISOString().slice(0, 10),
        p_notes: null,
        p_user_email: "system",
      })
      if (rpcError) throw rpcError
      onUpdated()
      setModal("none")
    } catch (err: any) {
      setError(err.message || "Settlement failed.")
    }
    setBusy(false)
  }

  const doUndo = async (offsetId: number) => {
    setBusy(true)
    setError("")
    try {
      const { error: rpcError } = await supabase.rpc("reverse_customer_vendor_offset", {
        p_offset_id: offsetId,
        p_company_id: companyId,
        p_user_email: "system",
        p_reason: "Undone from Net Position panel",
      })
      if (rpcError) throw rpcError
      onUpdated()
      const customerId = partyType === "customer" ? party.id : linkedId
      const supplierId = partyType === "customer" ? linkedId : party.id
      const { data } = await supabase
        .from("customer_vendor_offsets")
        .select("*")
        .eq("company_id", companyId)
        .eq("customer_id", customerId)
        .eq("supplier_id", supplierId)
        .order("id", { ascending: false })
      setHistory(data || [])
    } catch (err: any) {
      setError(err.message || "Undo failed.")
    }
    setBusy(false)
  }

  const iconColor = linkedId ? "#10B981" : suggestedMatch ? "#F59E0B" : "var(--text-muted)"
  const iconTitle = linkedId
    ? `Linked to ${counterpart?.name || (partyType === "customer" ? "vendor" : "customer")} - view Net Position`
    : suggestedMatch
    ? `Possible match found: ${suggestedMatch.name} - click to link`
    : `Link to existing ${partyType === "customer" ? "vendor" : "customer"}`

  return (
    <>
      {asMenuItem ? (
        <button
          type="button"
          className="row-actions-menu-item"
          onClick={() => setModal(linkedId ? "net" : "link")}
          style={{ color: iconColor }}
        >
          <span className="row-actions-menu-item-icon" style={{ position: "relative" }}>
            <Link2 size={14} />
            {suggestedMatch && !linkedId && (
              <span style={{ position: "absolute", top: -2, right: -2, width: 6, height: 6, borderRadius: "50%", background: "#F59E0B" }} />
            )}
          </span>
          <span>{linkedId ? (partyType === "customer" ? "Vendor Link" : "Customer Link") : iconTitle}</span>
        </button>
      ) : (
        <button
          className="btn-icon"
          onClick={() => setModal(linkedId ? "net" : "link")}
          title={iconTitle}
          style={{ color: iconColor, position: "relative" }}
        >
          <Link2 size={13} />
          {suggestedMatch && !linkedId && (
            <span style={{ position: "absolute", top: -2, right: -2, width: 6, height: 6, borderRadius: "50%", background: "#F59E0B" }} />
          )}
        </button>
      )}

      {modal === "link" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setModal("none")}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, maxWidth: 420, width: "90%", maxHeight: "70vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 32px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                Link {party.name} to {partyType === "customer" ? "a Vendor" : "a Customer"}
              </h3>
              <button className="btn-icon" onClick={() => setModal("none")}><X size={16} /></button>
            </div>

            {suggestedMatch && (
              <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid #F59E0B", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12.5, color: "var(--text)" }}>
                Possible match found: <b>{suggestedMatch.name}</b> {suggestedMatch.phone ? `(${suggestedMatch.phone})` : ""}. Same business/person?
                <div style={{ marginTop: 8 }}>
                  <button className="btn" style={{ fontSize: 12, padding: "5px 10px" }} disabled={busy} onClick={() => doLink(suggestedMatch.id)}>Yes, Link</button>
                </div>
              </div>
            )}

            <div style={{ position: "relative", marginBottom: 10 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input className="input" style={{ paddingLeft: 30 }} placeholder="Search by name or phone..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            <div style={{ overflowY: "auto", flex: 1 }}>
              {availableToLink.length === 0 ? (
                <div style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: 20 }}>No unlinked {partyType === "customer" ? "vendors" : "customers"} found.</div>
              ) : (
                availableToLink.map(c => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 4px", borderBottom: "1px solid var(--border)" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.phone || "-"}</div>
                    </div>
                    <button className="btn btn-outline" style={{ fontSize: 12, padding: "4px 10px" }} disabled={busy} onClick={() => doLink(c.id)}>Link</button>
                  </div>
                ))
              )}
            </div>

            {error && <div style={{ color: "#EF4444", fontSize: 12, marginTop: 10 }}>{error}</div>}
          </div>
        </div>
      )}

      {modal === "net" && counterpart && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setModal("none")}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, maxWidth: 440, width: "90%", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 32px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Net Position</h3>
              <button className="btn-icon" onClick={() => setModal("none")}><X size={16} /></button>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
              {party.name} is linked with {counterpart.name}
            </div>

            <div style={{ background: "var(--bg-soft)", borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <span>They owe you (Receivable)</span>
                <b style={{ color: "#10B981" }}>PKR {customerBalance.toLocaleString()}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <span>You owe them (Payable)</span>
                <b style={{ color: "#EF4444" }}>PKR {supplierBalance.toLocaleString()}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderTop: "1px dashed var(--border)", paddingTop: 6, marginTop: 6 }}>
                <span>Net</span>
                <b>PKR {(customerBalance - supplierBalance).toLocaleString()}</b>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button className="btn" style={{ flex: 1 }} disabled={busy || !canSettle} onClick={doSettle}>
                {canSettle ? `Settle Full Amount (PKR ${Math.min(customerBalance, supplierBalance).toLocaleString()})` : "Nothing to settle"}
              </button>
              <button className="btn btn-outline" disabled={busy} onClick={doUnlink}>Unlink</button>
            </div>

            {error && <div style={{ color: "#EF4444", fontSize: 12, marginBottom: 10 }}>{error}</div>}

            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>Settlement History</div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {historyLoading ? (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading...</div>
              ) : history.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No settlements yet.</div>
              ) : (
                history.map(h => (
                  <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                    <div>
                      <div>PKR {Number(h.amount).toLocaleString()} on {h.date}</div>
                      <div style={{ color: "var(--text-muted)" }}>{h.status === "reversed" ? "Reversed" : "Posted"}</div>
                    </div>
                    {h.status === "posted" && (
                      <button className="btn btn-outline" style={{ fontSize: 11, padding: "3px 8px" }} disabled={busy} onClick={() => doUndo(h.id)}>Undo</button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}