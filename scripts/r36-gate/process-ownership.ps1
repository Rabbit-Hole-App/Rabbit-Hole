function Get-ObservedProcessIds {
  param([object[]]$Snapshot, [int]$RootPid, [int]$ObserverPid)
  $byId = @{}
  foreach ($process in $Snapshot) { $byId[[int]$process.ProcessId] = $process }
  if (-not $byId.ContainsKey($RootPid)) { throw 'Observed root is missing' }
  $ids = @{$RootPid=$true}
  do {
    $added = $false
    foreach ($process in $Snapshot) {
      $parentId = [int]$process.ParentProcessId
      if ($process.ProcessId -eq $ObserverPid -or $ids.ContainsKey([int]$process.ProcessId) -or -not $ids.ContainsKey($parentId)) { continue }
      # A stale ParentProcessId can now belong to a different, younger process.
      # PID adjacency alone must never authorize cleanup of that older orphan.
      if ($process.CreationDate -lt $byId[$parentId].CreationDate) { continue }
      $ids[[int]$process.ProcessId]=$true
      $added=$true
    }
  } while ($added)
  return $ids
}
