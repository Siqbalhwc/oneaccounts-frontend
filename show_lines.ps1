$lines = Get-Content 'src\app\api\inventory\adjustments\route.ts'
for ($i = 65; $i -le 90; $i++) {
    Write-Output ("{0}: [{1}]" -f $i, $lines[$i])
}