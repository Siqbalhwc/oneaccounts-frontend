$filePath = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\components\DashboardSidebar.tsx"
$backupPath = "$filePath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

$rawContent = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($backupPath, $rawContent, [System.Text.Encoding]::UTF8)
$content = $rawContent -replace "`r`n", "`n"
function Norm($s) { return ($s -replace "`r`n", "`n").TrimEnd("`n") }

$old = Norm @'
  const bg = theme === "oneaccounts"
    ? "linear-gradient(155deg, #04092E 0%, #071352 18%, #0F2280 40%, #1740C8 72%, #1E55E8 100%)"
    : "var(--main-bg)"

  const isDarkText = theme === "light" || (theme === "system" && typeof window !== "undefined" && !window.matchMedia("(prefers-color-scheme: dark)").matches)
  const textColor      = theme === "oneaccounts" ? "rgba(255,255,255,0.9)" : (isDarkText ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.85)")
  const mutedTextColor  = theme === "oneaccounts" ? "rgba(255,255,255,0.6)" : (isDarkText ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)")
  const borderColor     = theme === "oneaccounts" ? "rgba(255,255,255,0.15)" : (isDarkText ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)")
  const shadow = theme === "oneaccounts"
    ? "0 25px 50px -12px rgba(0,0,0,0.6)"
    : (isDarkText ? "0 25px 50px -12px rgba(0,0,0,0.15)" : "0 25px 50px -12px rgba(0,0,0,0.5)")
'@

$new = Norm @'
  const gradientThemes = ["oneaccounts", "light"]
  const bg = theme === "oneaccounts"
    ? "linear-gradient(155deg, #04092E 0%, #071352 18%, #0F2280 40%, #1740C8 72%, #1E55E8 100%)"
    : theme === "light"
    ? "linear-gradient(155deg, #021B0E 0%, #04331A 22%, #085C30 50%, #0B7C44 78%, #0F9D58 100%)"
    : "var(--main-bg)"

  const hasGradient = gradientThemes.includes(theme)
  const isDarkText = !hasGradient && (theme === "system" && typeof window !== "undefined" && !window.matchMedia("(prefers-color-scheme: dark)").matches)
  const textColor      = hasGradient ? "rgba(255,255,255,0.9)" : (isDarkText ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.85)")
  const mutedTextColor  = hasGradient ? "rgba(255,255,255,0.6)" : (isDarkText ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)")
  const borderColor     = hasGradient ? "rgba(255,255,255,0.15)" : (isDarkText ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)")
  const shadow = hasGradient
    ? "0 25px 50px -12px rgba(0,0,0,0.6)"
    : (isDarkText ? "0 25px 50px -12px rgba(0,0,0,0.15)" : "0 25px 50px -12px rgba(0,0,0,0.5)")
'@

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($filePath, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Sidebar light-theme gradient added. Backup saved at $backupPath"
} else {
    Write-Host "ERROR: Block not found. No changes made."
}