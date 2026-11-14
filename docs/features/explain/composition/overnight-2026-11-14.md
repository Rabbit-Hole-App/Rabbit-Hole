# Composition overnight report — 14 November 2026

The latest verified boundary is C04. C05 content planning is underway; subsequent batches remain subject to the same tests, prior-pick replay, token, linter and visual-sheet gates. All branches retain release133 `a8ef11d64995c1e1bd1784ec9c8840b1af0b6a36`. No force-push, branch rename, renderer/schema/tooling/author-prompt change, provider call or deployment.

| Batch | Branch | Pushed SHA | NEW / REUSE | Affected tests passed | Exact prior replay / moved | Maximum tokens | Snapshots added / changed / removed | Sheets Overview / Standard / Deep |
|---|---|---|---:|---:|---:|---:|---:|---:|
| [C01](batches/C01/fix-133/REPORT.md) | `explain/composition-c01-r1` | `bb5cc476c91033d4a469a0c98a360eb41e691119` | 4 / 0 | 1,307 | 2,865 / 0 | 298 | 0 / 3 / 0 | 4 / 4 / 8 |
| [C02](batches/C02/fix-133/REPORT.md) | `explain/composition-c02-r1` | `f9634af3c236b0d788a12389462227f9fe66dbd1` | 6 / 0 | 1,349 | 2,937 / 0 | 300 | 0 / 6 / 0 | 6 / 6 / 12 |
| [C03](batches/C03/REPORT.md) | `explain/composition-c03` | `b6346aacfa85dc789f1e31f3ecc4336d892791b9` | 3 / 3 | 1,361 | 3,048 / 0 | 234 | 9 / 0 / 0 | 6 / 6 / 9 |
| [C04](batches/C04/REPORT.md) | `explain/composition-c04` | [branch head](https://github.com/Rabbit-Hole-App/Rabbit-Hole/tree/explain/composition-c04) | 3 / 4 | 1,371 | 3,135 / 0 | 164 | 9 / 0 / 0 | 7 / 7 / 11 |

C02's six refreshed keys comprise its own three attention entries and three inherited C01 objective entries. No outside-id snapshot changed. C03 adds exactly three new ids at three widths; reused visuals are unchanged. Every reported affected test run has zero failures/skips; these totals cover all tutor-diagram tests and all reference-author suites, not the unrelated whole application. Original C02 push also landed at `07371644349e7d82a515707a0155ffc96998de6e` with the exact local `66cfd0288` tree and parent `343d91f8a`.

| Batch | Source/depth hits | Paraphrases | Actual prepared author schemas | Strict parent / single coverage | Linter applicable errors / warnings | Raw authorized filename exceptions |
|---|---:|---:|---|---:|---:|---:|
| C01 fix | 12 / 12 | original 60 / 60 | 72 primary | 37 / 37 | 0 / 0 | 2 |
| C02 fix | 21 / 21 | original 90 / 90 | 183 primary + 21 planned | 43 / 43 | 0 / 0 | 4 |
| C03 | 51 / 51 | 45 / 45 | 192 primary + 30 detail + 51 planned | 44 / 44 | 0 / 0 | 1 |
| C04 | 24 / 24 | 45 / 45 | 324 primary + 84 detail, including planned paths | 44 / 44 | 0 / 0 | 2 |

The ten required C01/C02 author singles now use the point-carrying existing leaf, the same computed data and inherited prompts/keywords/lessons. The strict parent-id set equality is unchanged. All token receipts include canonical compact cl100k_base counts and SHA-256 hashes. The raw composition-filename exceptions are preserved in reports; Claude Code owns their pipeline allowlist additions and release gating. No tooling exception was hidden by source changes.

## Expressibility list

- **C01:** per-neuron wiring and greyed cells inside panels are unavailable; symbolic block-stacks and computed zeroing carry the supported point. Basic bars cannot declare a shared numeric axis; matching-axis stems preserve the ReLU/dropout magnitude comparisons.
- **C02:** no additional kind gap remains after depth/figure splits. Existing vertical comparisons preserve readable full-size figures and the unchanged data-loss comparison.
- **C03 detailed architecture alias:** d2l Transformer Figure 01 requires existing embedding, encoder and decoder supporting views. The reused memory overview alone does not render that complete architecture. The manifest states this boundary and cites each supporting id.
- **C03 wiring:** a linear block-stack cannot draw arbitrary routed joins or every tokenwise inter-layer edge; the bounded shapes do not claim full real hidden vectors.
- **C03 roles:** token-links has fixed Source/Target/query labels that reverse the needed translation roles. Full-width heatmaps name target queries and source keys explicitly.
- **C03 layout:** dense ordered heatmap children are unreadable at 408 px. Native full-width views across depths carry the computation; numeric feature bars expose the weighted sum. No numeric text-box workaround or renderer change.

- **C04 independent paths:** native relationship graphs must be connected, while panels do not admit relationship children. The two modality paths use a native matrix and separate Deep block-stacks; no false fusion edge.
- **C04 encoder scope:** symbolic features and declared contextual outputs do not reproduce a real image backbone/BERT encoder. The fixed-CLS probe is conditional on already-encoded states.

## Failure disposition

`reference-single-variants.test.mjs:17` and the following strict set equality now pass through real author variants: C01 37/37, C02 43/43. `svg-snapshots.test.mjs:25` now passes with only the stated owned refreshes and zero removed entries. Both were correctness/data failures owned by these batches and have been fixed.

The original sparse application lane's [complete file/assertion inventory](batches/C02/broad-suite-failures.md) remains historical: 351 failures across 298 files, including 122 dependency loads (one provisional), 228 source/fixture loads, zero timing failures and the one now-fixed variant assertion. It is not represented as a green full-application run or as 351 unrelated timing tests. The inventory preserves each test file, exact load/assertion and classification. No unrelated application repair was folded into this work.

The previous wait-for-134 automation was paused after the owner authorized and received the release133 rebases. A read-only consolidated morning report is scheduled around 08:00 Pacific; it reads actual remote heads and final receipts without interrupting active authoring.
