# GEN-1 example pool · Batch 1

Branch `explain/gen-1-pool` at `9e5f7ba9bf81579951a36dc927734ef2263e7509`, based on `c56e4fcc8de12ab2fc114fc15c8bb1cbc0858993`. This batch adds ten references and thirty depth variants. Each variant passes the kind-only schema bundle check. All four kinds now have three eligible library references at each depth.

| Kind | Before per depth | After per depth | Commit |
| --- | ---: | ---: | --- |
| waterfall | 0 | 3 | `e4482698c7f4c3c82d681d56e520c79a570c448f` |
| t-account | 0 | 3 | `69d0f966ce98ca1fd73fcf3a22f75256028b9d33` |
| box-plot | 1 | 3 | `f0f87c1d090ee40fdda2c98e52a3a07065c0b849` |
| number-line | 1 | 3 | `9e5f7ba9bf81579951a36dc927734ef2263e7509` |

The snapshot update adds 30 IDs for the new references at 320, 408, and 720 px. The 408 px sheet includes all three depths. The Standard and Detailed trivia waterfalls fit their native 442 px renders proportionally into the 408 px columns.

## Token counts

Compact `{id, spec}` counted with `cl100k_base`. The largest is 188 tokens. The largest parsed entry is 204 tokens.

| Reference | Overview | Standard | Deep |
| --- | ---: | ---: | ---: |
| `pool-exhibit-tank-refill` | 79 | 78 | 86 |
| `pool-trivia-team-score` | 83 | 88 | 99 |
| `pool-apron-fabric-stock` | 80 | 82 | 91 |
| `pool-prepaid-recital-venue` | 113 | 127 | 125 |
| `pool-robotics-parts-payable` | 106 | 114 | 117 |
| `pool-orchard-packing-expense` | 121 | 135 | 137 |
| `pool-sunflower-tray-heights` | 134 | 172 | 188 |
| `pool-fired-tile-widths` | 143 | 154 | 161 |
| `pool-trailhead-elevation-offsets` | 97 | 108 | 107 |
| `pool-soundcheck-time-window` | 92 | 135 | 137 |

## Planner-kind replay

Zero plan or reference pick changes across 3,072 existing prompt-depth cases and 474 saved planner cases. All 30 new own-prompt depth cases independently selected their expected reference and resolved to its kind.

## Verification

- All 17 new data and reference tests passed. They independently check waterfall reconciliation, equal debit and credit totals in integer cents, quartiles and fences, and number-line positions and bounds.
- The focused suite passed 514 checks, including the new tests, reference integration, the content contract, and SVG fingerprints. The web build passed.
- The full web unit suite reported 7,356 passed, 37 skipped, 1 todo, and 1 failure. The board-link reader test in `packages/web/src/inline-ai-annotation.test.mjs` reports the same extra `tutor-diagrams/derived.js` match on the release base. The focused base reproduction used `node --test --test-name-pattern='every reader of board links' packages/web/src/inline-ai-annotation.test.mjs`.

[408 px contact sheet](contact-sheet.png) · [Planner replay](replay.json) · [Token counts and schema verification](verification.json)
