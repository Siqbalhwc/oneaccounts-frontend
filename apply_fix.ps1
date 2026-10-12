# apply_fix.ps1 - Payroll Batch 2a (safe version: checks EVERYTHING first, changes NOTHING unless every patch matches)
# Run from: C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend
$ErrorActionPreference = 'Stop'
$enc = New-Object System.Text.UTF8Encoding($false)
$root = (Get-Location).Path
$script:files = @{}
$script:failed = @()
$script:count = 0

function Add-Patch($rel, $old, $new) {
  $full = Join-Path $root $rel
  if (-not $script:files.ContainsKey($rel)) {
    if (-not (Test-Path -LiteralPath $full)) { $script:failed += "MISSING FILE: $rel"; $script:files[$rel] = $null; return }
    $script:files[$rel] = [System.IO.File]::ReadAllText($full)
  }
  $t = $script:files[$rel]
  if ($t -eq $null) { return }
  $nl = if ($t.Contains("`r`n")) { "`r`n" } else { "`n" }
  $o = $old.Replace("`r`n","`n").Replace("`n",$nl)
  $n = $new.Replace("`r`n","`n").Replace("`n",$nl)
  $i = $t.IndexOf($o)
  if ($i -lt 0) {
    $first = (($old -split "`n") | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1).Trim()
    $msg = "NOT MATCHED in $rel`n  looking for: $first"
    $lines = $t -split "`r?`n"
    $hit = -1
    for ($k = 0; $k -lt $lines.Count; $k++) { if ($lines[$k].Contains($first)) { $hit = $k; break } }
    if ($hit -ge 0) {
      $msg += "`n  first line found at line $($hit+1); the file has this there:"
      $to = [Math]::Min($hit + 14, $lines.Count - 1)
      for ($k = $hit; $k -le $to; $k++) { $msg += "`n  | " + $lines[$k] }
    } else { $msg += "`n  (that first line does not exist in your file at all)" }
    $script:failed += $msg
    return
  }
  if ($t.IndexOf($o, $i + 1) -ge 0) { $script:failed += "FOUND TWICE in $rel : $($old.Substring(0, [Math]::Min(60,$old.Length)))"; return }
  $script:files[$rel] = $t.Substring(0,$i) + $n + $t.Substring($i + $o.Length)
  $script:count++
}


Add-Patch 'src\app\dashboard\payroll\attendance\page.tsx' @'
  const [dirty, setDirty] = useState(false)

'@ @'
  const [dirty, setDirty] = useState(false)
  const dirtyKeys = useRef<Set<string>>(new Set())

'@

Add-Patch 'src\app\dashboard\payroll\attendance\page.tsx' @'
    supabase
      .from("attendance_records")
      .select("employee_id, date, raw_status, check_in, check_out, verified_status")
      .eq("company_id", companyId)
      .gte("date", startDate)
      .lte("date", endDate)
      .then(({ data }) => {
        const map: Record<string, any> = {}
        if (data) {
          data.forEach((row: any) => {
            const key = `${row.employee_id}_${row.date}`
            map[key] = row
          })
        }
        setAttendanceData(map)
        setLoading(false)
      })
  }, [companyId, month, year, daysInMonth])
'@ @'
    let cancelled = false
    const load = async () => {
      // Read in pages of 1000 so a big company is never cut off silently
      const all: any[] = []
      const PAGE = 1000
      for (let from = 0; ; from += PAGE) {
        const { data, error: fetchErr } = await supabase
          .from("attendance_records")
          .select("employee_id, date, raw_status, check_in, check_out, verified_status")
          .eq("company_id", companyId)
          .gte("date", startDate)
          .lte("date", endDate)
          .order("employee_id")
          .order("date")
          .range(from, from + PAGE - 1)
        if (fetchErr) { if (!cancelled) setError(fetchErr.message); break }
        if (!data || data.length === 0) break
        all.push(...data)
        if (data.length < PAGE) break
      }
      if (cancelled) return
      const map: Record<string, any> = {}
      all.forEach((row: any) => {
        map[`${row.employee_id}_${row.date}`] = row
      })
      setAttendanceData(map)
      dirtyKeys.current = new Set()
      setDirty(false)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [companyId, month, year, daysInMonth])
'@

Add-Patch 'src\app\dashboard\payroll\attendance\page.tsx' @'
    const key = `${empId}_${dateStr}`
    setAttendanceData(prev => ({
      ...prev,
      [key]: { ...(prev[key] || { raw_status: "present", verified_status: "pending" }), [field]: value }
    }))
    setDirty(true)
