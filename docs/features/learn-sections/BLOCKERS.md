# Learn sections: blockers, decisions taken alone, deviations

Read this first. Each entry: **what**, **where**, **what was done instead**, **what is needed**. Newest at the bottom of each list.

Branch `rehearsal/sections`, based on `rehearsal/mvp` d6e42614d (2026-11-16 00:46 PT).

## Blockers

## Decisions taken alone

- **Lane layout.** Four lanes in their own worktrees (`C:/s/sec-core`, `C:/s/sec-browser`, `C:/s/sec-tools`, `C:/s/sec-evidence`) on branches `rehearsal/sections-<lane>`, merged into `rehearsal/sections` in the order CORE, BROWSER, TOOLS. Main's CLAUDE.md asks for isolated worktrees per lane. What is needed: nothing.
- **BROWSER: section ids.** CONTRACT.md fixes `sectionId` in every body but not its form. The browser sends `'1.1'` for the first section on Accept (sections numbered `n.m` in the plan's order, the numbering the brief spec's "already taught in <n.m>" and the contents use), and after that only the `currentSectionId` that `learn_section_next` returns; a reload reads `checkpoint.learn.currentSectionId`. Where: `TutorRehearsal.jsx FIRST_SECTION`. What is needed: CORE confirms `'1.1'` names the first section, or the integrator changes `FIRST_SECTION`.
- **BROWSER: a reload runs nothing.** After a reload of an accepted plan the dev rows **Next section** / **Make section** act on the stored current section; brief and compose are not called again (no spend on reload), so the dev disclosure is empty until one of them runs. **Make section** calls `learn_section_compose` first when it has no composition (the stored one comes back), then starts at the first item. Where: `TutorRehearsal.jsx makeSection`. What is needed: nothing for the rehearsal; the browser does not read `made[]` back.
- **BROWSER: Make failure words.** A §5 has words for the brief only. Compose, Next section and Make failures show the server's `words` when it sends them, else A §5's sentence, with the same **Try again** / **Skip this section** rows. What is needed: the Reviewer's words for a Make failure if they should differ.
- **BROWSER: notebook runtime list.** The notebook site publishes no package list, so `notebook-runtime.js RUNTIME_PACKAGES` is Pyodide 314.0.6's (the version jupyterlite-pyodide-kernel 0.8.6 loads): CPython 3.13's `sys.stdlib_module_names` plus 3.14's `annotationlib`/`compression`, less tkinter, turtle, curses, idlelib, ensurepip, venv, plus every `imports` name in that version's `pyodide-lock.json` (488 names). `unavailableImports(code, { local })` takes an optional second argument, the module names of the card's own `.py` files, so a helper import is not marked unavailable; called with one argument (the contract shape) a helper module counts as unavailable. What is needed: TOOLS passes `{ local }` from the notebook's `.py` file names.
- **BROWSER: notebook helper files.** Files other than the active notebook ride on the block's `seed_files` (the shape an imported `.py` already uses; `canvas-bridge.js` writes them into a new, empty workspace as text files). A second `.ipynb` is seeded the same way, as text; whether JupyterLite opens a notebook seeded as a text file was not checked (no browser checks). What is needed: the owner opens a two-notebook card on 8878.

## Deviations from the specs

- **No screenshots.** The overnight brief asks for screenshots where a card is made. Main's CLAUDE.md (Browser verification) forbids Claude browser checks unless the owner authorizes an exception, so the evidence is API-level only: the requests, the server's returned `perform` and the stored records. What is needed: the owner clicks **Make section** on 8878 to see the cards.
