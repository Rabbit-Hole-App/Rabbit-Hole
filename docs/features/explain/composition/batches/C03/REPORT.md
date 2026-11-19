# C03 · Transformer at release 164

This tranche comes from `68343e19d` and `b6346aacf`. The [C01 and C02 carryover](../../c01-c02-release-164-carryover.md) precedes it on `explain/composition-c03-r2` at base `a88949c27`.

| Reference | Change |
| --- | --- |
| `ml-transformer-cross-attention-alignment` | New source/target grids and the weighted context from the valid source values |
| `ml-transformer-context-rules` | New comparison and prior-memory probe, with an authored matrix single for the request schema |
| `ml-transformer-contextual-layer-states` | New stack of contextual slots that keeps positions and feature widths |
| `ml-transformer-encoder-decoder-memory` | Source prompt aliases and lesson `01` |
| `ml-transformer-positionwise-feedforward` | Source prompt aliases |
| `ml-transformer-original-decoder-sublayers` | Source prompt aliases |

The reuse tests check each existing visual payload against its library definition. The new-reference tests recompute the cross-attention values and display rounding, padding, context permissions, and contextual slot shapes from the data module. The source manifest traces the original prompts.

The new snapshot entries cover the three newly registered references. The requested 408 px contact sheet, token table, replay, and verification results are available on `film/evidence`. [C03 review](https://github.com/Rabbit-Hole-App/Rabbit-Hole/tree/film/evidence/docs/features/explain/checks/codex/explain/composition-r2/c03)
