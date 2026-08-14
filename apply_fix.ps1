$filePath = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\dashboard\reports\vendor-ledger\page.tsx"
$backupPath = "$filePath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

$rawContent = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($backupPath, $rawContent, [System.Text.Encoding]::UTF8)
$content = $rawContent -replace "`r`n", "`n"
function Norm($s) { return ($s -replace "`r`n", "`n").TrimEnd("`n") }

$old1 = Norm @'
      const paymentIds = (supplierPayments || []).map(p => p.id)
      const paymentNoById = new Map((supplierPayments || []).map(p => [p.id, p.payment_no]))
'@
$new1 = Norm @'
      const paymentIds = (supplierPayments || []).map(p => p.id)
      const paymentNoById = new Map((supplierPayments || []).map(p => [p.id, p.payment_no]))

      // Real creation timestamps for bill journal lines posted to AP —
      // used purely as a same-day tiebreaker so entries sort in true creation order.
      const billIds = (allBills || []).map(b => b.id)
      const { data: billJournalLines } = apAccount && billIds.length
        ? await supabase
            .from("journal_lines")
            .select(`
              source_id,
              journal_entries ( created_at )
            `)
            .eq("company_id", companyId)
            .eq("account_id", apAccount.id)
            .in("source_id", billIds)
            .not("source_type", "in", "(payment,payment_reversal,supplier_opening)")
        : { data: [] as any[] }

      const billCreatedAtById = new Map<number, string>()
      for (const line of billJournalLines || []) {
        const je = (line as any).journal_entries
        if (je?.created_at && line.source_id != null) {
          billCreatedAtById.set(line.source_id, je.created_at)
        }
      }
'@

$old2 = Norm @'
        periodLines.push({
          id: `bill-${bill.id}`,
          entry_no: `BILL-${bill.invoice_no}`,
          date: bill.date,
          description: `Purchase Bill ${bill.invoice_no}`,
          debit: 0,
          credit,
          running_balance: 0,
        })
'@
$new2 = Norm @'
        periodLines.push({
          id: `bill-${bill.id}`,
          entry_no: `BILL-${bill.invoice_no}`,
          date: bill.date,
          created_at: billCreatedAtById.get(bill.id) || `${bill.date}T00:00:00`,
          description: `Purchase Bill ${bill.invoice_no}`,
          debit: 0,
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
            .eq("account_id", apAccount.id)
            .in("source_type", ["payment", "payment_reversal"])
'@
$new3 = Norm @'
            .select(`
              id, debit, credit, entry_id, source_type, source_id,
              journal_entries ( date, description, entry_no, created_at )
            `)
            .eq("company_id", companyId)
            .eq("account_id", apAccount.id)
            .in("source_type", ["payment", "payment_reversal"])
'@

$old4 = Norm @'
        periodLines.push({
          id: `pay-${line.id}`,
          entry_no: isReversal ? `Rev-${paymentNo}` : `PAY-${paymentNo}`,
          date: lineDate,
          description: isReversal ? `Payment Reversal - ${paymentNo}` : `Payment ${paymentNo}`,
          debit,
          credit,
          running_balance: 0,
        })
'@
$new4 = Norm @'
        periodLines.push({
          id: `pay-${line.id}`,
          entry_no: isReversal ? `Rev-${paymentNo}` : `PAY-${paymentNo}`,
          date: lineDate,
          created_at: je?.created_at || `${lineDate}T00:00:00`,
          description: isReversal ? `Payment Reversal - ${paymentNo}` : `Payment ${paymentNo}`,
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
      .eq("account_id", apAccount.id)
      .eq("source_type", "supplier_opening")
'@
$new5 = Norm @'
      .select(`
      id, debit, credit, entry_id, source_type, source_id,
      journal_entries ( date, description, entry_no, created_at )
      `)
      .eq("company_id", companyId)
      .eq("account_id", apAccount.id)
      .eq("source_type", "supplier_opening")
'@

$old6 = Norm @'
      periodLines.push({
      id: `ob-${line.id}`,
      entry_no: je?.entry_no || "OB",
      date: lineDate,
      description: je?.description || "Opening Balance Entry",
      debit,
      credit,
      running_balance: 0,
      })
      }

      periodLines.sort((a, b) => a.date.localeCompare(b.date))
'@
$new6 = Norm @'
      periodLines.push({
      id: `ob-${line.id}`,
      entry_no: je?.entry_no || "OB",
      date: lineDate,
      created_at: je?.created_at || `${lineDate}T00:00:00`,
      description: je?.description || "Opening Balance Entry",
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
  @{old=$old1; new=$new1; label="1 of 6 (fetch bill timestamps)"},
  @{old=$old2; new=$new2; label="2 of 6 (attach to bill lines)"},
  @{old=$old3; new=$new3; label="3 of 6 (payment query created_at)"},
  @{old=$old4; new=$new4; label="4 of 6 (attach to payment lines)"},
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
    Write-Host "SUCCESS: Vendor ledger now sorts by true creation order within each day. Backup saved at $backupPath"
} else {
    Write-Host "ERROR: One or more blocks not found. No changes were written."
}