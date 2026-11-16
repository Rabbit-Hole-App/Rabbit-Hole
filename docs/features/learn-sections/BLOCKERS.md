# Learn sections: blockers, decisions taken alone, deviations

Read this first. Each entry: **what**, **where**, **what was done instead**, **what is needed**. Newest at the bottom of each list.

Branch `rehearsal/sections`, based on `rehearsal/mvp` d6e42614d (2026-11-16 00:46 PT).

## Blockers

## Decisions taken alone

- **Lane layout.** Four lanes in their own worktrees (`C:/s/sec-core`, `C:/s/sec-browser`, `C:/s/sec-tools`, `C:/s/sec-evidence`) on branches `rehearsal/sections-<lane>`, merged into `rehearsal/sections` in the order CORE, BROWSER, TOOLS. Main's CLAUDE.md asks for isolated worktrees per lane. What is needed: nothing.

- **Three agents, not four (owner 00:52).** The 00:44 brief named four lanes; the owner's 00:52 message names three. CORE (server spine) and TOOLS (server tool halves) were already running as two agents, and BROWSER as the third, so the owner's Lane 3 (prompt runs, datasette canvas, acceptance runs, morning report) is done by the integrator, not a fourth agent. The overlays for brief and compose are written by CORE, byte-for-byte from the specs. What is needed: nothing.
- **Make runs use the draft overlay, marked pre-review (owner 00:52).** `tasks/learn-section-make.md` is a draft until the Reviewer's byte review; every Make run tonight is labelled "pre-review" in the evidence.
- **`tool_choice: auto`, no forced submit turn (Reviewer 01:00).** Copied from `learn-code-explain.js:323`; the forced-call probe was dropped.

## Deviations from the specs

- **No screenshots.** The overnight brief asks for screenshots where a card is made. Main's CLAUDE.md (Browser verification) forbids Claude browser checks unless the owner authorizes an exception, so the evidence is API-level only: the requests, the server's returned `perform` and the stored records. What is needed: the owner clicks **Make section** on 8878 to see the cards.
