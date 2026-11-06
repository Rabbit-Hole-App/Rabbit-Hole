# R1 (card feedback) prerequisites receipt

Stacked release candidate `feat/tutor-r1-release` (MVP fast path, owner label 2026-11-05).

- Main integrated onto: `9b798f7760b7af5aa2446d281a07eebfc4e10b84` (P1 released). R1's lane commits (6, built on 4102f8ea) were cherry-picked without conflicts onto the P2 tip.
- Stacked on: cleanup P2 tip `cdeb7727494e6f4f79abc084a3661b4fe504cc40` (`feat/tutor-cleanup-p2`). **P2 must be released to main first**; this branch then fast-forwards from the released P2.
- Cleanup phase depended on: P2 only. Verified, not assumed (commands run in this worktree):
  - Card hosting: `grep -n CardFeedback packages/web/src/AdaptiveCanvas.jsx` shows the import and the single mount under a generated card (`!cadPermissions.readOnly && !cadPermissions.localCopy`).
  - Access: `card-feedback-routes.js` imports `authorizedBoardApp` from `learn-board.js`, which lazy-loads `canvasAccess` from `canvases.js`; both exist unchanged by P2 (`git diff 9b798f776 cdeb77274 --stat -- learn-boards.js shared-privacy.js learn-board.js canvases.js` is empty).
  - `learn_boards`: `card-feedback.js` reads `state_json` by `org, owner_email, app` (same query as `learn-boards.js ownerRow`); the columns are in `repository-schema.sql`.
  - `chat.canvasOps.hasBlock` / `locate`: defined in `LearnPage.jsx` (`hasBlock`, `locate: id => canvasApi.current?.focusBlock(id)`) and used by `CardFeedback.jsx` (summary rows).
  - LearnProgress props: `<LearnProgress scope={{ app: chat.canvas, board: boardName }} ... chat={chat} />` in LearnPage; the component takes `scope` and `chat`.
  - Provider chain: `CardFeedbackScope.Provider` wraps `AdaptiveCanvas` inside the `AnimationBoard` and `ExplainBackService` providers; its value uses `app.kind === 'canvas' && canEditCanvas` (defined at the top of LearnSurface from `app.canEdit`) and `boardName`. A member, viewer or project board gets `null` and no control.
  - Shared privacy intact: `shared-privacy.js` and `learn-boards.js` have no diff versus P2; feedback lives in its own table keyed by the owner's user id and is never part of the board state, so share and fork carry none.
- Migration: `packages/control-plane/learn-migrations/0036-card-feedback.sql` only (CREATE-only, `learn_card_feedback`). Latest Learn migration on main is 0035; cleanup adds none. State: applied to the **dev** Learn D1 by the Lead under the owner's dev-only authorization; **not applied to production**. The web and control-plane code degrade as `feedback_unavailable` (503) where the table is missing.
- Recovery branch: `feat/tutor-r1-release-recovery` (strict descendant; one commit that draws no rating control by setting `feedbackScope` to null in LearnPage.jsx).
