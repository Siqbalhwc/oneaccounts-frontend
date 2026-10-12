# apply_fix.ps1 - Payroll Batch 3 (accounting: overtime, absence, loans, advances)
# Run from: C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend
$ErrorActionPreference = 'Stop'
$enc = New-Object System.Text.UTF8Encoding($false)
function Write-Target($rel, $content) {
  $full = Join-Path (Get-Location).Path $rel
  $dir = Split-Path $full -Parent
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  [System.IO.File]::WriteAllText($full, $content, $enc)
  Write-Host ("WROTE   " + $rel)
}
function Patch-Target($rel, $old, $new) {
  $full = Join-Path (Get-Location).Path $rel
  if (-not (Test-Path -LiteralPath $full)) { throw "File not found: $rel" }
  $t = [System.IO.File]::ReadAllText($full)
  $nl = if ($t.Contains("`r`n")) { "`r`n" } else { "`n" }
  $o = $old.Replace("`r`n","`n").Replace("`n",$nl)
  $n = $new.Replace("`r`n","`n").Replace("`n",$nl)
  $i = $t.IndexOf($o)
  if ($i -lt 0) { throw "PATCH FAILED (text not found): $rel" }
  if ($t.IndexOf($o, $i + 1) -ge 0) { throw "PATCH FAILED (text found twice): $rel" }
  $t = $t.Substring(0,$i) + $n + $t.Substring($i + $o.Length)
  [System.IO.File]::WriteAllText($full, $t, $enc)
  Write-Host ("PATCHED " + $rel)
}


Patch-Target 'src\app\api\payroll\runs\generate\route.ts' @'
        type: 'deduction',
        gl_account_id: null,
        source_type: null,
        source_id: null,
      })
      deductions += absenceDeduction
'@ @'
        type: 'deduction',
        gl_account_id: null,
        source_type: 'absence',
        source_id: null,
      })
      deductions += absenceDeduction
'@

Patch-Target 'src\app\api\payroll\runs\generate\route.ts' @'
        type: 'earning',
        gl_account_id: null,
        source_type: null,
        source_id: null,
      })
      gross += overtimeTotal
'@ @'
        type: 'earning',
        gl_account_id: null,
        source_type: 'overtime',
        source_id: null,
      })
      gross += overtimeTotal
'@

Patch-Target 'src\app\api\payroll\runs\generate\route.ts' @'
      .select('id, monthly_installment')
      .eq('employee_id', emp.id)
      .eq('status', 'active')
'@ @'
      .select('id, monthly_installment, balance, start_date')
      .eq('employee_id', emp.id)
      .eq('status', 'active')
      .gt('balance', 0)
      .or(`start_date.is.null,start_date.lte.${endDate}`)
'@

Patch-Target 'src\app\api\payroll\runs\generate\route.ts' @'
        const installment = Number(loan.monthly_installment || 0)
        if (installment > 0) {
'@ @'
        // Never recover more than what is still owed (last installment is the remaining balance)
        const installment = Math.min(Number(loan.monthly_installment || 0), Number(loan.balance || 0))
        if (installment > 0) {
'@

Patch-Target 'src\app\api\payroll\runs\generate\route.ts' @'
      .select('id, monthly_recovery')
      .eq('employee_id', emp.id)
      .eq('status', 'active')
'@ @'
      .select('id, monthly_recovery, balance, start_date')
      .eq('employee_id', emp.id)
      .eq('status', 'active')
      .gt('balance', 0)
      .or(`start_date.is.null,start_date.lte.${endDate}`)
'@

Patch-Target 'src\app\api\payroll\runs\generate\route.ts' @'
        const recovery = Number(adv.monthly_recovery || 0)
        if (recovery > 0) {
'@ @'
        const recovery = Math.min(Number(adv.monthly_recovery || 0), Number(adv.balance || 0))
        if (recovery > 0) {
'@

Patch-Target 'src\app\api\payroll\runs\[runId]\reverse\route.ts' @'
    .select('account_id, debit, credit, project_id, activity_id, location_id, donor_id')
'@ @'
    .select('account_id, debit, credit, project_id, activity_id, location_id, donor_id, employee_id')
'@

Patch-Target 'src\app\api\payroll\runs\[runId]\reverse\route.ts' @'
      description: `Reversal of Payroll ${reason}`,
    })
'@ @'
      description: `Reversal of Payroll ${reason}`,
      source_type: 'payroll_reversal',
      source_id: runId,
    })
'@

Patch-Target 'src\app\api\payroll\runs\[runId]\reverse\route.ts' @'
    donor_id: line.donor_id,
    source_type: 'payroll_reversal',
'@ @'
    donor_id: line.donor_id,
    employee_id: line.employee_id,
    source_type: 'payroll_reversal',
'@

Patch-Target 'src\app\dashboard\payroll\loans\page.tsx' @'
  const [saving, setSaving] = useState(false)