'@ @'
    const key = `${empId}_${dateStr}`
    dirtyKeys.current.add(key)
    setAttendanceData(prev => {
      const base = prev[key] || { raw_status: "present", verified_status: "pending" }
      const next = { ...base, [field]: value }
      // Any change to a day that was already approved or rejected sends it back for verification
      if (base.verified_status === "approved" || base.verified_status === "rejected") next.verified_status = "pending"
      return { ...prev, [key]: next }
    })
    setDirty(true)
'@

Add-Patch 'src\app\dashboard\payroll\attendance\page.tsx' @'
    if (!companyId) { setError("Company not loaded"); return }
    setSaving(true)
    setError("")

'@ @'
    if (!companyId) { setError("Company not loaded"); return }
    if (frozen) { setError("This month is frozen. Changes are not allowed."); return }
    setSaving(true)
    setError("")

'@

Add-Patch 'src\app\dashboard\payroll\attendance\page.tsx' @'
    const records: any[] = []
    filteredEmployees.forEach(emp => {
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
        const cell = getCell(emp.id, dateStr)
        records.push({
          company_id: companyId,
          employee_id: emp.id,
          date: dateStr,
          raw_status: cell.raw_status,
          check_in: cell.check_in || null,
          check_out: cell.check_out || null,
          source: "manual",
          verified_status: cell.verified_status || "pending",
        })
      }
    })

'@ @'
    // Save ONLY the days the user actually changed (whatever the search or filter shows)
    const records: any[] = []
    dirtyKeys.current.forEach(key => {
      const sep = key.indexOf("_")
      const empId = Number(key.slice(0, sep))
      const dateStr = key.slice(sep + 1)
      const cell = getCell(empId, dateStr)
      records.push({
        company_id: companyId,
        employee_id: empId,
        date: dateStr,
        raw_status: cell.raw_status,
        check_in: cell.check_in || null,
        check_out: cell.check_out || null,
        source: "manual",
        verified_status: cell.verified_status || "pending",
      })
    })
    if (records.length === 0) {
      setDirty(false)
      setSaving(false)
      return
    }

'@

Add-Patch 'src\app\dashboard\payroll\attendance\page.tsx' @'
    setDirty(false)
    setFlash(`Attendance saved for ${monthLabel}`)
'@ @'
    dirtyKeys.current = new Set()
    setDirty(false)
    setFlash(`Attendance saved for ${monthLabel}`)
'@

