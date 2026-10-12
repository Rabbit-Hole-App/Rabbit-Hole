# Stops only processes launched with this copy's exact config paths and their descendants.
$ErrorActionPreference = 'Stop'
$taskGateRoot = '@@GATE_ROOT@@'
$taskCandidate = '@@APP_ROOT@@'
$taskScope = 'fork'
$taskSnapshot = @(Get-CimInstance Win32_Process)
$taskRoots = @($taskSnapshot | Where-Object {
  $taskCommand = ([string]$_.CommandLine).Replace('\', '/').ToLowerInvariant()
  $taskNode = $_.Name -in @('node.exe', 'workerd.exe')
  if ($taskScope -eq 'fork') {
    $taskMatch = $taskCommand -match ([regex]::Escape("$taskCandidate/packages/") + '(web/integ-(?:local|app)|control-plane/integ-local(?:-cp2)?)(?:-tw)?\.jsonc(?:["\s]|$)')
  } else {
    $taskMatch = $taskCommand.Contains("$taskGateRoot/lp1h/ws/cfg/".ToLowerInvariant())
  }
  $taskNode -and $taskMatch -and $_.ProcessId -ne $PID
})
$taskSelected = @{}
foreach ($taskProcess in $taskRoots) { $taskSelected[[int]$taskProcess.ProcessId] = $taskProcess }
do {
  $taskAdded = $false
  foreach ($taskProcess in $taskSnapshot) {
    if ($taskSelected.ContainsKey([int]$taskProcess.ParentProcessId) -and -not $taskSelected.ContainsKey([int]$taskProcess.ProcessId) -and $taskProcess.ProcessId -ne $PID) {
      $taskSelected[[int]$taskProcess.ProcessId] = $taskProcess
      $taskAdded = $true
    }
  }
} while ($taskAdded)
foreach ($taskProcess in @($taskSelected.Values | Sort-Object CreationDate -Descending)) {
  $taskCurrent = Get-CimInstance Win32_Process -Filter "ProcessId = $($taskProcess.ProcessId)" -ErrorAction SilentlyContinue
  if ($taskCurrent -and $taskCurrent.CreationDate -eq $taskProcess.CreationDate) {
    Stop-Process -Id $taskProcess.ProcessId -Force -ErrorAction SilentlyContinue
  }
}
Start-Sleep -Seconds 2
$taskListeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(8878, 8879) })
"Stopped $($taskSelected.Count) scoped processes; listening on 8878/8879: $($taskListeners.Count)"
if ($taskListeners.Count) { Write-Error 'Ports remain occupied; do not stop their owners by port. Resolve through the scheduler.'; exit 1 }
