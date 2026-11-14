# The two 30 s stalls of the chained runs: analysis (owner brief, 2026-11-14 10:05 PT, section 2)

Branch `st-q`. Evidence read from the clone (read-only GETs of the old jobs' `detail=1` diagnostics) and reproduced in-process. No clone deploy, no clone run.

## Verdict

The cause is **not proven**. What is proven, and what is ruled out, narrows it to one event: after the first alarm of the job ended, the 1 s wake alarm that should have resumed the job never ran, and the 30 s recovery alarm (armed at the start of the first alarm) resumed it instead. A second finding changes how the runs must be read: every chained row measured on the clone (`after`, `after2`) ran the chain with a bug that stopped it early, so the stalls were seen on a chain that was not the chain now on `design/fast-path`.

## 1. What the stalled rows look like

Stage durations in ms (from `diagnostics.timing.stages`; `design` is `design_authoring` then `design_verifying`):

| Set | Row | design_authoring | design_verifying | authoring | validating | rendering | msTotal |
|---|---|---|---|---|---|---|---|
| before (no chain) | brief 1 | 4261 | 1151 | **1000** | **1000** | **1000** | 8506 |
| before | all 9 rows | 4172 to 5702 | 1125 to 1151 | 1000 | 1000 | 1000 | 8380 to 9910 |
| after (chain, clone b5c98634) | brief 1 | 3320 | 548 | 0 | **1000** | 0 | 4973 |
| after | brief 2, detailed 1, 2, 3 | 3034 to 4110 | 187 to 206 | 0 | **1000** | 0 | 4405 to 5417 |
| after | **brief 3 (stalled)** | 3034 | 175 | 0 | **26722** | 0 | 30021 |
| after | **balanced 3 (stalled)** | 4343 | 198 | 0 | **25368** | 0 | 29991 |
| after2 (chain, same deploy) | 9 rows | 3023 to 6686 | 152 to 217 | 0 | **1000** | 0 | 4335 to 7969 |

Absolute times of the two stalled jobs (ms, from the job's marks):

| Job | submitted | first alarm start (firstFeedback) | validating began | result | result minus submitted |
|---|---|---|---|---|---|
| brief 3 `ej_2462197a` | 1794657504975 | 1794657505065 | 1794657508343 | 1794657535065 | **30090** |
| balanced 3 `ej_d4fbcc44` | 1794657543550 | 1794657543632 | 1794657548264 | 1794657573632 | **30082** |

`alarm()` in `packages/control-plane/src/explain-job.js` arms `setAlarm(Date.now() + 30000)` first, and `firstFeedback` is 82 to 90 ms after submit, so the recovery alarm of the first alarm falls at submitted + about 30.08 s. Both stalled jobs finished at exactly that time, and everything after the stall (validate, render, accept) ran in the same millisecond, which is how the stages read when one alarm runs them with the isolate clock frozen. So: **the alarm that resumed both jobs was the 30 s recovery alarm of the first alarm; the 1 s wake alarm set at the end of the first alarm did not run.**

## 2. The "normal" 1000 ms validating hop is a chain defect

In all 18 chained rows the `validating` stage lasts exactly 1000 ms, the wake delay. The chain was meant to run validate, render and accept in the first alarm. It stopped after `authoring` because the clone ran `751feda48`, whose check was `next.updatedAt === prev.updatedAt` (no progress): a 0 ms stage saves twice in the same millisecond, so the chain returned and the next alarm 1 s later ran validate, render and accept. The fix `23c023415` (`... && next.stage === prev.stage`) is on `on-c` and in `design/fast-path`, but **every chained clone run (`after`, `after2`, deploy `b5c98634`) predates it**. Consequences:

- The stalls were observed on a chain whose validate step always ran in the **second** alarm. The fixed chain runs validate in the **first** alarm, so what a confirming run measures is different from what was measured. In-process the fixed chain finishes a fast job in one alarm (brief, balanced: `design_authoring ... ready` in a single `alarm()`).
- The hop count of the stalled rows is the same as the normal rows (one hop of 1 s expected); the stall is the loss of that single hop.

## 3. Ruled out, with evidence

| Hypothesis | Why not |
|---|---|
| A deploy reset the Durable Object | Agent C compared deploy times: the nearest clone deploys were 11 to 13 minutes before the stalls (clone `b5c98634` at 11:47:21Z, agent A's at 11:45:25Z; stalls 11:58:25 to 11:58:55Z and 11:59:03 to 11:59:33Z). |
| The shadow judge of the previous job blocked the alarm | `ledger.msJudge` is 3.5 to 6.7 s for every job in the set (3848, 6210, 6059, 6746, 3458, 6169, 6196). Previous job detailed 2 was ready at +593.9 s and its judge ended near +601 s, the stalled brief 3 was submitted at +605.0 s; brief 3's judge ended near +640 s, balanced 3 was submitted at +643.6 s. No overlap, and a 4 to 7 s judge cannot make a 26 s stall. |
| Something about the job | The ledger rows of the stalled brief 3 and the normal brief 2 differ only in the plan hash, the judge fields and the timing; counts, settings, captures, the pick, the design cost and the build are the same. |
| An isolate that ran out of memory through leaked QuickJS runtimes or wasm memory | `runtime.js` disposes handles, context and runtime in `finally`, and the engine is one module-level instance. In-process, 36 chained jobs (12 per depth, the full job after approval, template build, headless run) show `external` memory flat at 21 to 23 MB and heap oscillating 55 to 126 MB with no trend, one alarm per job. A leak per job is not there. (This does not prove the Worker's 128 MB limit was never touched: node's heap includes the test stack.) |
| A headless-run `runtime_limit: time limit` (the check under load, seen by agent P on correct formulas) sent the job to a recovery or retry | In the stalled jobs `findings` holds only the accepted shadow review (`[{"round":0,"stage":"reviewing","accepted":true,"findings":[],"review":"shadow"}]`), `repairs` is 0, `repairCauses` is empty and `oracleFailed` is 0: no validate or run problem was ever recorded, so no time-limit failure happened. Mechanism, from the code: the program's limits are `interruptMs: 50` for one operation and `watchdogMs: 250` for the host's setup, both measured with `performance.now()` in `runtime.js` (`setInterruptHandler(() => interrupted ||= performance.now() > deadline)`). In Node (tests, scripts, a loaded machine) that is real wall-clock time, so scheduling delay counts and a correct plan can be refused: this is what agent P saw. In a Worker `performance.now()` does not advance during CPU-only work (the isolate clock moves only at I/O, which is also why the ledger's `msValidate`, `msRun`, `msCheck` read 0 on the clone), so the interrupt handler can never fire there and the limit is not hit by isolate scheduling. And a refusal does not go to a retry: for a template build `failWith` calls `stopWith(job, 'template_error', ...)`, a terminal fail-fast with the first problem's text, no repair loop and no recovery alarm; the stalled rows ended `ready`. |
| The alarm retry backoff | A throwing alarm would re-arm the recovery alarm at its own start (`setAlarm` is the first statement); the recovery alarm that fired is the one armed at the start of the **first** alarm. |
| A lost request-side wake | The driver only polls (GET); `wake()` is called only by create, approve, edit and retry. |

## 4. What is left

The 1 s wake at the end of the first alarm (`if (active) await this.wake(1000)`) did not produce an alarm in 2 of about 20 first-alarm ends (2 of 18 chained jobs; the unchained `before` set made 4 such hops per job, 36 in all, with none lost). Candidates, each consistent with the evidence, none proven:

1. **`wake()` skipped the `setAlarm`.** `wake` only sets the alarm when `getAlarm()` is empty or later than the new time. A stale alarm already due (the 30 s one when the handler ran long, or one set by a concurrent request) makes it skip; the platform then fires the recovery alarm. In both stalled rows the first alarm would have had to run until the recovery alarm was due, which the stage times (design done by 3.3 to 4.5 s) do not support, so this needs a second thing holding the first alarm open for about 26 s. Nothing in the data names it.
2. **The first alarm did not return normally** (the isolate was evicted or killed after the last save and before `wake`), and the platform's own recovery alarm resumed the job. This matches the exact 30.09 s, and explains why nothing after the last save is recorded. A kill after one stage of a chain is the only thing the chain adds over the unchained path (more work per invocation, the fill call, the template precheck and the build's headless run now share one alarm).
3. **A platform fault** (an alarm lost during a Durable Object restart). It would be rare and random, which 2 of 18 fits, and it would not depend on the chain at all; the unchained `before` set is too small (36 hops) to say it never happens there.

Hypotheses 2 and 3 cannot be told apart from stored data; hypothesis 1 can be excluded or confirmed by the trace added below.

## 5. What was changed

One diagnostic, no behaviour change: while `INTERACT_CHAIN=on`, `alarm()` writes one log line per alarm (`event: interact_alarm`): the milliseconds the alarm ran, `active`, each job it advanced with its stage before and after and the elapsed time at that point, the alarm armed just before `wake`, and `Date.now()`. With `wrangler tail` on the clone, a stall shows as one of three things: an alarm line with `ms` of about 26000 or more (a handler held open: hypothesis 1), a first alarm with no line at all (it never returned: hypothesis 2), or a complete first alarm line followed by a gap of about 30 s with `armed` earlier than `now` plus 1000 (a lost wake: hypothesis 3). No other code was changed: the chain stays off by default and there is no confirmed defect to fix.

## 6. What a confirmation run should do (3 per depth, chain on)

1. Deploy `design/fast-path` at or after `751feda48` **plus `23c023415`** (the fixed chain) with `INTERACT_CHAIN=on`. Runs on the older deploy do not test what ships.
2. Run `wrangler tail` against the clone and keep the output, filtered on `interact_alarm`.
3. Per row read `msTotal`: the fixed chain should finish a fast toss card in the first alarm, so about the design time plus a few hundred ms (about 3.5 to 5 s), with `validating` at 0 ms and no 1000 ms hop. A row with `validating` over 5 s, or a `msTotal` far above the sum of its stages, is a stall: read its alarm lines (section 5).
4. Run the nine rows back to back as before, and then once with a gap of 60 s between jobs. If stalls appear only back to back, the previous job's judge and the first alarm of the next job are the thing to look at (section 3 shows they did not overlap here, but the order of jobs in `storage.list` is the key order, not the time order).
5. If the stall does not reappear in 9 runs, that is consistent with hypothesis 3 or with the buggy chain only; it does not clear the chain, so keep `INTERACT_CHAIN` off until the trace explains one.

## Files

`packages/control-plane/src/explain-job.js` (the trace line in `alarm()`), this file. The scratch scripts that fetched the diagnostics and the in-process memory runs were not kept.
