# GEN-1 Batch 2 · Transformation

The `transformation` commit is `41376bca8afaf29fb0646f260fc7ceb2732b2058` on `explain/gen-1-pool` based on main `8837d4a19`. Each reference has one diagram at each depth with the kind-only schema bundle.

| Depth | Eligible before | Eligible after |
| --- | ---: | ---: |
| Overview | 10 | 11 |
| Standard | 3 | 4 |
| Deep | 2 | 3 |

## Compact `{id, spec}` token counts

| Reference | Overview | Standard | Detailed |
| --- | ---: | ---: | ---: |
| `pool-fixed-border-thumbnail-crop` | 140 | 141 | 144 |

## Verification

- All 2 data and reference tests and all 507 focused checks passed.
- The planner replay found zero changed picks across 3,102 existing prompt-depth cases and 474 saved planner cases. All 3 new prompt-depth cases selected their intended references and kind.
- The snapshot update added 3 IDs for the new references. The contact sheet uses the existing renderer at 408 px.

[408 px contact sheet](contact-sheet.png) · [Per-depth verification](verification.json)
