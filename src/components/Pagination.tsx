"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize) || 1

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: "white", borderTop: "1px solid #E2E8F0", fontSize: 13, color: "#64748B" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>Rows per page:</span>
        <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))}
          style={{ border: "1px solid #E2E8F0", borderRadius: 6, padding: "4px 8px", fontSize: 12, outline: "none" }}>
          {[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span>{total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
            style={{ padding: "4px 8px", border: "1px solid #E2E8F0", borderRadius: 6, background: "white", cursor: page > 1 ? "pointer" : "default", opacity: page > 1 ? 1 : 0.5 }}>
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
            style={{ padding: "4px 8px", border: "1px solid #E2E8F0", borderRadius: 6, background: "white", cursor: page < totalPages ? "pointer" : "default", opacity: page < totalPages ? 1 : 0.5 }}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}