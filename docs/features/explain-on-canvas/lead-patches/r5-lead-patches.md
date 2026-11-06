# R5 Lead patches (proposal editing, Chat reference, existing-card links)

Nothing here is applied. Each `.patch` was produced by actually editing the tree and `git diff`; `git apply --check` is clean on this branch.
R5 is stacked on R6 (git order only; R5 does not use R6 code). Apply in this order after R4 is on main:

1. `git apply docs/features/explain-on-canvas/lead-patches/r5-repository-schema.patch` (mirror of migration 0041 at the tail of `repository-schema.sql`, after 0039/0040). `node --test scripts/schema-check.test.mjs` passes with it applied.
2. `git apply docs/features/explain-on-canvas/lead-patches/r5-learn-models-roadmap-proposal.patch` registers the `roadmap_proposal` role (Sonnet 5.5, low effort, 600 tokens, platform-funded) and updates the two pinned expectations in `test/learn-models.test.js` (registry order, role table). Without it the edit composer fails closed: `POST .../proposals/:id/drafts` answers 503 `edit_unavailable` (`role_not_registered`). With it applied `test/learn-models.test.js` (15) and `test/roadmap-proposal-drafts.test.js` pass.
3. `git apply docs/features/explain-on-canvas/lead-patches/r5-index-ask-proposal-context.patch` (`index.js`, the Lead-only ask route): attached `proposal` refs are resolved by `roadmap-proposal-context.js` under the asker's access right after the mentioned-canvas read; an unreadable or stale one refuses the turn with 403 `proposal_unavailable` naming nothing; the text rides into `context`. `node --check` passes. Without it a `proposal` ref passes validation (chat-modes.js) but adds no text, so Chat would answer without the proposal context.
4. `git apply docs/features/explain-on-canvas/lead-patches/r5-learnpage-add-to-chat.patch` (`LearnPage.jsx`, one line): passes `addToChat` to `<RoadmapCanvas>` so the overlay's Add to chat button attaches the reference through `chatWorkspace.current.addToChat(ref)` and never sends. Without it the button is simply absent. Confirm `chatWorkspace` is in scope at the mount (it is used at line 1051 of the same component).
5. `node docs/features/explain-on-canvas/lead-patches/apply-r5-check-map.mjs` (6 rows, 1 check `roadmap-edit-check.mjs` at 45 s estimate, 12 appended). Proved on a copy swapped in for one run (then restored), together with `apply-r6-check-map.mjs`: `check-map.test.mjs` passes 21 of 22; the one failure is the six-part time budget, which the R4 tip already fills (each added check pushes a part over 900 s: 915 s with R5 and R6 both added). Same Lead decision as `r6-lead-patches.md` section 2.

## Not patched, not done (for the Lead to place)

- The learner-selected link ("Use as my next step") has a route (`POST /roadmap/:id/steps/link`) and a controller method (`controller.linkCard(cardId, reason)`), but no card-menu entry: that row belongs in `canvas-actions.js` and needs the roadmap controller from `LearnPage.jsx`, which is Lead-only. Suggested: a card context-menu row shown when `roadmap.active` and the card type is linkable (`LINKABLE_TYPES` in `roadmap-links.js`).
- Ctrl/Cmd+L / Add to chat for a proposal: the overlay button is wired (patch 4); the keyboard chord is not.
- Passing the dragged position to R4's slot reservation (world space): the position is kept per proposal version in screen space (`roadmap-proposal-context.js`); converting it and handing it to `deliveredSpot` needs the canvas camera, which only `LearnPage.jsx` has.

## Activation (no patch)

`ROADMAP_EDIT_ENABLED` is a new variable, unset everywhere; it must be `'true'` together with `ROADMAP_ENABLED`. Migration 0041 must exist on the target `LEARN_DB` first. Do not add it to a wrangler config as true by this release.
