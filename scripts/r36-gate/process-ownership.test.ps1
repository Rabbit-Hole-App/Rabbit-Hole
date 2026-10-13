$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'process-ownership.ps1')
$start = [datetime]'2026-10-13T01:00:00Z'
function ProcessFixture([int]$Id,[int]$Parent,[int]$Seconds) {
  [pscustomobject]@{ProcessId=$Id;ParentProcessId=$Parent;CreationDate=$start.AddSeconds($Seconds)}
}
$snapshot = @(
  (ProcessFixture 100 50 0),
  (ProcessFixture 200 100 1),
  (ProcessFixture 300 200 -60), # unrelated orphan whose old parent PID was reused
  (ProcessFixture 400 200 2),
  (ProcessFixture 500 100 1), # observer and its children must stay outside cleanup
  (ProcessFixture 600 500 2)
)
$ids=Get-ObservedProcessIds -Snapshot $snapshot -RootPid 100 -ObserverPid 500
if (($ids.Keys | Sort-Object) -join ',' -ne '100,200,400') { throw "Incorrect ownership: $($ids.Keys -join ',')" }
Write-Output 'PASS creation-time ancestry rejects stale parent PID and observer children'
