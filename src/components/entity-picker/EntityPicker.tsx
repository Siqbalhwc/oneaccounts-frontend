"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { getEntityConfig } from "@/lib/entities/registry"

interface LookupRecord {
  id: number | string
  name: string
  [key: string]: any
}

interface EntityPickerProps {
  entityType: string
  value: LookupRecord | null
  onChange: (record: LookupRecord | null) => void
  label?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  defaultValues?: Record<string, any>
  className?: string
  compact?: boolean
  /** Show the "+ Quick Create" button. Default true. */
  allowCreate?: boolean
}

export default function EntityPicker({
  entityType,
  value,
  onChange,
  label,
  placeholder,
  required = false,
  disabled = false,
  defaultValues = {},
  className = "",
  compact = false,
  allowCreate = true,
}: EntityPickerProps) {
  const config = getEntityConfig(entityType)
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [allRecords, setAllRecords] = useState<LookupRecord[] | null>(null)
  const [filteredResults, setFilteredResults] = useState<LookupRecord[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formValues, setFormValues] = useState<Record<string, any>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [companyId, setCompanyId] = useState("")
  const [lookupOptions, setLookupOptions] = useState<Record<string, any[]>>({})

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  const tableName =
    entityType === "customer" ? "customers"
    : entityType === "supplier" ? "suppliers"
    : entityType === "product" ? "products"
    : entityType === "location" ? "locations"
    : entityType === "activity" ? "activities"
    : entityType === "project" ? "projects"
    : entityType === "account" ? "accounts"
    : null

  // ── Lazy load: only fetch when dropdown opens ──
  useEffect(() => {
    if (!isOpen || !companyId || !tableName) return
    if (allRecords !== null) return   // already loaded

    supabase
      .from(tableName)
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .then(({ data }) => {
        setAllRecords(data || [])
      })
  }, [isOpen, companyId, tableName, allRecords])

  // ── Filter locally ──
  useEffect(() => {
    if (!allRecords) { setFilteredResults([]); return }
    if (!searchQuery.trim()) {
      setFilteredResults(allRecords.slice(0, 8))
      return
    }
    const q = searchQuery.toLowerCase()
    const fields = config?.searchFields || ["name"]
    const filtered = allRecords
      .filter((r) => fields.some((f) => (r[f]?.toString() || "").toLowerCase().includes(q)))
      .slice(0, 8)
    setFilteredResults(filtered)
  }, [searchQuery, allRecords, config])

  // Load dynamic lookup options when modal opens
  useEffect(() => {
    if (isModalOpen && config) {
      config.quickCreate.fields.forEach(async (field: any) => {
        if (field.lookupTable && !lookupOptions[field.name]) {
          const { data } = await supabase
            .from(field.lookupTable)
            .select("id, name")
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .order("name")
          if (data) {
            setLookupOptions((prev) => ({ ...prev, [field.name]: data }))
          }
        }
      })
    }
  }, [isModalOpen, config, companyId])

  const openDropdown = useCallback(() => {
    if (!disabled) setIsOpen(true)
  }, [disabled])

  const closeDropdown = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        closeDropdown()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [closeDropdown])

  useEffect(() => {
    if (isOpen) setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [isOpen])

  const handleSelect = (record: LookupRecord) => {
    onChange(record)
    closeDropdown()
    setSearchQuery("")
  }

  const openModal = () => {
    const initial: Record<string, any> = { ...defaultValues }
    if (config) {
      config.quickCreate.fields.forEach((f) => {
        if (f.defaultValue !== undefined && initial[f.name] === undefined) {
          initial[f.name] = f.defaultValue
        }
      })
    }
    if (searchQuery.trim()) initial.name = searchQuery.trim()
    setFormValues(initial)
    setFieldErrors({})
    setSaveError(null)
    setIsOpen(false)
    setIsModalOpen(true)
  }

  const handleFieldChange = (name: string, val: string) => {
    setFormValues((prev) => {
      const updated = { ...prev, [name]: val }
      const field = config?.quickCreate.fields.find((f) => f.name === name)
      if (field?.validation) {
        const err = field.validation(val, updated)
        setFieldErrors((prevErrs) => {
          const next = { ...prevErrs }
          if (err) next[name] = err
          else delete next[name]
          return next
        })
      } else if (field?.required && !val) {
        setFieldErrors((prevErrs) => ({ ...prevErrs, [name]: `${field.label} is required` }))
      } else {
        setFieldErrors((prevErrs) => {
          const next = { ...prevErrs }
          delete next[name]
          return next
        })
      }
      return updated
    })
  }

  const validateForm = (): boolean => {
    if (!config) return false
    const errors: Record<string, string> = {}
    config.quickCreate.fields.forEach((f) => {
      const val = formValues[f.name]
      if (f.required && !val) {
        errors[f.name] = `${f.label} is required`
        return
      }
      if (f.validation && val) {
        const err = f.validation(val, formValues)
        if (err) errors[f.name] = err
      }
    })
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm() || !config) return

    setIsSaving(true)
    setSaveError(null)

    try {
      const payload: any = { company_id: companyId }
      config.quickCreate.fields.forEach((f) => {
        if (f.name === "country_code") return
        if (formValues[f.name] !== undefined) {
          payload[f.name] = formValues[f.name]
        }
      })

      if (formValues.country_code && formValues.phone) {
        payload.phone = (formValues.country_code || "") + (formValues.phone || "")
      }

      let newRecord: any = null

      // PRODUCT
      if (entityType === "product") {
        let nextCode = "PROD-001"
        const { data: codes } = await supabase
          .from("products")
          .select("code")
          .eq("company_id", companyId)
          .ilike("code", "PROD-%")
          .order("code", { ascending: false })
          .limit(1)
        if (codes && codes.length > 0) {
          const match = codes[0].code?.match(/PROD-(\d+)/)
          if (match) {
            const num = parseInt(match[1], 10) + 1
            nextCode = `PROD-${String(num).padStart(3, "0")}`
          }
        }
        const productPayload = {
          company_id: companyId,
          code: nextCode,
          name: payload.name || "",
          sale_price: parseFloat(payload.sale_price || 0),
          cost_price: parseFloat(payload.cost_price || 0),
          opening_qty: 0,
          qty_on_hand: 0,
          image_path: null,
        }
        const { data: inserted, error: insertErr } = await supabase
          .from("products")
          .insert(productPayload)
          .select("*")
          .single()
        if (insertErr) throw new Error(insertErr.message)
        newRecord = inserted
      }
      // location, activity, project, account – direct insert
      else if (["location", "activity", "project", "account"].includes(entityType)) {
        if (entityType === "account" && payload.code) {
          const { data: existing } = await supabase
            .from("accounts")
            .select("id")
            .eq("company_id", companyId)
            .eq("code", payload.code)
            .maybeSingle()
          if (existing) {
            setSaveError("Code already exists. Please choose another.")
            setIsSaving(false)
            return
          }
        }
        const { data: inserted, error: insertErr } = await supabase
          .from(tableName!)
          .insert(payload)
          .select("*")
          .single()
        if (insertErr) throw new Error(insertErr.message)
        newRecord = inserted
      }
      // customer / supplier
      else {
        const res = await fetch(config.apiBase, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || "Failed to create record")
        }
        const data = await res.json()
        newRecord = data.customer || data.supplier || data
      }

      // Update all records cache and select
      setAllRecords((prev) => (prev ? [newRecord, ...prev] : [newRecord]))
      onChange(newRecord)
      setIsModalOpen(false)
    } catch (err: any) {
      setSaveError(err.message || "Failed to create record. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isModalOpen) setIsModalOpen(false)
        else if (isOpen) closeDropdown()
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [isOpen, isModalOpen, closeDropdown])

  if (!config) return null

  const canCreate = allowCreate && config.permissions.create.length > 0
  const displayLabel = compact ? "" : label || config.displayName

  const styles: Record<string, React.CSSProperties> = {
    wrapper: { position: "relative", fontFamily: "'Inter', sans-serif", width: "100%" },
    label: { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 4, display: "block" },
    trigger: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      width: "100%", height: compact ? 32 : 38,
      border: "1.5px solid var(--border)", borderRadius: 8,
      padding: compact ? "0 6px" : "0 12px",
      fontSize: compact ? 11 : 13,
      background: "var(--bg)", color: "var(--text)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      outline: "none", fontFamily: "inherit", boxSizing: "border-box",
      textAlign: "left" as const,
    },
    triggerPlaceholder: { color: "var(--text-muted)", fontSize: compact ? 11 : 13 },
    selectedChip: { display: "flex", alignItems: "center", gap: 6, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontSize: compact ? 11 : 13 },
    dropdown: { position: "absolute", zIndex: 100, top: "calc(100% + 4px)", left: 0, minWidth: compact ? 220 : "100%", right: compact ? "auto" : 0, background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", overflow: "hidden" },
    searchInput: { width: "100%", height: 34, border: "1.5px solid var(--border)", borderRadius: 8, padding: "0 12px", fontSize: 13, background: "var(--bg)", color: "var(--text)", outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
    resultItem: { padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text)", display: "flex", justifyContent: "space-between", alignItems: "center" },
    emptyState: { padding: "16px 12px", textAlign: "center" as const, color: "var(--text-muted)", fontSize: 13 },
    actionFooter: { display: "flex", gap: 8, padding: "8px 12px", borderTop: "1px solid var(--border)" },
    actionBtn: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1.5px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontFamily: "inherit" },
    modalBackdrop: { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" },
    modalPanel: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, width: "90%", maxWidth: 500, maxHeight: "80vh", overflowY: "auto" as const, padding: 20, boxShadow: "0 8px 24px rgba(0,0,0,0.2)" },
    modalTitle: { fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 12 },
    modalField: { marginBottom: 12 },
    modalFieldLabel: { fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, color: "var(--text-muted)", marginBottom: 4, display: "block" },
    modalFieldInput: { width: "100%", height: 38, border: "1.5px solid var(--border)", borderRadius: 8, padding: "0 12px", fontSize: 13, background: "var(--bg)", color: "var(--text)", outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
    modalFieldSelect: { width: "100%", height: 38, border: "1.5px solid var(--border)", borderRadius: 8, padding: "0 12px", fontSize: 13, background: "var(--bg)", color: "var(--text)", outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
    modalFieldError: { color: "#EF4444", fontSize: 12, marginTop: 2 },
    modalFooter: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 },
    saveBtn: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "var(--primary)", color: "var(--primary-text)", border: "none", fontFamily: "inherit" },
    cancelBtn: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "transparent", color: "var(--text-muted)", border: "1.5px solid var(--border)", fontFamily: "inherit" },
    errorBanner: { background: "var(--card)", border: "1px solid #EF4444", color: "#FCA5A5", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 },
    phoneRow: { display: "grid", gridTemplateColumns: "130px 1fr", gap: 8, alignItems: "flex-start" },
  }

  const isPhoneRow = (fields: any[], idx: number) =>
    fields[idx]?.name === "country_code" && fields[idx + 1]?.name === "phone"

  return (
    <div style={styles.wrapper} className={className}>
      {!compact && (
        <label style={styles.label}>
          {displayLabel}
          {required && <span style={{ color: "#EF4444", marginLeft: 4 }}>*</span>}
        </label>
      )}

      <button ref={triggerRef} type="button" disabled={disabled} onClick={openDropdown} style={styles.trigger}>
        {value ? (
          <span style={styles.selectedChip}>
            {value.code ? `${value.code} — ` : ""}
            {value.name}
          </span>
        ) : (
          <span style={styles.triggerPlaceholder}>
            {placeholder || `Search ${config.displayName.toLowerCase()}…`}
          </span>
        )}
        <span style={{ color: "var(--text-muted)", fontSize: compact ? 10 : 13 }}>▼</span>
      </button>

      {isOpen && (
        <div ref={dropdownRef} style={styles.dropdown}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${config.displayName.toLowerCase()}…`}
              style={styles.searchInput}
            />
          </div>
          <div className="ep-results-list">
            {allRecords === null ? (
              <div style={styles.emptyState}>Loading…</div>
            ) : filteredResults.length > 0 ? (
              filteredResults.map((r) => (
                <div
                  key={r.id}
                  onClick={() => handleSelect(r)}
                  style={{
                    ...styles.resultItem,
                    background: value?.id === r.id ? "var(--card-hover)" : "transparent",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-hover)")}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background =
                      value?.id === r.id ? "var(--card-hover)" : "transparent")
                  }
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ fontWeight: 600 }}>
                      {r.code ? `${r.code} — ` : ""}
                      {r.name}
                    </span>
                    {config.searchResultExtra && config.searchResultExtra(r) && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                        {config.searchResultExtra(r)}
                      </span>
                    )}
                  </span>
                </div>
              ))
            ) : searchQuery ? (
              <div style={styles.emptyState}>No results for &quot;{searchQuery}&quot;</div>
            ) : (
              <div style={styles.emptyState}>Start typing to search…</div>
            )}
          </div>
          {canCreate && (
            <div style={styles.actionFooter}>
              <button type="button" onClick={openModal} style={styles.actionBtn}>
                + Quick Create {config.displayName}
              </button>
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <div style={styles.modalBackdrop} onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div style={styles.modalPanel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={styles.modalTitle}>Create {config.displayName}</h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ ...styles.cancelBtn, padding: "4px 8px", fontSize: 14 }}
              >
                ✕
              </button>
            </div>

            {saveError && <div style={styles.errorBanner}>{saveError}</div>}

            {config.quickCreate.fields.map((field: any, idx: number) => {
              if (field.name === "phone" && idx > 0 && config.quickCreate.fields[idx - 1]?.name === "country_code")
                return null

              if (isPhoneRow(config.quickCreate.fields, idx)) {
                const phoneField = config.quickCreate.fields[idx + 1]
                return (
                  <div key="phone-row" className="phone-row" style={styles.modalField}>
                    <label style={styles.modalFieldLabel}>
                      Phone<span style={{ color: "#EF4444", marginLeft: 4 }}>*</span>
                    </label>
                    <div style={styles.phoneRow}>
                      <select
                        value={formValues[field.name] || ""}
                        onChange={(e) => handleFieldChange(field.name, e.target.value)}
                        style={styles.modalFieldSelect}
                      >
                        {field.options?.map((opt: any) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={formValues[phoneField.name] || ""}
                        onChange={(e) => handleFieldChange(phoneField.name, e.target.value)}
                        placeholder={phoneField.placeholder}
                        style={{
                          ...styles.modalFieldInput,
                          borderColor: fieldErrors[phoneField.name] ? "#EF4444" : "var(--border)",
                        }}
                      />
                    </div>
                    {fieldErrors[phoneField.name] && (
                      <div style={styles.modalFieldError}>{fieldErrors[phoneField.name]}</div>
                    )}
                  </div>
                )
              }

              return (
                <div key={field.name} style={styles.modalField}>
                  <label style={styles.modalFieldLabel}>
                    {field.label}
                    {field.required && <span style={{ color: "#EF4444", marginLeft: 4 }}>*</span>}
                  </label>

                  {field.type === "select" && (field.options || field.lookupTable) ? (
                    <select
                      value={formValues[field.name] || ""}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      style={styles.modalFieldSelect}
                    >
                      <option value="">Select {field.label.toLowerCase()}…</option>
                      {(field.options || lookupOptions[field.name] || []).map((opt: any) => (
                        <option key={opt.value || opt.id} value={opt.value || opt.id}>
                          {opt.label || opt.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      value={formValues[field.name] || ""}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      placeholder={field.placeholder}
                      style={{
                        ...styles.modalFieldInput,
                        borderColor: fieldErrors[field.name] ? "#EF4444" : "var(--border)",
                      }}
                    />
                  )}
                  {fieldErrors[field.name] && (
                    <div style={styles.modalFieldError}>{fieldErrors[field.name]}</div>
                  )}
                </div>
              )
            })}

            <div style={styles.modalFooter}>
              <button type="button" onClick={() => setIsModalOpen(false)} style={styles.cancelBtn}>
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={isSaving} style={styles.saveBtn}>
                {isSaving ? "Saving…" : `Save ${config.displayName}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 640px) {
          .phone-row { grid-template-columns: 110px 1fr !important; }
        }

        /* Results list: capped to ~5 rows, theme-aware scrollbar instead of
           the OS-default white scrollbar (inline styles can't reach
           ::-webkit-scrollbar, so this has to live in real CSS). */
        .ep-results-list {
          max-height: 210px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }
        .ep-results-list::-webkit-scrollbar {
          width: 8px;
        }
        .ep-results-list::-webkit-scrollbar-track {
          background: transparent;
        }
        .ep-results-list::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 8px;
        }
        .ep-results-list::-webkit-scrollbar-thumb:hover {
          background: var(--border-strong, var(--text-faint));
        }
      `}</style>
    </div>
  )
}