$path = "src\app\dashboard\settings\budgets\page.tsx"
$backup = "$path.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
[System.IO.File]::Copy($path, $backup)
Write-Host "Backup created: $backup"

$content = [System.IO.File]::ReadAllText($path)
$originalContent = $content

$old = @'
        ) : (
          // Month view (unchanged)
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Month view will show after data loads.</div>
        )}
      </div>
    </div>
  )
}
'@

$new = @'
        ) : (
          // Month view (unchanged)
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Month view will show after data loads.</div>
        )}
      </div>

      {showRejectModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div style={{
            background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14,
            width: "100%", maxWidth: 480, padding: 24,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <AlertTriangle size={18} color="#EF4444" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Reject Budget</h3>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
              Please explain what needs correction. This will be shown to the person who submitted the budget.
            </p>
            <textarea
              value={rejectComment}
              onChange={e => setRejectComment(e.target.value)}
              placeholder="e.g. Islamabad Utilities budget seems too high, please review"
              rows={4}
              style={{
                width: "100%", padding: 10, borderRadius: 8, border: "1.5px solid var(--border)",
                background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", resize: "vertical",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn-outline" onClick={() => { setShowRejectModal(false); setRejectComment("") }}>Cancel</button>
              <button
                className="btn-primary"
                style={{ background: "#EF4444" }}
                onClick={handleReject}
                disabled={!rejectComment.trim() || rejecting}
              >
                {rejecting ? "Rejecting..." : "Reject Budget"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
'@

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Added reject modal"
} else {
    Write-Host "NOT FOUND"
}