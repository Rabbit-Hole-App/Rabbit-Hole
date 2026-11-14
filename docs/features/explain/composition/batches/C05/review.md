# C05 fresh read-only review — PASS

**Reviewed candidate:** `bce7f1af2c80342ec0861ee0c8c61fe09cb1dbee`  
**Canonical C04 base:** `744d3103f20f2871539d228b0fb3d213fc82cf36`  
**Initial data candidate:** `37f88858c146db35e7a9b9492b720b28e3a735e1`

No open **Important** or **Critical** defect found in the reviewed content/data changes. The final transpose fixes the known narrow-width mask defect without changing the underlying recurrence, schedules, availability bits, or other visuals.

## Scope and instructions

Read repository `AGENTS.md`, `CLAUDE.md`, `UI.md`, C05 content specs, the exact changed modules/tests/receipts, and all five source headings at source revision `05d5f02f64b474dcf0f830050af4e34907fbdaa8`. The candidate's `CLAUDE.md` matches `rabbit-hole/main`. Content commits `7701114eb`, `07ff6b821`, and `2605cc5f8` precede the first data commit; refinement `92d52ed43` precedes the final width correction. Existing native relationship, heatmap, timeline, block-stack, coordinate-plot, matrix, and bar-chart renderers are reused.

No repository mutation, network/provider call, install, build, browser automation, smoke, deploy, or subagent was performed by this review. The only written file is this report. Broad suites and bulk visual acceptance remain coordinator-owned.

## Source fidelity and associations

The manifest independently matches all four queued NEW families and all five source headings, including exact prompts, topics, representative lessons, alias metadata, and family lessons.

| Family / source | Source lessons | Family lessons |
|---|---|---|
| Gradient horizons / d2l-bptt 01 | `[]` | `[]` |
| Shared parameter gradients / d2l-bptt 02 | `[]` | `[]` |
| Recurrent update / d2l-rnn 01 | `[]` | `[]` |
| Next-token training / illustrated-bert 16 | `['01','15']` | `['01','15']` |
| Next-token training alias / d2l-rnn 02 | `[]` | `['01','15']` |

The source points are present across the authored depth views and details: continuous forward state versus stopped gradients; an unrolled shared parameter with both readout losses and loss/state dependencies; distinct observed input and prior state before activation/readout; and prefix/state/shifted-target training with a marked comparison. The cell mechanism uses the allowed full-width Standard companion. Existing depth merging correctly also inherits that companion into Overview; there are **17 explicit visuals and 18 resolved visuals**, without a resolver change.

## Independent verification executed

Exact data and reference modules were loaded from `git show` into in-memory modules. Independent objectives, central differences, explicit boundary comparisons, exact serialized-payload comparisons, receipt hashes, and native rendering were checked directly.

| Check | Evidence |
|---|---|
| Gradient horizons | Full/fixed/sample-A/sample-B final-loss reach counts are `6/2/1/4`. Every schedule preserves the independently recomputed forward state sequence. The detail graph retains forward `h4→h5`; backward `loss→h6→h5→Detach` terminates there, with no outgoing detach edge or `h5→h4` gradient edge. |
| Shared gradients | States are `0.5,1.25,2.625`; loss/state rows are `[0.5,1,null]` and `[0.25,0.5,1]`. Independent state perturbations agree with every defined sensitivity. Per-use terms `0.75+1.25=2` agree with a shared-parameter central difference of `2.0000000000630624`. Future dependencies remain null. |
| Activated update | Independent affine/ReLU/readout results are `(z,h,y)=(1.25,1.25,2.5)` and `(-1.375,0,0)`. Fresh-input, state-handoff, and readout edges remain distinct; inputs receive no fabricated computational edge. |
| Next-token objective | Both raw probability vectors normalize to 1; independently computed cross entropies are `0.556012399691389` and `0.5520806973651564`. Hidden-state loss derivatives and each loss's shared-parameter derivative agree with independent finite differences. Total shared derivative is `-0.2507118988762667`. Prefixes and targets align with observed `birds,cross,rivers`. |
| Teacher forcing | The observed next input `cross` gives state `2.625`; substituting hypothetical sampled `birds` would give `1.625`. Both values derive from the same first state and cell. The diagram preserves observed training inputs and targets and introduces no prediction-feedback edge or downstream-quality guarantee. |
| Final transpose | All 12 cells were independently reconstructed from the original sampled boundaries. Six earlier-state rows by two sample columns preserve the original bits. The mask now renders at native **408 px** for a 408 request; its receipt is **165 tokens** with matching SHA-256. |
| Native rendering | Exact-match preflight covered 34 renderer dependencies. All 18 resolved visuals fit a 680 request. All five relationship views render each declared node identity exactly once at 408 and 680. The existing coordinate-plot minimum remains 420 px for the update Deep view at a 408 request; it is recorded honestly, and the coordinator owns its accepted narrow-card visual evidence. |
| Token receipts | Recomputed compact `cl100k_base` counts and SHA-256 hashes match all 17 authored receipts. Maximum is **295**, within 300. Numerical data blobs are byte-identical between the initial and final candidates, so the independent numerical verification remains applicable. |
| Preservation | Exact registry evaluation against C04 confirms **474 old references** and **44 old singles** remain byte-equivalent after serialization; exactly four references are added. All 407 prior learner-keyword entries are unchanged. The final data diff changes no old reference/data/single/receipt/snapshot payload and no renderer/schema/prompt/tooling/dependency. |

Preserved-reference SHA-256: `68baed76fb2403a9317af48f9cfe6642da5fc8b5375a54cb51732802266fdd86`  
Preserved-single SHA-256: `40880b45a436521c255ece46abbc76550a6e7b3612e59ebcbb4593343679db32`

The four supplied narrow graph PNGs were also inspected: identities, edge legends, reciprocal arrows, and real detach termination are readable. The coordinator separately reported final transposed-mask visual acceptance, 1,390 passing full tests with no failures/skips, 3,204 prior picks with none moved, 300 primary plus 148 detail author schemas, and 12 added snapshots with none changed/removed. Those broad checks were not rerun by this reviewer.
