"use client"

import { useState, useEffect, useMemo } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown, Printer } from "lucide-react"
import { useRole } from "@/contexts/RoleContext"
import { useCompany } from "@/contexts/CompanyContext"
import { generateVendorLedgerPDF } from "@/lib/pdf/vendorLedgerPDF"

type SortField = "date" | "entry_no" | "description" | "debit" | "credit" | "running_balance"
type SortDir = "asc" | "desc"

export default function VendorLedgerPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const searchParams = useSearchParams()
  const { role } = useRole()
  const { companyName, companyTagline, logoUrl } = useCompany()
  const canView = role === "admin" || role === "accountant"

  const urlSupplierId = searchParams.get("supplierId")
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(urlSupplierId || "")
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplier, setSupplier] = useState<any>(null)
  const [companyId, setCompanyId] = useState<string>("")

  const now = new Date()
  const [startDate, setStartDate] = useState(searchParams.get("startDate") || `${now.getFullYear()}-01-01`)
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || now.toISOString().split("T")[0])

  const [ledgerLines, setLedgerLines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState("")

  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const cid = (user?.app_metadata as any)?.company_id
      if (cid) {
        setCompanyId(cid)
        supabase
          .from("suppliers")
          .select("id, code, name")
          .eq("company_id", cid)
          .is("deleted_at", null)
          .order("name")
          .then(({ data }) => data && setSuppliers(data))
      }
    })
  }, [])

  useEffect(() => {
    if (urlSupplierId && suppliers.length > 0) {
      setSelectedSupplierId(urlSupplierId)
    }
  }, [urlSupplierId, suppliers])

  useEffect(() => {
    if (!selectedSupplierId || !companyId) {
      setSupplier(null)
      return
    }
    supabase
      .from("suppliers")
      .select("id, code, name, balance")
      .eq("id", selectedSupplierId)
      .eq("company_id", companyId)
      .single()
      .then(({ data }) => data && setSupplier(data))
  }, [selectedSupplierId, companyId])

  const fetchLedger = async () => {
    if (!selectedSupplierId || !companyId || !supplier) return
    setLoading(true)
    setErrorMsg("")

    try {
      // 1. Find the AP account for this company
      const { data: apAccount } = await supabase
        .from("accounts")
        .select("id")
        .eq("company_id", companyId)
        .eq("code", "2000")
        .single()

      // 2. Fetch ALL purchase bills for this supplier (to calculate opening)
      const { data: allBills } = await supabase
        .from("invoices")
        .select("id, total, invoice_no, date, type")
        .eq("party_id", selectedSupplierId)
        .eq("type", "purchase")
        .is("deleted_at", null)
        .order("date", { ascending: true })

      // 3. Get all payment IDs that belong to this supplier
      const { data: supplierPayments } = await supabase
        .from("payments")
        .select("id, payment_no")
        .eq("party_id", selectedSupplierId)

      const paymentIds = (supplierPayments || []).map(p => p.id)
      const paymentNoById = new Map((supplierPayments || []).map(p => [p.id, p.payment_no]))

      // 4. Fetch ALL journal lines for the AP account that are linked to those payments
      const { data: paymentJournalLines } = apAccount && paymentIds.length
        ? await supabase
            .from("journal_lines")
            .select(`
              id, debit, credit, entry_id, source_type, source_id,
              journal_entries ( date, description, entry_no )
            `)
            .eq("company_id", companyId)
            .eq("account_id", apAccount.id)
            .in("source_type", ["payment", "payment_reversal"])
            .in("source_id", paymentIds)
            .order("entry_id", { ascending: true })
        : { data: [] as any[] }

      // 5. Build ledger lines, bucketing into opening/period
      const periodLines: any[] = []
      let openingDebit = 0
      let openingCredit = 0

      // Bills
      for (const bill of allBills || []) {
        const credit = bill.total || 0   // purchase bill is a credit to AP
        if (bill.date < startDate) {
          openingCredit += credit
          continue
        }
        if (bill.date > endDate) continue

        periodLines.push({
          id: `bill-${bill.id}`,
          entry_no: `BILL-${bill.invoice_no}`,
          date: bill.date,
          description: `Purchase Bill ${bill.invoice_no}`,
          debit: 0,
          credit,
          running_balance: 0,
        })
      }

      // Payment journal lines
      for (const line of paymentJournalLines || []) {
        const je = (line as any).journal_entries
        const lineDate: string | undefined = je?.date
        if (!lineDate) continue

        const debit = line.debit || 0
        const credit = line.credit || 0

        if (lineDate < startDate) {
          openingDebit += debit
          openingCredit += credit
          continue
        }
        if (lineDate > endDate) continue

        const paymentNo = paymentNoById.get(line.source_id) || "PAY"
        const isReversal = line.source_type === "payment_reversal"

        periodLines.push({
          id: `pay-${line.id}`,
          entry_no: isReversal ? `Rev-${paymentNo}` : `PAY-${paymentNo}`,
          date: lineDate,
          description: isReversal ? `Payment Reversal - ${paymentNo}` : `Payment ${paymentNo}`,
          debit,
          credit,
          running_balance: 0,
        })
      }

      periodLines.sort((a, b) => a.date.localeCompare(b.date))

      // 6. Opening balance
      const openingNet = openingDebit - openingCredit
      const openingLine = {
        id: "opening-calc",
        entry_no: "",
        date: startDate,
        description: "Opening Balance",
        debit: openingNet > 0 ? openingNet : 0,
        credit: openingNet < 0 ? -openingNet : 0,
        running_balance: 0,
        isOpening: true,
      }

      const allLines = [openingLine, ...periodLines]

      let running = 0
      for (const line of allLines) {
        running += (line.debit || 0) - (line.credit || 0)
        line.running_balance = running
      }

      setLedgerLines(allLines)
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to load ledger")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedSupplierId && companyId && supplier) fetchLedger()
  }, [selectedSupplierId, companyId, startDate, endDate, supplier])

  const sortedLines = useMemo(() => {
    const list = [...ledgerLines]
    list.sort((a, b) => {
      if (a.isOpening && !b.isOpening) return -1
      if (!a.isOpening && b.isOpening) return 1
      let valA: any, valB: any
      if (sortField === "debit" || sortField === "credit" || sortField === "running_balance") {
        valA = a[sortField] || 0
        valB = b[sortField] || 0
      } else {
        valA = (a[sortField] || "").toString().toLowerCase()
        valB = (b[sortField] || "").toString().toLowerCase()
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1
      if (valA > valB) return sortDir === "asc" ? 1 : -1
      return 0
    })
    return list
  }, [ledgerLines, sortField, sortDir])

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => prev === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("asc") }
  }
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.5 }} />
    return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const totalDebit = sortedLines.filter(l => !l.isOpening).reduce((s, l) => s + l.debit, 0)
  const totalCredit = sortedLines.filter(l => !l.isOpening).reduce((s, l) => s + l.credit, 0)
  const closingBalance = sortedLines.length > 0 ? sortedLines[sortedLines.length - 1].running_balance : 0

  const handlePrintPDF = async () => {
    if (!supplier || sortedLines.length === 0) return
    const pdfData = {
      companyName:    companyName || "",
      companyAddress: "",
      companyPhone:   "",
      companyEmail:   "",
      companyTagline: companyTagline || "",
      logoUrl:        logoUrl,
      supplierName:   supplier.name,
      supplierCode:   supplier.code,
      startDate:      startDate,
      endDate:        endDate,
      totalDebit:     totalDebit,
      totalCredit:    totalCredit,
      closingBalance: closingBalance,
      ledgerLines:    sortedLines,
    }
    const doc = await generateVendorLedgerPDF(pdfData)
    doc.save(`Vendor_Ledger_${supplier.code}.pdf`)
  }

  if (!role) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
  if (!canView) return <div style={{ padding: 24, textAlign: "center", color: "var(--text)" }}><h2>Access Denied</h2></div>

  return (
    <div style={{ padding: 24, background: "var(--bg)", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "var(--text)" }}>
      {/* Styling identical to the customer ledger (omitted for brevity but must be included in the actual file) */}
      {/* ... */}
    </div>
  )
}