$path = "src\app\dashboard\settings\projects\page.tsx"
$backup = "$path.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
[System.IO.File]::Copy($path, $backup)
Write-Host "Backup created: $backup"

$content = [System.IO.File]::ReadAllText($path)
$originalContent = $content

# Step 1: wire the dispatcher to call handleImportProjects
$s1old = @'
    if (importType === "donor") {
      await handleImportDonors(rows)
    } else {
      setImportErrors([`Import for ${importType} is not built yet.`])
    }
'@
$s1new = @'
    if (importType === "donor") {
      await handleImportDonors(rows)
    } else if (importType === "project") {
      await handleImportProjects(rows)
    } else {
      setImportErrors([`Import for ${importType} is not built yet.`])
    }
'@
if ($content.Contains($s1old)) { $content = $content.Replace($s1old, $s1new); Write-Host "Step 1: SUCCESS" } else { Write-Host "Step 1: NOT FOUND" }

# Step 2: add handleImportProjects right after handleImportDonors
$s2old = @'
    setFlash(messages.join(" "))
    setShowImportModal(false)
    setImportFile(null)
    fetchData()
    setTimeout(() => setFlash(""), 6000)
  }
'@
$s2new = @'
    setFlash(messages.join(" "))
    setShowImportModal(false)
    setImportFile(null)
    fetchData()
    setTimeout(() => setFlash(""), 6000)
  }

  const handleImportProjects = async (rows: any[]) => {
    const errors: string[] = []
    const cleanRows: { name: string; description: string; donorName: string }[] = []
    const seenNames = new Set<string>()

    rows.forEach((row: any, idx: number) => {
      const rowNum = idx + 2
      const name = String(row.Name || row.name || "").trim()
      const description = String(row.Description || row.description || "").trim()
      const donorName = String(row.DonorName || row.donorName || row["Donor Name"] || "").trim()
      if (!name) {
        errors.push(`Row ${rowNum}: Name is required.`)
        return
      }
      if (!donorName) {
        errors.push(`Row ${rowNum}: ${labels.donor} name is required.`)
        return
      }
      const key = name.toLowerCase()
      if (seenNames.has(key)) {
        errors.push(`Row ${rowNum}: Project "${name}" appears more than once in this file.`)
        return
      }
      seenNames.add(key)
      cleanRows.push({ name, description, donorName })
    })

    if (errors.length > 0) {
      setImportErrors(errors)
      return
    }

    // Look up existing donors and projects (case-insensitive) once, up front.
    const { data: existingDonors } = await supabase
      .from("donors")
      .select("id, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
    const { data: existingProjects } = await supabase
      .from("projects")
      .select("id, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)

    const donorByName = new Map<string, any>()
    ;(existingDonors || []).forEach((d: any) => donorByName.set(d.name.trim().toLowerCase(), d))
    const projectByName = new Map<string, any>()
    ;(existingProjects || []).forEach((p: any) => projectByName.set(p.name.trim().toLowerCase(), p))

    // Create any missing donors first (donors referenced by name that don't exist yet).
    const donorNamesNeeded = [...new Set(cleanRows.map(r => r.donorName.toLowerCase()))]
    const donorNamesToCreate = donorNamesNeeded.filter(n => !donorByName.has(n))
    if (donorNamesToCreate.length > 0) {
      const originalCaseNames = donorNamesToCreate.map(lower =>
        cleanRows.find(r => r.donorName.toLowerCase() === lower)!.donorName
      )
      const donorPayload = await Promise.all(originalCaseNames.map(async name => ({
        company_id: companyId,
        name,
        code: await getNextDonorCode(supabase, companyId, donorCodePrefix),
        is_active: true,
      })))
      const { data: createdDonors, error: donorError } = await supabase.from("donors").insert(donorPayload).select("id, name")
      if (donorError) {
        setImportErrors([`Import failed while creating ${labels.donor.toLowerCase()}s: ${donorError.message}`])
        return
      }
      ;(createdDonors || []).forEach((d: any) => donorByName.set(d.name.trim().toLowerCase(), d))
    }

    const toCreate = cleanRows.filter(r => !projectByName.has(r.name.toLowerCase()))
    const alreadyExisting = cleanRows.filter(r => projectByName.has(r.name.toLowerCase()))

    if (toCreate.length > 0) {
      const payload = toCreate.map(r => ({
        company_id: companyId,
        name: r.name,
        description: r.description,
        donor_id: donorByName.get(r.donorName.toLowerCase())?.id || null,
        is_active: true,
      }))
      const { error } = await supabase.from("projects").insert(payload)
      if (error) {
        setImportErrors([`Import failed: ${error.message}`])
        return
      }
    }

    const messages: string[] = []
    if (donorNamesToCreate.length > 0) messages.push(`${donorNamesToCreate.length} new ${labels.donor.toLowerCase()}(s) created.`)
    if (toCreate.length > 0) messages.push(`${toCreate.length} new ${labels.project.toLowerCase()}(s) created.`)
    if (alreadyExisting.length > 0) {
      messages.push(`${alreadyExisting.length} ${labels.project.toLowerCase()}(s) already existed and were skipped: ${alreadyExisting.map(r => r.name).join(", ")}.`)
    }
    setFlash(messages.join(" "))
    setShowImportModal(false)
    setImportFile(null)
    fetchData()
    setTimeout(() => setFlash(""), 6000)
  }
'@
if ($content.Contains($s2old)) { $content = $content.Replace($s2old, $s2new); Write-Host "Step 2: SUCCESS" } else { Write-Host "Step 2: NOT FOUND" }

if ($content -ne $originalContent) {
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "FILE UPDATED"
} else {
    Write-Host "NO CHANGES MADE"
}