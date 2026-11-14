# Stepper composition review

**Source-only assessment · 2026-11-14 · independent composition reviewer.** Reviewed the nine hand-authored stepper references at `aa6a85b26`, their embedded `Scene` objects, authored models, companion composition JSON, shared drawing/UI kit and offline tests. This applies the numbered checks in [scene-composition-scorecard.md](../scene-composition-scorecard.md). No browser, rendered capture, model call or clone fit review was performed. These references do not implement production renderer parts, family admission or the proposed composition schema.

Yes below means the inspected source and executed checks support that specific teaching/data claim. It does not mean demonstrated learner understanding or visual acceptance. Q5, Q9 and Q10 remain **Unknown** for every card because their rendered or keyboard evidence is missing.

## Ten-check matrix

Q1 mechanism; Q2 holds aha; Q3 meaningful parameters; Q4 bindings; Q5 rendered 640 px fit; Q6 matching words; Q7 depth; Q8 computed values/one place; Q9 rendered legibility/control handling; Q10 Reset, boundaries and keyboard/focus.

| Actual reference | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 | Q7 | Q8 | Q9 | Q10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [overview-stepper-merge-sort.html](overview-stepper-merge-sort.html) | Yes | Yes | Yes | Yes | Unknown | Yes | Yes | Yes | Unknown | Unknown |
| [standard-stepper-merge-sort.html](standard-stepper-merge-sort.html) | Yes | Yes | Yes | Yes | Unknown | Yes | Yes | Yes | Unknown | Unknown |
| [deep-stepper-merge-sort.html](deep-stepper-merge-sort.html) | Yes | Yes | Yes | Yes | Unknown | Yes | Yes | Yes | Unknown | Unknown |
| [overview-stepper-tcp-handshake.html](overview-stepper-tcp-handshake.html) | Yes | Yes | Yes | Yes | Unknown | Yes | Yes | Yes | Unknown | Unknown |
| [standard-stepper-tcp-handshake.html](standard-stepper-tcp-handshake.html) | Yes | Yes | Yes | Yes | Unknown | Yes | Yes | Yes | Unknown | Unknown |
| [deep-stepper-tcp-handshake.html](deep-stepper-tcp-handshake.html) | Yes | Yes | Yes | Yes | Unknown | Yes | Yes | Yes | Unknown | Unknown |
| [overview-stepper-mitosis.html](overview-stepper-mitosis.html) | Yes | Yes | Yes | Yes | Unknown | Yes | Yes | Yes | Unknown | Unknown |
| [standard-stepper-mitosis.html](standard-stepper-mitosis.html) | Yes | Yes | Yes | Yes | Unknown | Yes | Yes | Yes | Unknown | Unknown |
| [deep-stepper-mitosis.html](deep-stepper-mitosis.html) | Yes | Yes | Yes | Yes | Unknown | Yes | Yes | Yes | Unknown | Unknown |

**Finding corrected before this assessment:** Overview merge sort originally highlighted two regions together at `split` and `halves`, failing Q7's one-changing-region rule. Root corrected the model, HTML and JSON before publication. The reviewed revision activates only `left`, `singles`, `mergeLeft`, then `output`; its callouts explain that the other half repeats the operation. The `halves` aha shows the computed ordered left run `[1,4]`. Reinspection, exact artifact comparisons and the new one-region regression support Q7 Yes; no exception or automatic pass was used.

## State and boundary coverage

All **92 state/variant cases** were exercised: merge sort 4 / 12 / 16, TCP 3 / 11 / 14, mitosis 4 / 12 / 16 across Overview / Standard / Deep. Default and Reset are index zero and option zero. Every state holds until navigation; the aha never advances automatically. Changing an option preserves the numeric index and clamps it to a shorter list, rather than preserving semantic state ids.

Aha states: merge sort `halves` / `finish` / `compare`; TCP `confirmed`; mitosis `anaphase`. Every active region, link and scalar callout anchor resolves. All nine embedded model objects equal their authored models; companion data equals the HTML data.

## Evidence by subject and depth

The shared kit binds the rail to `variant.states`/`inputs.step`, the fixed picture to declared regions/links and `state.active`, the anchored callout to `state.calloutRegion`/`state.sentence`, and measurements to `state.readouts`. Standard/Deep add the previous-state ghost; Deep adds `state.why` and the completed-state trace. Every active region, link endpoint and callout anchor resolves. All nine embedded HTML model objects were compared with the authored `buildScene` output; each companion JSON's variants match the HTML data exactly. The actual drawing marks are generated from those same states, not from detached illustrative values.

