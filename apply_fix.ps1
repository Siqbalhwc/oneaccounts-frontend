$ErrorActionPreference = "Stop"
$base = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$utf8 = New-Object System.Text.UTF8Encoding($true)

function Apply-Edit {
    param([string]$content, [string]$old, [string]$new, [string]$label)
    $contentNorm = $content -replace "`r`n", "`n"
    $oldNorm = $old -replace "`r`n", "`n"
    $newNorm = $new -replace "`r`n", "`n"
    if (-not $contentNorm.Contains($oldNorm)) {
        throw "Anchor not found for edit: $label"
    }
    return $contentNorm.Replace($oldNorm, $newNorm)
}

# ============ 1. NEW FILE: ActionSlots.tsx ============
$actionSlotsPath = Join-Path $base "src\components\ActionSlots.tsx"
$actionSlotsContent = @'
"use client"

import RowActionsMenu, { RowAction } from "./RowActionsMenu"
import { ChevronRight } from "lucide-react"

/** A single fixed-position action (View / Edit / WhatsApp slot). */
export interface ActionSlotItem {
  icon: React.ReactNode
  title?: string
  color?: string
  onClick?: () => void
  /** Escape hatch for a slot that needs its own trigger (e.g. a component managing its own modal), same pattern as RowAction.render. */
  render?: () => React.ReactNode
}

interface ActionSlotsProps {
  /** 1st fixed slot - View / View Ledger. Pass null/undefined to leave blank. */
  slot1?: ActionSlotItem | null
  /** 2nd fixed slot - Edit. Pass null/undefined to leave blank. */
  slot2?: ActionSlotItem | null
  /** 3rd fixed slot - WhatsApp (or leave blank if not applicable to this entity/row). */
  slot3?: ActionSlotItem | null
  /** Any remaining actions, shown behind a "more actions" overflow trigger. Empty/all-hidden = no trigger shown. */
  overflow?: RowAction[]
}

const SLOT_SIZE = 28

function Blank() {
  return <span style={{ display: "inline-block", width: SLOT_SIZE, height: SLOT_SIZE, flexShrink: 0 }} />
}

