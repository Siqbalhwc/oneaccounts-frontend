$ErrorActionPreference = "Stop"

# Only check .tsx and .ts files
$staged = git diff --cached --name-only --diff-filter=ACM | Where-Object { $_ -match "\.(tsx|ts)$" }

if (-not $staged) { exit 0 }

$badFiles = @()

foreach ($file in $staged) {
    try {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        # Use an encoding that THROWS on invalid bytes
        $enc = New-Object System.Text.UTF8Encoding $false, $true  # throwOnInvalidBytes
        [void]$enc.GetString($bytes)
    } catch [System.Text.DecoderFallbackException] {
        $badFiles += $file
    } catch {
        # other read errors also considered bad
        $badFiles += $file
    }
}

if ($badFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "❌ COMMIT REJECTED – These files contain invalid UTF‑8 characters:" -ForegroundColor Red
    $badFiles | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "👉 Open each file in Notepad, press Ctrl+H, search for unusual characters"
    Write-Host "   (like Â, â€, ðŸ, etc.) and delete them, or re‑type the text manually."
    Write-Host ""
    exit 1
}

exit 0