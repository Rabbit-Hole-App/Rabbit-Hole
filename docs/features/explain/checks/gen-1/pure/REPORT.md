# GEN-1 pure pieces (Lane 4): report

Branch feat/gen-1-pure, commit 47089fcd713404d75555eea063a121440f6cb75e, on main c56e4fcc8 (release 160). Not wired into any request. Spec used: GEN-1 v1 plus the 44 contradiction points (v1.2 was not on the machine); choices are listed at the end.

## What changed (6 files, +250/-3)
- New `packages/control-plane/src/explanation-examples.js`: `exampleReferences(kind, depth, seed)` (G1) and `examplePoolSize`.
- New `packages/control-plane/src/explanation-kind-draw.js`: `drawKind(probabilities, { seed, onTopicKind, exact, depth, requiredKinds, visuals })` (G4).
- `explanation-references.js` (selection half only): the `steer` object gains `exact` (the prompt is one of the reference's documented prompts verbatim); `sampledSpec` is now exported so the new module applies `vary` through the request path's own function. Nothing else in that file moved.
- Tests: 6 in `explanation-examples.test.js`, 5 in `explanation-kind-draw.test.js`, 1 added to `explanation-plan-kind-from-reference.test.js`.
- Not touched: explanation-fast-chain.js, learn-artifact.js, roadmap/*.js, learn-inline.js, learn-primitives.js, TutorDiagram.js and the layout files, the bundle half of explanation-references.js.

## exampleReferences
- Pool = strict single-diagram library references at the card's depth (brief, balanced, detailed to overview, standard, deep), bundle-neutral (no change to the schema bundle for the kind), no `general-` or `shape-` ids. Totals 404 / 385 / 385 for brief / balanced / detailed (one more than the G1 prep: SAME-1's top-k bar-chart is on main now).
- Pool below three: figure, argument, t-account, waterfall, tensor 0 at every depth; layers, number-line, box-plot 1; transformation at detailed 2 (3 balanced, 10 brief).
- The gallery gives ONE example per kind and depth, so a card gets at most pool + 1. The function returns `{ examples, pool, galleryFilled, short }` and invents nothing; `short` flags fewer than three.
- Each example is `{ id, spec }` with `vary` applied by `sampledSpec`. Draw: three distinct ids by `seededRandom(seed + ':examples')`.
- Size: worst case over 24 kinds x 3 depths x 25 seeds is 3810 of the 14,000-character MAX_CONTEXT.

## drawKind
Returns null for: no seed; no usable probabilities (Reviewer decision C: no probabilities, no draw); a learner-named kind (requiredKinds); a picture plan or two visuals; nothing left at Brief after the exclusions. Otherwise: Brief drops BRIEF_NO_KINDS; the on-topic kind gets +0.5, +1.0 more when exact; renormalise; drop kinds under 0.2 (none left: keep the top); draw by `seededRandom(seed + ':kind')`; returns `{ weights, drawn }`. Over 4000 seeds the draws match the weights within 0.03.

## Guards and tests
- Byte-identity: the 470 request hashes and the 474-card replay are identical to main (C:/s/gen1-prep/h-main160.json vs h-pure.json, replay-main160.json vs replay-pure.json).
- Not wired: a test greps packages/control-plane/src and packages/web/src and finds neither module imported anywhere.
- 0 fail: the new tests, explanation-plan-kind-from-reference 13, explanation-references 11, explanation-planner 12, explanation-fast-chain 24, learn-artifact 23, explanation-vary 10, svg-snapshots 1, and a sweep of explanation-*, roadmap-* and learn-* control-plane tests (2060). Not run: the whole web suite, browser checks, any provider.

## Decisions for the Reviewer
1. Pool definition: strict single diagrams only. The two-panel `-single` variants would add 32 to 33 per depth and are not depth-specific. Keep strict?
2. The G2 heading and the R2 wiring must tolerate fewer than three examples (8 kinds).
3. R3 wiring: pass `onTopicKind` and `exact` from the steer and `visuals` from the plan; write the drawn kind to `plan.kind` without overwriting `plannerKind`.
- Choices made without v1.2: the pool rule is v1's; drawKind's null cases follow decision C and CONTRADICTIONS.md items 23 to 25.
- Not checked: how Lane 3's bundle changes interact with the pool's bundle-neutrality test (it uses today's `diagramBundle`).