function Slot({ item }: { item?: ActionSlotItem | null }) {
  if (!item) return <Blank />
  if (item.render) {
    return (
      <span style={{ display: "inline-flex", width: SLOT_SIZE, height: SLOT_SIZE, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {item.render()}
      </span>
    )
  }
  return (
    <button className="btn-icon" onClick={item.onClick} title={item.title} style={{ color: item.color, flexShrink: 0 }}>
      {item.icon}
    </button>
  )
}

/**
 * Standard action column for list-view pages: 3 fixed-width slots
 * (View / Edit / WhatsApp, by convention) that always occupy the same
 * position whether or not that action applies to a given row, plus an
 * overflow trigger for anything beyond the 3 - so rows stay aligned
 * column-to-column regardless of which actions are available per row.
 */
export default function ActionSlots({ slot1, slot2, slot3, overflow = [] }: ActionSlotsProps) {
  const visibleOverflow = overflow.filter(a => !a.hidden)
  return (
    <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
      <Slot item={slot1} />
      <Slot item={slot2} />
      <Slot item={slot3} />
      {visibleOverflow.length > 0 ? (
        <RowActionsMenu actions={visibleOverflow} variant="flat" triggerIcon={<ChevronRight size={14} />} />
      ) : (
        <Blank />
      )}
    </div>
  )
}
'@

# ============ 2. RowActionsMenu.tsx (3 edits) ============
$ramPath = Join-Path $base "src\components\RowActionsMenu.tsx"
$ramContent = [System.IO.File]::ReadAllText($ramPath, [System.Text.Encoding]::UTF8)

$r1old = @'
interface RowActionsMenuProps {
  actions: RowAction[]
  /** Which side of the trigger button the menu opens toward. Default "right". */
  align?: "left" | "right"
}

export default function RowActionsMenu({ actions, align = "right" }: RowActionsMenuProps) {
'@
$r1new = @'
interface RowActionsMenuProps {
  actions: RowAction[]
  /** Which side of the trigger button the menu opens toward. Default "right". */
  align?: "left" | "right"
  /** Trigger visual style. "primary" = filled circular button (default, original style). "flat" = bordered icon button matching the .btn-icon style used elsewhere in list rows. */
  variant?: "primary" | "flat"
  /** Icon shown in the trigger button. Defaults to a chevron-down. */
  triggerIcon?: React.ReactNode
}

export default function RowActionsMenu({ actions, align = "right", variant = "primary", triggerIcon }: RowActionsMenuProps) {
'@
$ramContent = Apply-Edit $ramContent $r1old $r1new "RowActionsMenu: props"

$r2old = @'
      <button
        ref={triggerRef}
        type="button"
        className="row-actions-trigger"
        onClick={(e) => {
          e.stopPropagation()
          toggleOpen()
        }}
        title="Actions"
      >
        <ChevronDown size={18} strokeWidth={2.5} />
      </button>
'@
$r2new = @'
      <button
        ref={triggerRef}
        type="button"
        className={variant === "flat" ? "row-actions-trigger row-actions-trigger-flat" : "row-actions-trigger"}
        onClick={(e) => {
          e.stopPropagation()
          toggleOpen()
        }}
        title="More actions"
      >
        {triggerIcon ?? <ChevronDown size={18} strokeWidth={2.5} />}
      </button>
'@
$ramContent = Apply-Edit $ramContent $r2old $r2new "RowActionsMenu: trigger button"

$r3old = @'
        .row-actions-trigger:active {
          transform: translateY(0);
        }
'@
$r3new = @'
        .row-actions-trigger:active {
          transform: translateY(0);
        }
        .row-actions-trigger-flat {
          width: 26px;
          height: 26px;
          background: transparent;
          border: 1.5px solid var(--border);
          color: var(--text-muted);
          box-shadow: none;
        }
        .row-actions-trigger-flat:hover {
          background: var(--card-hover);
          transform: none;
        }
'@
$ramContent = Apply-Edit $ramContent $r3old $r3new "RowActionsMenu: css"

# ============ 3. CUSTOMERS ============
$custPath = Join-Path $base "src\app\dashboard\customers\page.tsx"
$custContent = [System.IO.File]::ReadAllText($custPath, [System.Text.Encoding]::UTF8)

$c1old = 'import RowActionsMenu, { RowAction } from "@/components/RowActionsMenu"'
$c1new = @'
import type { RowAction } from "@/components/RowActionsMenu"
import ActionSlots from "@/components/ActionSlots"
'@
$custContent = Apply-Edit $custContent $c1old $c1new "customers: import"

$c2old = @'
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <div style={{ display: "flex", justifyContent: "center" }}>
                            <RowActionsMenu
                              actions={[
                                {
                                  key: "ledger",
                                  label: "View Ledger",
                                  icon: <Eye size={14} />,
                                  onClick: () => router.push(`/dashboard/reports/customer-ledger?customerId=${cust.id}`),
                                },
                                {
                                  key: "link",
                                  label: "Link",
                                  icon: <></>,
                                  hidden: !(canEdit && companyId),
                                  render: () => (
                                    <CustomerVendorLink
                                      partyType="customer"
                                      party={cust}
                                      companyId={companyId!}
                                      counterparts={suppliersForLink}
                                      onUpdated={refreshLinkData}
                                      asMenuItem
                                    />
                                  ),
                                },
                                {
                                  key: "edit",
                                  label: "Edit",
                                  icon: <Edit size={14} />,
                                  hidden: !canEdit,
                                  onClick: () => router.push(`/dashboard/customers/new?id=${cust.id}`),
                                },
                                {
                                  key: "restore",
                                  label: "Restore",
                                  icon: <RotateCcw size={14} />,
                                  color: "#10B981",
                                  hidden: !(canEdit && isArchived),
                                  onClick: () => restoreCustomer(cust),
                                },
                                {
                                  key: "archive",
                                  label: checkingUsage === cust.id ? "Checking..." : "Archive / Delete",
                                  icon: <Trash2 size={14} />,
                                  color: "#EF4444",
                                  hidden: !(canEdit && !isArchived),
                                  onClick: () => { if (checkingUsage === null) handleArchiveOrDelete(cust) },
                                },
                                {
                                  key: "whatsapp",
                                  label: "Send WhatsApp",
                                  color: "#25D366",
                                  hidden: !(hasFeature("whatsapp_invoice") && cust.phone),
                                  icon: (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                    </svg>
                                  ),
                                  onClick: () => sendWhatsApp(cust),
                                },
                              ] as RowAction[]}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
'@
$c2new = @'
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <ActionSlots
                            slot1={{
                              icon: <Eye size={13} />,
                              title: "View Ledger",
                              onClick: () => router.push(`/dashboard/reports/customer-ledger?customerId=${cust.id}`),
                            }}
                            slot2={canEdit ? {
                              icon: <Edit size={13} />,
                              title: "Edit",
                              onClick: () => router.push(`/dashboard/customers/new?id=${cust.id}`),
                            } : null}
                            slot3={(hasFeature("whatsapp_invoice") && cust.phone) ? {
                              icon: (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                              ),
                              title: "Send WhatsApp",
                              color: "#25D366",
                              onClick: () => sendWhatsApp(cust),
                            } : null}
                            overflow={[
                              {
                                key: "link",
                                label: "Link",
                                icon: <></>,
                                hidden: !(canEdit && companyId),
                                render: () => (
                                  <CustomerVendorLink
                                    partyType="customer"
                                    party={cust}
                                    companyId={companyId!}
                                    counterparts={suppliersForLink}
                                    onUpdated={refreshLinkData}
                                    asMenuItem
                                  />
                                ),
                              },
                              {
                                key: "restore",
                                label: "Restore",
                                icon: <RotateCcw size={14} />,
                                color: "#10B981",
                                hidden: !(canEdit && isArchived),
                                onClick: () => restoreCustomer(cust),
                              },
                              {
                                key: "archive",
                                label: checkingUsage === cust.id ? "Checking..." : "Archive / Delete",
                                icon: <Trash2 size={14} />,
                                color: "#EF4444",
                                hidden: !(canEdit && !isArchived),
                                onClick: () => { if (checkingUsage === null) handleArchiveOrDelete(cust) },
                              },
                            ] as RowAction[]}
                          />
                        </td>
                      </tr>
                    )
                  })
                )}
