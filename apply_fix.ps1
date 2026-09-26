$path = "src\app\dashboard\reports\profit-loss\page.tsx"
$content = Get-Content -LiteralPath $path -Raw

$replacements = @(
  @{ old = 'import { useState, useEffect } from "react"'; new = 'import { useState, useEffect, useRef } from "react"' },
  @{ old = "  const [accounts, setAccounts] = useState<any[]>([])`r`n  const [loading, setLoading] = useState(true)"; new = "  const [accounts, setAccounts] = useState<any[]>([])`r`n  const [loading, setLoading] = useState(true)`r`n  const hasLoadedOnce = useRef(false)" },
  @{ old = "      setAccounts(mapped)`r`n    } catch (e) {`r`n      console.error(e)`r`n    } finally {`r`n      setLoading(false)`r`n    }`r`n  }"; new = "      setAccounts(mapped)`r`n    } catch (e) {`r`n      console.error(e)`r`n    } finally {`r`n      setLoading(false)`r`n      hasLoadedOnce.current = true`r`n    }`r`n  }" },
  @{ old = "  if (loading) return ("; new = "  if (loading && !hasLoadedOnce.current) return (" }
)

foreach ($r in $replacements) {
  if ($content -notmatch [regex]::Escape($r.old)) {
    Write-Host "ANCHOR NOT FOUND, stopping (no changes made): $($r.old)"
    exit 1
  }
}

foreach ($r in $replacements) {
  $content = $content -replace [regex]::Escape($r.old), [System.Text.RegularExpressions.Regex]::Escape($r.new).Replace('\ ', ' ') -replace '\\(.)', '$1'
}

Set-Content -LiteralPath $path -Value $content -NoNewline
Write-Host "Done - profit-loss date filter fix applied"