Add-Patch 'src\app\dashboard\payroll\attendance\page.tsx' @'
  const goToPrevMonth = () => { if (month === 0)
'@ @'
  const goToPrevMonth = () => { if (dirtyKeys.current.size > 0) { setError("Save your changes before changing the month."); return }; if (month === 0)
'@

Add-Patch 'src\app\dashboard\payroll\attendance\page.tsx' @'
  const goToNextMonth = () => { if (month === 11)
'@ @'
  const goToNextMonth = () => { if (dirtyKeys.current.size > 0) { setError("Save your changes before changing the month."); return }; if (month === 11)
'@

Add-Patch 'src\app\dashboard\payroll\runs\new\page.tsx' @'
          .select("id")
          .eq("company_id", companyId)

        if (departmentId) {
'@ @'
          .select("id")
          .eq("company_id", companyId)
          .eq("status", "active")

        if (departmentId) {
'@

Add-Patch 'src\app\dashboard\payroll\runs\new\page.tsx' @'
            .select("employee_id, effective_date")
            .eq("company_id", companyId)
            .order("effective_date", { ascending: false })
'@ @'
            .select("employee_id, effective_date")
            .in("employee_id", allEmployees.map(e => e.id))
            .lte("effective_date", `${selectedMonth}-01`)
            .order("effective_date", { ascending: false })
'@

Add-Patch 'src\app\dashboard\payroll\runs\new\page.tsx' @'
          .from("employee_loans")
          .select("*", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "active")
'@ @'
          .from("employee_loans")
          .select("*", { count: "exact", head: true })
          .in("employee_id", allEmployees.map(e => e.id))
          .eq("status", "active")
          .gt("balance", 0)
'@

Add-Patch 'src\app\dashboard\payroll\runs\new\page.tsx' @'
          .from("salary_advances")
          .select("*", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "active")
'@ @'
          .from("salary_advances")
          .select("*", { count: "exact", head: true })
          .in("employee_id", allEmployees.map(e => e.id))
          .eq("status", "active")
          .gt("balance", 0)
'@

Add-Patch 'src\app\dashboard\payroll\runs\new\page.tsx' @'
          warnings.push(`${missingStructureCount} employee(s) have no salary structure assigned.`)
        }

'@ @'
          warnings.push(`${missingStructureCount} employee(s) have no salary structure assigned.`)
        }

        // Attendance that is not approved yet is ignored by payroll
        const [py, pm] = selectedMonth.split("-").map(Number)
        const lastDay = new Date(py, pm, 0).getDate()
        let attQuery = supabase
          .from("attendance_records")
          .select("id, employees!inner(department_id)", { count: "exact", head: true })
          .eq("company_id", companyId)
          .gte("date", `${selectedMonth}-01`)
          .lte("date", `${selectedMonth}-${String(lastDay).padStart(2, "0")}`)
          .neq("verified_status", "approved")
        if (departmentId) attQuery = attQuery.eq("employees.department_id", departmentId)
        const { count: pendingAtt } = await attQuery
        if ((pendingAtt || 0) > 0) {
          warnings.push(`${pendingAtt} attendance record(s) for this month are not approved yet. Absences and overtime in them will NOT be counted. Approve them in Attendance Verification first.`)
        }

'@

Add-Patch 'src\app\dashboard\payroll\reports\payroll-register\page.tsx' @'
<input type="date" className="input" value={month} onChange={e => setMonth(e.target.value)} />
'@ @'
<input type="month" className="input" value={month ? month.slice(0, 7) : ""} onChange={e => setMonth(e.target.value ? e.target.value + "-01" : "")} />
'@

Add-Patch 'src\app\dashboard\payroll\reports\tax-deduction\page.tsx' @'
<input type="date" className="input" value={month} onChange={e => setMonth(e.target.value)} />
'@ @'
<input type="month" className="input" value={month ? month.slice(0, 7) : ""} onChange={e => setMonth(e.target.value ? e.target.value + "-01" : "")} />
'@

Add-Patch 'src\app\dashboard\payroll\reports\bank-transfer\page.tsx' @'
<input type="date" className="input" value={month} onChange={e => setMonth(e.target.value)} />
'@ @'
<input type="month" className="input" value={month ? month.slice(0, 7) : ""} onChange={e => setMonth(e.target.value ? e.target.value + "-01" : "")} />
'@

Add-Patch 'src\app\dashboard\payroll\reports\salary-summary\page.tsx' @'
<input type="date" className="input" value={month} onChange={e => setMonth(e.target.value)} />
'@ @'
<input type="month" className="input" value={month ? month.slice(0, 7) : ""} onChange={e => setMonth(e.target.value ? e.target.value + "-01" : "")} />
'@

Add-Patch 'src\app\dashboard\payroll\reports\attendance-register\page.tsx' @'
<input type="date" className="input" value={month} onChange={e => setMonth(e.target.value)} />
'@ @'
<input type="month" className="input" value={month ? month.slice(0, 7) : ""} onChange={e => setMonth(e.target.value ? e.target.value + "-01" : "")} />
'@

Add-Patch 'src\app\dashboard\payroll\reports\payslip\page.tsx' @'
<input type="date" className="input" style={{ width: 200 }} value={month} onChange={e => setMonth(e.target.value)} />
'@ @'
<input type="month" className="input" style={{ width: 200 }} value={month ? month.slice(0, 7) : ""} onChange={e => setMonth(e.target.value ? e.target.value + "-01" : "")} />
'@


if ($script:failed.Count -gt 0) {
  Write-Host ''
  Write-Host "NOTHING WAS CHANGED. $($script:failed.Count) patch(es) did not match your files:" -ForegroundColor Red
  foreach ($f in $script:failed) { Write-Host ''; Write-Host $f -ForegroundColor Yellow }
  Write-Host ''
  Write-Host 'Copy everything above and send it to Claude.' -ForegroundColor Red
  exit 1
}
foreach ($rel in $script:files.Keys) {
  [System.IO.File]::WriteAllText((Join-Path $root $rel), $script:files[$rel], $enc)
  Write-Host ("PATCHED " + $rel)
}
Write-Host ''
Write-Host ("Batch 2a applied: " + $script:count + " patches. Next: npm run build") -ForegroundColor Green