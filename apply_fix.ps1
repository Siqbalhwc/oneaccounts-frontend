$path = "src\app\dashboard\products\new\page.tsx"
$content = Get-Content $path -Raw

$old1 = '  const [category, setCategory] = useState("")'
$new1 = "  const [category, setCategory] = useState(`"`")`n  const [unit, setUnit] = useState(`"PCS`")"

$old2 = '          setCategory(product.category || "")'
$new2 = "          setCategory(product.category || `"`")`n          setUnit(product.unit || `"PCS`")"

$old3 = '      category: category.trim() || null,'
$new3 = "      category: category.trim() || null,`n      unit: unit,"

$old4 = @'
            <div style={{ marginBottom: 16 }}>
              <label className="label">Category (optional)</label>
              <input className="input" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Cabinet Handles, Cabinet Knobs" />
            </div>
'@
$new4 = @'
            <div style={{ marginBottom: 16 }}>
              <label className="label">Category (optional)</label>
              <input className="input" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Cabinet Handles, Cabinet Knobs" />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">Unit of Measurement</label>
              <select className="input" value={unit} onChange={e => setUnit(e.target.value)}>
                <option value="PCS">Pieces (PCS)</option>
                <option value="KG">Kilogram (KG)</option>
                <option value="Gram">Gram</option>
                <option value="Liter">Liter</option>
                <option value="Meter">Meter</option>
                <option value="Yard">Yard</option>
                <option value="Dozen">Dozen</option>
                <option value="Box">Box</option>
                <option value="Carton">Carton</option>
                <option value="Set">Set</option>
                <option value="Pair">Pair</option>
                <option value="Roll">Roll</option>
                <option value="Bag">Bag</option>
                <option value="Ton">Ton</option>
              </select>
            </div>
'@

$checks = @(
    @{old=$old1; label="state declaration"},
    @{old=$old2; label="edit-load"},
    @{old=$old3; label="submit payload"},
    @{old=$old4; label="form field"}
)
$allGood = $true
foreach ($c in $checks) {
    $count = ([regex]::Matches($content, [regex]::Escape($c.old))).Count
    if ($count -ne 1) {
        Write-Host "SAFETY CHECK FAILED on $($c.label): expected 1 match, found $count." -ForegroundColor Red
        $allGood = $false
    }
}

if (-not $allGood) {
    Write-Host "No changes made." -ForegroundColor Red
} else {
    $content = $content.Replace($old1, $new1).Replace($old2, $new2).Replace($old3, $new3).Replace($old4, $new4)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: file updated." -ForegroundColor Green
}