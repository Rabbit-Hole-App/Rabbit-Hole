# C03 · Contextual states and arrow labels

Branch `explain/composition-c03-r2` at `4dd3fe85f27231134b5fe28fb2c2315f13a156ac`, including arrow-label commit `06e5b4c5057e9557e20cab1dd65d03b38450a362`.

The contextual-state reference uses a teaching matrix. [CLS], we, read, and [SEP] keep their rows across the lookup and both computed layers. The changed-state colour follows “read” from (2, 0) to (2, 3) to (5, 8). With the toy causal mask, it goes from (2, 0) to (2, 1) to (3, 2).

## Relationship diagrams

| Reference | Brief labels | Balanced labels | Detailed labels |
| --- | ---: | ---: | ---: |
| `ml-transformer-encoder-decoder-memory` | 5 | 5 | 5 |
| `ml-transformer-positionwise-feedforward` | 6 | 6 | 6 |

The two relationship diagrams still show unfilled boxes and more than three lines below the picture because the current renderer lists the arrow labels there. Claude Code is handling the rendering change.

## Compact token counts

Counts use compact `{id, spec}` with `cl100k_base`. A slash separates authored and parser-completed counts.

| Reference | Brief | Balanced | Detailed | Detailed companion | Author single |
| --- | ---: | ---: | ---: | ---: | ---: |
| `ml-transformer-cross-attention-alignment` | 114 | 149 | 111 / 110 | 145 | — |
| `ml-transformer-context-rules` | 104 | 236 | 245 | 127 | 105 |
| `ml-transformer-encoder-decoder-memory` | 191 | 191 | 194 | — | — |
| `ml-transformer-contextual-layer-states` | 234 | 238 | 242 | 245 | — |
| `ml-transformer-positionwise-feedforward` | 229 | 228 | 235 | — | — |
| `ml-transformer-original-decoder-sublayers` | 213 | 224 | 230 | — | — |

## Verification

- The replay against the C01/C02 carryover moved zero existing first picks or planner kinds across 3,057 catalogue and 474 saved cases. All 105 tranche prompt-depth cases reached their intended reference. [Replay](planner-replay.json) · [New prompts](new-prompts.md)
- All 17 affected tests passed, including independent layer recomputation, the production author request, the lazy library accessor, and the full SVG fingerprint check. All 22 visual payloads passed the content contract and token limit. The scoped linter reported zero findings. [Token checks](tokens.json) · [Relationship label inventory](relationships.json)
- The arrow-label commit changed 18 scoped snapshots. The matrix changed its three registered snapshots. [Snapshot changes](snapshot-changes.json)
- The aged renderer still draws a repeat bracket through the ×6 marker on the reused decoder-sublayers card. [Preview layout](preview-layout.json) · [Typeset sheet](contact-sheet.html)

![C03 contact sheet at 408 px per diagram](contact-sheet.png)
