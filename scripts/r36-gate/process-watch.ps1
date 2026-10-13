param([Parameter(Mandatory=$true)][int]$RootPid,[Parameter(Mandatory=$true)][string]$LogBase)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'process-ownership.ps1')
$owned = @{}
$handles = @{}
$done = @{}
$rootIdentity = Get-CimInstance Win32_Process -Filter "ProcessId = $RootPid"
if (-not $rootIdentity) { throw 'Supervisor disappeared before observation' }
while (-not (Test-Path -LiteralPath "$LogBase.stop")) {
  $snapshot = @(Get-CimInstance Win32_Process)
  $currentRoot = $snapshot | Where-Object { $_.ProcessId -eq $RootPid }
  if (-not $currentRoot -or $currentRoot.CreationDate -ne $rootIdentity.CreationDate) { break }
  $ids = Get-ObservedProcessIds -Snapshot $snapshot -RootPid $RootPid -ObserverPid $PID
  foreach ($p in $snapshot) {
    if ($p.ProcessId -eq $RootPid -or -not $ids.ContainsKey([int]$p.ProcessId)) { continue }
    $key="$($p.ProcessId):$($p.CreationDate.ToUniversalTime().ToString('o'))"
    if (-not $owned.ContainsKey($key)) {
      $owned[$key]=@{pid=[int]$p.ProcessId; parent=[int]$p.ParentProcessId; name=$p.Name; created=$p.CreationDate.ToUniversalTime().ToString('o')}
      try { $h=Get-Process -Id $p.ProcessId; $null=$h.Handle; $handles[$key]=$h } catch {}
    }
  }
  foreach ($key in @($handles.Keys)) {
    $h=$handles[$key]
    try {
      if ($h.HasExited -and -not $done.ContainsKey($key)) {
        @{at=(Get-Date).ToUniversalTime().ToString('o');process=$owned[$key];exitCode=$h.ExitCode} | ConvertTo-Json -Compress -Depth 5 | Add-Content -LiteralPath "$LogBase.exits.jsonl"
        $done[$key]=$true
      }
    } catch {}
  }
  @($owned.Values) | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath "$LogBase.owned.json" -Encoding utf8
  @{at=(Get-Date).ToUniversalTime().ToString('o');freeMiB=[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1024);processes=@($snapshot | Where-Object { $ids.ContainsKey([int]$_.ProcessId) } | ForEach-Object { @{pid=$_.ProcessId;parent=$_.ParentProcessId;name=$_.Name;workingSetBytes=[long]$_.WorkingSetSize} })} | ConvertTo-Json -Compress -Depth 5 | Add-Content -LiteralPath "$LogBase.memory.jsonl"
  Start-Sleep -Seconds 2
}
# Retire only descendants this supervisor observed, with a fresh creation-time match.
# Graceful taskkill is attempted first; headless Windows children may require Stop-Process.
foreach ($entry in @($owned.Values | Sort-Object created -Descending)) {
  $current=Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.pid)" -ErrorAction SilentlyContinue
  if (-not $current -or $current.CreationDate.ToUniversalTime().ToString('o') -ne $entry.created) { continue }
  try { & taskkill.exe /PID $entry.pid 2>$null | Out-Null } catch {}
  Start-Sleep -Milliseconds 150
  $current=Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.pid)" -ErrorAction SilentlyContinue
  if ($current -and $current.CreationDate.ToUniversalTime().ToString('o') -eq $entry.created) {
    Stop-Process -Id $entry.pid -Force -ErrorAction SilentlyContinue
  }
}
@{at=(Get-Date).ToUniversalTime().ToString('o');cleanup='complete';observed=$owned.Count} | ConvertTo-Json -Compress | Add-Content -LiteralPath "$LogBase.exits.jsonl"
