# ILL-2 order 2: planner time distribution (numbers only; no code or config changed)

Planner = the TypeSafe jev call (explanation-planner.js, PLANNER_TIMEOUT_MS = 1200 at :12). A call that reaches the limit is aborted and logged `explanation_planner_failed` with the elapsed ms. That call is CENSORED: its true answer time is unknown. Consequence: no completed call in any live source can exceed about 1200 ms, so "share over 1,500 / 2,000 / 2,500 ms" is 0 by construction everywhere the limit was 1200. The only measure of the slow tail is the timeout rate (second table). The shares are still shown, as ordered.

## Completed calls (the planner answered)
| source | n | p50 ms | p90 | p99 | max | > 1,200 | > 1,500 | > 2,000 | > 2,500 |
|---|---|---|---|---|---|---|---|---|---|
| 8878 archive, /explain cards (request.command explanation), plan.ms, Nov 15 to Nov 18 (this is the real-use sample) | 22 | 161 | 263 | 708 | 708 | 0 | 0 | 0 | 0 |
| 8878 app logs, explanation_author_raw attempt 0 plan.ms | 20 | 133 | 263 | 708 | 708 | 0 | 0 | 0 | 0 |
| offline planner bench jev-planner/2026-11-09T0221 (Nov 8, quiet machine) | 70 | 141 | 246 | 439 | 439 | 0 | 0 | 0 | 0 |
| offline planner bench jev-planner/2026-11-09T0225 (same day) | 70 | 86 | 158 | 449 | 449 | 0 | 0 | 0 | 0 |
| offline planner bench jev-planner/v2-20261108 | 70 | 90 | 152 | 253 | 253 | 0 | 0 | 0 | 0 |
The log row and the archive row are the same cards seen twice (not independent). The 22 archive values, sorted: 64, 79, 80, 82, 88, 88, 100, 115, 133, 156, 161, 182, 183, 191, 192, 206, 215, 228, 262, 263, 357, 708. The 92 other archive records are v2 job-flow records (request.class, no planner call): excluded.

## Timeouts (the censored calls)
| source | calls | timed out | share | abort ms |
|---|---|---|---|---|
| 8878 archive, /explain cards | 23 | 1 (the ILL-2 card, 16:07 PT Nov 18) | 4.3 % | 1352 |
| 8878 app logs (explanation_planner_failed vs completed attempt-0) | 21 | 1 (the same event) | 4.8 % | 1352 (reason timeout) |
| VAR-1 bench, 626 delivered-card runs (Nov 18 13:30 to 14:37 PT, planner on for every run) | 626 | 1 | 0.16 % | 1205 |
| SAME-1 measurement, 156 runs (Nov 18 about 14:05 to 14:45 PT) | 156 | 0 | 0 % | - |
| offline planner bench jev-planner (3 files, Nov 8) | 210 | 0 | 0 % | - |
So: 2 timeouts in 1,015 live or bench planner calls; the 8878 sample is 1 in 23.

## What the timestamps allow (busy vs quiet)
- The abort took 1352 ms on 8878 and 1205 ms in the bench, against a limit of 1200: the abort fired 152 ms late on 8878 and 5 ms late in the bench. A 152 ms overshoot means the process could not run its timer on time, i.e. the machine (or the stack's event loop) was busy at that moment; the bench call was on an idle loop. That is the only direct load evidence in the data.
- Load by time (the lane work is known from this session: GEN-1, kinds-fit and NUM-2 lanes ran from about 15:20 PT, START-2 and previews after, the VAR-1 rerun 14:19 to 14:37 with SAME-1 in parallel 14:30 to 14:45). 8878 archive calls before 13:30 PT on Nov 18 (13 completed, 64 to 262 ms) ran while no lanes were building; the one failed call is at 16:07 PT, with lanes running. That is one busy-window call, so the busy rate cannot be estimated beyond "1 of 1". The 8878 log lines carry no timestamps, so nothing finer can be split without guessing.
- During the busy VAR-1 and SAME-1 bench windows (several processes at once) the planner still timed out 1 time in 782 calls, so in that window the rate was 0.13 %.

## Sources, exactly
8878 archive: local R2 (C:/s/spec/owner-local/persist/local/v3/r2), 115 explain-archive records. 8878 logs: 108 *app.log files in C:/s/spec/owner-local/persist (lines carry no timestamps; file mtimes 2026-11-15 to 2026-11-18). Bench: C:/s/sprint2-evidence/var-1-bench/results.jsonl and results-combined.jsonl (`events` keeps explanation_planner_failed), C:/s/film-evidence/docs/features/explain/checks/same-1/measure/results.jsonl, C:/s/spec/benchmarks/jev-planner/*/rows.json (`ms` per plan). Scripts: C:/s/gen1-prep/planner-ms.mjs, planner-arch2.mjs.
Not available: a live planner sample with a limit above 1200 ms (so the real tail beyond 1200 is unknown); per-line timestamps in the 8878 logs; the production archive (not queried).
