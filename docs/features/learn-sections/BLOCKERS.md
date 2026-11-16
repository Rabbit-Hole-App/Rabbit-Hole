# Learn sections: blockers, decisions taken alone, deviations

Read this first. Each entry: **what**, **where**, **what was done instead**, **what is needed**. Newest at the bottom of each list.

Branch `rehearsal/sections`, based on `rehearsal/mvp` d6e42614d (2026-11-16 00:46 PT).

## Blockers

## Decisions taken alone

- **Lane layout.** Four lanes in their own worktrees (`C:/s/sec-core`, `C:/s/sec-browser`, `C:/s/sec-tools`, `C:/s/sec-evidence`) on branches `rehearsal/sections-<lane>`, merged into `rehearsal/sections` in the order CORE, BROWSER, TOOLS. Main's CLAUDE.md asks for isolated worktrees per lane. What is needed: nothing.
- **TOOLS: the example code check reads the request's `context`.** `learn-section-make/code.js` (C §2b) puts the source's top-level Python module names on one `context` line (`Source modules, never imported: a, b`, `learn-primitives.js SOURCE_MODULES_LINE`) of the `slash` perform; the section variant of `code_sample` (madeBy `learn-section`) refuses an answer that imports one of them or does a relative import, and an answer with an output claim (`>>>`, `# output`, `# ->`). Typed /code is unchanged (60 lines, 2000 characters, no new checks). Done instead of a new artifact-body field, which CONTRACT.md does not have. What is needed: BROWSER's `learn-slash.js` sends `perform.context` as the artifact body's `context` (CONTRACT already says so).
- **TOOLS: `ctx.record` for data plots (C §9).** `graph.js` traces a `data_plot` value to `ctx.record` (the rehearsal record's measured numbers: metrics, step times), the anchored lines and this section's notebook files in `ctx.earlier`. CONTRACT.md's ctx has no `record`; without it a `data_plot` that claims measured values is corrected to `illustrative: true` and the correction recorded. What is needed: CORE puts the rehearsal record (any JSON; its numbers are read) on `ctx.record`, or the integrator adds it to CONTRACT.md. C §9c.3 (a graph on a structure beat) is compose's fit check: not built here.

## Deviations from the specs

- **No screenshots.** The overnight brief asks for screenshots where a card is made. Main's CLAUDE.md (Browser verification) forbids Claude browser checks unless the owner authorizes an exception, so the evidence is API-level only: the requests, the server's returned `perform` and the stored records. What is needed: the owner clicks **Make section** on 8878 to see the cards.