'@ @'
  const [formPaidFrom, setFormPaidFrom] = useState<number | null>(null)
  const [payAccounts, setPayAccounts] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

'@

Patch-Target 'src\app\dashboard\payroll\loans\page.tsx' @'
        setCompanyId(cid)

        // Fetch departments and employees (without join, then merge)

'@ @'
        setCompanyId(cid)

        // Bank and cash accounts the money can be paid from
        supabase
          .from("accounts")
          .select("id, code, name")
          .eq("company_id", cid)
          .eq("type", "Asset")
          .like("code", "10%")
          .order("code")
          .then(({ data }) => setPayAccounts(data || []))

        // Fetch departments and employees (without join, then merge)

'@

Patch-Target 'src\app\dashboard\payroll\loans\page.tsx' @'
    setFormInstallment("")
    setFormStartDate(new Date().toISOString().split("T")[0])
    setShowForm(true)
'@ @'
    setFormInstallment("")
    setFormPaidFrom(null)
    setFormStartDate(new Date().toISOString().split("T")[0])
    setShowForm(true)
'@

Patch-Target 'src\app\dashboard\payroll\loans\page.tsx' @'
    if (!formPrincipal || isNaN(Number(formPrincipal))) { setError("Valid principal amount required"); return }
    if (!formInstallment || isNaN(Number(formInstallment))) { setError("Valid installment required"); return }

'@ @'
    if (!formPrincipal || isNaN(Number(formPrincipal)) || Number(formPrincipal) <= 0) { setError("Valid principal amount required"); return }
    if (!formInstallment || isNaN(Number(formInstallment)) || Number(formInstallment) <= 0) { setError("Valid installment required"); return }
    if (Number(formInstallment) > Number(formPrincipal)) { setError("Monthly amount cannot be more than the total amount"); return }
    if (!editingId && !formPaidFrom) { setError("Select the Bank or Cash account the money is paid from"); return }

'@

Patch-Target 'src\app\dashboard\payroll\loans\page.tsx' @'
    if (editingId) {
      // Update
      const { error: updateErr } = await supabase
        .from("employee_loans")
        .update({
          principal_amount: Number(formPrincipal),
          monthly_installment: Number(formInstallment),
          start_date: formStartDate,
          balance: Number(formPrincipal),   // reset balance on edit
        })
        .eq("id", editingId)
      if (updateErr) { setError(updateErr.message); setSaving(false); return }
      setFlash("Loan updated")
    } else {
      // Insert
      const { error: insertErr } = await supabase
        .from("employee_loans")
        .insert({
          employee_id: formEmployeeId,
          principal_amount: Number(formPrincipal),
          monthly_installment: Number(formInstallment),
          balance: Number(formPrincipal),
          start_date: formStartDate,
          status: "active",
          created_by: user?.id,
        })
      if (insertErr) { setError(insertErr.message); setSaving(false); return }
      setFlash("Loan created")
    }

'@ @'
    if (editingId) {
      // Only the repayment terms can change. The amount and the balance are never touched here.
      const { error: updateErr } = await supabase
        .from("employee_loans")
        .update({
          monthly_installment: Number(formInstallment),
          start_date: formStartDate,
        })
        .eq("id", editingId)
      if (updateErr) { setError(updateErr.message); setSaving(false); return }
      setFlash("Loan updated")
    } else {
      // Issuing posts the accounting entry: Dr Employee Loans & Advances, Cr Bank/Cash
      const { error: issueErr } = await supabase.rpc("issue_employee_loan", {
        p_company_id: companyId,
        p_employee_id: formEmployeeId,
        p_amount: Number(formPrincipal),
        p_installment: Number(formInstallment),
        p_start_date: formStartDate,
        p_paid_from_account_id: formPaidFrom,
      })
      if (issueErr) { setError(issueErr.message); setSaving(false); return }
      setFlash("Loan issued")
    }

'@

Patch-Target 'src\app\dashboard\payroll\loans\page.tsx' @'
onChange={e => setFormPrincipal(e.target.value)} placeholder="e.g. 100000" />
'@ @'
onChange={e => setFormPrincipal(e.target.value)} placeholder="e.g. 100000" disabled={!!editingId} />
'@

Patch-Target 'src\app\dashboard\payroll\loans\page.tsx' @'
            <div style={{ marginBottom: 20 }}>
              <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>Start Date *</label>
