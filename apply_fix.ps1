$path = "src\app\dashboard\projects\page.tsx"
$backup = "$path.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
[System.IO.File]::Copy($path, $backup)
Write-Host "Backup created: $backup"

$content = [System.IO.File]::ReadAllText($path)
$originalContent = $content

$old = 'import { ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown, FileText, Check, X, Settings2 } from "lucide-react"'
$new = 'import { ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown, FileText, Settings2 } from "lucide-react"'

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Removed unused Check, X imports"
} else {
    Write-Host "NOT FOUND"
}