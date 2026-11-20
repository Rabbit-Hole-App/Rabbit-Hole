# REL-1b: a label may sit under or over a box only if that box is its edge's source or target (2026-11-20)

The lead wrote this from the lane agent's text and looked at sheet pages 1 and 13 itself. Branch feat/rel-1, pushed, no force: **44a823e99** (REL-1b) then **1b36e600c** (follow-up: three of the 14 labels escaped the rule by straddling the target's top edge, 2 to 6 px into the next row; closed in a second commit instead of a force-push; squash on request). Tip 1b36e600ca1391a98e8194fe7c977372956f9200, on top of deee5d795. Files: ml-topology-layouts.js, relationship-graph.test.mjs, test-relationship-geometry.mjs, svg-snapshots.json. Renderer only. Card widths are unchanged on all 57 specs at all four widths.

## The rule (as ordered), and what was read into it
1. A label may sit directly below a box only if that box is its edge's source, and directly above a box only if that box is its edge's target.
2. If its first place fails: the other side of its own wire at that height, then the other places along its own lane; the REL-1 rule still holds everywhere (own wire within 6 px, every other wire 24 px farther).
3. If no place passes: a numbered note.
4. Test: for every on-arrow label of all 57 specs at 320, 408, 720, 960, rule 1 holds.
Judgment calls the agent made (say if you want any narrower): (a) "directly under or over" also counts the corridor between the box and the label's own wire (otherwise Predicts i at 3.9 px, Previous release at 7.3 px and Scale by v1 at 32 px would escape and the 14 would not all fail on deee5d795); (b) "in the row gap" is read as the label's top (bottom, for "over") being in the gap even if it reaches into the next row, which also moved "Sets the penalty" and "Adds fitting error" of d2l-regularized-forward-graph (not on the list) to notes; (c) the card width still comes from the REL-1 logic and the final placement is done at that width.

## Counts: edges with a label on the arrow / edges in notes (BEFORE = deee5d795, AFTER = 1b36e600c)
| width | BEFORE | AFTER |
|---|---|---|
| 408 | 188 / 94 | **127 / 155** |
| 320 | 182 / 100 | 117 / 165 |
| 720 | 214 / 68 | 190 / 92 |
| 960 | 214 / 68 | 190 / 92 |
Labels that broke rule 1 on deee5d795 (all variants): 66 at 320, 62 at 408, 24 at 720, 24 at 960; after: 0 at every width. At 408, 61 labels went to notes and 1 moved to a new place on its arrow (Predicts i). Nothing else moved. The on-arrow count at 408 fell from 188 to 127: that is what the rule requires.

## The 14 labels at 408 (all 14 fail rule 1 on deee5d795)
- Supplies a new weighted input, Passes first activation (d2l-dense-hidden-layer-activations): numbered notes; at 720 unchanged, on the arrow.
- Carries earlier information (d2l-recurrent-state-handoff): note; 720 unchanged.
- Adds gradient one (d2l-recurrent-weight-gradient-sum-detailed-detail): note; 720 unchanged.
- Predicts i (d2l-recurrent-next-character-targets-detailed-detail): stays on its arrow, moved from y 277 to y 325, now at the top corner of its target, Guess after ra; 720 unchanged.
- Uses a separate weight (d2l-softmax-affine-class-scores): note; 720 unchanged.
- Reuses shared memory (figure-gallery-encoder-global-kv): note; 720 unchanged.
- Adds a quarter of the update (figure-gallery-multistream-residual): note; at 720 also a note (it was under the write-a box there too).
- Shares the chosen positions (figure-gallery-shared-kv-and-index): note; 720 unchanged.
- Reuse fitted parameters (ml-fit-transform-leakage): note; at 720 also a note.
- Scale by v1 (ml-neural-network-weights): note (it was on its arrow on deee5d795); 720 unchanged.
- Sets the same level (ml-stable-diffusion-unet-timestep-and-skips): note; 720 unchanged.
- Same training input, Previous release (ml-version-lineage): both notes; 720 unchanged.

## Specs with more than three note lines at 408 after the fix (numbered-list entries; these go to Codex as content, nothing squeezed)
- d2l-dense-hidden-layer-activations (+ brief, detailed): 6 (before 3 or fewer)
- d2l-regularized-forward-graph (+ brief, detailed): 6 (before 3 or fewer)
- ml-neural-network-weights: 5 (before 3 or fewer)
- figure-gallery-multistream-residual (+ brief, detailed): 5 (before 3 or fewer)
- figure-gallery-encoder-global-kv (+ brief, detailed): 5 (before 3 or fewer)
- figure-gallery-shared-kv-and-index (+ brief, detailed): 5 (before 3 or fewer)
- ml-stable-diffusion-unet-timestep-and-skips (+ brief, detailed): 5 (before 4: already over three)
- d2l-softmax-affine-class-scores (+ brief, detailed): 4 (before 3 or fewer)
- ml-version-lineage: 4 (before 3 or fewer)
Total 23 specs including variants. The list at 408 before (deee5d795): only the unet family, at 4.

## Snapshots, tests, sheet
- Snapshot keys changed against deee5d795: 90 (6 at 320, 33 at 408, 3 at 720, 18 at 960, 29 natural) in 35 ids, all relationship-graph ids: ml-computational-graph, ml-feature-store-architecture, ml-feedback-graph, ml-fit-transform-leakage, ml-neural-network-weights, ml-version-lineage; the families (base, -brief, -detailed) ml-stable-diffusion-unet-timestep-and-skips, d2l-softmax-affine-class-scores, d2l-dense-hidden-layer-activations, d2l-regularized-forward-graph, d2l-recurrent-state-handoff, d2l-bahdanau-changing-decoder-context, figure-gallery-multistream-residual, figure-gallery-encoder-global-kv, figure-gallery-shared-kv-and-index; and d2l-recurrent-next-character-targets-detailed-detail, d2l-recurrent-weight-gradient-sum-detailed-detail. Nothing else moved.
- Tests: new "all 57 relationship specs: no label on an arrow sits under a box it does not come from or over a box it does not go to (320, 408, 720, 960)" (fails on deee5d795, passes now) and one on the rule itself with hand-built cases (the straddle, the corridor, beyond the wire). One latent bug fixed in the old "named failures" test (`\d` in a template string became the letter d, so its note regex could never match). Whole tutor-diagrams directory 1624 of 1624.
- Sheet at 408, BEFORE = efe5a5207, AFTER = 1b36e600c, two specs a page, 13 pages: rel1b-p1.png to rel1b-p13.png here. 25 specs: the 23 base ids plus the two -detailed-detail ids. The lane read all 13 pages; the lead read pages 1 and 13.
- Reading: no label on an arrow sits under a box that is not its source or over a box that is not its target (the agent's statement over all 13 pages; geometry test: 0 violations at 320, 408, 720, 960). Two residuals to judge: Predicts i now sits at the top corner of its target; in ml-version-lineage "Transforms with code v1" and "Training input" stay under Dataset v1 and Features v1, which are their sources.

Not done by this lane: nothing skipped. Scratch: C:/s/rel1b-out/. Not checked: the whole web suite beyond tutor-diagrams; the live app.
