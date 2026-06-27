"use client"

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react"
import { createBrowserClient } from "@supabase/ssr"
import { getEntityConfig } from "@/lib/entities/registry"
import { validatePKMobile } from "@/lib/validators"

// ── Types ──────────────────────────────────────────────────────────────

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
}

// ── Component ──────────────────────────────────────────────────────────

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
  const [allRecords, setAllRecords] = useState<LookupRecord[]>([])
  const [filteredResults, setFilteredResults] = useState<LookupRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formValues, setFormValues] = useState<Record<string, any>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [companyId, setCompanyId] = useState("")

  // ── Fetch company ID ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) setCompanyId(cid)
    })
  }, [])

  // ── Fetch all records ──
  const tableName =
    entityType === "customer" ? "customers"
    : entityType === "supplier" ? "suppliers"
    : entityType === "product" ? "products"
    : null

  useEffect(() => {
    if (!companyId || !tableName) return
    setIsLoading(true)
    supabase
      .from(tableName)
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .then(({ data }) => {
        setAllRecords(data || [])
        setIsLoading(false)
      })
  }, [companyId, tableName])

  // ── Filter locally ──
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredResults(allRecords.slice(0, 8))
      return
    }
    const q = searchQuery.toLowerCase()
    const fields = config?.searchFields || ["name"]
    const filtered = allRecords
      .filter((r) =>
        fields.some((f) => (r[f]?.toString() || "").toLowerCase().includes(q))
      )
      .slice(0, 8)
    setFilteredResults(filtered)
  }, [searchQuery, allRecords, config])

  // ── Open / close ──
  const openDropdown = useCallback(() => {
    if (!disabled) setIsOpen(true)
  }, [disabled])

  const closeDropdown = useCallback(() => setIsOpen(false), [])

  // ── Click outside closes dropdown ──
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

  // ── Focus search on open ──
  useEffect(() => {
    if (isOpen) setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [isOpen])

  // ── Select a record ──
  const handleSelect = (record: LookupRecord) => {
    onChange(record)
    closeDropdown()
    setSearchQuery("")
  }

  // ── Open quick create modal ──
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

  // ── Form field change ──
  const handleFieldChange = (name: string, val: string) => {
    setFormValues((prev) => ({ ...prev, [name]: val }))
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  // ── Client‑side validation ──
  const validateForm = (): boolean => {
    if (!config) return false
    const errors: Record<string, string> = {}
    config.quickCreate.fields.forEach((f) => {
      const val = formValues[f.name]
      if (f.required && !val) {
        errors[f.name] = `${f.label} is required`
        return
      }
      if (f.type === "tel" && val) {
        const err = validatePKMobile(val)
        if (err) errors[f.name] = err
      }
    })
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  // ── Save (Quick Create) ──
  const handleSave = async () => {
    if (!validateForm() || !config) return

    setIsSaving(true)
    setSaveError(null)

    try {
      const payload: any = { company_id: companyId }
      config.quickCreate.fields.forEach((f) => {
        if (formValues[f.name] !== undefined) {
          payload[f.name] = formValues[f.name]
        }
      })

      const res = await fetch(config.apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        setSaveError(errData.error || "Failed to create record")
        setIsSaving(false)
        return
      }

      const data = await res.json()
      const newRecord = data.customer || data.supplier || data.product || data

      setAllRecords((prev) => [newRecord, ...prev])
      onChange(newRecord)
      setIsModalOpen(false)
    } catch {
      setSaveError("Network error. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  // ── Keyboard: Escape closes ──
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

  const canCreate = config.permissions.create.length > 0
  const displayLabel = label || config.displayName

  // ── Inline Styles (CSS variables, fully themed) ──
  const styles: Record<string, React.CSSProperties> = {
    wrapper: {
      position: "relative",
      fontFamily: "'Inter', sans-serif",
      width: "100%",
    },
    label: {
      fontSize: 10,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      color: "var(--text-muted)",
      marginBottom: 4,
      display: "block",
    },
    trigger: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      height: 38,
      border: "1.5px solid var(--border)",
      borderRadius: 8,
      padding: "0 12px",
      fontSize: 13,
      background: "var(--bg)",
      color: "var(--text)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      outline: "none",
      fontFamily: "inherit",
      boxSizing: "border-box",
      textAlign: "left" as const,
    },
    triggerPlaceholder: {
      color: "var(--text-muted)",
    },
    selectedChip: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
    },
    dropdown: {
      position: "absolute",
      zIndex: 100,
      top: "calc(100% + 4px)",
      left: 0,
      right: 0,
      background: "var(--card)",
      border: "1.5px solid var(--border)",
      borderRadius: 10,
      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
      overflow: "hidden",
    },
    searchInput: {
      width: "100%",
      height: 34,
      border: "1.5px solid var(--border)",
      borderRadius: 8,
      padding: "0 12px",
      fontSize: 13,
      background: "var(--bg)",
      color: "var(--text)",
      outline: "none",
      fontFamily: "inherit",
      boxSizing: "border-box",
    },
    resultsList: {
      maxHeight: 200,
      overflowY: "auto" as const,
    },
    resultItem: {
      padding: "8px 12px",
      cursor: "pointer",
      borderBottom: "1px solid var(--border)",
      fontSize: 13,
      color: "var(--text)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    },
    emptyState: {
      padding: "16px 12px",
      textAlign: "center" as const,
      color: "var(--text-muted)",
      fontSize: 13,
    },
    actionFooter: {
      display: "flex",
      gap: 8,
      padding: "8px 12px",
      borderTop: "1px solid var(--border)",
    },
    actionBtn: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "8px 14px",
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      border: "1.5px solid var(--border)",
      background: "transparent",
      color: "var(--text-muted)",
      fontFamily: "inherit",
    },
    // Modal
    modalBackdrop: {
      position: "fixed",
      inset: 0,
      zIndex: 1000,
      background: "rgba(0,0,0,0.3)",
      backdropFilter: "blur(2px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    modalPanel: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      width: "90%",
      maxWidth: 500,
      maxHeight: "80vh",
      overflowY: "auto" as const,
      padding: 20,
      boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
    },
    modalTitle: {
      fontSize: 15,
      fontWeight: 700,
      color: "var(--text)",
      marginBottom: 12,
    },
    modalField: {
      marginBottom: 12,
    },
    modalFieldLabel: {
      fontSize: 10,
      fontWeight: 600,
      textTransform: "uppercase" as const,
      color: "var(--text-muted)",
      marginBottom: 4,
      display: "block",
    },
    modalFieldInput: {
      width: "100%",
      height: 38,
      border: "1.5px solid var(--border)",
      borderRadius: 8,
      padding: "0 12px",
      fontSize: 13,
      background: "var(--bg)",
      color: "var(--text)",
      outline: "none",
      fontFamily: "inherit",
      boxSizing: "border-box",
    },
    modalFieldError: {
      color: "#EF4444",
      fontSize: 12,
      marginTop: 2,
    },
    modalFooter: {
      display: "flex",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 12,
    },
    saveBtn: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "8px 14px",
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      background: "var(--primary)",
      color: "var(--primary-text)",
      border: "none",
      fontFamily: "inherit",
    },
    cancelBtn: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "8px 14px",
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      background: "transparent",
      color: "var(--text-muted)",
      border: "1.5px solid var(--border)",
      fontFamily: "inherit",
    },
    errorBanner: {
      background: "var(--card)",
      border: "1px solid #EF4444",
      color: "#FCA5A5",
      padding: "8px 12px",
      borderRadius: 8,
      fontSize: 13,
      marginBottom: 12,
    },
  };

  return (
    <div style={styles.wrapper} className={className}>
      {/* Label */}
      <label style={styles.label}>
        {displayLabel}
        {required && <span style={{ color: "#EF4444", marginLeft: 4 }}>*</span>}
      </label>

      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={openDropdown}
        style={styles.trigger}
      >
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
        <span style={{ color: "var(--text-muted)" }}>▼</span>
      </button>

      {/* Dropdown */}
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

          <div style={styles.resultsList}>
            {filteredResults.length > 0 ? (
              filteredResults.map((r) => (
                <div
                  key={r.id}
                  onClick={() => handleSelect(r)}
                  style={{
                    ...styles.resultItem,
                    background: value?.id === r.id ? "var(--card-hover)" : "transparent",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = value?.id === r.id ? "var(--card-hover)" : "transparent")}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.code ? `${r.code} — ` : ""}{r.name}
                  </span>
                </div>
              ))
            ) : searchQuery ? (
              <div style={styles.emptyState}>
                No results for &quot;{searchQuery}&quot;
              </div>
            ) : (
              <div style={styles.emptyState}>
                Start typing to search…
              </div>
            )}
          </div>

          <div style={styles.actionFooter}>
            {canCreate && (
              <button type="button" onClick={openModal} style={styles.actionBtn}>
                + Quick Create {config.displayName}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Quick Create Modal */}
      {isModalOpen && (
        <div
          style={styles.modalBackdrop}
          onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}
        >
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

            {config.quickCreate.fields.map((field) => (
              <div key={field.name} style={styles.modalField}>
                <label style={styles.modalFieldLabel}>
                  {field.label}
                  {field.required && <span style={{ color: "#EF4444", marginLeft: 4 }}>*</span>}
                </label>
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
                {fieldErrors[field.name] && (
                  <div style={styles.modalFieldError}>{fieldErrors[field.name]}</div>
                )}
              </div>
            ))}

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

      {/* Responsive: modal becomes bottom sheet on mobile */}
      <style>{`
        @media (max-width: 640px) {
          .entity-picker-modal-panel {
            max-width: 100% !important;
            border-radius: 12px 12px 0 0 !important;
            position: fixed !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
        }
      `}</style>
    </div>
  )
}