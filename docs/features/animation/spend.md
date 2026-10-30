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
| 6 | 3:06 PM | G acceptance.mjs | watch: failed | claude-opus-5-5 | 3 calls, repairs 0 | US$1.9549 | US$0.1452 | US$0.1452 (3 model call(s); 6 render(s), platform, US$0) | - | US$1.4074 | US$1.5290 |
| 7 | 3:06 PM | G acceptance.mjs | experiment: failed (the plan stage ended failed: preparing/provider_unavailable: Animations are temp) | claude-opus-5-5 | 1 calls, repairs 0 | US$1.9549 | US$0.0000 | US$0.0000 (1 model call(s)) | - | US$1.4074 | US$1.5290 |
| 8 | 3:06 PM | G acceptance.mjs | fresh: failed (the plan stage ended failed: preparing/provider_unavailable: Animations are temp) | claude-opus-5-5 | 1 calls, repairs 0 | US$1.9549 | US$0.0000 | US$0.0000 (1 model call(s)) | - | US$1.4074 | US$1.5290 |
| 9 | 3:46 PM | G acceptance.mjs | watch: ready | claude-opus-5-5 | 3 calls, repairs 0 | US$1.9549 | US$0.1971 | US$0.1971 (3 model call(s); 6 render(s), platform, US$0) | `1e1e25e715157251` | US$1.6045 | US$1.7261 |
| 10 | 3:48 PM | G acceptance.mjs | experiment: failed | claude-opus-5-5 | 4 calls, repairs 1 | US$1.9549 | US$0.2564 | US$0.2564 (4 model call(s); 6 render(s), platform, US$0) | - | US$1.8609 | US$1.9825 |
| 11 | 3:50 PM | G acceptance.mjs | fresh: failed | claude-opus-5-5 | 2 calls, repairs 0 | US$1.9549 | US$0.2315 | US$0.2315 (2 model call(s); job diagnostics say US$0.0254) | - | US$2.0924 | US$2.2140 |
| 12 | 3:58 PM | G acceptance.mjs | experiment: ready | claude-opus-5-5 | 5 calls, repairs 1 | US$2.1949 | US$0.3396 | US$0.3396 (5 model call(s); 12 render(s), platform, US$0) | `da7d7f0ed8fa2e96` | US$2.4320 | US$2.5536 |
| 13 | 3:58 PM | G acceptance.mjs | fresh: failed (the plan stage ended failed: preparing/transport/invalid_turn: The plan was not ) | claude-opus-5-5 | 1 calls, repairs 0 | US$2.1949 | US$0.0263 | US$0.0263 (1 model call(s)) | - | US$2.4583 | US$2.5799 |
| 14 | 4:05 PM | G acceptance.mjs | fresh: failed | claude-opus-5-5 | 3 calls, repairs 0 | US$2.4749 | US$0.4169 | US$0.4169 (3 model call(s); 6 render(s), platform, US$0; job diagnostics say US$0.2950) | - | US$2.8752 | US$2.9968 |

Total provider: US$2.8752. Total ledger (incl. reserves): US$2.9968. Reserved in flight: US$0.00. Remaining: US$7.0032.
