# Reviewer calibration set (owner standing rule from C10)

The golden SGD artifact must **pass** the review, and the three worst retained drafts below must **fail** it, each for its known reason. The set is sent through the product's review once per
candidate, whenever the review prompt or the review page changes. This folder holds the fixtures and `manifest.json`; the mechanism that sends them is lane (e)'s tool.

## What is here

| File | Role |
|---|---|
| `manifest.json` | `{ golden, mustFail[] }`: what the tool reads. `mustFail[].artifact` is the fixture path; `knownFindings` and `mustMention` are the evidence and the match rule (see `matching`). |
| `height-mismatch.json`, `mixed-arrow-scales.json`, `twin-balls-and-edge-claim.json` | One fixture per case: `request` (the learner's words), `plan`, `draft` (the draft the reviewer judged, as the model wrote it), the review it came from, its `knownFindings`, `mustMention` and `whyItMustFail`. |
| the golden | `packages/web/src/animation3d/testdata/sgd-golden.json` (`{ plan, artifact }`), its sha256 pinned in the manifest. A golden retune changes it: regenerate the manifest, or the test fails on purpose. |

To send a case: seal `draft` for `plan` as the job does (`validateStage`), render it, and run the review with `request` and `plan`. A case **passes calibration** when the review rejects the draft
(a blocker or major finding on some capture) and at least one such finding matches one of `mustMention` (case-insensitive regular expressions, anyOf). The golden passes when the review accepts it.

## The choice

Source: `docs/features/animation/evidence/` on `rabbit-hole/evidence/animation-ladder` (C4 to C8, Gate 2 jobs). Every Gate 2 job was read: its `reviews.json` (every review's raw findings with severity),
`diagnostics-detail1.json` (the drafts and the candidate chain) and `summary.json`. A review judges the draft that existed when it ran, so each fixture's draft is the one its review saw, found from the job's recorded
draft-hash chain (`candidates[].draftHash` and `previousDraft`); for the arrows case it was also re-sealed and its hash equals the review's `artifactHash` (710808cad8e3).

Selection rules: rejected with many serious findings that are clear and checkable against the program; the failure is **authored** (a data or program fault) so that no renderer change can remove it; three different kinds; no
finding caused by the review-page Status strip (FX-AN-098) or a tool bug since fixed.

| Case | Candidate, job | Review used | Kind | Why it must fail now |
|---|---|---|---|---|
| `height-mismatch` | C7 `951288c09`, job 3 `aj_2f17bed198df4482b5e2e7e170dcdd31` ("gradient descent with two learning rates") | the one review (after repair 1), draft `fab0ec513f28`, 7 serious findings | geometry: the heights grid is written at 0.25 x loss, the program lifts balls and trails at 0.125 x | an authored data bug: the balls and trails sit under the drawn bowl in every capture, and both walkers start at one point |
| `mixed-arrow-scales` | C7 `951288c09`, job 2 `aj_7b5712ec2988484b911750613839aaff` ("SGD on a bowl-shaped loss") | review 0, the author's draft `9d331d1c4919`, 9 serious findings | arrows: the step arrow is drawn at 2x, the slope arrow at 0.2x | the review prompt names the rule (one disclosed scale; fail mixed scales); the scales are constants in the program |
| `twin-balls-and-edge-claim` | C6 `c3d9aa6e8`, job 7 `aj_aeb96465d2e142938de8d7b5f3235bc9` ("compare learning rate 0.1 and 1.5 on the same surface") | review 0, the author's draft `e37c87c9a053`, 8 serious findings | state and honesty: two balls start at one point; the assumptions say an off-square ball is drawn at the edge, the program draws it where it is | an authored layout and a claim the computation does not make |

## What the C9 renderer could legitimately fix

Each known finding carries `c9Renderer`. Most are `persists`: they follow from the draft's own data or program. The exceptions to read before judging a calibration result:

- `mixed-arrow-scales`: the findings that arrows are hidden under the ball say `persists unless the program sets an arrow offset`: the renderer draws an offset arrow honestly (FX-AN-072), but this draft declares no offset, so it is
  still hidden. The mixed-scale findings are program constants and persist.
- `twin-balls-and-edge-claim`: two findings are `may be eased by the C9 renderer`: a label over crossing paths (the declutter) and the framing of a far-off ball. The twin start, the mismatch between the assumption and the
  program, and the diverged ball drawn in mid-air outside the surface persist.
- `height-mismatch`: every finding follows from the grid-versus-program mismatch and persists.
- A reviewer that passes any of the three on the C9 tree is not calibrated, whatever the renderer does.

## Known false positives (`falsePositives` in the manifest)

The opposite promise: a draft the review may reject for **other, real** reasons but must **not** reject for a finding it got wrong. `falsePositives[]` is `{ id, artifact, candidate, job, reviewArtifactHash, request,
mustNotMention[], knownFalseFindings[], note }`; the fixture has the same shape as a must-fail one (`request`, `plan`, `draft`) plus `majorFindings` (each marked `falsePositive` or real). A case **fails calibration** if the review raises a
blocker or major finding whose message matches any `mustNotMention` regular expression (case-insensitive; the patterns apply to that case alone). Other findings, including major ones, are allowed.

| Case | Candidate, job | What the reviewer got wrong |
|---|---|---|
| `offset-shrinks-false-positive` | C9 `4a920b1f7`, job 1 `aj_4c561e74c65444bda3466b601aa5fb04` ("stochastic gradient descent"), review 1 (after repair 1), draft `e98d1bdc6b29` | at v0-s1 it said the arrows are "tiny and mostly hidden inside the ball" because "the 0.2 offset shrinks" with the node scale. False: `scene.js` keeps an arrow's offset outside the node scale. |

The same review's three camera findings (`v0-s0`, `v0-s1`, `v0-s2`) are real on the C9 renderer and stay allowed. Read the result as: the false finding **persisting** means the reviewer is not calibrated;
it **disappearing** means the trace (lane (c), `trace.arrows`) and the review request's arrow sentence (`ARROW_NOTE`, FX-AN-112) work.

## Considered and not chosen

- **Camera and framing failures** (C4 jobs 2, 4, 5, 6, 8: the near wall hides the ball, the camera looks along the steep axis; C8 jobs 1, 5, 6: the bowl fills under half the frame). The C9 renderer's cutaway and the surface-scene
  elevation floor could remove them, so they are not guaranteed to persist; a pass on those drafts would not show a weak reviewer. If a camera case is wanted, C4 `aj_74a8e1f1...` review 0 is the clearest, with the caveat.
- **Status readout not visible** (for example C4 jobs 4 to 6, C7 jobs 4, 5 and 7): caused by the review page's Status strip, FX-AN-098, since fixed.
- **Trail sampled every 2nd or 4th step hides the zig-zag** (C6 job 9, C7 job 2 review 1, C8 job 5 review 0): a good authored fault, and a fourth candidate if a case is needed; not chosen to avoid two cases from one job.
- **Spurious 'converged' stop under noise** (C8 job 1): a real program issue but argued from probability, not from a visible state, so a reviewer could fairly disagree.
- Jobs rejected at validation (`placement` on a node, FX-AN-110) never reached a review that reads a scene.

## Running it against a changed review

The calibration set judges the REVIEW, so its identity is the review's, not the author's: `node scripts/animation/author-sample.mjs review-identity` prints the sha256 over `REVIEW_IDENTITY_FILES` (the review prompt `agents/animation-review.js`,
the request builder `animation-review.js`, `animation-render.js`, the review page `animation3d-render.js` and `animation3d.html`, and `animation3d/review.js`) and each file's short hash. A different hash means the controls and Gate 2 re-run;
Gate 1 (the author alone, `PROMPT_FILES`) does not. Record the hash with every calibration run.

## Provenance

The fixtures were generated by reading the evidence branch and copying the judged draft, the plan, the request and the serious (blocker and major) findings of the chosen review; nothing was edited. The per-finding `c9Renderer`
notes are the only added text. The draft hash chain and the golden hash are checked by `scripts/animation-calibration.test.mjs`. The false-positive case was added with the review request's arrow sentence (C10).
