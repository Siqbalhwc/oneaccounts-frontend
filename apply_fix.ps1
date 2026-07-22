$path = "src\app\dashboard\reports\customer-ledger\page.tsx"
$content = Get-Content $path -Raw

$old1 = @'
            .in("source_type", ["receipt", "receipt_reversal"])
            .in("source_id", receiptIds)
            .order("entry_id", { ascending: true })
        : { data: [] as any[] }
'@

$new1 = @'
            .in("source_type", ["receipt", "receipt_reversal"])
            .in("source_id", receiptIds)
            .order("entry_id", { ascending: true })
        : { data: [] as any[] }
      // 4b. Opening balance journal lines tagged directly to this customer
      const { data: openingEntryLines } = arAccount
        ? await supabase
            .from("journal_lines")
            .select(`
              id, debit, credit, entry_id, source_type, source_id,
              journal_entries ( date, description, entry_no )
            `)
            .eq("company_id", companyId)
            .eq("account_id", arAccount.id)
            .eq("source_type", "customer_opening")
            .eq("source_id", selectedCustomerId)
        : { data: [] as any[] }
'@

$old2 = '      periodLines.sort((a, b) => a.date.localeCompare(b.date))'

$new2 = @'
      for (const line of openingEntryLines || []) {
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

$count1 = ([regex]::Matches($content, [regex]::Escape($old1))).Count
$count2 = ([regex]::Matches($content, [regex]::Escape($old2))).Count

if ($count1 -ne 1 -or $count2 -ne 1) {
    Write-Host "SAFETY CHECK FAILED: block1 matches=$count1 block2 matches=$count2. No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old1, $new1).Replace($old2, $new2)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}