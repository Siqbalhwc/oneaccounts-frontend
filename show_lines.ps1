$lines = Get-Content 'src\app\dashboard\suppliers\new\page.tsx'
for ($i = 230; $i -le 275; $i++) {
    Write-Output ("{0}: [{1}]" -f $i, $lines[$i])
}