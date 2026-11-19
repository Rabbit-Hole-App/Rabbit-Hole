# GEN-1 Batch 2 · Tensor

The `tensor` commit is `f83becfc61fe0ffde2659d607b9649f8466df007` on `explain/gen-1-pool` based on main `8837d4a19`. Each reference has one diagram at each depth with the kind-only schema bundle.

| Depth | Eligible before | Eligible after |
| --- | ---: | ---: |
| Overview | 0 | 3 |
| Standard | 0 | 3 |
| Deep | 0 | 3 |

## Compact `{id, spec}` token counts

| Reference | Overview | Standard | Detailed |
| --- | ---: | ---: | ---: |
| `pool-stereo-audio-frame` | 106 | 102 | 110 |
| `pool-granola-batch-ingredients` | 102 | 110 | 110 |
| `pool-booklet-press-pages` | 88 | 94 | 97 |

## Verification

- All 6 data and reference tests and all 504 focused checks passed.
- The planner replay found zero changed picks across 3,087 existing prompt-depth cases and 474 saved planner cases. All 9 new prompt-depth cases selected their intended references and kind.
- The snapshot update added 9 IDs for the new references. The contact sheet uses the existing renderer at 408 px.

[408 px contact sheet](contact-sheet.png) · [Per-depth verification](verification.json)
