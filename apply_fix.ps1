$path = "src\app\dashboard\settings\budgets\page.tsx"
$content = [System.IO.File]::ReadAllText($path)
$originalContent = $content

$old = @'
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" })
    doc.setFontSize(14)
    doc.text("Budget vs Actual Report", 14, 20)
    const tableColumns = ["Activity / Location", ...relevantAccounts.map(acc => `${acc.code} Budget`), ...relevantAccounts.map(acc => `${acc.code} Actual`), ...relevantAccounts.map(acc => `${acc.code} Var`), "Total Budget", "Total Actual", "Total Var"]
    const tableData: any[] = []
    for (const actId of Object.keys(data)) {
      for (const locId of Object.keys(data[actId])) {
        const actName = allActivities.find(a => a.id == actId)?.name || actId
        const locName = locations.find(l => l.id == locId)?.name || locId
        const row: any = { "Activity / Location": `${actName} - ${locName}` }
        let rowBudget = 0, rowActual = 0
        relevantAccounts.forEach(acc => {
          const cell = data[actId][locId]?.[acc.id] || { budget: 0, actual: 0 }
          row[`${acc.code} Budget`] = cell.budget
          row[`${acc.code} Actual`] = cell.actual
          row[`${acc.code} Var`] = cell.budget - cell.actual
          rowBudget += cell.budget
          rowActual += cell.actual
        })
        row["Total Budget"] = rowBudget
        row["Total Actual"] = rowActual
        row["Total Var"] = rowBudget - rowActual
        tableData.push(row)
      }
    }
    autoTable(doc, { head: [tableColumns], body: tableData.map(row => tableColumns.map(col => row[col] || "")), startY: 35, styles: { fontSize: 7 } })
    doc.save(`budget_vs_actual_${fiscalYear}.pdf`)
  }
'@

$new = @'
  const exportPDF = async () => {
    const pdfRows: any[] = []
    let pdfGrandBudget = 0, pdfGrandActual = 0
    for (const actId of Object.keys(data)) {
      const actName = allActivities.find(a => a.id == actId)?.name || actId
      pdfRows.push({ activity: actName, location: "", accountCode: "", accountName: "", budget: 0, actual: 0, isHeading: true })
      let actBudget = 0, actActual = 0
      for (const locId of Object.keys(data[actId])) {
        const locName = locations.find(l => l.id == locId)?.name || locId
        relevantAccounts.forEach(acc => {
          const cell = data[actId][locId]?.[String(acc.id)]
          if (!cell || (cell.budget === 0 && cell.actual === 0)) return
          pdfRows.push({ activity: actName, location: locName, accountCode: acc.code, accountName: acc.name, budget: cell.budget, actual: cell.actual })
          actBudget += cell.budget; actActual += cell.actual
        })
      }
      pdfRows.push({ activity: actName, location: "", accountCode: "", accountName: "", budget: actBudget, actual: actActual, isSubtotal: true })
      pdfGrandBudget += actBudget; pdfGrandActual += actActual
    }
    pdfRows.push({ activity: "", location: "", accountCode: "", accountName: "", budget: pdfGrandBudget, actual: pdfGrandActual, isGrandTotal: true })

    const projectName = projects.find(p => p.id == selectedProjectId)?.name || ""
    const donorName = donors.find(d => d.id == selectedDonorId)?.name || ""

    const doc = await generateBudgetVsActualPDF({
      companyName: companyName || "OneAccounts",
      companyTagline: companyTagline || "",
      logoUrl: logoUrl || null,
      projectName,
      donorName,
      periodStart: projectStartDate,
      periodEnd: projectEndDate,
      rows: pdfRows,
    })
    doc.save(`Budget_vs_Actual_${projectName.replace(/\s+/g, '_')}.pdf`)
  }
'@

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Replaced exportPDF with navy-themed generator"
} else {
    Write-Host "NOT FOUND"
}