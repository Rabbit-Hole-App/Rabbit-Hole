# VAR-1 step 2: prose tokens `{{d:N.path}}`

Branch `feat/var-1`, commits ea17c1fb3 (tokens) and 84bac61f9 (comment), on top of the step-1 close b692eb42e. No provider call was made (all tests use a scripted model).

## What changed
- `packages/control-plane/src/explanation-tokens.js` (new): `fillTokens(block)` and `leftoverToken(block, questions)`. A token names a number of the card's Nth closed `rh-diagram` fence (N from 1, body first, then the folded sections); `{{d:path}}` without N works on a card with exactly one diagram; `{{d:N.path|k}}` forces k decimals (0 to 3). The path walks the PARSED diagram (`parseTutorDiagram`, so derived fields are already filled). Only prose lines are filled; a fence is never edited.
- `learn-artifact.js`: the fill runs after the server's structural fixes (`relationshipsAsGraphs`) and before `numbersIssue` / `explanationProblem` / the drop of invalid diagrams, so every check reads the real number. Archive: `trace.tokensFilled` and `trace.bodyWithTokens` (the body as written); the record's `returned` block is the filled one.
- `derived.js`: `derivedPaths(d)` (the numbers a derived field holds, for the "valid paths" message).
- Guidance: one sentence added to the end of `VISUAL_COMPLETE` ("A number the figure computes from others (fences, means, normalised weights, softmax outputs) is written as {{d:N.path}}, never typed ..."). `EXPLANATION_VISUAL_RULES` ends with it, and so does the planner's visuals statement (`visualsStatement`), so both prompt paths carry it; putting it in `EXPLANATION_VISUAL_RULES` alone would have missed every planned card.
- `learn-primitives.js`: `markdownFences` export (the existing fence splitter). Docs: `docs/features/explain.md` (new row, derived row updated).

## Behaviour
- Unknown path, a path that is not a number, a malformed token, or a missing diagram number on a multi-diagram card: the attempt fails with `explanation_bad_token: ...` naming the numbers the figure computes there (`1.boxes.0.fences.lower, 1.boxes.0.fences.upper`). It is a plain validation issue (`failedOn: validation_error`), NOT arithmetic-tagged: nothing in a diagram is wrong, and the arithmetic route's never-drop / second same-model repair rules do not apply. The normal repair carries the text.
- A token whose diagram does not parse is left alone: the diagram's own problem goes to the repair first. At the last attempt, if that diagram is then dropped, the token that pointed at it is still in the text and `leftoverToken` fails the step. A token inside a fence or in a question fails the same way. No raw token reaches a learner.
- Gemini: tokens are plain text in `body`; no schema changed, no property added.

## Tests
- `packages/control-plane/test/explanation-tokens.test.js` (new, 10 tests): the Q1 6 / Q3 12 card with no fences delivers "21" and "-3" (acceptance item 4); `|1` gives "21.0"; unknown path -> repair names the valid paths, then delivers; never-fixed token -> `validation_error`; wrong typed fences still fail first (154); two diagrams need the number (diagram 2 with Q3 14 gives 26, diagram 1 gives 21); folded sections filled; fence untouched; leftover refused (fence, question); malformed token and non-number path; unparseable diagram defers to its own problem; the guidance sentence is in `EXPLANATION_VISUAL_RULES`.
- Control plane suites (fast-chain, visual-fallback, learn-artifact, references, prose-pass, gemini-illustration-bundles, validation, diagram-kinds, tokens, batch1-fixes, prompt-cleanup): 158 tests, 0 fail. Web `src/tutor-diagrams` plus learn-slash: 1370 tests, 0 fail. The sentence splitter that trims over-long prose by whole sentences keeps tokens whole (checked offline on a long paragraph: 8 openers, 8 intact).

## Checked, not changed
- Card audio (`explanation-audio.js` on owner/local, not in this branch): the script route reads the body the client sends, which is the delivered (filled) body, so the spoken numbers come from the filled text. Nothing to change.
- Questions and terms are written in the same author call; tokens are not filled there (a token in a question fails the step). Terms anchor on the filled prose.

## Open for the Reviewer
1. Decimals: a token prints the number as stored (computed fence 21 prints "21", 0.7 prints "0.7"), not "the spec's decimals" beyond what `derived.js` rounded to; `|k` forces k. Say if you want it padded to the inputs' decimals.
2. Questions: fill tokens in the three questions too, or keep refusing them (current).
3. Any numeric path is accepted (an input like `boxes.0.q1` works), not only derived ones; the valid-paths message lists only the derived ones. Say if tokens must be limited to derived numbers.
4. The guidance sentence is appended to every explanation prompt, including a prose-only card; if a card has no figure it is wasted (about 45 words).

## Decisions applied 2026-11-18 (Reviewer)
Commit 26465bef6 on `feat/var-1`.
1. No padding: a token prints the stored number ("21" prints "21"), as built.
2. Tokens in the three questions are refused, as built.
3. Any numeric path is accepted, as built. After the step-1 amendment it reads every derived value, silent ones too (a plain box's fences exist for a token though the figure does not draw them).
4. CHANGED: the token sentence enters the prompt only when the card has a diagram. `learn-primitives.js` now holds `VISUAL_COMPLETE_BASE` (the shipped text, byte-equal to main's `VISUAL_COMPLETE`), `TOKEN_RULE`, and `VISUAL_COMPLETE = BASE + TOKEN_RULE`. `visualsStatement` (explanation-planner.js) adds the sentence when the plan has at least one non-picture visual, otherwise the base text only; the unplanned rules block (`EXPLANATION_VISUAL_RULES`, where the author decides the visuals and may draw a diagram) keeps it. Test: `explanation-tokens.test.js` "the token sentence is in the prompt of a card with a diagram and absent from a prose-only card" (diagram plan and mixed plan have it; picture-only and empty plans do not; an unplanned request has it; a picture-only plan's whole author request carries no `{{d:N.path}}`).
5. Gemini `op` only: waits for the bench; nothing done.
