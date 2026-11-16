# BAR-U (sprint 2): a generic-word unit is dropped

Commit on feat/visual-sprint-2-flow (spec.js, TutorDiagram.js; hunk.diff), on top of BAR-1 (13b2e5a81). before = 13b2e5a81.

Rule: a `unit` that is only a generic word (value, values, number, numbers, amount, amounts, score, scores; case-insensitive; a score has no scale in a unit field) is dropped before the diagram is drawn or described, anywhere in the spec (panels, axes included): labels read "1" and "0.33", not "1 value", and the accessible description loses "(value)". A real unit (%, ms, kg, k ...) stays: real-unit-kept-* is unchanged ("20 %", "30 %"). `dropGenericUnits(diagram)` returns the same object when no unit is generic; the parsed spec is not mutated.

Where it lives (differs from the brief): content-contract.js is the authoring-time linter (it imports node:util and is read by the topic pipeline); it is not on the render path, so the render-path function is in spec.js (next to parseTutorDiagram, describeTutorDiagram) and renderTutorDiagram in TutorDiagram.js calls it right after parsing. No schema change; the content-contract linter itself is untouched.

The equal-logits spec is not in the repository (grep for its title finds nothing), so the evidence rebuilds it from the brief in the shape the real softmax references use: a `panels` figure, "Uniform probabilities from equal logits", panels "Raw scores" (Class 0-2, 1, 1, 1) and "Probabilities" (0.33 x 3), both unit "value", linked by "Softmax" (equal-logits-panels-*). equal-logits-grouped-* is the same data as one grouped bar chart; real-unit-kept-* is a "%" control.
| figure | 408 before | 408 after | 720 before | 720 after |
|---|---|---|---|---|
| equal-logits panels | 408 x 318 | 408 x 318 | 720 x 260 | 720 x 260 |
| equal-logits grouped | 408 x 388 | 408 x 388 | 720 x 366 | 720 x 366 |
| real unit "%" | 408 x 332 | 408 x 332 | 720 x 332 | 720 x 332 |
In the panels the value text goes from "1 value" / "0.33 value" (the value column wrapped onto two lines and shortened the bars) to "1" / "0.33"; the bars are now their proper length (equal-logits-panels-408-before.png vs -after.png). In the grouped chart the legend/accessible text loses "(value)".
No tests were run (this round).
