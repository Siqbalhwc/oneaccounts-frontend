$path = "src\app\api\super-admin\companies\extend-trial\route.ts"

$content = [System.IO.File]::ReadAllText($path)

$old = @"
  const { error } = await supabaseAdmin
    .from('company_settings')
    .upsert({
      company_id: companyId,
      trial_ends_at: newEndDate,
    })
    .eq('company_id', companyId)
"@

$new = @"
  const { error } = await supabaseAdmin
    .from('company_settings')
    .upsert(
      {
        company_id: companyId,
        trial_ends_at: newEndDate,
      },
      { onConflict: 'company_id' }
    )
"@

if ($content -notmatch [regex]::Escape($old)) {
    Write-Host "ANCHOR NOT FOUND - aborting, no changes made" -ForegroundColor Red
    exit 1
}

$content = $content.Replace($old, $new)

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $content, $utf8NoBom)

Write-Host "Fix applied successfully to $path" -ForegroundColor Green