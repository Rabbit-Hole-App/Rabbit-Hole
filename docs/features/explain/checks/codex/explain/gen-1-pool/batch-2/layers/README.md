# GEN-1 Batch 2 · Layers

The `layers` commit is `d327924c29688324f8af3dcfc93c657475724a29` on `explain/gen-1-pool` based on main `8837d4a19`. Each reference has one diagram at each depth with the kind-only schema bundle.

| Depth | Eligible before | Eligible after |
| --- | ---: | ---: |
| Overview | 1 | 3 |
| Standard | 1 | 3 |
| Deep | 1 | 3 |

## Compact `{id, spec}` token counts

| Reference | Overview | Standard | Detailed |
| --- | ---: | ---: | ---: |
| `pool-hilltop-park-map-layers` | 108 | 106 | 129 |
| `pool-raspberry-cocoa-slice-layers` | 77 | 103 | 143 |

## Verification

- All 3 data and reference tests and all 506 focused checks passed.
- The planner replay found zero changed picks across 3,096 existing prompt-depth cases and 474 saved planner cases. All 6 new prompt-depth cases selected their intended references and kind.
- The snapshot update added 6 IDs for the new references. The contact sheet uses the existing renderer at 408 px.

[408 px contact sheet](contact-sheet.png) · [Per-depth verification](verification.json)
