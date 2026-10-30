# /animation spend ledger

Authorization: owner 2026-10-30 ~12:45 PM PT, decision A: **US$10.00 total** for `/animation` dev testing, separate from
every other feature budget (Explain, Explain-back, Motion and Image budgets are not transferable). Covers planning,
authoring, review and repair calls. Before any paid call, add its worst-case estimate to "reserved" below, including
calls running concurrently; at the cap, stop paid calls and continue unpaid work. No secrets, cookies or tokens here.

| # | Time (PT) | Agent | Purpose / case | Model | Stage calls | Estimate (worst case) | Actual | Artifact hash | Running total |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2:32 PM | G acceptance.mjs | watch: failed (the plan stage ended failed: preparing/internal: The animation stopped unexpecte) | claude-opus-5-5 | 1 calls, repairs 0 | US$1.9549 | US$0.1216 (ledger; 1 unsettled counted at their reserve) | - | US$0.1216 |
| 2 | 2:43 PM | G acceptance.mjs | watch: failed | claude-opus-5-5 | 5 calls, repairs 1 | US$1.9549 | US$0.4767 (ledger; 12 unsettled counted at their reserve) | - | US$0.5983 |
| 3 | 2:51 PM | G acceptance.mjs | watch: awaiting_approval (GET /api/learn/animation/jobs/aj_384a51628e4041508745cf2648583eb8: fetch failed) | claude-opus-5-5 | 1 calls, repairs 0 | US$1.9549 | US$0.2113 (ledger; 6 unsettled counted at their reserve) | - | US$0.8096 |
| 4 | 2:53 PM | G acceptance.mjs | experiment: failed | claude-opus-5-5 | 4 calls, repairs 1 | US$1.9549 | US$0.2417 (ledger; 6 unsettled counted at their reserve) | - | US$1.0513 |
| 5 | 2:56 PM | G acceptance.mjs | game: ready | claude-opus-5-5 | 5 calls, repairs 1 | US$1.9549 | US$0.3325 (ledger; 12 unsettled counted at their reserve) | `ff4c8c09c716c842` | US$1.3838 |

From 2026-10-30 (acceptance.next.mjs): provider charges and ledger counts are separate columns. The earlier rows' provider total is US$1.2622.

| # | Time (PT) | Agent | Case / outcome | Model | Calls | Worst case | Provider US$ | Ledger US$ (incl. reserves) | Artifact hash | Running provider total | Running ledger total |
|---|---|---|---|---|---|---|---|---|---|---|---|

Total provider: US$1.2622. Total ledger (incl. reserves): US$1.3838. Reserved in flight: US$0.00. Remaining: US$8.6162.