| Subject/depth | Teaching and control evidence | Values, words and depth evidence |
| --- | --- | --- |
| Merge sort / Overview | Fixed `[4,1,3,2]` isolates splitting from ordered small runs; no parameter is needed. `halves` is the aha, highlighting only Merge left. | Named Input, halves, Singles, merges and Sorted output match the concept/callouts. One region changes focus per state. The ordered left `[1,4]` and output `[1,2,3,4]` are computed by merging; no numerical readouts. |
| Merge sort / Standard | Starting array: Mixed `[4,1,3,2]` versus Already sorted `[1,2,3,4]`, default Mixed. The same fixed picture exposes different heads and comparison work, beyond a label change. | Computed totals are 5 versus 4 comparisons. Both halves use one comparison each; final work differs. The two readouts report comparisons and final-output placement; previous outlines support comparison. |
| Merge sort / Deep | `compare` underlines the actual computed front heads, with the smaller chosen by the merge decision. The Starting array control changes those decisions. | At `compare`, 3 comparisons and `1 / 4` placed; final totals 5/4 and `4 / 4` placed. Reasons explain why a smallest remaining value must be at a front and why an exhausted-run tail can be appended. |
| TCP / Overview | SYN, received SYN-ACK and final received ACK expose why a reply needs confirmation. One active message per state; a fixed successful exchange is sufficient. | Client/Server labels, dynamic endpoint readiness and the final-ACK explanation agree. The last state demonstrates Server readiness only after ACK receipt; no numerical readouts. |
| TCP / Standard | Lose SYN-ACK: No/Yes, default No. Yes visibly loses the first reply, prevents confirmation, then adds a real Retry before the ACK. Message order is explicitly not elapsed time. | Segment SEQ/ACK and Ready endpoints derive from message/endpoints: `0 of 2 → 1 of 2 → 2 of 2`. SYN uses one sequence position; the pure ACK uses none. Current/previous styles expose sent versus received confirmation. |
| TCP / Deep | Adds `before`, and `waiting` for loss. Explicit protocol states distinguish Client established from Server still awaiting ACK; retry reuses the original sequence space. | Client next SEQ `100 → 101`; Server `500 → 501`. SYN-ACK is SEQ 500/ACK 101; final ACK is SEQ 101/ACK 501. Counters do not advance for retransmission or a pure ACK. Assumptions specify no payload and one possible retry order, without modelling timers. |
| Mitosis / Overview | One phase region is active at a time. `anaphase` separates already-copied sisters without making DNA; the fixed toy-cell comparison suffices. | Phase callouts match the drawn condensation, alignment, separation and new nuclei. The context return explicitly requires division, growth and DNA copying, preventing a direct telophase-to-prophase claim. No readouts. |
| Mitosis / Standard | Focus: Chromosomes/Spindle, default Chromosomes. It changes actual highlighted structures, attachments and explanatory sentences, while preserving the genome; it is not only a renamed label. | Toy whole-view chromosome count changes 2→4 at anaphase; DNA molecules stay 4; each pole then has 2. Six phases and previous outlines expose the mechanism. The picture explicitly includes both eventual daughters. |
| Mitosis / Deep | Adds before/daughters as labelled context, reasons and completed trace. Focus exposes sister-to-pole attachments while the count distinction remains inspectable. | DNA identities `A.a`, `A.b`, `B.a`, `B.b` are conserved. Whole-view count stays 4 after separation; each new nucleus has 2 from telophase; cell bodies change 1→2 at cytokinesis. Readouts distinguish whole view, DNA, nucleus and cells. |

Numerical quantities have dedicated readouts; the anchored callouts carry state/location explanations instead of duplicating those measurements. Array items, chromosomes and message paths are the subject picture, not extra copies of measurement readouts. Pure model tests independently check sorting, comparison decisions, sequence arithmetic, ACK arrival conditions, DNA identity conservation, spindle attachment targets and chromosome/nucleus partitions under the declared toy assumptions.

## Executed checks and remaining review

Root ran **61/61 reference checks** (45 stepper, 16 unchanged curve) and **22/22 check-map checks** after the correction. The independent reviewer reran **45/45 stepper checks** and all nine model/HTML/JSON comparisons. These execute actual reference scripts through a small document adapter, checking bindings, fixed geometry, computed values, controls, Reset and boundary logic. They do not prove browser or sealed-program behavior.

| Unknown check | Why source/tests are insufficient | Evidence still needed |
| --- | --- | --- |
| Q5 — native 640 px fit | SVG width, bounded rectangles and estimated callout lines do not measure browser font metrics, text extents, clipping, overflow, surrounding card height or the application viewport. | Render all nine at native 640 px, inspect each enumerated state/variant and longest text, then verify the real clone at 1440 × 900 with Chat open. Record captures, viewport and revision; retain horizontal access on narrow viewports without shrinking the scene. |
| Q9 — legibility/control handling | An exact font/palette match and 0 Overview/1 Standard-or-Deep parameter selector do not prove readable contrast, ghost distinction, wrapped callouts, trace labels, pointer targeting or actual control layout. Node's adapter has no browser layout or input device. | Inspect current/previous and selected structures, readout labels/values, connectors and longest callouts in the rendered cards. Operate the Step slider and choices at all bounds; confirm the parameter budget separately from Previous/Next/Reset navigation. |
| Q10 — Reset, boundaries, keyboard/focus | Source/native buttons and range inputs provide accessible names, `aria-valuetext`, disabled boundaries and focus CSS; adapter tests cover click/data behavior only. They cannot establish Tab order, actual key events, focus visibility/persistence or status announcements. | On the clone, Tab through every control; use keyboard activation and range keys; verify names, focus and state announcements. Exercise Reset from each option/end state, confirm first-state/default restoration and named disabled Previous/Next, and check option changes across unequal TCP state counts. |

**Acceptance remains pending for all nine cards.** Each currently has seven Yes answers and three Unknown answers. This rubric requires ten Yes answers per card; a No requires correction and an Unknown is not a pass. Complete the manual rendered/keyboard review before claiming rubric acceptance. This source review adds no production gate: the existing owner-approved shadow judge stays nonblocking and release policy is unchanged.
