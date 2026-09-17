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