'@ @'
            {!editingId ? (
              <div style={{ marginBottom: 12 }}>
                <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>Paid From (Bank / Cash) *</label>
                <select className="select" value={formPaidFrom ?? ""} onChange={e => setFormPaidFrom(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Select account...</option>
                  {payAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                The amount cannot be changed after it is issued. You can change the monthly amount and the start date.
              </div>
            )}
            <div style={{ marginBottom: 20 }}>
              <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>Start Date *</label>
'@

Patch-Target 'src\app\dashboard\payroll\advances\page.tsx' @'
  const [saving, setSaving] = useState(false)

'@ @'
  const [formPaidFrom, setFormPaidFrom] = useState<number | null>(null)
  const [payAccounts, setPayAccounts] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

'@

Patch-Target 'src\app\dashboard\payroll\advances\page.tsx' @'
        setCompanyId(cid)
        // Fetch employees without join

'@ @'
        setCompanyId(cid)
        // Bank and cash accounts the money can be paid from
        supabase
          .from("accounts")
          .select("id, code, name")
          .eq("company_id", cid)
          .eq("type", "Asset")
          .like("code", "10%")
          .order("code")
          .then(({ data }) => setPayAccounts(data || []))
        // Fetch employees without join

'@

Patch-Target 'src\app\dashboard\payroll\advances\page.tsx' @'
    setFormRecovery("")
    setFormStartDate(new Date().toISOString().split("T")[0])
    setShowForm(true)
'@ @'
    setFormRecovery("")
    setFormPaidFrom(null)
    setFormStartDate(new Date().toISOString().split("T")[0])
    setShowForm(true)
'@

Patch-Target 'src\app\dashboard\payroll\advances\page.tsx' @'
    if (!formAdvance || isNaN(Number(formAdvance))) { setError("Valid advance amount required"); return }
    if (!formRecovery || isNaN(Number(formRecovery))) { setError("Valid monthly recovery required"); return }

'@ @'
    if (!formAdvance || isNaN(Number(formAdvance)) || Number(formAdvance) <= 0) { setError("Valid advance amount required"); return }
    if (!formRecovery || isNaN(Number(formRecovery)) || Number(formRecovery) <= 0) { setError("Valid monthly recovery required"); return }
    if (Number(formRecovery) > Number(formAdvance)) { setError("Monthly amount cannot be more than the total amount"); return }
    if (!editingId && !formPaidFrom) { setError("Select the Bank or Cash account the money is paid from"); return }

'@

Patch-Target 'src\app\dashboard\payroll\advances\page.tsx' @'
    if (editingId) {
      const { error: updateErr } = await supabase
        .from("salary_advances")
        .update({
          advance_amount: Number(formAdvance),
          monthly_recovery: Number(formRecovery),
          start_date: formStartDate,
          balance: Number(formAdvance),
        })
        .eq("id", editingId)
      if (updateErr) { setError(updateErr.message); setSaving(false); return }
      setFlash("Advance updated")
    } else {
      const { error: insertErr } = await supabase
        .from("salary_advances")
        .insert({
          employee_id: formEmployeeId,
          advance_amount: Number(formAdvance),
          monthly_recovery: Number(formRecovery),
          balance: Number(formAdvance),
          start_date: formStartDate,
          status: "active",
          created_by: user?.id,
        })
      if (insertErr) { setError(insertErr.message); setSaving(false); return }
      setFlash("Advance created")
    }

'@ @'
    if (editingId) {
      // Only the repayment terms can change. The amount and the balance are never touched here.
      const { error: updateErr } = await supabase
        .from("salary_advances")
        .update({
          monthly_recovery: Number(formRecovery),
          start_date: formStartDate,
        })
        .eq("id", editingId)
      if (updateErr) { setError(updateErr.message); setSaving(false); return }
      setFlash("Advance updated")
    } else {
      // Issuing posts the accounting entry: Dr Employee Loans & Advances, Cr Bank/Cash
      const { error: issueErr } = await supabase.rpc("issue_salary_advance", {
        p_company_id: companyId,
        p_employee_id: formEmployeeId,
        p_amount: Number(formAdvance),
        p_installment: Number(formRecovery),
        p_start_date: formStartDate,
        p_paid_from_account_id: formPaidFrom,
      })
      if (issueErr) { setError(issueErr.message); setSaving(false); return }
      setFlash("Advance issued")
    }

'@

Patch-Target 'src\app\dashboard\payroll\advances\page.tsx' @'
onChange={e => setFormAdvance(e.target.value)} placeholder="e.g. 25000" />
'@ @'
onChange={e => setFormAdvance(e.target.value)} placeholder="e.g. 25000" disabled={!!editingId} />
'@

Patch-Target 'src\app\dashboard\payroll\advances\page.tsx' @'
            <div style={{ marginBottom: 20 }}>
              <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>Start Date *</label>
'@ @'
            {!editingId ? (
              <div style={{ marginBottom: 12 }}>
                <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>Paid From (Bank / Cash) *</label>
                <select className="select" value={formPaidFrom ?? ""} onChange={e => setFormPaidFrom(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Select account...</option>
                  {payAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                The amount cannot be changed after it is issued. You can change the monthly amount and the start date.
              </div>
            )}
            <div style={{ marginBottom: 20 }}>
              <label className="kpi-label" style={{ display: "block", marginBottom: 4 }}>Start Date *</label>
'@

Write-Host ''
Write-Host 'Batch 3 applied. Next: npm run build' -ForegroundColor Green