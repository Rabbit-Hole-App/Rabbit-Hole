# CI and release speed lane: parked (not candidates, owner's call later)

## P-CI-001: Firefox/WebKit engine-library install on fast-e2e shard 5 (about 160 s)
Seen in probe (b) (one-file web change, fast-e2e 42106618072): shard 5 decided the wall time (6.6 min) because the embed checks install the Firefox and WebKit engine libraries on each run. A cacheable cost. Not a candidate. Owner 2026-11-05.

## P-CI-002: two flaky fast-e2e checks that each cost a 15-minute rerun
- `project-menu` ("a new tab opened"), first attempt of fast-e2e run 41997063688 on d3bfea9be (the W1 flip). The failure waited 8 h 01 min for a rerun; the rerun passed.
- `explain-back-sketch` (`TimeoutError`, 0/0 after 31 s, shard 5), first attempt of fast-e2e run 42114874686 on 1c3f73d9c (feat/ci-gate-attest-2). The same check passed on 9853b58a7 (run 42109586563) and on 44ac75f04 (run 42103316294). The change under test touches only the end of run-part.sh, after the checks.
Rule applied: the integrator reruns only the failed shard at once, never overnight. Worth a look later, not now. Owner 2026-11-05.
