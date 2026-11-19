# ILL-2 fix: no-plan picture cap (Reviewer's order 1)

Branch feat/heat-1, commit c79f221565eb90c54f67745abd540cb7a3a23e29 (on 1ad846a68 = HEAT-1 merged with main c56e4fcc8), pushed. Ships with release 161 (the lead redoes the 161 prep). No release prep done here.

## The hunk (packages/control-plane/src/learn-artifact.js, the picture cap at about :274-281; +6/-4)
Before: `capped = !requiredMix(wanted) && planned !== undefined` (planned is undefined whenever there is no JEV plan, so no plan = no cap; the cap log sat inside `if (capped)`).
After:
- `cap = planned ?? (input.plan?.planner !== 'jev' ? <count of wanted items with kind illustration and implied> : undefined)`: a JEV plan keeps its own count exactly as before; with no JEV plan the cap is the pictures the learner's words IMPLY (the `implied` illustration item of visualRequirements, normally 0).
- `capped = !requiredMix(wanted) && cap !== undefined` and `settleExplanationBody(block.body, requiredMix(wanted) ?? (capped ? { diagram: max(0, 3 - cap), illustration: cap } : null))`: a learner-named mix still wins unchanged; diagrams up to three visuals in all (three minus the pictures kept, the card limit of three visuals).
- `explanation_picture_capped` fires on the no-plan path with `planned: <cap>` (0 normally) and `source: 'no-plan'`; fields otherwise as before (planned, authored, kept, dropped); the plan path's line is unchanged (no `source`). A JEV plan whose `visuals` is missing still has planned undefined and is unchanged.
Choice to note: "diagrams up to three" is read as three visuals in all (the card holds at most three), so with one implied picture the diagram cap is two.

## Tests
- Rewritten (not deleted): the old explanation-picture-cap.test.js:67 'no plan: an author picture is kept, up to two' is now 'no plan, nothing implied: an author picture is dropped, the card still delivers with its diagram, and the cap line says no-plan' (result artifact, 1 call, 1 picture dropped, 0 pictures and 1 diagram delivered; cap line { planned: 0, authored: 1, kept: 0, dropped: [1], source: 'no-plan' }).
- New: 'no plan, one picture implied ("what does X look like")' (the repo's own deriveVisualRequirements gives one implied illustration; one picture kept, a second dropped with { planned: 1, authored: 2, kept: 1, dropped: [2], source: 'no-plan' }); 'no plan, a learner-named mix: unchanged' (picture kept, no cap line). The JEV-plan tests (:33-61) stay unchanged and green: a plan with one picture, two pictures, a second author picture dropped.
- Twelve other tests pinned "no plan keeps author pictures" (explanation-fast-card 5, explanation-layout 6, explanation-validation 1). They exercise the picture pipeline (streaming, repair reuse, figures, roadmap pictures), not the cap, so each now says how many pictures the learner implies (`visualRequirements` with that many implied illustration items); no assertion about their own subject changed.
- Results, 0 fail: explanation-picture-cap 9, explanation-fast-card 13, explanation-layout 16, explanation-validation 16; every control-plane test file that imports learn-artifact.js (52 files) 602 tests; plus explanation-*, roadmap-*, learn-*, explain-* 2,278 tests. Not run: the web suites (no web file changed), any provider.

## Offline proof on the archived card 2fbd2c0e (resettle-2fbd2c0e.mjs, output resettle-output.txt)
The archive object (8878 R2, key explain-archive/2026-11-19/2fbd2c0e-...json) holds the delivered body, not the model's raw visuals, so the proof settles the archived delivered body with the production settleExplanationBody and the two mixes. Archived plan null; the 67-character request args derive 0 visual requirements, so 0 implied pictures.
- Archived body: 1 picture fence, 1 diagram fence, 1478 characters.
- OLD rule (no plan: nothing capped): re-settled = 1 picture, 1 diagram, 1478 characters (the picture comes through).
- NEW rule (cap 0, mix { diagram: 3, illustration: 0 }): re-settled = 0 pictures, 1 diagram, 1024 characters; the settle log shows explanation_diagram_dropped_element kind illustration 'beyond the visual count or the asked mix'. The diagram is kept.
The end-to-end wiring (generateArtifact with plan null) is covered by the new picture-cap tests.

## Byte identity
The change is on the response side. The 470 Gemini request hashes (C:/s/var-1-tools/hashes.mjs) and the 474-row planner replay (C:/s/int8-replay.mjs) are identical to main c56e4fcc8 (cmp of the JSON outputs: C:/s/gen1-prep/h-ill2.json vs h-main160.json, replay-ill2.json vs replay-main160.json).

## For the Reviewer to decide / know
1. The roadmap path also has no plan (planned: true) and no learner-named mix on most steps, so with this rule a roadmap card's author picture is dropped unless the step's learner instruction implies or asks one (a roadmap step that carries a visualRequirements with a picture is unchanged). That follows "one global /explain" but it is a behaviour change for roadmap cards until G6 (R2) gives them a plan: the two roadmap picture tests (explanation-layout 'the roadmap path makes the pictures too', explanation-validation) now pass visualRequirements with one implied picture to keep testing the picture pipeline.
2. Which picture counts as "implied": only the single `looks like / 3d / anatomy` wording (explanation-visuals.js:57-58, :82), so a learner who asks "show me an image of X" is a named picture (mix) and is unaffected.
3. Evidence tool: the proof script and archive reader are resettle-2fbd2c0e.mjs and read-archive.mjs in this folder.
