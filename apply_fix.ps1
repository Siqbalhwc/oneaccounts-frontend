$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$path = "src\app\dashboard\suppliers\new\page.tsx"
$backupPath = "src\app\dashboard\suppliers\new\page.tsx.bak_20260811_051706"

if (-not (Test-Path $backupPath)) {
    Write-Host "ABORT: Backup not found: $backupPath" -ForegroundColor Red
    return
}

# Restore clean, correctly-encoded content from the pre-corruption backup
$content = [System.IO.File]::ReadAllText($backupPath, [System.Text.Encoding]::UTF8)
Write-Host "Restored clean content from backup." -ForegroundColor Yellow

function Apply-Edit {
    param($Content, $Old, $New, $Label)
    $count = ([regex]::Matches($Content, [regex]::Escape($Old))).Count
    if ($count -ne 1) {
        Write-Host "ABORT ($Label): found $count times (expected 1)." -ForegroundColor Red
        return $null
    }
    Write-Host "OK ($Label)" -ForegroundColor Green
    return $Content.Replace($Old, $New)
}

# ---------- Edit 1: add country_code to payload ----------
$old0 = "      opening_balance: isNaN(balance) ? 0 : balance,`r`n      balance: isNaN(balance) ? 0 : balance,`r`n      payment_terms: paymentTerms,"
$new0 = "      opening_balance: isNaN(balance) ? 0 : balance,`r`n      balance: isNaN(balance) ? 0 : balance,`r`n      payment_terms: paymentTerms,`r`n      country_code: countryCode,"
$content = Apply-Edit -Content $content -Old $old0 -New $new0 -Label "add country_code"
if ($null -eq $content) { return }

# ---------- Edit 2: update path core call ----------
$old1 = "      const { error: updateErr } = await supabase`r`n        .from(`"suppliers`")`r`n        .update(payload)`r`n        .eq(`"id`", Number(editId))`r`n        .eq(`"company_id`", companyId)"
$new1 = "      const putRes = await fetch('/api/suppliers', {`r`n        method: 'PUT',`r`n        headers: { 'Content-Type': 'application/json' },`r`n        body: JSON.stringify({ id: Number(editId), ...payload }),`r`n      })`r`n      const putJson = await putRes.json()`r`n      const updateErr = (!putRes.ok || !putJson.success) ? { message: putJson.error || 'Update failed' } : null"
$content = Apply-Edit -Content $content -Old $old1 -New $new1 -Label "update path"
if ($null -eq $content) { return }

# ---------- Edit 3: insert path core call ----------
$old2 = "      const { data, error: insertErr } = await supabase`r`n        .from(`"suppliers`")`r`n        .insert({ ...payload, created_by: userEmail })`r`n        .select(`"id, code, name`")`r`n        .single()"
$new2 = "      const postRes = await fetch('/api/suppliers', {`r`n        method: 'POST',`r`n        headers: { 'Content-Type': 'application/json' },`r`n        body: JSON.stringify(payload),`r`n      })`r`n      const postJson = await postRes.json()`r`n      const insertErr = (!postRes.ok || !postJson.success) ? { message: postJson.error || 'Insert failed' } : null`r`n      const data = postJson.supplier"
$content = Apply-Edit -Content $content -Old $old2 -New $new2 -Label "insert path"
if ($null -eq $content) { return }

# ---------- Edit 4: remove now-redundant opening-entry POST block ----------
$old3 = "      if (balance !== 0 && data) {`r`n        try {`r`n          await fetch(`"/api/suppliers/opening-entry`", {`r`n            method: `"POST`",`r`n            headers: { `"Content-Type`": `"application/json`" },`r`n            body: JSON.stringify({ supplierId: data.id, supplierName: data.name, amount: balance }),`r`n          })`r`n        } catch (err) {`r`n          console.error(`"Opening entry failed:`", err)`r`n        }`r`n      }`r`n`r`n"
$new3 = ""
$content = Apply-Edit -Content $content -Old $old3 -New $new3 -Label "remove opening-entry call"
if ($null -eq $content) { return }

[System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
Write-Host "FIXED (encoding-safe, restored from clean backup): $path" -ForegroundColor Green