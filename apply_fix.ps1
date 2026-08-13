$filePath = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\dashboard\reports\customer-ledger\page.tsx"
$backupPath = "$filePath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

$rawContent = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($backupPath, $rawContent, [System.Text.Encoding]::UTF8)
$content = $rawContent -replace "`r`n", "`n"
function Norm($s) { return ($s -replace "`r`n", "`n").TrimEnd("`n") }

$old1 = Norm @'
      const receiptIds = (customerReceipts || []).map(r => r.id)
      const receiptNoById = new Map((customerReceipts || []).map(r => [r.id, r.receipt_no]))
'@
$new1 = Norm @'
      const receiptIds = (customerReceipts || []).map(r => r.id)
      const receiptNoById = new Map((customerReceipts || []).map(r => [r.id, r.receipt_no]))

      // 3b. Real creation timestamps for invoice/return journal lines posted to AR —
      // used purely as a same-day tiebreaker so entries sort in true creation order,
      // not just by their (time-less) transaction date.
      const invoiceIds = (allInvoices || []).map(inv => inv.id)
      const { data: invoiceJournalLines } = arAccount && invoiceIds.length
        ? await supabase
            .from("journal_lines")
            .select(`
              source_id,
              journal_entries ( created_at )
            `)
            .eq("company_id", companyId)
            .eq("account_id", arAccount.id)
            .in("source_id", invoiceIds)
            .not("source_type", "in", "(receipt,receipt_reversal,customer_opening,opening_balance)")
        : { data: [] as any[] }

      const invoiceCreatedAtById = new Map<number, string>()
      for (const line of invoiceJournalLines || []) {
        const je = (line as any).journal_entries
        if (je?.created_at && line.source_id != null) {
          invoiceCreatedAtById.set(line.source_id, je.created_at)
        }
      }
'@

$old2 = Norm @'
        periodLines.push({
          id: inv.type === "sale" ? `inv-${inv.id}` : `ret-${inv.id}`,
          entry_no: inv.type === "sale" ? `INV-${inv.invoice_no}` : `SR-${inv.invoice_no}`,
          date: inv.date,
          description: inv.type === "sale" ? `Sales Invoice ${inv.invoice_no}` : `Sales Return ${inv.invoice_no}`,
          debit,
          credit,
          running_balance: 0,
        })
'@
$new2 = Norm @'
        periodLines.push({
          id: inv.type === "sale" ? `inv-${inv.id}` : `ret-${inv.id}`,
          entry_no: inv.type === "sale" ? `INV-${inv.invoice_no}` : `SR-${inv.invoice_no}`,
          date: inv.date,
          created_at: invoiceCreatedAtById.get(inv.id) || `${inv.date}T00:00:00`,
          description: inv.type === "sale" ? `Sales Invoice ${inv.invoice_no}` : `Sales Return ${inv.invoice_no}`,
          debit,
          credit,
          running_balance: 0,
        })
'@

$old3 = Norm @'
            .select(`
              id, debit, credit, entry_id, source_type, source_id,
              journal_entries ( date, description, entry_no )
            `)
            .eq("company_id", companyId)
            .eq("account_id", arAccount.id)
            .in("source_type", ["receipt", "receipt_reversal"])
'@
$new3 = Norm @'
            .select(`
              id, debit, credit, entry_id, source_type, source_id,
              journal_entries ( date, description, entry_no, created_at )
            `)
            .eq("company_id", companyId)
            .eq("account_id", arAccount.id)
            .in("source_type", ["receipt", "receipt_reversal"])
'@

$old4 = Norm @'
        periodLines.push({
          id: `rec-${line.id}`,
          entry_no: isReversal ? `Rev-${receiptNo}` : `REC-${receiptNo}`,
          date: lineDate,
          description: isReversal ? `Receipt Reversal - ${receiptNo}` : `Receipt ${receiptNo}`,
          debit,
          credit,
          running_balance: 0,
        })
'@
$new4 = Norm @'
        periodLines.push({
          id: `rec-${line.id}`,
          entry_no: isReversal ? `Rev-${receiptNo}` : `REC-${receiptNo}`,
          date: lineDate,
          created_at: je?.created_at || `${lineDate}T00:00:00`,
          description: isReversal ? `Receipt Reversal - ${receiptNo}` : `Receipt ${receiptNo}`,
          debit,
          credit,
          running_balance: 0,
        })
'@

$old5 = Norm @'
            .select(`
              id, debit, credit, entry_id, source_type, source_id,
              journal_entries ( date, description, entry_no )
            `)
            .eq("company_id", companyId)
            .eq("account_id", arAccount.id)
            .in("source_type", ["customer_opening", "opening_balance"])
'@
$new5 = Norm @'
            .select(`
              id, debit, credit, entry_id, source_type, source_id,
              journal_entries ( date, description, entry_no, created_at )
            `)
            .eq("company_id", companyId)
            .eq("account_id", arAccount.id)
            .in("source_type", ["customer_opening", "opening_balance"])
'@

$old6 = Norm @'
        periodLines.push({
          id: `op-${line.id}`,
          entry_no: "OB",
          date: lineDate,
          description: "Opening Balance Entry",
          debit,
          credit,
          running_balance: 0,
        })
      }
      periodLines.sort((a, b) => a.date.localeCompare(b.date))
'@
$new6 = Norm @'
        periodLines.push({
          id: `op-${line.id}`,
          entry_no: "OB",
          date: lineDate,
          created_at: je?.created_at || `${lineDate}T00:00:00`,
          description: "Opening Balance Entry",
          debit,
          credit,
          running_balance: 0,
        })
      }
      periodLines.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date)
        if (dateCompare !== 0) return dateCompare
        return (a.created_at || "").localeCompare(b.created_at || "")
      })
'@

$blocks = @(
  @{old=$old1; new=$new1; label="1 of 6 (fetch invoice timestamps)"},
  @{old=$old2; new=$new2; label="2 of 6 (attach to invoice lines)"},
  @{old=$old3; new=$new3; label="3 of 6 (receipt query created_at)"},
  @{old=$old4; new=$new4; label="4 of 6 (attach to receipt lines)"},
  @{old=$old5; new=$new5; label="5 of 6 (opening query created_at)"},
  @{old=$old6; new=$new6; label="6 of 6 (attach + real sort)"}
)

$allFound = $true
foreach ($b in $blocks) {
    if ($content.Contains($b.old)) {
        $content = $content.Replace($b.old, $b.new)
        Write-Host "Step $($b.label): OK"
    } else {
        Write-Host "Step $($b.label): NOT FOUND"
        $allFound = $false
    }
}

if ($allFound) {
    [System.IO.File]::WriteAllText($filePath, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Customer ledger now sorts by true creation order within each day. Backup saved at $backupPath"
} else {
    Write-Host "ERROR: One or more blocks not found. No changes were written."
}