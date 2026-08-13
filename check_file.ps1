$filePath = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\dashboard\customers\page.tsx"

if (Test-Path $filePath) {
    $size = (Get-Item $filePath).Length
    Write-Host "File exists. Size: $size bytes"
    $content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
    Write-Host "Characters read: $($content.Length)"
    Write-Host "Contains 'CustomersPage': $($content.Contains('export default function CustomersPage'))"
    Write-Host "Contains 'handleDelete': $($content.Contains('const handleDelete'))"
    Write-Host "Contains 'importMessage': $($content.Contains('importMessage'))"
} else {
    Write-Host "FILE DOES NOT EXIST AT THIS PATH"
}