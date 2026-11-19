# C03 · Transformer at release 164

This tranche comes from `68343e19d` and `b6346aacf`. The [C01 and C02 carryover](../../c01-c02-release-164-carryover.md) precedes it on `explain/composition-c03-r2` at base `a88949c27`.

| Reference | Change |
| --- | --- |
| `ml-transformer-cross-attention-alignment` | New source/target grids and the weighted context from the valid source values |
| `ml-transformer-context-rules` | New comparison and prior-memory probe, with an authored matrix single for the request schema |
| `ml-transformer-contextual-layer-states` | Teaching matrix comparing lookup and contextual values at the same named slots |
| `ml-transformer-encoder-decoder-memory` | Source prompt aliases, lesson `01`, and concise arrow labels |
| `ml-transformer-positionwise-feedforward` | Source prompt aliases and concise arrow labels |
| `ml-transformer-original-decoder-sublayers` | Source prompt aliases |

The reuse tests check each existing visual payload against its library definition. The new-reference tests recompute cross-attention, context permissions, and both bidirectional and causal slot updates from the data module. In the teaching matrix, the named tokens keep their rows. The changed-state styling follows the updated values at “read.” The source manifest traces the original prompts.

| Relationship reference | Brief labels | Balanced labels | Detailed labels |
| --- | ---: | ---: | ---: |
| `ml-transformer-encoder-decoder-memory` | 5 | 5 | 5 |
| `ml-transformer-positionwise-feedforward` | 6 | 6 | 6 |

Snapshots cover the new references and the revised relationship and slot-state views. The 408 px contact sheet, token table, replay, and verification results are available on `film/evidence`. [C03 review](https://github.com/Rabbit-Hole-App/Rabbit-Hole/tree/film/evidence/docs/features/explain/checks/codex/explain/composition-r2/c03)
