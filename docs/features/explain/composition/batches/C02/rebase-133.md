# C01 and C02 — release-133 rebase receipt

Task: `a97894d9-db7b-4af3-8a7d-35c2d0114221` (continuation). Base: **a8ef11d64995c1e1bd1784ec9c8840b1af0b6a36**. Both rebases completed without conflicts. The C02 branch contains C01 followed by C02, preserving content-spec-first order. All authored reference specs, toy-data modules and keywords are byte-identical to their approved originals; main's additional registry entries remain present. No renderer, schema, author-prompt or tooling changes.

## Published data commits

| Branch | Content-spec commit | Data commit |
|---|---|---|
| `explain/composition-c01-r1` | `ed586cbcec41b6eae079714e2e623f57f4f80218` | `11adf988ac02aa3dfed7f265caf6f3909de6b8bd` |
| `explain/composition-c02-r1` | `1c357f824c428839b052f6f2d53bff732ff222f8` | `f5d6d7c74ae7db42cb741584b039d6d04536758f` |

C02 has a following documentation-only commit containing this receipt and the complete failure classification. Git transport still lacks credentials. Connected GitHub publication produced new commit identities, and every published tree was checked against its local counterpart. The original C02 branch was fast-forwarded from `343d91f8a` to **07371644349e7d82a515707a0155ffc96998de6e**, whose tree **c3e4339299c510c614bbf32d206dec3f89ff015e** exactly matches local `66cfd0288`. No force-push or branch rename occurred.

## Fresh offline replay

| Candidate | Prior baseline | Prior cases | Changed picks | New source checks |
|---|---|---:|---:|---:|
| C01-r1 | release 133 | 2,865 | **0** | **12/12** |
| C02-r1 | C01-r1 on release 133 | 2,937 | **0** | **21/21** |

[C01 receipt](r1-c01-replay.json) · [C02 receipt](r1-c02-replay.json). These use the existing coverage/selector path with deterministic source-kind JEV plans, at all three depths. No live planner calls. The expanded baselines include main's new what-is-machine-learning references.

## Fresh test results and remaining assertions

| Candidate / suite | Passed | Failed | Skipped | Log |
|---|---:|---:|---:|---|
| C01-r1: composition, renderer, content, snapshots and single variants | 101 | **2** | 0 | [C01](r1-c01-tests.txt) |
| C02-r1: original focused suite | 91 | **1** | 0 | [C02 focused](r1-c02-focused-tests.txt) |
| C02-r1: single-variant suite separately | 33 | **1** | 0 | [C02 variants](r1-c02-single-variants.txt) |

1. **Changed reference data:** `packages/web/src/tutor-diagrams/reference-single-variants.test.mjs:17`, `assert.equal(parents.length, 33)`. C01-r1 produces **37** and C02-r1 **43**; both have **33** linked singles. All four C01 and six C02 parent references are unlinked. The next assertion, line 18, compares the actual parent-id and linked-variant-id sets, so changing the count alone is insufficient. This is a real integration gap, not a load or timing failure. No test assertion was weakened or suppressed.
2. **Rendered snapshot data after number formatting:** `packages/web/src/tutor-diagrams/svg-snapshots.test.mjs:25`, `assert.equal(changed.length, 0)`. C01-r1 has **3** changed fingerprints: `ml-regularization-regularized-objective/{320,408,720}`. C02-r1 has **6**, adding `ml-attention-scaled-score-normalization/{320,408,720}`. Release 133 changes decimal presentation inside panels; authored specs and numeric inputs are unchanged. These are fixture assertions on the changed references under the new renderer, not load/timing failures. Original approved contact sheets and snapshot receipts remain the pinned-1944 evidence; they are not claimed as refreshed render acceptance on 133.

The historical sparse-lane broad run is separately inventoried in [broad-suite-failures.md](broad-suite-failures.md), with a [machine-readable summary](broad-suite-summary.json): **351 failures across 298 files**, including **122 dependency loads** (one provisional highlighter cause), **228 source/fixture loads**, **0 timing failures** and the single-variant assertion above. All failure rows reconcile to the raw log; the historical suite is not passing evidence. Several missing loads block catalog, selector or snapshot coverage in the reference directory itself.

**Release gate:** Claude Code owns suites, property count and replay zero. `ponytail:` no smoke, build, full-suite rerun, provider call, stack run, deployment, single-variant authoring, snapshot regeneration or renderer/schema/tooling changes were performed for this rebase/report request. The two assertion families above remain open for integration disposition. C03 has not started.
