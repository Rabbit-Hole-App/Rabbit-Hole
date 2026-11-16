# ONE-1: why do /explain cards carry ONE visual?

Read-only run on main 5f29c23a6 (release 150). No provider, production or dev-D1 call. Scripts and outputs are in this folder (histogram.mjs, bench-histogram.mjs, bench-depth-scan.mjs, multi-visual-references.mjs and their outputs; records/ is a copy of the owner-local archive and stays local).

## Conclusion
1. The planner's default is ONE visual, and the plan is handed to the author as fact: explanation-planner.js:71 ("no second-visual decision. One diagram, plus a picture only when the visual type is both") and :77, :80-84 (a second visual only for a physical subject, or two separate structures); the no-plan fallback ends "otherwise one" (learn-primitives.js:372).
2. Evidence (bench, 13 saved runs since release 132, 855 plans): 725 planned 1, 130 planned 2, 0 planned 3. A plan of 2 became 1 carried visual in 0 of 130 cases. 25 plans of 1 became 2. A third visual: 1 card of 10,766.
3. Nothing caps a card at one: settleExplanationBody keeps up to 3 (learn-primitives.js:1244), layoutOk allows 1-3 (:1192), requiredMix is null unless the learner names a visual (explanation-visuals.js:89-93), the prose budget excludes visuals (learn-primitives.js:1149; EXPLANATION_BUDGET target 450, hard 700, chat-depth.js:41).
4. Reinforcing: the depth text says "The visual" in the singular (chat-depth.js:54-56); 36 of the 40 multi-panel references reach the author as single diagrams (preferSingleVariants, explanation-references.js:139-146) and the panels kind is withheld from the author schema (spec.js:375-379).
5. Smallest change (not made): in planFromAnswers (explanation-planner.js:77) allow a second complementary visual when visualType is not already two, gated by the flags the planner already returns (needsWorkedExample or needsPlot), stated in visualsStatement (:109).

## Measured, and not measured
- The production archive is NOT measured (R2 LEARN_MEDIA, explain-archive/<yyyy-mm-dd>/<id>.json, writers learn-storage.js:14-19, learn-artifact.js:434-437; no script in the repo reads it). histogram.mjs produces the by-depth histogram from downloaded records; reading production needs R2 access and your OK.
- Owner-local archive: 5 /explain cards (all Balanced): 5 with one visual, all planned 1. Too small for a rate.
- Bench, latest 66-prompt smoke run: 54 one-visual, 12 two-visual, 0 three (the set deliberately holds 12 two-visual prompts, so it overstates two-visual prompts).
- All saved bench history by depth: Brief 909 cards (109 with two), Balanced 1575 (130 with two, 1 with three), Detailed 1031 (120 with two). Depth makes no meaningful difference.
- Not measured: real learner traffic, planner time-outs in production, rendered card heights.

## References with 2+ visuals (469 registered)
40 references compose 2+ child diagrams in the base spec (25 comparison/panels, 8 transformation/visual, 7 panels); 74 more are single-diagram specs with a detailSpec. Offered with 2+ visuals: Brief 55, Balanced 64, Detailed 114; 114 of 469 (24%) at any depth; 17 reach 3. Ids in multi-visual-references-output.txt.
