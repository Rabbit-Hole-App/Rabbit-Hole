# Composition overnight report — 14 November 2026

The latest verified boundary is C09. C10 content planning is complete; subsequent batches remain subject to the same tests, prior-pick replay, token, linter and visual-sheet gates. All branches retain release133 `a8ef11d64995c1e1bd1784ec9c8840b1af0b6a36`. No force-push, branch rename, renderer/schema/tooling/author-prompt change, provider call or deployment.

| Batch | Branch | Pushed SHA | NEW / REUSE | Affected tests passed | Exact prior replay / moved | Maximum tokens | Snapshots added / changed / removed | Sheets Overview / Standard / Deep |
|---|---|---|---:|---:|---:|---:|---:|---:|
| [C01](batches/C01/fix-133/REPORT.md) | `explain/composition-c01-r1` | `bb5cc476c91033d4a469a0c98a360eb41e691119` | 4 / 0 | 1,307 | 2,865 / 0 | 298 | 0 / 3 / 0 | 4 / 4 / 8 |
| [C02](batches/C02/fix-133/REPORT.md) | `explain/composition-c02-r1` | `f9634af3c236b0d788a12389462227f9fe66dbd1` | 6 / 0 | 1,349 | 2,937 / 0 | 300 | 0 / 6 / 0 | 6 / 6 / 12 |
| [C03](batches/C03/REPORT.md) | `explain/composition-c03` | `b6346aacfa85dc789f1e31f3ecc4336d892791b9` | 3 / 3 | 1,361 | 3,048 / 0 | 234 | 9 / 0 / 0 | 6 / 6 / 9 |
| [C04](batches/C04/REPORT.md) | `explain/composition-c04` | `744d3103f20f2871539d228b0fb3d213fc82cf36` | 3 / 4 | 1,371 | 3,135 / 0 | 164 | 9 / 0 / 0 | 7 / 7 / 11 |
| [C05](batches/C05/REPORT.md) | `explain/composition-c05` | `cb53d5dce47115dfd9900b50d939cdd67d6e3a2f` | 4 / 0 | 1,390 | 3,204 / 0 | 295 | 12 / 0 / 0 | 5 / 5 / 8 |
| [C06](batches/C06/REPORT.md) | `explain/composition-c06` | `8f152b490c8be5d7f7f507db00249f809b093d6c` | 4 / 0 | 1,406 | 3,279 / 0 | 166 | 12 / 0 / 0 | 4 / 4 / 6 |
| [C07](batches/C07/REPORT.md) | `explain/composition-c07` | `48eb998162288fd55001c20639cc1d2aaa11b764` | 10 / 1 | 1,445 | 3,363 / 0 | 300 | 30 / 0 / 0 | 18 / 18 / 18 |
| [C08](batches/C08/REPORT.md) | `explain/composition-c08` | `28a33d2e2f1cd2e19c1110c7725f6788c2f2b5eb` | 4 / 0 | 1,465 | 3,594 / 0 | 298 | 12 / 0 / 0 | 7 / 7 / 7 |
| [C09](batches/C09/REPORT.md) | `explain/composition-c09` | [branch head](https://github.com/Rabbit-Hole-App/Rabbit-Hole/tree/explain/composition-c09) | 4 / 0 | 1,479 | 3,687 / 0 | 221 | 12 / 0 / 0 | 4 / 6 / 7 |

C02's six refreshed keys comprise its own three attention entries and three inherited C01 objective entries. No outside-id snapshot changed. C03 adds exactly three new ids at three widths; reused visuals are unchanged. Every reported affected test run has zero failures/skips; these totals cover all tutor-diagram tests and all reference-author suites, not the unrelated whole application. Original C02 push also landed at `07371644349e7d82a515707a0155ffc96998de6e` with the exact local `66cfd0288` tree and parent `343d91f8a`.

| Batch | Source/depth hits | Paraphrases | Actual prepared author schemas | Strict parent / single coverage | Linter applicable errors / warnings | Raw authorized filename exceptions |
|---|---:|---:|---|---:|---:|---:|
| C01 fix | 12 / 12 | original 60 / 60 | 72 primary | 37 / 37 | 0 / 0 | 2 |
| C02 fix | 21 / 21 | original 90 / 90 | 183 primary + 21 planned | 43 / 43 | 0 / 0 | 4 |
| C03 | 51 / 51 | 45 / 45 | 192 primary + 30 detail + 51 planned | 44 / 44 | 0 / 0 | 1 |
| C04 | 24 / 24 | 45 / 45 | 324 primary + 84 detail, including planned paths | 44 / 44 | 0 / 0 | 2 |
| C05 | 15 / 15 | 60 / 60 | 300 primary + 148 detail, including planned paths | 44 / 44 | 0 / 0 | 2 |
| C06 | 24 / 24 | 60 / 60 | 336 primary + 60 detail, including planned paths | 44 / 44 | 0 / 0 | 2 |
| C07 | 108 / 108 | 150 / 150 | 936 primary + 624 detail, including planned paths | 44 / 44 | 0 / 0 | 3 |
| C08 | 33 / 33 | 60 / 60 | 372 primary + 300 detail, including planned paths | 44 / 44 | 0 / 0 | 3 |
| C09 | 15 / 15 | 60 / 60 | 300 primary + 124 detail, including planned paths | 44 / 44 | 0 / 0 | 1 |

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

- **C05 gradients/insets:** no crossed-out gradient edge or arbitrary graph inset. An explicit detach node terminates backward signal; a separate full-width block-stack shows the cell mechanism. Intervals encode gradient-horizon extent rather than direction. Native relationship graphs preserve independent observed inputs without false flow edges.
- **C05 dense masks:** six state columns exceeded readable contact width. The same mask transposed to six rows/two sample columns fits native 408 px, retaining every cell.

- **C06 native widths/units:** grouped bars have a 420 px minimum, readable at the 408 px sheet scale. Probability and loss use separate figures. Observed-prefix tables retain the required causal boundary without an optional 444 px grid. Complete short raw body/lead fields preserve text and identity before formatting.

- **C07 compact sources:** legacy pooling/causal/QKV native widths524/604/686 exceed the intended contact layout. Full new bounded cases use four-key/two-query transposed grids, three causal positions and tiny declared QKV projectors; old payloads remain frozen.
- **C07 complete forks/grids:** keep all six joint values and three real named slices at native460, readable at408. A simultaneous local/recurrent/global three-grid panel would shrink cells, so native details span depths and every main retains the three-method computed hop comparison. No fabricated edge or discarded component.
- **C07 conditional scope:** recurrent state updates are an explicit scalar toy; packed layer inputs/projectors are supplied independently, with no computed inter-layer transition. Value-product details stay on the matching role route and use its actual base/probe values. Deep pair labels follow the B,A data permutation.

- **C08 lookup/plot grammar:** block-stack lookup functions run after their current block. Explicit IDs precede the fork/add, followed by a separate combined tensor and decoder repeat. Native420 plots and444 grids are readable at408; explicit sampled points support both normal and fast schemas. The effective plot domain allows five series, so four paired channels require no new primitive. Population normalization and fixed/learned lookup variants retain their declared toy limits; display-column order is not model equivalence.

- **C09 toy/provenance scope:** linear directional streams teach independent context and same-position concatenation, without claiming a gated LSTM or measured semantics. Task-depth weights and gamma remain distinct. The full aligned-output and layer-product points use native grids; synthetic feature/readout F1 is a declared calculation with supplied untrained heads, not empirical BERT performance or a universal pooling ranking.

## Failure disposition

`reference-single-variants.test.mjs:17` and the following strict set equality now pass through real author variants: C01 37/37, C02 43/43. `svg-snapshots.test.mjs:25` now passes with only the stated owned refreshes and zero removed entries. Both were correctness/data failures owned by these batches and have been fixed.

The original sparse application lane's [complete file/assertion inventory](batches/C02/broad-suite-failures.md) remains historical: 351 failures across 298 files, including 122 dependency loads (one provisional), 228 source/fixture loads, zero timing failures and the one now-fixed variant assertion. It is not represented as a green full-application run or as 351 unrelated timing tests. The inventory preserves each test file, exact load/assertion and classification. No unrelated application repair was folded into this work.

The previous wait-for-134 automation was paused after the owner authorized and received the release133 rebases. A read-only consolidated morning report is scheduled around 08:00 Pacific; it reads actual remote heads and final receipts without interrupting active authoring.
