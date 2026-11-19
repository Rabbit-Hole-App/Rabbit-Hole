# Intake asked once (owner 2026-11-18 22:09 to 22:11, via the Reviewer)

Before this change, `flowMessages` rebuilt the catalogue facts and "What do you want to do with this codebase?" on every render and pinned them above the thread.

1. **One question, one time.** When the repository connects and the chat opens, `askIntake` (rehearsal-flow.js) appends ONE Tutor message to the thread (`state.log`).
   - The message holds the catalogue's one-line fact (`factsMessage`), the question, and the catalogue's teachable options (`learnOf(doc).options`) as rows. There is no Run it / Learn from it step.
   - A click goes topic, then depth, then plan, as before. After that it is a normal chat.
   - The rows go grey once a topic is set (`optionsOpen`). Typing replies to the options (`mode: 'learn'`).
   - It is asked once per open of the chat (`asked`). A later render adds nothing.
   - A canvas with a saved Learn goal comes back at its plan and is not asked.
2. **Asked again only on the router's `codebase-options`** (`CODEBASE_OPTIONS_EVENT`). That appends the same message again (`intake-2`, and so on) with live rows.
3. **Run it is behind the flag `runIt`** (flags.js, `VITE_RUN_IT`, off by default, never set by prod-release.mjs).
   - Off: no Run it row and no route list.
   - On: Run it leads the rows where the codebase can run, and its route list is the second step, as before.
   - The Run card and `VITE_REHEARSAL_TRIGGER` are unchanged. Load sample section stays a dev-only last row.
4. **Status lines stay transient.** Indexing, catalogue-failed, and "Working out what you can learn here" (options still being added) show only until the question is asked. Nothing is pinned after that.
5. **Tests:**
   - learn-intake.test.mjs: asked once, a second ask adds nothing, codebase-options asks again, and with Run it off the options are the first rows.
   - choice-list.test.mjs: Run it on, and the rows greying.
   - intake-once.test.mjs: the wiring and the flag.

Shortcut: the question lives in the flow's thread state (`state.log`) like the Tutor's other intake lines, so a reload asks it again (once per open). It is not saved into the Chat thread.