'@
$custContent = Apply-Edit $custContent $c2old $c2new "customers: action column"

# ============ 4. SUPPLIERS ============
$supPath = Join-Path $base "src\app\dashboard\suppliers\page.tsx"
$supContent = [System.IO.File]::ReadAllText($supPath, [System.Text.Encoding]::UTF8)

$s1old = 'import CustomerVendorLink from "@/components/CustomerVendorLink"'
$s1new = @'
import CustomerVendorLink from "@/components/CustomerVendorLink"
import ActionSlots from "@/components/ActionSlots"
'@
$supContent = Apply-Edit $supContent $s1old $s1new "suppliers: import"

$s2old = @'
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                        <button className="btn-icon" onClick={() => router.push(`/dashboard/reports/vendor-ledger?supplierId=${s.id}`)} title="View Ledger"><Eye size={13} /></button>
                        {canEdit && companyId && (
                          <CustomerVendorLink
                            partyType="supplier"
                            party={s}
                            companyId={companyId}
                            counterparts={customersForLink}
                            onUpdated={refreshLinkData}
                          />
                        )}
                        {canEdit && (
                          <button className="btn-icon" onClick={() => openEdit(s)} title="Edit"><Edit size={13} /></button>
                        )}
                        {canEdit && isArchived && (
                          <button className="btn-icon" onClick={() => restoreSupplier(s)} style={{ color: "#10B981" }} title="Restore"><RotateCcw size={13} /></button>
                        )}
                        {canEdit && !isArchived && (
                          <button
                            className="btn-icon"
                            onClick={() => { if (checkingUsage === null) handleArchiveOrDelete(s) }}
                            style={{ color: "#EF4444" }}
                            title={checkingUsage === s.id ? "Checking..." : "Archive / Delete"}
                            disabled={checkingUsage === s.id}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })
