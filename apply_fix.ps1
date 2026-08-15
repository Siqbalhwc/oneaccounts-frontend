$path = "src\app\dashboard\settings\budgets\page.tsx"
$backup = "$path.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
[System.IO.File]::Copy($path, $backup)
Write-Host "Backup created: $backup"

$content = [System.IO.File]::ReadAllText($path)
$originalContent = $content

$old = @'
            {/* Edit Budget button - only when not editing and user can edit */}
            {!editMode && canEditBudget && (
              <button className="btn-outline" onClick={() => setEditMode(true)}>
                <Edit size={14} /> Edit Budget
              </button>
            )}
'@

$new = @'
            {/* Edit Budget button - only when not editing and user can edit */}
            {!editMode && canEditBudget && (
              <button className="btn-outline" onClick={() => setEditMode(true)}>
                <Edit size={14} /> Edit Budget
              </button>
            )}
            {/* Locked message - shown when approved and current user is not admin */}
            {!editMode && !canEditBudget && isApproved && (
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                This budget is approved. Only an admin can edit it.
              </span>
            )}
'@

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Added locked-budget message for non-admins"
} else {
    Write-Host "NOT FOUND: The expected code block was not found. No changes made."
}