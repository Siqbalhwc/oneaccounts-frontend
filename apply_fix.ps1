$path = "src\app\dashboard\reports\profit-loss\page.tsx"
$content = Get-Content -LiteralPath $path -Raw

$old1 = "  const [accounts, setAccounts] = useState<any[]>([])rn  const [loading, setLoading] = useState(true)rn  const hasLoadedOnce = useRef(false)"
$new1 = "  const [accounts, setAccounts] = useState<any[]>([])`r`n  const [loading, setLoading] = useState(true)`r`n  const hasLoadedOnce = useRef(false)"

$old2 = "      setAccounts(mapped)rn    } catch (e) {rn      console.error(e)rn    } finally {rn      setLoading(false)rn      hasLoadedOnce.current = truern    }rn  }"
$new2 = "      setAccounts(mapped)`r`n    } catch (e) {`r`n      console.error(e)`r`n    } finally {`r`n      setLoading(false)`r`n      hasLoadedOnce.current = true`r`n    }`r`n  }"

if ($content -notmatch [regex]::Escape($old1)) { Write-Host "ANCHOR 1 NOT FOUND - stopping, no changes made"; exit 1 }
if ($content -notmatch [regex]::Escape($old2)) { Write-Host "ANCHOR 2 NOT FOUND - stopping, no changes made"; exit 1 }

$content = $content.Replace($old1, $new1)
$content = $content.Replace($old2, $new2)

Set-Content -LiteralPath $path -Value $content -NoNewline
Write-Host "Done - corrupted 'rn' text replaced with real line breaks"