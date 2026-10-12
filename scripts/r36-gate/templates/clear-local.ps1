param([Parameter(Mandatory=$true)][ValidateSet('bundle', 'journey')][string]$Target)
$ErrorActionPreference = 'Stop'
$taskGateRoot = [IO.Path]::GetFullPath('@@GATE_ROOT@@')
$taskCandidate = [IO.Path]::GetFullPath('@@APP_ROOT@@')
if ($Target -eq 'bundle') {
  $taskBoundary = Join-Path $taskCandidate 'packages/web'
  $taskTarget = Join-Path $taskBoundary 'dist-prodcheck'
} else {
  $taskBoundary = Join-Path $taskGateRoot 'lp1h/ws'
  $taskTarget = Join-Path $taskBoundary 'local'
}
$taskBoundary = [IO.Path]::GetFullPath($taskBoundary)
$taskTarget = [IO.Path]::GetFullPath($taskTarget)
if (-not $taskTarget.StartsWith($taskBoundary + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Cleanup target is outside its declared boundary.' }
if (Test-Path -LiteralPath $taskTarget) {
  $taskResolved = (Resolve-Path -LiteralPath $taskTarget).Path
  if ($taskResolved -ne $taskTarget) { throw 'Cleanup target does not resolve to the exact declared target.' }
  $taskCursor = $taskTarget
  while ($taskCursor -and $taskCursor.Length -ge $taskBoundary.Length) {
    if ((Get-Item -LiteralPath $taskCursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Cleanup refuses a reparse point.' }
    $taskCursor = Split-Path -Parent $taskCursor
  }
  Remove-Item -LiteralPath $taskTarget -Recurse -Force
}
