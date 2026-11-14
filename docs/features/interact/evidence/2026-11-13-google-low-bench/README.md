# google-low on the clone: 18 runs (2026-11-13 evening)

**What this folder holds:** `runs/` (g1 to g9) and `runs-after-fix/` (f1 to f9): nine runs each of Brief, Balanced and Detailed through the real path with `INTERACT_BUILD_PROFILE=google-low` and `INTERACT_FALLBACK=off`, before and after the contract flatten fix `87ee7ce5d`.
Each run folder holds the plan card, the job detail (`job-*-final-full.json`) and `result.json`. None reached `ready` (0 of 18); first problems are listed in the report of that brief and in `benchmarks/ledger.jsonl` (`repairCauses`).

Ledger rows: the 18 rows with `profile=google-low` and `timing=v2` in `benchmarks/ledger.jsonl`. No launcher: nothing ready to open. Summary: `docs/features/interact/build-half.md`.
