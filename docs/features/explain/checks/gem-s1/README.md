# GEM-S1 evidence

Branch feat/gem-s1 (base rabbit-hole/feat/release-154 tip 9531b382f). Change: hunk.diff (one line in
packages/control-plane/src/learn-primitives.js plus its comment; tests appended to
packages/control-plane/test/explanation-matrix-coerce.test.js).

## What Q0 is
Q0 = `coercedMatrixShape` + `correctDiagrams` in learn-primitives.js (release 118/126, logged as
`explanation_matrix_coerced`). It runs before the validator and only for `matrix` / `heatmap`: the only kinds
whose `columns` are a string list (spec.js:72, ml-data-spec.js:22). token-links and transformation have no `columns`:
the section-6 cards were PLANNED as token-links / transformation, but Gemini AUTHORED a matrix or heatmap, and that
diagram's columns were objects. Q0 already turned column objects into their text via heading, label, text, title.

## Change
`name` added to that key list (`columnText`). Nothing else: objects with no usable text stay as written (logged
`left`, the repair gets the original error); strings untouched; same all-or-nothing rule (applied only if the whole
diagram then validates).

## Before / after (tests, offline)
- {name} columns: before -> still invalid (2 new tests fail on the old code), after -> strings, validates.
- {label} columns, mixed lists, heatmap, no-label objects, strings, idempotence: covered; label/heading/text/title behaved the same before and after.
- Specs are BUILT from the error text and the schema (3 columns), not the real attempt-0 specs: section-6 results keep only
  the error string, not the attempt-0 body (results.jsonl `events[].error`; `body` is the final card).

## Caveat the lead must read
The key Gemini actually writes is NOT in the saved data. Q0 already read heading/label/text/title, and those 19 runs
still failed at attempt 0, so the likely shape is the one saved for the same forward-diffusion prompt (test CARD_27):
columns as {heading, items} with no rows. Q0 leaves that on purpose (release 126: never invent Item 1, Item 2); `name`
does not change it. The `name` addition is the only unread label key the ticket names; whether it turns any of the 19
valid is unknown until rerun.mjs runs (it logs `coercedByQ0` per run, so the actual shape/reason is visible: action
`left` + reason, or `coerced`).

## Counts (counts.json)
Attempt-0 columns error: BEFORE 10/303, AFTER 10/303 (final simplified flow card: 5 and 9), section-6b AFTER-2 0/147.

## Rerun (not run)
rerun.mjs + rerun-plan.json: 4 prompt x depth pairs x 3 reps x BEFORE/AFTER = 24 runs, google-low, about US$0.005 each.
Records `colsErrorAttempt0`, `anyErrorAttempt0`, `coercedByQ0` per run.
