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
| 15 | 4:11 PM | G acceptance.mjs | fresh: failed | claude-opus-5-5 | 5 calls, repairs 1 | US$2.5949 | US$0.5059 | US$0.5059 (5 model call(s); 12 render(s), platform, US$0) | - | US$3.3811 | US$3.5027 |
| 16 | 4:17 PM | G acceptance.mjs | fresh: ready | claude-opus-5-5 | 3 calls, repairs 0 | US$2.5949 | US$0.2735 | US$0.2735 (3 model call(s); 6 render(s), platform, US$0) | `0831533567091007` | US$3.6546 | US$3.7762 |

| 17 | 2026-10-31 7:56 PM | owner try-it (preview, launcher user) | experiment (pendulum 0.1-5 m): failed (rounds, review: short swing not visible) | claude-opus-5-5 | 5 calls, repairs 1 | - | US$0.3303 | US$0.3303 (dev usage_attempts for the launcher user; 12 render(s), platform, US$0) | - | US$3.9849 | US$4.1065 |
| 18 | 2026-10-31 8:31 PM | owner try-it (preview, launcher user) | experiment (pendulum 0.5-3 m): ready | claude-opus-5-5 | 3 calls, repairs 0 | - | US$0.1834 | US$0.1834 (dev usage_attempts for the launcher user; 6 render(s), platform, US$0) | (job aj_da0909b3) | US$4.1683 | US$4.2899 |
| 19 | 9:22 PM | G acceptance.mjs | experiment: failed | claude-opus-5-5 | 5 calls, repairs 1 | US$2.5949 | US$0.4063 | US$0.4063 (5 model call(s); 12 render(s), platform, US$0) | - | US$4.5746 | US$4.6962 |
| 20 | 9:23 PM | G acceptance.mjs | watch: failed | claude-opus-5-5 | 3 calls, repairs 0 | US$2.5949 | US$0.1701 | US$0.1701 (3 model call(s); 6 render(s), platform, US$0; job diagnostics say US$0.1028) | - | US$4.7447 | US$4.8663 |
| 21 | 9:25 PM | G acceptance.mjs | game: ready | claude-opus-5-5 | 5 calls, repairs 1 | US$2.5949 | US$0.3015 | US$0.3015 (5 model call(s); 12 render(s), platform, US$0) | `d500849cd1b5ea2b` | US$5.0462 | US$5.1678 |
| 22 | 9:59 PM | G acceptance.mjs | experiment: ready | claude-opus-5-5 | 3 calls, repairs 0 | US$2.5949 | US$0.1779 | US$0.1779 (3 model call(s); 6 render(s), platform, US$0) | `718c0ff2f3acdf37` | US$5.2241 | US$5.3457 |
| 23 | 10:01 PM | G acceptance.mjs | watch: ready | claude-opus-5-5 | 3 calls, repairs 0 | US$2.5949 | US$0.1674 | US$0.1674 (3 model call(s); 6 render(s), platform, US$0) | `9c31d0e86dfab505` | US$5.3915 | US$5.5131 |
| 24 | 2026-11-01 7:44 PM | owner try-it (preview, launcher user) | game (launch a ball at a target): failed (rounds: crash repaired, then review rejected the framing) | claude-opus-5-5 | 4 calls, repairs 1 | - | US$0.4852 | US$0.4852 exact: dev usage_attempts for the launcher user, 4 settled calls (brief 43,040 + author 149,935 + repair 156,058 + review 136,148 micros = 485,181), the same as the job diagnostics; 6 render(s), platform, US$0 | (job aj_283c19f) | US$5.8767 | US$5.9983 |
| 25 | 2026-11-01 9:00 PM | owner try-it (preview, launcher user) | game (launch a ball at a target, retry on 30eac64c6): failed (rounds: review rejected the framing, run repair restored a dropped program, review rejected again) | claude-opus-5-5 | 6 calls, repairs 2 | - | US$0.7692 | US$0.7692 exact: dev usage_attempts for the launcher user, 6 settled calls (brief 41,760 + author 193,027 + review 100,601 + repair 189,582 + repair 155,768 + review 88,482 micros = 769,220), the same as the job diagnostics | (job aj_9229023) | US$6.6459 | US$6.7675 |
| 26 | 9:25 PM | G acceptance.mjs | ownergame: failed | claude-opus-5-5 | 5 calls, repairs 2 | US$3.5462 | US$0.7498 | US$0.7498 (5 model call(s); 6 render(s), platform, US$0) | - | US$7.3957 | US$7.5173 |
| 27 | 9:27 PM | G acceptance.mjs | ownerpendulum: ready (the result could not be placed: invalid_result: ref.artifactId) | claude-opus-5-5 | 6 calls, repairs 2 | US$3.5462 | US$0.2807 | US$0.2807 (6 model call(s); 12 render(s), platform, US$0) | `18a064c972c47453` | US$7.6764 | US$7.7980 |
| 28 | 2026-11-01 9:39 PM | owner try-it (preview, launcher user, canvas-910b08d0) | experiment (pendulum length and swing): ready (job aj_bd6fc64) | claude-opus-5-5 | 3 calls, repairs 0 | - | US$0.1788 | US$0.1788 exact: dev usage_attempts, 3 settled calls (brief 32,252 + author 77,515 + review 68,993 micros = 178,760); added 2026-11-02 in the ledger reconciliation | (job aj_bd6fc64) | US$7.8552 | US$7.9768 |
| 29 | 2026-11-01 9:41 PM | owner try-it (preview, launcher user, canvas-910b08d0) | game (token on a 3 by 3 grid): ready after one repair (job aj_a11dc34) | claude-opus-5-5 | 5 calls, repairs 1 | - | US$0.3368 | US$0.3368 exact: dev usage_attempts, 5 settled calls (brief 16,860 + author 72,251 + review 65,890 + repair 124,850 + review 56,966 micros = 336,817); added 2026-11-02 in the ledger reconciliation | (job aj_a11dc34) | US$8.1920 | US$8.3136 |
| 30 | 2026-11-01 9:52 PM | owner try-it (preview, launcher user, canvas-910b08d0) | experiment (SGD, the owner's prompt): failed (rounds: the repair-request size check twice, FX-AN-026) | claude-opus-5-5 | 3 calls, repairs 1 | - | US$0.4416 | US$0.4416 exact: dev usage_attempts, 3 settled calls (brief 45,712 + author 242,995 + repair 152,902 micros = 441,609); added 2026-11-02 in the ledger reconciliation | (job aj_41cfeac) | US$8.6336 | US$8.7552 |

"Exact" here is the dev ledger's settled cost: the provider's reported token usage at the list price (not an invoice). A reserve is
an estimate held before a call and released when it settles.

Reconciliation 2026-11-02 (all /animation calls in the dev ledger, every user, attempt ids `animation-*`, since 2026-10-30): 108 model
calls, settled US$8.633597, plus one unsettled reserve of US$0.121590 (row 1, never sent). Rows 1-30 sum to the same within
rounding (US$8.6336): rows 28-30
were three owner preview runs that had not been logged. Renders are platform compute and are not in these totals.

Total provider: US$8.6336. Total ledger (incl. reserves): US$8.7552. Reserved in flight: US$0.00. Remaining: US$1.2448.
