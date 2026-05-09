import { Suspense } from 'react'
import SpendingDetailClient from './client'

export default function SpendingDetailPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Loading…</div>}>
      <SpendingDetailClient />
    </Suspense>
  )
}