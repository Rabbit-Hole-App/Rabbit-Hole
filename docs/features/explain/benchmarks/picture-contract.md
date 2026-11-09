# Picture `p` contract (owner 2026-11-08): prep for the Codex integration run

Owner brief: pictures judged "no" were 36/110 (33%) on the clean-up run; the Codex set 3 picture templates were not in the clean-up. They go in as a `p` contract line in the author prompt; the integration run must report this number; the pass is under 15%.

## The contract (learn-primitives.js, EXPLANATION_GUIDANCE, `# Card layout`, replaces "p says what to draw ... (subject, view, style; no text or labels in the picture)")
p says what to draw in at most 200 characters and fills one template, ending with the clause no text, labels, titles or icons: object-mechanism "Technical cutaway of <subject> showing <parts and the action, with arrows for flow or motion>"; positional-cause "Textbook illustration of <subject>, <view>, showing the arrangement of <objects and positions>" (orbits, layers, stages side by side); appearance "Realistic exterior of <subject>, <view>, showing <visible features>"; organism "Natural-history illustration of <subject>, <view>, showing <trait in context>"; repeating-structure "Scientific close-up of <subject> showing <unit and pattern>". Name the parts, positions or stages the question and the prose are about, never a generic view of the subject; a process of stages is a few panels in one picture.
Cost: +708 characters = about +177 tokens (chars/4) on a planned prompt of about 3,363 (+5.3%). The server no-text suffix check (withNoTextSuffix) stays as the backstop. Pinned by `explanation-picture-templates.test.js` (every template class and its opening words are in the prompt, the clause and the name-the-parts rule are in it).

## The 36 "no" cases of the clean-up run (110 pictures judged, picture-v1, description only), by cause
| cause | cases | where |
|---|---|---|
| one moment or end state of a process or sequence | 12 | mitosis 3, moon-phases 3, robot-arm 3 (final grasp / static arm), water-cycle 2 (generic scene, no stages), four-stroke 1 |
| generic object view that does not show the mechanism or relationship asked | 11 | heart 3 (static anatomy, no flow), photosynthesis 3 (whole leaf, arrows only), bike-gears 2 (chain close-up, no gear ratio), suspension-bridge 1 (parts, not load path), virus-vs-bacterium 1, leaf-venation 1 (one type of two) |
| wrong view of the subject asked | 1 | gpu-look (bare die instead of the card) |
| vague comparison | 2 | mitosis-vs-meiosis |
| layered structure drawn as unlabelled bands (a picture cannot carry named layers without text) | 10 | atmosphere (10 of its 14 pictures) |
| text in the picture | 0 | |
The earlier 116 hints (heart, bike-gears, leaf-venation, photosynthesis, mitosis, mitosis-vs-meiosis, atmosphere, moon-phases: generic or single-moment views) are the same cases. 28 of the 36 sit beside a diagram that carries the mechanism (flow, cycle, layers, comparison, figure); the judge sees only the picture description and the card prose.

## Offline measure (no cards generated; picture-v1 on the 110 pictures, p replaced by the template output)
For each of the 30 prompts (clean-up run) the template class and slots were filled by hand the way an author following the contract would (`C:/s/spec/picture-contract/slots.json`: not committed, the fill is mine, not a model's); the author's own alt and caption were kept; US$0.337 for 110 judge calls.
Before (recorded verdicts): 36 no of 110 = 33%. After: 4 no of 110 = 3.6%: 33 of the 36 fixed, 3 still no, 1 previously-yes broken. The 4 are all a template `p` that disagrees with the author's unchanged alt/caption (gpu-look x2: the template says graphics card, the alt says bare die; leaf-venation: p says two leaves, the caption one; atmosphere 1: p says stacked layers, the alt a plain horizon), which a real author following the contract would not write: expect the real number at or below that.
Limits: the fill is a careful, informed one; a model's slots will be vaguer and its alt/caption may not follow them; the judge reads descriptions, not images (the image model may not draw four panels, arrows or named layers well): the contract moves the description, not the pixels; atmosphere's picture duplicates its layers diagram (the planner's isPhysical rule adds it), so its fix here is a description the image model cannot literally satisfy without text.

## What the integration run must watch
1. Pictures judged "no" overall and by cause (pass < 15%); report atmosphere, mitosis, moon-phases, heart, photosynthesis, robot-arm separately.
2. Alt/caption agree with p (the 4 residuals above): add a check "alt and caption name what p names" if it recurs.
3. Picture count and no-text violations (images with lettering), cost per picture, picture ready/dropped ratio (a multi-panel prompt may fail more often in the image model).
4. Author prompt tokens (+~177) and p length (200 limit; the template overhead is about 85 characters, so slots have about 115: long fills trip the 200 limit: report truncation or repairs).
5. Whether atmosphere should keep a picture at all (diagram-only is the alternative): not decided here.
