$ErrorActionPreference = "Stop"

# Get list of staged .tsx and .ts files
$staged = git diff --cached --name-only --diff-filter=ACM | Where-Object { $_ -match "\.(tsx|ts)$" }

if (-not $staged) { exit 0 }

$badFiles = @()

foreach ($file in $staged) {
    # Read file bytes and attempt to convert to UTF-8
    try {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $text = [System.Text.Encoding]::UTF8.GetString($bytes)
        # If the bytes cannot be decoded without replacement characters, they're invalid
        $repaired = [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::UTF8.GetBytes($text))
        if ($text.Length -ne $repaired.Length) {
            $badFiles += $file
        }
    } catch {
        $badFiles += $file
    }
}

if ($badFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "❌ COMMIT REJECTED – These files contain non‑UTF‑8 characters:" -ForegroundColor Red
    $badFiles | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "👉 Open each file in Notepad, press Ctrl+H, search for unusual characters"
    Write-Host "   (like Â, â€, ðŸ, etc.) and delete them, or re‑type the text manually."
    Write-Host ""
    exit 1
}

exit 0