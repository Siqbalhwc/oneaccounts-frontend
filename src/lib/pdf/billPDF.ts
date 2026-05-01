import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export function generateBillPDF(bill: any, items: any[], companyName = 'OneAccounts by Siqbal') {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header
  doc.setFontSize(18)
  doc.setTextColor(15, 34, 138)
  doc.text(companyName, 14, 20)
  doc.setFontSize(9)
  doc.setTextColor(148, 163, 184)
  doc.text('Smart Accounting, Stronger Business', 14, 25)

  // Bill title
  doc.setFontSize(22)
  doc.setTextColor(30, 58, 138)
  doc.text('PURCHASE BILL', pageWidth - 14, 20, { align: 'right' })
  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  doc.text(`Bill No: ${bill.invoice_no || ''}`, pageWidth - 14, 26, { align: 'right' })
  doc.text(`Date: ${bill.date || ''}`, pageWidth - 14, 31, { align: 'right' })
  doc.text(`Due Date: ${bill.due_date || ''}`, pageWidth - 14, 36, { align: 'right' })

  // Supplier info
  doc.setFontSize(12)
  doc.setTextColor(30, 41, 59)
  doc.text('Supplier:', 14, 40)
  doc.setFontSize(10)
  doc.text(bill.suppliers?.name || 'Supplier', 14, 46)
  if (bill.suppliers?.phone) doc.text(`Phone: ${bill.suppliers.phone}`, 14, 51)

  // Items table
  const tableRows = items.map((item: any, idx: number) => [
    idx + 1,
    item.description || '',
    item.qty || 0,
    `PKR ${(item.unit_price || 0).toLocaleString()}`,
    `PKR ${(item.total || 0).toLocaleString()}`,
  ])
  const total = items.reduce((sum: number, i: any) => sum + (i.total || 0), 0)

  autoTable(doc, {
    startY: 60,
    head: [['#', 'Description', 'Qty', 'Unit Price', 'Amount']],
    body: tableRows,
    foot: [['', '', '', 'Total', `PKR ${total.toLocaleString()}`]],
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
    },
  })

  const finalY = (doc as any).lastAutoTable.finalY || 100
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text('Thank you for your business!', 14, finalY + 10)
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, finalY + 15)

  doc.setFontSize(8)
  doc.text('OneAccounts by Siqbal - Smart Accounting, Stronger Business', pageWidth / 2, 285, { align: 'center' })

  return doc
}