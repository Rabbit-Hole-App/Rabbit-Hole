# TL-1: timeline steps form (feat/visual-sprint-2-scn, one commit on tutor-diagrams/layouts.js)

## Grep first: does an ordered process route to `timeline` or to `flow`?
To `flow`, by the planner's own definitions, and never to `timeline` unless the words say so.
- `packages/control-plane/src/explanation-planner.js` l.16: `flow: 'Ordered steps of one process, with or without decisions; the default only when nothing below fits.'`; l.19: `timeline: 'Events ordered by dates, years or eras.'`. The "each" candidate kinds (l.14, `EACH_KINDS`) do not include timeline.
- `explanation-visuals.js` l.20: the learner-word fallback names `timeline` only for the word "timeline" (and l.27 says a topic word alone is not a request for a picture).
- `explanation-references.js` `selectForAuthor` only passes the planned/required kinds on; no rule maps numbered steps to timeline. `timeline` is in `CORE_KINDS`, so the author may still pick it, but a planner-routed "numbered process" is a flow.
So the MLE steps (Formulate Model, Write Likelihood, Take Logarithm, Maximize) are a flow today. Proposed one-line rule, NOT applied (the planner is untouched): in the planner's kind table, extend the timeline line to `timeline: 'Events ordered by dates, years or eras, or a short numbered procedure (up to eight steps, each a title and one line).'` and keep the flow line for procedures with decisions or branches.

## Code (defaults only)
When every `event.time` is one or two digits, the timeline draws the steps form: a 28 px circle badge (blue fill, ink outline, ink numeral 700), a 1.5 px ink spine from the first badge centre to the last, no content box, the title 700 on the ground and the detail (13 px, muted) beneath it, and "N steps" (muted, 13 px) at the top right from `events.length`. Dates and words ("9 am", "Noon") keep the pill form unchanged (`dates-after-408.png`).

## Evidence
`steps-after-408.png`, `steps-after-720.png`: times 1 to 4 with the four titles and their one-line details. `steps-before-408.png`, `steps-before-720.png`: the same spec on released main (pill form). `dates-after-408.png`: a word-time timeline, unchanged.

## Follow-ups (coordinator, after the owner's read)
- Planner: the two-line edit from planner-grep.md is applied exactly (`planner-edit.diff`; KIND.timeline also covers a short numbered derivation or recipe of 3 to 6 branch-free stages with times "1" to "N", KIND.flow says such a derivation is a timeline). The ship round's planner-kind replay will report moved picks.
- Reference: `ml-mle-steps` (ml-mle-steps-reference.js, registered in `estimationEvaluationReferences` next to the Bernoulli and k-fold references, the way those two are). `reference-standard-408.png` and `reference-standard-720.png` are drawn through the library path (diagramReferences). Ship round, not done here: svg-snapshots.json, and the reference's token budget in illustration-token-budgets.json (the Bernoulli reference has one) if its test requires it.
