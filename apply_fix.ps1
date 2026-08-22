$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

function Fix-CompanyIdLookup {
    param($path, $lineIdx)  # lineIdx = 0-based index of "const companyId = ..." line

    $backup = "$path.backup_$timestamp"
    Copy-Item $path $backup
    Write-Host "Backup saved: $backup"

    $lines = [System.IO.File]::ReadAllLines($path)

    $line1 = $lines[$lineIdx].Trim()
    $line2 = $lines[$lineIdx+1].Trim()

    if ($line1 -ne "const companyId = user.app_metadata?.company_id") {
        Write-Host "ABORT ($path): Line $($lineIdx+1) does not match expected content. Found: '$line1'" -ForegroundColor Red
        return $false
    }
    if ($line2 -ne "if (!companyId) return NextResponse.json({ error: 'No company associated with this user' }, { status: 400 })") {
        Write-Host "ABORT ($path): Line $($lineIdx+2) does not match expected content. Found: '$line2'" -ForegroundColor Red
        return $false
    }

    $indent = "  "  # 2-space indent matches original file style at this level
    $newBlock = @(
        "${indent}const { data: roleRow } = await supabase.from('user_roles').select('company_id').eq('user_id', user.id).eq('is_active', true).maybeSingle()",
        "${indent}const companyId = roleRow?.company_id",
        "${indent}if (!companyId) return NextResponse.json({ error: 'No active company found for this user' }, { status: 400 })"
    )

    $before = $lines[0..($lineIdx-1)]
    $after  = $lines[($lineIdx+2)..($lines.Count-1)]
    $finalLines = $before + $newBlock + $after

    [System.IO.File]::WriteAllLines($path, $finalLines, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS ($path): Fix applied." -ForegroundColor Green
    return $true
}

$base = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\api\construction\investors"

Write-Host "=== Fix 1: assign/route.ts ===" -ForegroundColor Cyan
$ok1 = Fix-CompanyIdLookup -path (Join-Path $base "assign\route.ts") -lineIdx 47   # line 48, 0-based

Write-Host ""
Write-Host "=== Fix 2: contribute/route.ts ===" -ForegroundColor Cyan
$ok2 = Fix-CompanyIdLookup -path (Join-Path $base "contribute\route.ts") -lineIdx 50   # line 51, 0-based

Write-Host ""
if ($ok1 -and $ok2) {
    Write-Host "Both fixes applied successfully." -ForegroundColor Green
} else {
    Write-Host "One or both fixes were ABORTED. Check messages above. No partial changes were made to any aborted file (each file is fully independent)." -ForegroundColor Yellow
}