$path = "src\app\api\inventory\adjustments\route.ts"
$content = Get-Content $path -Raw

$old = @"
    // 4. Update product quantity (scoped)
    const { error: updateError } = await supabase
      .from("products")
      .update({ qty_on_hand: newQty })
      .eq("id", product_id)
      .eq("company_id", companyId)

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
    }

"@

$new = @"

"@

if ($content -notmatch [regex]::Escape($old.Trim())) {
    Write-Output "remove-redundant-update: matches found = 0"
    Write-Output "Anchor did not match exactly once - stopping, NO changes made."
} else {
    $count = ([regex]::Matches($content, [regex]::Escape($old.Trim()))).Count
    if ($count -ne 1) {
        Write-Output "remove-redundant-update: matches found = $count"
        Write-Output "Anchor matched more than once - stopping, NO changes made."
    } else {
        $updated = $content -replace [regex]::Escape($old.Trim()), ""
        Set-Content -Path $path -Value $updated -NoNewline
        Write-Output "remove-redundant-update: SUCCESS - redundant qty_on_hand update removed"
    }
}