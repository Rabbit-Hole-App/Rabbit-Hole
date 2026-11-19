# GEN-1 example pool 2 · Batch B stage roles

Source commit `a580aa22a1f4328a3c6b3ce8fefc01c9ef9a2e2e` adds stage roles to the three plain stacks on `explain/gen-1-pool-2`.

| Reference | `changed` | `output` |
| --- | --- | --- |
| `pool-pop-up-toaster-stages` | Bread browns in the chamber. The detailed caption gives 69 of 90 seconds. | Toast pops up. |
| `pool-mesh-and-paper-water-filter` | The mesh and paper remove grit. | The collection cup receives the filtered water with 15 mg of grit remaining. |
| `pool-parcel-sorting-line` | The sorting station or route chute redirects the parcel. | The dispatch cart receives the routed parcel. |

The 7 m measurement covers the stretch between the scanner and chute. The captions and measurements match the prior views. The nine revised views retain their native 408 px bounds and the stacks have no skip lanes or joins.

## Compact tokens

Authored and parser-completed `{id, spec}` counts agree at each depth, measured with `cl100k_base`.

| Reference | Overview | Standard | Detailed |
| --- | ---: | ---: | ---: |
| `pool-pop-up-toaster-stages` | 100 | 125 | 137 |
| `pool-mesh-and-paper-water-filter` | 92 | 130 | 137 |
| `pool-parcel-sorting-line` | 91 | 121 | 136 |

## Checks

- Passed 17 focused tests for the pool data, renderer and lazy registry, plus the full SVG fingerprint test. The update regenerated nine fingerprints for the three stacks at 320, 408 and 720 px.
- The reference linter reported zero errors and zero warnings. All nine specs passed the content contract and author schema checks.
- The production replay compared 3,099 catalogue cases and 474 saved planner cases. Zero existing first picks or planner kinds moved, and all nine Batch B prompt and depth combinations selected their intended stack. [Replay](replay.json)

[Token and schema checks](tokens.json) · [Role and label changes](reference-changes.json) · [Snapshot changes](snapshots.json) · [408 px dimensions](preview-layout.json) · [Detailed comparison](role-comparison.png)

![Batch B stage roles at 408 px per view](contact-sheet.png)

[Original block-stack inventory and tensor schema review](https://github.com/Rabbit-Hole-App/Rabbit-Hole/tree/62d70bf70/docs/features/explain/checks/codex/explain/gen-1-pool-2/batch-b)