'@
$s2new = @'
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <ActionSlots
                        slot1={{
                          icon: <Eye size={13} />,
                          title: "View Ledger",
                          onClick: () => router.push(`/dashboard/reports/vendor-ledger?supplierId=${s.id}`),
                        }}
                        slot2={canEdit ? {
                          icon: <Edit size={13} />,
                          title: "Edit",
                          onClick: () => openEdit(s),
                        } : null}
                        slot3={null}
                        overflow={[
                          {
                            key: "link",
                            label: "Link",
                            icon: <></>,
                            hidden: !(canEdit && companyId),
                            render: () => (
                              <CustomerVendorLink
                                partyType="supplier"
                                party={s}
                                companyId={companyId!}
                                counterparts={customersForLink}
                                onUpdated={refreshLinkData}
                                asMenuItem
                              />
                            ),
                          },
                          {
                            key: "restore",
                            label: "Restore",
                            icon: <RotateCcw size={14} />,
                            color: "#10B981",
                            hidden: !(canEdit && isArchived),
                            onClick: () => restoreSupplier(s),
                          },
                          {
                            key: "archive",
                            label: checkingUsage === s.id ? "Checking..." : "Archive / Delete",
                            icon: <Trash2 size={14} />,
                            color: "#EF4444",
                            hidden: !(canEdit && !isArchived),
                            onClick: () => { if (checkingUsage === null) handleArchiveOrDelete(s) },
                          },
                        ]}
                      />
                    </td>
                  </tr>
                  )
                })
'@
$supContent = Apply-Edit $supContent $s2old $s2new "suppliers: action column"

# ============ 5. INVOICES ============
$invPath = Join-Path $base "src\app\dashboard\invoices\page.tsx"
$invContent = [System.IO.File]::ReadAllText($invPath, [System.Text.Encoding]::UTF8)

$i1old = 'import { getWhatsAppLink } from "@/lib/whatsapp"'
$i1new = @'
import { getWhatsAppLink } from "@/lib/whatsapp"
import ActionSlots from "@/components/ActionSlots"
'@
$invContent = Apply-Edit $invContent $i1old $i1new "invoices: import"

