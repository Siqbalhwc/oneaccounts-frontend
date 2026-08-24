$ErrorActionPreference = "Stop"
$path = "C:\Users\Shahid Iqbal\Desktop\OneAccounts\frontend\src\components\DashboardSidebar.tsx"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = "$path.backup_$timestamp"
Copy-Item $path $backup
Write-Host "Backup saved: $backup"

$content = [System.IO.File]::ReadAllText($path)

$oldAnchor = "  const navSections = [...baseNavSections]"

$newAnchor = @"
  let navSections = [...baseNavSections]

  // Construction has its own dedicated Investor Capital page under the
  // tag-management section below - the legacy standalone Investors page
  // (built originally for Trading, never used there either) should not
  // also appear under Accounting for Construction companies. Trading
  // and any other business type keep seeing it unchanged.
  if (businessType === 'construction') {
    navSections = navSections.map(section => {
      if (section.section !== 'ACCOUNTING') return section
      return {
        ...section,
        groups: section.groups?.map((g: any) => ({
          ...g,
          items: g.items.filter((item: NavItem) => item.href !== '/dashboard/investors'),
        })),
      }
    })
  }
"@

$matchCount = ([regex]::Matches($content, [regex]::Escape($oldAnchor))).Count
if ($matchCount -eq 1) {
    $content = $content.Replace($oldAnchor, $newAnchor)
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESS: Legacy Investors link hidden for Construction only." -ForegroundColor Green
} else {
    Write-Host "ABORT: Anchor line not found exactly once (found $matchCount times). No changes made." -ForegroundColor Red
}