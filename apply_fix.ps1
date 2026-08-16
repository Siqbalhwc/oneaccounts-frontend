$path = "src\app\dashboard\settings\budgets\page.tsx"
$backup = "$path.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
[System.IO.File]::Copy($path, $backup)
Write-Host "Backup created: $backup"

$content = [System.IO.File]::ReadAllText($path)
$originalContent = $content

$old = @'
          {/* Approve / Reject / Send for Approval button */}
          {viewMode === "gl" && selectedProjectId && canEditBudget && budgetStatus !== "approved" && (
            <div style={{ display: "flex", gap: 8 }}>
              {budgetStatus === "draft" && (
                <button
                  className="btn-outline"
                  onClick={handleSubmitForApproval}
                  disabled={!monthlyVerified}
                  title={!monthlyVerified ? "Please review and confirm the monthly budget split before submitting" : ""}
                >
                  <Send size={14} /> Send for Approval
                </button>
              )}
              {isPendingApproval && role === "admin" && (
                <>
                  <button className="btn-outline" onClick={() => setShowRejectModal(true)} style={{ color: "#EF4444", borderColor: "#EF4444" }}>
                    <X size={14} /> Reject
                  </button>
                  <button className="btn-primary" onClick={handleApprove}>
                    <CheckCircle size={14} /> Approve Budget
                  </button>
                </>
              )}
            </div>
          )}
        </div>
'@

$new = @'
          {/* Approve / Reject / Send for Approval button */}
          {viewMode === "gl" && selectedProjectId && canEditBudget && budgetStatus !== "approved" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <div style={{ display: "flex", gap: 8 }}>
                {budgetStatus === "draft" && (
                  <button
                    className="btn-outline"
                    onClick={handleSubmitForApproval}
                    disabled={!monthlyVerified}
                  >
                    <Send size={14} /> Send for Approval
                  </button>
                )}
                {isPendingApproval && role === "admin" && (
                  <>
                    <button className="btn-outline" onClick={() => setShowRejectModal(true)} style={{ color: "#EF4444", borderColor: "#EF4444" }}>
                      <X size={14} /> Reject
                    </button>
                    <button className="btn-primary" onClick={handleApprove}>
                      <CheckCircle size={14} /> Approve Budget
                    </button>
                  </>
                )}
              </div>
              {budgetStatus === "draft" && !monthlyVerified && (
                <span style={{ fontSize: 11, color: "#F59E0B", fontWeight: 600, maxWidth: 260, textAlign: "right" }}>
                  Please review and confirm the monthly budget split (View by: Month) before submitting for approval.
                </span>
              )}
            </div>
          )}
        </div>
'@

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Added visible blocking message under Send for Approval"
} else {
    Write-Host "NOT FOUND"
}