$i2old = @'
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          <button className="btn-icon" onClick={() => router.push(`/dashboard/invoices/${inv.id}`)} title="View">
                            <Eye size={13} />
                          </button>
                          {hasFeature("whatsapp_invoice") && (
                            <button className="btn-icon" onClick={() => sendWhatsApp(inv)} title="Send WhatsApp" style={{ color: "#25D366" }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                            </button>
                          )}
                          {hasFeature("payment_reminders") && inv.status !== "Paid" && (
                            <button className="btn-icon" onClick={() => sendReminder(inv)} title="Send Reminder" style={{ color: "#F97316" }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
'@
$i2new = @'
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <ActionSlots
                          slot1={{
                            icon: <Eye size={13} />,
                            title: "View",
                            onClick: () => router.push(`/dashboard/invoices/${inv.id}`),
                          }}
                          slot2={null}
                          slot3={hasFeature("whatsapp_invoice") ? {
                            icon: (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                            ),
                            title: "Send WhatsApp",
                            color: "#25D366",
                            onClick: () => sendWhatsApp(inv),
                          } : null}
                          overflow={[
                            {
                              key: "reminder",
                              label: "Send Reminder",
                              color: "#F97316",
                              hidden: !(hasFeature("payment_reminders") && inv.status !== "Paid"),
                              icon: (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                                </svg>
                              ),
                              onClick: () => sendReminder(inv),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
'@
$invContent = Apply-Edit $invContent $i2old $i2new "invoices: action column"

# ============ 6. BILLS ============
$billPath = Join-Path $base "src\app\dashboard\bills\page.tsx"
$billContent = [System.IO.File]::ReadAllText($billPath, [System.Text.Encoding]::UTF8)

$b1old = 'import { getWhatsAppLink } from "@/lib/whatsapp"'
$b1new = @'
import { getWhatsAppLink } from "@/lib/whatsapp"
import ActionSlots from "@/components/ActionSlots"
'@
$billContent = Apply-Edit $billContent $b1old $b1new "bills: import"

$b2old = @'
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          <button className="btn-icon" onClick={() => router.push(`/dashboard/bills/${bill.id}`)} title="View bill">
                            <Eye size={13} />
                          </button>
                          {hasFeature("whatsapp_invoice") && (
                            <button className="btn-icon" onClick={() => sendWhatsApp(bill)} title="Send via WhatsApp" style={{ color: "#25D366" }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                            </button>
                          )}
                          {hasFeature("payment_reminders") && bill.status !== "Paid" && (
                            <button className="btn-icon" onClick={() => sendReminder(bill)} title="Send payment reminder" style={{ color: "#F97316" }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
'@
$b2new = @'
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <ActionSlots
                          slot1={{
                            icon: <Eye size={13} />,
                            title: "View bill",
                            onClick: () => router.push(`/dashboard/bills/${bill.id}`),
                          }}
                          slot2={null}
                          slot3={hasFeature("whatsapp_invoice") ? {
                            icon: (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                            ),
                            title: "Send via WhatsApp",
                            color: "#25D366",
                            onClick: () => sendWhatsApp(bill),
                          } : null}
                          overflow={[
                            {
                              key: "reminder",
                              label: "Send payment reminder",
                              color: "#F97316",
                              hidden: !(hasFeature("payment_reminders") && bill.status !== "Paid"),
                              icon: (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                                </svg>
                              ),
                              onClick: () => sendReminder(bill),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
'@
$billContent = Apply-Edit $billContent $b2old $b2new "bills: action column"

# ============ 7. RECEIPTS ============
$recPath = Join-Path $base "src\app\dashboard\receipts\page.tsx"
$recContent = [System.IO.File]::ReadAllText($recPath, [System.Text.Encoding]::UTF8)

$re1old = 'import { getWhatsAppLink } from "@/lib/whatsapp"'
$re1new = @'
import { getWhatsAppLink } from "@/lib/whatsapp"
import ActionSlots from "@/components/ActionSlots"
'@
$recContent = Apply-Edit $recContent $re1old $re1new "receipts: import"

$re2old = @'
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          <button className="btn-icon" onClick={() => router.push(`/dashboard/receipts/${rec.id}`)} title="View"><Eye size={13} /></button>
                          {canEdit && !isReversed && (
                            <>
                              <button className="btn-icon" onClick={() => router.push(`/dashboard/receipts/new?id=${rec.id}`)} title="Edit"><Edit size={13} /></button>
                              <button className="btn-icon" onClick={() => handleReverse(rec.id)} style={{ color: "#F59E0B" }} title="Reverse"><Undo2 size={13} /></button>
                            </>
                          )}
                          {hasFeature("whatsapp_invoice") && (
                            <button className="btn-icon" onClick={() => sendWhatsApp(rec)} title="Send via WhatsApp" style={{ color: "#25D366" }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                            </button>
                          )}
                          {isReversed && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Reversed</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
'@
$re2new = @'
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          <ActionSlots
                            slot1={{
                              icon: <Eye size={13} />,
                              title: "View",
                              onClick: () => router.push(`/dashboard/receipts/${rec.id}`),
                            }}
                            slot2={(canEdit && !isReversed) ? {
                              icon: <Edit size={13} />,
                              title: "Edit",
                              onClick: () => router.push(`/dashboard/receipts/new?id=${rec.id}`),
                            } : null}
                            slot3={hasFeature("whatsapp_invoice") ? {
                              icon: (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                              ),
                              title: "Send via WhatsApp",
                              color: "#25D366",
                              onClick: () => sendWhatsApp(rec),
                            } : null}
                            overflow={[
                              {
                                key: "reverse",
                                label: "Reverse",
                                color: "#F59E0B",
                                hidden: !(canEdit && !isReversed),
                                icon: <Undo2 size={14} />,
                                onClick: () => handleReverse(rec.id),
                              },
                            ]}
                          />
                          {isReversed && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Reversed</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
'@
$recContent = Apply-Edit $recContent $re2old $re2new "receipts: action column"

# ============ 8. PAYMENTS ============
$payPath = Join-Path $base "src\app\dashboard\payments\page.tsx"
$payContent = [System.IO.File]::ReadAllText($payPath, [System.Text.Encoding]::UTF8)

$p1old = 'import { getWhatsAppLink } from "@/lib/whatsapp"'
$p1new = @'
import { getWhatsAppLink } from "@/lib/whatsapp"
import ActionSlots from "@/components/ActionSlots"
'@
$payContent = Apply-Edit $payContent $p1old $p1new "payments: import"

$p2old = @'
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          <button className="btn-icon" onClick={() => router.push(`/dashboard/payments/${pay.id}`)} title="View"><Eye size={13} /></button>
                          {canEdit && !isReversed && (
                            <>
                              <button className="btn-icon" onClick={() => router.push(`/dashboard/payments/new?id=${pay.id}`)} title="Edit"><Edit size={13} /></button>
                              <button className="btn-icon" onClick={() => handleReverse(pay.id)} style={{ color: "#F59E0B" }} title="Reverse"><Undo2 size={13} /></button>
                            </>
                          )}
                          {hasFeature("whatsapp_invoice") && (
                            <button className="btn-icon" onClick={() => sendWhatsApp(pay)} title="Send via WhatsApp" style={{ color: "#25D366" }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                            </button>
                          )}
                          {isReversed && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Reversed</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
'@
$p2new = @'
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          <ActionSlots
                            slot1={{
                              icon: <Eye size={13} />,
                              title: "View",
                              onClick: () => router.push(`/dashboard/payments/${pay.id}`),
                            }}
                            slot2={(canEdit && !isReversed) ? {
                              icon: <Edit size={13} />,
                              title: "Edit",
                              onClick: () => router.push(`/dashboard/payments/new?id=${pay.id}`),
                            } : null}
                            slot3={hasFeature("whatsapp_invoice") ? {
                              icon: (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                              ),
                              title: "Send via WhatsApp",
                              color: "#25D366",
                              onClick: () => sendWhatsApp(pay),
                            } : null}
                            overflow={[
                              {
                                key: "reverse",
                                label: "Reverse",
                                color: "#F59E0B",
                                hidden: !(canEdit && !isReversed),
                                icon: <Undo2 size={14} />,
                                onClick: () => handleReverse(pay.id),
                              },
                            ]}
                          />
                          {isReversed && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Reversed</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
'@
$payContent = Apply-Edit $payContent $p2old $p2new "payments: action column"

# ============ 9. CASH SALES ============
$csPath = Join-Path $base "src\app\dashboard\cash-sales\page.tsx"
$csContent = [System.IO.File]::ReadAllText($csPath, [System.Text.Encoding]::UTF8)

$cs1old = 'import { useCompany } from "@/contexts/CompanyContext"'
$cs1new = @'
import { useCompany } from "@/contexts/CompanyContext"
import ActionSlots from "@/components/ActionSlots"
'@
$csContent = Apply-Edit $csContent $cs1old $cs1new "cash-sales: import"

$cs2old = @'
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          <button className="btn-icon" onClick={() => router.push(`/dashboard/cash-sales/${sale.id}`)} title="View">
                            <Eye size={13} />
                          </button>
                          <button className="btn-icon" onClick={() => router.push(`/dashboard/cash-sales/new?id=${sale.id}`)} title="Edit">
                            <Edit size={13} />
                          </button>
                          <button className="btn-icon" onClick={() => handlePrintPDF(sale)} title="PDF">
                            <FileText size={13} />
                          </button>
                          {hasFeature("whatsapp_invoice") && cust?.phone && (
                            <button className="btn-icon" onClick={() => sendWhatsApp(sale)} title="Send WhatsApp" style={{ color: "#25D366" }}>
                              <Send size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
'@
$cs2new = @'
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <ActionSlots
                          slot1={{
                            icon: <Eye size={13} />,
                            title: "View",
                            onClick: () => router.push(`/dashboard/cash-sales/${sale.id}`),
                          }}
                          slot2={{
                            icon: <Edit size={13} />,
                            title: "Edit",
                            onClick: () => router.push(`/dashboard/cash-sales/new?id=${sale.id}`),
                          }}
                          slot3={(hasFeature("whatsapp_invoice") && cust?.phone) ? {
                            icon: <Send size={13} />,
                            title: "Send WhatsApp",
                            color: "#25D366",
                            onClick: () => sendWhatsApp(sale),
                          } : null}
                          overflow={[
                            {
                              key: "pdf",
                              label: "PDF",
                              icon: <FileText size={14} />,
                              onClick: () => handlePrintPDF(sale),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
'@
$csContent = Apply-Edit $csContent $cs2old $cs2new "cash-sales: action column"

# ============ 10. PRODUCTS ============
$prodPath = Join-Path $base "src\app\dashboard\products\page.tsx"
$prodContent = [System.IO.File]::ReadAllText($prodPath, [System.Text.Encoding]::UTF8)

$pr1old = 'import { Plus, Edit, Trash2, Eye, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react"'
$pr1new = @'
import { Plus, Edit, Trash2, Eye, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react"
import ActionSlots from "@/components/ActionSlots"
'@
$prodContent = Apply-Edit $prodContent $pr1old $pr1new "products: import"

$pr2old = @'
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                          <button className="btn-icon" onClick={() => router.push(`/dashboard/products/new?id=${prod.id}`)} title="Edit">
                            <Edit size={13} />
                          </button>
                          <button className="btn-icon" onClick={() => handleDelete(prod.id)} style={{ color: "#EF4444" }} title="Delete">
                            <Trash2 size={13} />
                          </button>
                          <button className="btn-icon" onClick={() => router.push(`/dashboard/reports/product-ledger?productId=${prod.id}`)} title="View Ledger">
                            <Eye size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedCostId === prod.id && (
'@
$pr2new = @'
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <ActionSlots
                          slot1={{
                            icon: <Eye size={13} />,
                            title: "View Ledger",
                            onClick: () => router.push(`/dashboard/reports/product-ledger?productId=${prod.id}`),
                          }}
                          slot2={{
                            icon: <Edit size={13} />,
                            title: "Edit",
                            onClick: () => router.push(`/dashboard/products/new?id=${prod.id}`),
                          }}
                          slot3={null}
                          overflow={[
                            {
                              key: "delete",
                              label: "Delete",
                              icon: <Trash2 size={14} />,
                              color: "#EF4444",
                              onClick: () => handleDelete(prod.id),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                    {expandedCostId === prod.id && (
'@
$prodContent = Apply-Edit $prodContent $pr2old $pr2new "products: action column"

# ============ 11. BANK ACCOUNTS ============
$bankPath = Join-Path $base "src\app\dashboard\banking\bank-accounts\page.tsx"
$bankContent = [System.IO.File]::ReadAllText($bankPath, [System.Text.Encoding]::UTF8)

$bk1old = 'import { useRole } from "@/contexts/RoleContext"'
$bk1new = @'
import { useRole } from "@/contexts/RoleContext"
import ActionSlots from "@/components/ActionSlots"
'@
$bankContent = Apply-Edit $bankContent $bk1old $bk1new "bank-accounts: import"

$bk2old = @'
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                        {canEdit && (
                          <button className="btn-icon" onClick={() => openEdit(b)} title="Edit">
                            <Edit size={13} />
                          </button>
                        )}
                        {canEdit && (
                          <button className="btn-icon" onClick={() => setDeleteId(b.id)} style={{ color: "#EF4444" }} title="Delete">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
'@
$bk2new = @'
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <ActionSlots
                        slot1={null}
                        slot2={canEdit ? {
                          icon: <Edit size={13} />,
                          title: "Edit",
                          onClick: () => openEdit(b),
                        } : null}
                        slot3={null}
                        overflow={[
                          {
                            key: "delete",
                            label: "Delete",
                            icon: <Trash2 size={14} />,
                            color: "#EF4444",
                            hidden: !canEdit,
                            onClick: () => setDeleteId(b.id),
                          },
                        ]}
                      />
                    </td>
                  </tr>
'@
$bankContent = Apply-Edit $bankContent $bk2old $bk2new "bank-accounts: action column"

# ============ ALL EDITS SUCCEEDED — BACKUP THEN WRITE ============
foreach ($p in @($ramPath, $custPath, $supPath, $invPath, $billPath, $recPath, $payPath, $csPath, $prodPath, $bankPath)) {
    Copy-Item $p "$p.bak_$stamp"
}

[System.IO.File]::WriteAllText($actionSlotsPath, $actionSlotsContent, $utf8)
[System.IO.File]::WriteAllText($ramPath, $ramContent, $utf8)
[System.IO.File]::WriteAllText($custPath, $custContent, $utf8)
[System.IO.File]::WriteAllText($supPath, $supContent, $utf8)
[System.IO.File]::WriteAllText($invPath, $invContent, $utf8)
[System.IO.File]::WriteAllText($billPath, $billContent, $utf8)
[System.IO.File]::WriteAllText($recPath, $recContent, $utf8)
[System.IO.File]::WriteAllText($payPath, $payContent, $utf8)
[System.IO.File]::WriteAllText($csPath, $csContent, $utf8)
[System.IO.File]::WriteAllText($prodPath, $prodContent, $utf8)
[System.IO.File]::WriteAllText($bankPath, $bankContent, $utf8)

Write-Host "SUCCESS: ActionSlots created; RowActionsMenu + 9 list pages patched. Backups saved with suffix .bak_$stamp"