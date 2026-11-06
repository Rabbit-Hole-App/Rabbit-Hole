# R5 Lead patches (proposal editing minimum)

Nothing here is applied. Each `.patch` is a real `git diff` and was proved with `git apply --cached --check` against a temporary index of the named base (no worktree touched).
Proved against `rabbit-hole/main` `e90b47083` (core 76 merged, includes the R6 0040 mirror) and, where noted, `a28ed8f86`. The 76 chain will move main again: re-run the check before applying.
R5 is stacked on R6 (git order only; R5 does not use R6 code). Apply in this order after R4 and R6 are on main:

1. `git apply docs/features/explain-on-canvas/lead-patches/r5-repository-schema.patch` (mirror of migration 0041 at the tail of `repository-schema.sql`, after the 0040 mirror). Clean on `e90b47083`. On `a28ed8f86` (no 0040 mirror yet) use `r5-repository-schema.on-a28ed8f.patch` instead; clean there.
2. `git apply docs/features/explain-on-canvas/lead-patches/r5-learn-models-roadmap-proposal.patch` registers the `roadmap_proposal` role (Sonnet 5.5, low effort, 600 tokens, platform-funded) and updates the two pinned expectations in `test/learn-models.test.js`. Clean on both bases. Without it the edit composer fails closed: `POST .../proposals/:id/drafts` answers 503 `edit_unavailable`.
3. `node docs/features/explain-on-canvas/lead-patches/apply-r5-check-map.mjs` (5 rows, 1 check `roadmap-edit-check.mjs` at 45 s estimate, 12 appended). Ran clean on a copy of `e90b47083`'s `check-map.json`. The `check-map.test.mjs` six-part time budget has no headroom (a Lead decision, see `r6-lead-patches.md` section 2).

## Removed from this minimum

- The `proposal` ContextRef kind, Add to chat and the ask-route patch (`r5-index-ask-proposal-context.patch`, `r5-learnpage-add-to-chat.patch`) are gone: the kind broke `generation-review.test.js` (its pinned ContextRef list). Deferred; the first R5 commit (`8302dbb42`) holds the code if it is wanted back.
- The learner-selected link ("Use as my next step") still has its route and controller method but no card-menu entry (`canvas-actions.js` plus the controller from `LearnPage.jsx`, Lead-only). Not part of the minimum.
- Passing the dragged position to R4's slot reservation needs the canvas camera in `LearnPage.jsx`. Not part of the minimum.

## Activation (no patch)

`ROADMAP_EDIT_ENABLED` is a new variable, unset everywhere; it must be `'true'` together with `ROADMAP_ENABLED`. Migration 0041 must exist on the target `LEARN_DB` first (not applied anywhere). Do not add it to a wrangler config as true by this release. With it on, every roadmap view carries `edit: true` and the web renders Edit only then; with it off the views are R4's, byte for byte.
