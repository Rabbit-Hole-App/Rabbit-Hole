# TL-1 grep: does the planner / selectForAuthor route an ordered process to `timeline` or to `flow`?

Answer: **to `flow`. By the planner's own definitions an ordered process is never a timeline; `timeline` is reserved for dates, years and eras.** (Code evidence below; the planner is an LLM classifier, so "never" is the rule it is given, not a hard guard. I did not run it: a planner call is paid and this lane is read-only.)

## Evidence (file:line, main 74c4f68ae)

- `packages/control-plane/src/explanation-planner.js:16` `flow: 'Ordered steps of one process, with or without decisions; the default only when nothing below fits.'`
- `packages/control-plane/src/explanation-planner.js:19` `timeline: 'Events ordered by dates, years or eras.'`
  These two strings are the whole of the planner's kind guidance (KIND table, l.15-39). An ordered process (numbered derivation, recipe, "first X then Y") matches the flow line verbatim; nothing in the timeline line matches a numbered step.
- `explanation-planner.js:14` `EACH_KINDS` (two-things plans) does not offer `timeline` at all.
- `explanation-planner.js:68` and `:83`: the fallback kind when the planner has no confident kind is `flow`, never `timeline`.
- `packages/control-plane/src/explanation-references.js:151` `selectForAuthor` does not choose a kind. It resolves `plannedKinds = visualKinds(cardVisuals(plan, asked))` and `requiredKinds` (l.152-153), then `selectWithSteer` keeps only references whose `spec.diagram.kind` is in that set, plus the single best topical reference (l.100-104). So `timeline` references reach the author only if the planner or the learner chose `timeline`, or a topical keyword match steers to one.
- `explanation-references.js:183` `CORE_KINDS` includes `timeline`: the schema always offers it, so the author may still pick it when no plan fixes the kind.
- `packages/control-plane/src/explanation-visuals.js:20` a learner who writes the word "timeline" requires kind `timeline`; `:22` "flow chart / flow diagram / process diagram / decision tree / flow of" requires `flow`. `explanation-visuals.js:27` a topic word alone is not a request.
- `packages/control-plane/test/explanation-visuals.test.js:115-116` a card asked for a flow that comes back as a `timeline` is refused ("asked for a flow diagram ... is a timeline"). So an explicit "flow" request can never be answered with the step form.
- `packages/control-plane/src/learn-primitives.js:684` the only server correction touching it is `timeline_plain` (a plain dated timeline sent with scaled lanes becomes the plain one). Nothing converts flow to timeline or back.

## What exists today in the library
- 9 `timeline` references. 8 are the *lane/axis* layout (`layout`, `lanes`, `cutoffs`: train-validation-test-split, nested-cross-validation-folds, walk-forward-validation-gaps, sliding-window-validation, label-delay-monitoring, as-of-join-ttl-window, point-in-time-created-time, event-created-label-time); their `time` values are axis numbers, not step numerals.
- 1 plain-events reference, `ml-gpt2-continue-prefix`, with times "Prompt / First step / Second step" (words) and the kind gallery's timeline has "9 am / Noon". **No reference has numeric `time` 1..N**, so the TL-1 step form has no worked reference yet (script: `timeline-refs.mjs`).
- Spec: `packages/web/src/tutor-diagrams/spec.js:62-64` events `{ time: text(28), label: text(55), detail: text(90)? }`, 2-8 events. A numeric-time default needs no schema change.

## Consequence for TL-1
Building the step form as a renderer default (when every `event.time` is numeric and at most 2 chars) is safe and harmless, but with today's planner **nothing will produce numeric-time timelines for ordered processes**: the planner sends those to `flow`. The step form will appear only for author-picked `timeline` cards (and the learner saying "timeline").

## Proposed one-line rule (not applied; planner unchanged)
In `explanation-planner.js` KIND.timeline, append: `Also a short numbered derivation or recipe of 3 to 6 stages in a fixed order with no branches, written with times "1" to "N".`; and in KIND.flow, change "Ordered steps of one process, with or without decisions" to "Ordered steps of one process, with or without decisions (a numbered derivation with no branches is a timeline)". Without both edits the two lines contradict each other and flow wins.
