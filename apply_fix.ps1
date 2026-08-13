$filePath = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\app\dashboard\invoices\new\page.tsx"
$backupPath = "$filePath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

$content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText($backupPath, $content, [System.Text.Encoding]::UTF8)

$old1 = @'
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import RecordHistory from "@/components/RecordHistory"
import { usePlan } from "@/contexts/PlanContext"
import EntityPicker from "@/components/entity-picker/EntityPicker"
'@

$new1 = @'
import { generateInvoicePDF } from "@/lib/pdf/invoicePDF"
import RecordHistory from "@/components/RecordHistory"
import { usePlan } from "@/contexts/PlanContext"
import EntityPicker from "@/components/entity-picker/EntityPicker"
import { useTheme } from "@/contexts/ThemeContext"
'@

$old2 = @'
  const { hasFeature } = usePlan()
  const showProducts = hasFeature("inventory")
  const taxEnabled = hasFeature("tax_management")
  const automationFeatureEnabled = hasFeature("invoice_automation")
'@

$new2 = @'
  const { hasFeature } = usePlan()
  const showProducts = hasFeature("inventory")
  const taxEnabled = hasFeature("tax_management")
  const automationFeatureEnabled = hasFeature("invoice_automation")
  const { theme: themeMode } = useTheme()
  const isDark = themeMode === "dark" || themeMode === "oneaccounts"
'@

$old3 = @'
        {flash && (
          <div style={{ background: "var(--card)", border: "1px solid #065F46", color: "#6EE7B7", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={16} /> {flash}
            {savedInvoiceId && !editId && <button className="inv-btn" style={{ marginLeft: 8, borderColor: "#ECFDF5", color: "#ECFDF5" }} onClick={() => router.push(`/dashboard/invoices/${savedInvoiceId}`)}><ExternalLink size={14} /> View Invoice</button>}
          </div>
        )}
'@

$new3 = @'
        {flash && (
          <div style={{ background: isDark ? "var(--card)" : "#ECFDF5", border: isDark ? "1px solid #065F46" : "1px solid #10B981", color: isDark ? "#6EE7B7" : "#065F46", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={16} /> {flash}
            {savedInvoiceId && !editId && <button className="inv-btn" style={{ marginLeft: 8, borderColor: isDark ? "#ECFDF5" : "#065F46", color: isDark ? "#ECFDF5" : "#065F46" }} onClick={() => router.push(`/dashboard/invoices/${savedInvoiceId}`)}><ExternalLink size={14} /> View Invoice</button>}
          </div>
        )}
'@

$allFound = $true
if ($content.Contains($old1)) { $content = $content.Replace($old1, $new1); Write-Host "Step 1 of 3: OK" } else { Write-Host "Step 1 of 3: NOT FOUND"; $allFound = $false }
if ($content.Contains($old2)) { $content = $content.Replace($old2, $new2); Write-Host "Step 2 of 3: OK" } else { Write-Host "Step 2 of 3: NOT FOUND"; $allFound = $false }
if ($content.Contains($old3)) { $content = $content.Replace($old3, $new3); Write-Host "Step 3 of 3: OK" } else { Write-Host "Step 3 of 3: NOT FOUND"; $allFound = $false }

if ($allFound) {
    [System.IO.File]::WriteAllText($filePath, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Invoice saved message contrast fixed. Backup saved at $backupPath"
} else {
    Write-Host "ERROR: One or more blocks not found. No changes were written. Please tell Claude which steps said NOT FOUND."
}