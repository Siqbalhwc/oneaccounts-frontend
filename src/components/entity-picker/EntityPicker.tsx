"use client"

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react"
import { createBrowserClient } from "@supabase/ssr"
import { getEntityConfig } from "@/lib/entities/registry"
import type { EntityConfig, FieldConfig } from "@/lib/entities/types"
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

// ── Entity Picker Component ────────────────────────────────────────────

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

  // ── Fetch all records for this entity ──
  const tableName = entityType === "customer" ? "customers"
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

  // ── Filter locally based on searchQuery ──
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredResults(allRecords.slice(0, 8))
      return
    }
    const q = searchQuery.toLowerCase()
    const fields = config?.searchFields || ["name"]
    const filtered = allRecords.filter((r) =>
      fields.some((f) => (r[f]?.toString() || "").toLowerCase().includes(q))
    ).slice(0, 8)
    setFilteredResults(filtered)
  }, [searchQuery, allRecords, config])

  // ── Open / close logic ──
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
      // Build a minimal payload based on the entity
      const payload: any = { company_id: companyId }
      config.quickCreate.fields.forEach((f) => {
        if (formValues[f.name] !== undefined) {
          payload[f.name] = formValues[f.name]
        }
      })

      // For customer/supplier: auto‑generate code if not provided
      if (!payload.code && (entityType === "customer" || entityType === "supplier")) {
        // Use existing code‑generation logic from the form (we can mimic it)
        // For simplicity, we'll let the backend handle it (the existing API already does)
      }

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

      // Add the new record to local list and select it
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

  return (
    <div className={`relative ${className}`} style={{ fontFamily: "inherit" }}>
      {/* Label */}
      <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-gray-500">
        {displayLabel}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>

      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={openDropdown}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-left hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {value ? (
          <span className="text-gray-800 font-medium truncate">
            {value.code ? `${value.code} — ` : ""}{value.name}
          </span>
        ) : (
          <span className="text-gray-400">
            {placeholder || `Search ${config.displayName.toLowerCase()}…`}
          </span>
        )}
        <span className="text-gray-400">▼</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
        >
          {/* Search */}
          <div className="p-3 border-b border-gray-100">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${config.displayName.toLowerCase()}…`}
              className="w-full px-3 py-2 bg-gray-50 rounded-lg text-sm border border-transparent focus:border-blue-300 focus:bg-white outline-none"
            />
          </div>

          {/* Results */}
          <div className="max-h-48 overflow-y-auto py-1">
            {filteredResults.length > 0 ? (
              filteredResults.map((r) => (
                <div
                  key={r.id}
                  onClick={() => handleSelect(r)}
                  className="px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
                >
                  {r.code ? `${r.code} — ` : ""}{r.name}
                </div>
              ))
            ) : searchQuery ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No results for &quot;{searchQuery}&quot;
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                Start typing to search…
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="border-t border-gray-100 p-2 flex gap-2">
            {canCreate && (
              <button
                type="button"
                onClick={openModal}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100"
              >
                + Quick Create {config.displayName}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Quick Create Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:rounded-b-none max-sm:max-w-none">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800">
                Create {config.displayName}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>
            <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {saveError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-xs text-red-600">
                  {saveError}
                </div>
              )}
              {config.quickCreate.fields.map((field) => (
                <div key={field.name} className="space-y-1">
                  <label className="block text-xs font-medium text-gray-500">
                    {field.label}
                    {field.required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  <input
                    type={field.type}
                    value={formValues[field.name] || ""}
                    onChange={(e) => handleFieldChange(field.name, e.target.value)}
                    placeholder={field.placeholder}
                    className={`w-full px-3 py-2.5 rounded-lg border text-sm ${
                      fieldErrors[field.name]
                        ? "border-red-300 focus:border-red-400"
                        : "border-gray-200 hover:border-gray-300 focus:border-blue-400"
                    } bg-white text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20`}
                  />
                  {fieldErrors[field.name] && (
                    <p className="text-xs text-red-500">{fieldErrors[field.name]}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? "Saving…" : `Save ${config.displayName}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}