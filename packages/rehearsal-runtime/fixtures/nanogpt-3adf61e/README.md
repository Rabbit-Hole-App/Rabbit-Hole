# Fixture — karpathy/nanoGPT at 3adf61e (CPU, 20-minute budget)

Written by the Reviewer 2026-11-14 16:00 PT; **v2 17:10 PT after run2** (meta.pkl bound 500; alternatives matched by reason, not id; knob verification semantic) from the source at `3adf61e154c3fe3fca428ad6bc3818b27a3b8291` (every line number below was read on a clone at that commit; see `use-codebase-use-cases.md` §4). Destination in the repo: `packages/rehearsal-runtime/fixtures/nanogpt-3adf61e/` (spec §10). Lane C's `compare_record.py` scores a `record.json` against these four files and prints a pass/fail list; lane A's A2 run is accepted when every line passes or every miss is explained and accepted by the Reviewer.

| File | What it asserts | Matched against |
|---|---|---|
| `expected-route.json` | the discovered route: id, three steps with README commands and sources, rejected alternatives, knobs with types | `record.route` |
| `expected-fixes.json` | which fixes may / must appear given the image bakes only torch+numpy; what must not | `record.fixes` |
| `expected-traps.json` | three commands that must fail (configurator.py type check / split) and the knob command that must pass | `record.traps`, `record.knobsVerified` |
| `expected-files.json` | produced files with sizes, stdout contents per step, log-line counts, loss range, timing bounds | `record.steps[*].files`, logs |

## Matching rules (so the comparison is not brittle)
- Commands compare after collapsing whitespace. Flags in a different order pass.
- The train step's CPU flags may arrive either in the discovered command (README.md:85) or as an `add_flag` fix on top of README.md:48. Both pass; the record says which happened.
- `required` fixes are conditional on the image assumption; `expected-fixes.json` says how to read a zero-fix run.
- Timing: only the step timeout fails the fixture; measured times are recorded, not judged.
- Loss: first ≈ ln(65) ≈ 4.17; last < 2.2 passes; README's ~1.88 is the reference, not the bar.

## What a miss means
- Route miss (wrong routeId, a GPU route chosen) → discovery prompt or candidate pass; not the runner.
- A fix outside `allowed` → either the README was wrong in a way I did not record (report it; I update the fixture) or the agent over-fixed (bounds/prompt).
- A trap that passes → `configurator.py` changed; the commit is not `3adf61e`.
- File size off → wrong torch/pickle version only for `ckpt.pt`/`meta.pkl` (sizes are `bytesMin`); `train.bin`/`val.bin`/`input.txt` are exact and a mismatch means a different dataset download.

## Not in this fixture
GPU route, MPS, `finetune_shakespeare`, anything about the Tutor UI.
