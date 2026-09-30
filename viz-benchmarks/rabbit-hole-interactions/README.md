# Rabbit Hole interactions - the four review cards

Interaction benchmark evidence for docs/rabbit-hole-interactive-visuals-agent-spec-v2.md.
Internal fixtures with exact oracles; **no external interaction source was
captured** for this milestone, so every status below means "internally
verified", never "external benchmark passed".

Each case: `target.json`, `interaction-scenarios.json`, `expected-states.json`,
and `generated/latest/interactive/` holding the fixture (`scene-spec.json`),
mechanically observed values (`observed-states.json`), the browser run's
passed-assertion trace (`interaction-trace.json`, `assertions.json`),
screenshots in both themes, and `run-manifest.json` with provenance.
Evidence scripts live untracked in `packages/web/e2e/` by repo policy; their
passed-assertion lines are archived here in `assertions.json`.

## Interaction-pattern coverage (spec §10.6)

| Pattern | Evidence |
|---|---|
| Discrete input -> linked views | i01 (query chips), i02 (patch click/slider/stepper) |
| Toggle -> actual mathematical change | i01 (causal mask; oracle-checked weights and output) |
| Slider -> data slice, not time | i02 (Patch slider; transport untouched, labelled Patch) |
| Choice -> immutable commit -> reveal | i03 (commit A, reveal derived 4/1/9, A never rewritten) |
| Continuous pointer movement -> calculation | i04 (5 distinct intermediate projections mid-drag) |
| Set selection -> check | i01 practice (exact set {0,1,2}, order-free) |
| Reset / reload -> same effective state | all four (case scripts assert both) |
| Visible state -> bottom-composer request | all four (payload parity asserted against a stubbed tutor) |

Unassessed here: temporal smoothness as a subjective quality (screenshots
cannot carry it; the intermediate-value traces carry the mechanical half),
and any external-reference comparison (none captured).

## Mutation classes (spec T10.8)

| Mutation | Detector that fails with the defect | Where proven |
|---|---|---|
| Change query but leave the old row/output | q2 oracle on wrow/output | src/interaction-mutations.test.mjs (defect injected into a copy: wrow pinned to row 0) |
| Toggle mask paint without changing weights | mask numerical oracle | src/interaction-mutations.test.mjs (defect injected into a copy: softmax fed unmasked scores) |
| Route a change to the wrong card / stale snapshot | composer payload assertions | e2e composer-context-check.mjs (in-flight immutability, A-vs-B retarget, deleted-target warning) |
| Auto-send or replace draft on Ask | draft/send assertions | e2e composer-context-check.mjs (draft survives, zero requests on Ask) |
| Screen pixels as vector coordinates after zoom | zoomed-drag landing assertion | e2e i04-vector-check.mjs step 8 (drag lands at world (1,1) under a zoomed transform) |
| Make a zero axis pass | projection_zero predicate + not-ready gate | src/scene-activity.test.mjs + src/interaction-mutations.test.mjs |
| Treat an answer set as click order | exact-set predicate | src/scene-activity.test.mjs + src/interaction-mutations.test.mjs (defect injected into a copy: order-sensitive comparator) |
| Replay clears the committed attempt | attempt/transport separation | src/scene-activity.test.mjs (scrub clone) + e2e t09-activities-check.mjs (real Replay click) |
| Mixed Motion/React quantitative fill ownership | AST ownership gate | src/motion-ownership.test.mjs (existing, with its own mutation proof) |
| Serve a stale client or old review seed | build/seed verification procedure | run-manifest records local-dev provenance; the deployed-build + seed check is performed and recorded in the T12 handoff |

Every injected defect lives in a copy inside its own test and is restored by
construction - no product file carried a defect at capture time.
