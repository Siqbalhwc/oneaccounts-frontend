$path = "src\app\dashboard\reports\page.tsx"
$content = [System.IO.File]::ReadAllText($path)
$old = 'ClipboardList } from "lucide-react"'
$new = 'ClipboardList, LineChart } from "lucide-react"'
if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Added LineChart import"
} else {
    Write-Host "NOT FOUND"
}