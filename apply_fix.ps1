$path = "src\app\dashboard\reports\page.tsx"
$content = Get-Content -LiteralPath $path -Raw

$old = '{ title: "Budget vs Actual",     desc: "Compare budget to actual by activity", icon: <ClipboardList size={24} />, href: "/dashboard/reports/budget-vs-actual", color: "#0F9D58" },'
$new = @'
{ title: "Budget vs Actual",     desc: "Compare budget to actual by activity", icon: <ClipboardList size={24} />, href: "/dashboard/reports/budget-vs-actual", color: "#0F9D58" },
    { title: "P&L Analysis",         desc: "Profit & Loss by day, product or customer", icon: <Activity size={24} />,      href: "/dashboard/reports/pl-analysis",     color: "#EC4899" },
'@

if ($content -notmatch [regex]::Escape($old)) { Write-Host "ANCHOR NOT FOUND - stopping, no changes made"; exit 1 }

$content = $content -replace [regex]::Escape($old), $new
$content = $content -replace 'import \{ Scale, TrendingUp, BarChart3, BookOpen, Users, Truck, Calendar, FileText, ClipboardList, LineChart \} from "lucide-react"', 'import { Scale, TrendingUp, BarChart3, BookOpen, Users, Truck, Calendar, FileText, ClipboardList, LineChart, Activity } from "lucide-react"'

Set-Content -LiteralPath $path -Value $content -NoNewline
Write-Host "Done - card and icon import added"