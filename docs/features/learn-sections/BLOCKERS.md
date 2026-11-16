# Learn sections: blockers, decisions taken alone, deviations

Read this first. Each entry: **what**, **where**, **what was done instead**, **what is needed**. Newest at the bottom of each list.

Branch `rehearsal/sections`, based on `rehearsal/mvp` d6e42614d (2026-11-16 00:46 PT).

## Blockers

## Decisions taken alone

- **Lane layout.** Four lanes in their own worktrees (`C:/s/sec-core`, `C:/s/sec-browser`, `C:/s/sec-tools`, `C:/s/sec-evidence`) on branches `rehearsal/sections-<lane>`, merged into `rehearsal/sections` in the order CORE, BROWSER, TOOLS. Main's CLAUDE.md asks for isolated worktrees per lane. What is needed: nothing.

- **CORE: no forced-tool probe; auto per Reviewer 01:00.** Where: every `learn_section_*` model call (`learn-section-research.js sectionTurn`). The engineering decision asked for one real probe of forced `tool_choice` on Sonnet 5.5 first; Reviewer round 2 (01:00) replaced it: copy `learn-code-explain.js` (tool_choice auto, exactly one call of the submit tool, one re-ask). No API call was made. The research loop offers the research tools and the one `submit_*` tool on auto in the same request; a reply that calls no tool is re-asked once. What is needed: nothing.

- **CORE: sectionId is the plan's own numbering.** Where: `learn-section-store.js planSections`, every `learn_section_*` action. CONTRACT names `sectionId` but not its form. It is `"<chapter>.<section>"` over the accepted plan's ops in order (`1.1`, `1.2`, `2.1`), the numbers the contents show; outline op keys are optional on sections, so they cannot be the id. What is needed: BROWSER sends these ids.
- **CORE: no `learn_section_save` action.** Where: spec A §1. The brief action stores its own result in `learn_sections`; CONTRACT lists no save action, so none was built. A redone brief clears the stored composition and made list of that section. What is needed: nothing.
- **CORE: `learn_section` is not added to `learn-usage.js FEATURES`.** Where: `learn-usage.js` (a broad CI path, not CORE's file). The actions are metered with feature `learn_section` through the route's `metered()`; FEATURES is the documentation list and is not checked at runtime. What is needed: the integrator adds `'learn_section'` to FEATURES when it touches that file anyway.
- **CORE: `learn_sections` rows are not purged on a permanent canvas delete.** Where: `learn-coaching-store.js purgeTutorRows`. A DELETE on a table prod D1 does not have yet would fail every canvas delete there (DECISIONS L: the migration is local only). What is needed: add `DELETE FROM learn_sections WHERE org = ? AND app = ?` to `purgeTutorRows` in the release that applies 0046 to prod.

## Deviations from the specs

- **No screenshots.** The overnight brief asks for screenshots where a card is made. Main's CLAUDE.md (Browser verification) forbids Claude browser checks unless the owner authorizes an exception, so the evidence is API-level only: the requests, the server's returned `perform` and the stored records. What is needed: the owner clicks **Make section** on 8878 to see the cards.
