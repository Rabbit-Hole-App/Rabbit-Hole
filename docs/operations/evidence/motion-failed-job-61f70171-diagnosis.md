# Failed production Motion job: diagnosis (integrator, 2026-10-25 ~9:55 PM PT). READ-ONLY; no generation was submitted.

Job: `61f701710ba30bfa591a992844509c0d` (owner-only acceptance job, "15s explain photosynthesis", 16:9). Action `act-c0f759ed-5ce7-4b65-bce0-028745e2c5c1`.

## Evidence (production, read-only)
| Fact | Value | Source |
|---|---|---|
| Deployed code | Worker 629251d4 (R1b, build b9375cd27b266e37); orchestrator + renderer 32d86ee7 (ceiling US$2.00 per job from MOTION_JOB_CEILING_USD in fly.orchestrator.toml); renderer hash 02d5069eeb4d | release receipts |
| Start / end | 2026-10-26 03:54:44 UTC to 04:05:34 UTC (about 10 min 50 s; orchestrator log: started 03:54:51Z, failed 04:05:26Z, 635 s) | usage_actions; orchestrator logs |
| Orchestrator log line | `job 61f70171...: failed (calls 3, cost 1.278157, bound 1.278157, renders 1)` | `fly logs -a rabbit-hole-motion-orchestrator --no-tail` |
| Orchestrator policy | `9 calls and 3300 s per job, the production policy; hold per job from the worker's grant` | same log |
| Model calls sent | 3 (limit 9) | log |
| Actual known cost | US$1.278157 (cost_state settled) | usage_attempts |
| Unknown reservations | none (bound == cost) | log |
| Remaining ceiling | US$2.00 - 1.278157 = US$0.721843 | arithmetic |
| Renders | 1 | log |
| Worker hold | US$8.96 reserved, then released | usage_attempts.reserved_micros |
| User debit | 1,278,157 micros = 127.8 credits ("Used 128 credits"), charge_class `would_charge`, attempt status `failed`, cost_state `settled` | usage_actions / usage_attempts |
| A second action 3 s later | feature `render`, `motion_renderer`, charge_class `free`, completed (the render attempt, free) | usage_actions |

## What the cause is, and how sure
- NOT the overall timeout: 635 s against a 3,300 s limit.
- NOT the call count: 3 of 9.
- NOT the account allowance: the Worker hold (US$8.96) fit and was released; the account balance was not exhausted.
- NOT unknown cost bounds: bound equals cost.
- The orchestrator's two `cause: 'limit'` paths are `job.timedOut` and `job.refusal` (orchestrator.mjs:412-413). The first is excluded by the numbers, so this was a `job.refusal`, set by `refuse()` (orchestrator.mjs:304) when a call's conservative bound exceeds what is left of THIS JOB's ceiling: `need > left` at line 321-322 (`the next step (<stage>) could cost up to $X, more than the $Y left of this job's $2.00`). With US$0.72 left of the US$2.00 acceptance ceiling the next paid step's bound (the lane measured that the Author call alone prices near US$1.3 at its output ceiling, and any review/repair step is bounded similarly) did not fit.
- CERTAINTY: strong by elimination and by the log numbers, but the exact `job.refusal` string and the stage name are NOT in the logs: `refuse()` does not log, the orchestrator holds job state in memory and autostopped at 04:07:08Z, and the Worker's job object is only readable with the orchestrator bearer. I could not read `failure_reason`, `cause` or `spend.refused` directly. This is itself a diagnosability gap to fix (log every refusal reason with job id and stage).
- Last completed stage / next refused stage: not recoverable from logs (3 calls and 1 render completed; the next call was refused). Reusable checkpoint: unknown; no rendered output was delivered. The orchestrator job store is not durable across its autostop, so there is no checkpoint to resume from.

## Why this happened (design cause)
The per-job ceiling for the acceptance window (US$2.00) was set to protect the US$2.00 production-acceptance reserve. Measured model spend for jobs that complete is US$0.71-1.12 (15 s) and 1.76 (30 s) WITH repairs; this job spent 1.278 before its next step and the conservative next-call bound exceeds the remaining 0.72. The Motion lane warned in advance that "the ceiling could make a job that needs a repair fail rather than overspend". The user-facing message ("This video reached its AI spending limit.") comes from learn-video.js mapping every `cause: 'limit'` to that sentence; a ceiling/policy refusal is not an exhausted allowance.

## Charging (the important finding)
The learner WAS charged: US$1.278157 settled as 127.8 credits on a FAILED attempt (`charge_class would_charge`). "Reservation released" refers to the US$8.96 hold, not a refund. This failure was caused by OUR configured per-job acceptance ceiling (a configuration failure), which the zero-credit policy should treat as free, but the `limit` classification bypasses the zeroCredit rule. Provider expense (US$1.278157 on the production Anthropic key) is real and has been recorded in the shared validation ledger as `motion-prod-accept-1`.

## Do NOT click "Generate again"
The same unchanged ceiling would predictably refuse the same step again; it would also spend more real money and charge more credits. Recommended recovery: (1) fix classification + zero-credit treatment + refusal logging + preflight/recovery eligibility (lane started), (2) raise the acceptance-window per-job ceiling to the measured/validated bound (proposal: US$3.00, the long-standing per-job validation bound, which fits with a small margin only after the budget increase is approved), (3) refund the 127.8 credits idempotently and auditably through the existing refund path (owner command, prepared after the fix), (4) then one new confirmed attempt.
