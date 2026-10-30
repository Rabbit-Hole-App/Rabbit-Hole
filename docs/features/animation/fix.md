# /animation blockers and fixes

Linked from [the checklist](checklist.md). Plan: [2026-10-30-animation.md](../../superpowers/plans/2026-10-30-animation.md).
Entry format: plan section 13. Resolved entries keep their history and name the fixing SHA. Times are PT.

## Open

No blockers found at kickoff (2026-10-30).

## Resolved

### FX-AN-001 — /explain paid-call record overwritten after a refused call
- Task / phase: AN-05 (found while building animation-job.js); affects existing /explain
- First observed at full SHA / environment: main `ff0fff36ad919785d1924a2f5780b2f5838e7fa8`, fake-transport tests
- Actual behavior / expected behavior: explain-job.js `paidCall` keyed a call record by the role's call count; a refused
  call gives its count back, so the retried call reused the refused call's key, overwrote it, and the new record stayed
  `running` forever. Expected: one record per call, refused then settled.
- Evidence: control-plane `test/explain-provider-cap.test.js` "cap reached before generation" (fails on the old code)
- Severity: nonblocking (accounting record, no extra charge observed); blocks neither MVP nor production
- Owner / branch: lane G / `fix/explain-paidcall-key`
- Attempted fixes and outcome: key `${id}-${role}-${calls.length + 1}`; animation-job.js built with the same rule
- Next concrete action: ships with the animation integration branch (merged into `feat/animation`)
- Owner action needed: none
- Fixing full SHA: `f7aa8a8e28fad2ef622841044b8c6bd0cdb3b4d9`
- Validation result: explain + animation control-plane tests 228/228 on feat/animation; not deployed
- Status: fixed-unverified (not deployed)
