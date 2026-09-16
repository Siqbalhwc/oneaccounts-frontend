"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { MoreVertical } from "lucide-react"

export interface RowAction {
  /** Unique key within this row's action list */
  key: string
  /** Label shown in the menu */
  label: string
  /** Icon element, e.g. <Edit size={14} /> */
  icon: React.ReactNode
  /** Called when the item is clicked. Omit if using `render` instead. */
  onClick?: () => void
  /** Optional color override (text/icon), e.g. "#EF4444" for a destructive action */
  color?: string
  /** Hide this action entirely (e.g. permission checks) */
  hidden?: boolean
  disabled?: boolean
  /**
   * Escape hatch for actions that need to render their own trigger/content
   * (e.g. a component that manages its own modal). When provided, `onClick`,
   * `icon`, and `color` are ignored for this item. The menu still closes
   * automatically when the rendered content is clicked, unless the content
   * itself stops propagation.
   */
  render?: () => React.ReactNode
}

interface RowActionsMenuProps {
  actions: RowAction[]
  /** Which side of the trigger button the menu opens toward. Default "right". */
  align?: "left" | "right"
}

export default function RowActionsMenu({ actions, align = "right" }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left?: number; right?: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const visibleActions = actions.filter(a => !a.hidden)

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    if (align === "right") {
      setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    } else {
      setCoords({ top: rect.bottom + 4, left: rect.left })
    }
  }

  const toggleOpen = () => {
    if (!open) updatePosition()
    setOpen(o => !o)
  }

  useEffect(() => {
    if (!open) return

    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    const handleReposition = () => updatePosition()

    document.addEventListener("mousedown", handleOutside)
    document.addEventListener("keydown", handleEscape)
    window.addEventListener("scroll", handleReposition, true)
    window.addEventListener("resize", handleReposition)

    return () => {
      document.removeEventListener("mousedown", handleOutside)
      document.removeEventListener("keydown", handleEscape)
      window.removeEventListener("scroll", handleReposition, true)
      window.removeEventListener("resize", handleReposition)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (visibleActions.length === 0) return null

  return (
    <>
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
        <MoreVertical size={18} strokeWidth={2.5} />
      </button>

      {open && coords && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="row-actions-menu"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              right: coords.right,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {visibleActions.map((a) =>
              a.render ? (
                <div key={a.key} className="row-actions-menu-custom" onClick={() => setOpen(false)}>
                  {a.render()}
                </div>
              ) : (
                <button
                  key={a.key}
                  type="button"
                  className="row-actions-menu-item"
                  disabled={a.disabled}
                  style={a.color ? { color: a.color } : undefined}
                  onClick={() => {
                    setOpen(false)
                    a.onClick?.()
                  }}
                >
                  <span className="row-actions-menu-item-icon">{a.icon}</span>
                  <span>{a.label}</span>
                </button>
              )
            )}
          </div>,
          document.body
        )}

      <style jsx global>{`
        .row-actions-trigger {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          padding: 0;
          border: 1px solid var(--border-strong);
          border-radius: 6px;
          background: var(--card-hover);
          color: var(--text);
          box-shadow: 0 1px 2px rgba(0,0,0,0.08);
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .row-actions-trigger:hover {
          background: var(--primary);
          border-color: var(--primary);
          color: var(--primary-text);
        }
        .row-actions-menu {
          z-index: 1000;
          min-width: 170px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
          padding: 4px;
          display: flex;
          flex-direction: column;
        }
        .row-actions-menu-item {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 10px;
          border: none;
          background: transparent;
          color: var(--text);
          font-size: 13px;
          text-align: left;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .row-actions-menu-item:hover:not(:disabled) {
          background: var(--card-hover);
        }
        .row-actions-menu-item:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .row-actions-menu-item-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 14px;
        }
        .row-actions-menu-custom {
          display: flex;
        }
      `}</style>
    </>
  )
}