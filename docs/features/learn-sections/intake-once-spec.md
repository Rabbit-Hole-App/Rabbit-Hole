# Source arrived: the Tutor opens (owner 2026-11-18 22:09 / 22:15, via the Reviewer)

This replaces the "intake asked once" draft. The opening question is written by the Tutor from what arrived, not a fixed sentence. The mechanism is one event for any source kind: a repository today, Markdown, PDF and slides next.

1. **One event for any source.** `sourceArrived(canvas, { kind, summary, options, cannot, canRun })` (source-arrived.js) fires when a source's reading finishes.
   - The repository fires it when its catalogue lands (TutorRehearsal.jsx, `repositoryArrival`): `kind: 'repository'`, the catalogue's one-line facts as the summary, `learnOf(doc).options`, `cannot`, and whether it can run.
   - Another source will fire the same call with its own words. Only the shape is built now.
   - While reading, the chat shows the shimmering pending line as before. Nothing else is pinned.
2. **The Tutor writes the opening:** the server action `learn_open` (learn-codebase-source-map.js), metered like `learn_intro`.
   - Input: `{ kind, summary, options [{ id, label, what }], cannot [{ thing, why }] }`. It reads no repository.
   - It makes one non-streaming call with `tasks/learn-open.md`:
     > A new source just arrived; the learner has not spoken. In two or three short sentences, say what it is in plain words and ask what they want to do with it; name nothing the options do not say; no path, file name or flag; end with the question.
   - Output: `{ text }`. A failed or empty call returns 502.
3. **One Tutor message joins the thread** (`state.log`): the opening's text plus the options as rows (`learn:<id>`).
   - If `learn_open` fails, the fixed sentence (the facts and "What do you want to do with this codebase?") is used, with the same rows. The learner always gets the question.
   - While it is being written, "Working out how <name> can be used" shimmers.
   - After that it is a normal chat. Nothing is rebuilt per render. The rows go grey once a topic is set, and typing replies to them.
   - It is asked once per open of the chat. The router's `codebase-options` writes a fresh opening, appended with live rows.
   - A canvas with a saved Learn goal comes back at its plan instead.
4. **Run it is behind `runIt`** (flags.js, `VITE_RUN_IT`, off by default, never set by prod-release.mjs).
   - On: the opening's rows gain Run it first, where the source can run, and its route list follows as before.
   - The Run card and `VITE_REHEARSAL_TRIGGER` are unchanged. Load sample section stays a dev-only last row.
5. **Tests:**
   - learn-intake.test.mjs and choice-list.test.mjs: asked once, a re-render adds nothing, codebase-options asks again, Run it off gives no Run row, the rows grey.
   - intake-once.test.mjs: the arrival's words, the body learn_open is sent, a 502 gives the fixed sentence plus rows, and the flag.
   - learn-codebase-source-map.test.js: the prompt is byte-equal to the owner's sentence, one call with the words as material, nothing written, 502 and 400.
   - Browser checks: intake-run-or-learn-check.mjs (the two-step intake it covered is gone) is removed. learn-plan-check.mjs picks its topic from the opening's rows.

6. **Saved into the chat thread** (Reviewer 2026-11-19 08:20).
   - Each opening is saved as a Tutor entry (`saveTutorEntry`, `meta.tutor.kind: 'opening'`, with its options and canRun) in the open thread. A new chat gets its thread here, as a first turn would.
   - A reload reads the thread first (`savedOpenings`, `restoreOpenings`): the same opening comes back with live rows and no second `learn_open`.
   - The transcript leaves `opening` entries to the Tutor flow (ChatMessages `hideTutor`), so it is never shown twice. codebase-options still writes a new one.
