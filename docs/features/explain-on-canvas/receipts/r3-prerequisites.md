# R3 (source passage references) prerequisites receipt

Stacked release candidate `feat/tutor-r3-release` (MVP fast path, owner label 2026-11-05).

- Main integrated onto: `9b798f7760b7af5aa2446d281a07eebfc4e10b84` (P1 released). R3's lane commits (3, built on 4102f8ea; lane tip `91e0eb632`) were cherry-picked onto the R1 release tip.
- Stacked on: R1 release tip `15141c05a931e082aaa2e59693d288a421d73938` (`feat/tutor-r1-release`), itself on cleanup P2 tip `409f4e8f3e4638bcc4b0477a2d2a26041ab40ec3`. **P2, then R1, must be released to main first**; this branch then fast-forwards from the released R1.
- Cleanup phase depended on: P2 only (plus R1 for the shared `AdaptiveCanvas.jsx` feedback slot, kept as is). Verified on this base, not assumed:
  - `packages/control-plane/src/explain-job.js`, `learn-artifact.js` (`export async function artifactFetch(..., { sourceRef })`), `packages/web/src/explain-client.js`, `learn-slash.js`, `FileDocMarkdown.jsx`, `LearnPaper.jsx` all exist and carry only R3's hunks (`git diff 15141c05a HEAD --stat`).
  - `pdf-excerpts.js` now exports `readSource` and `sourceHash` (R3's only change to it); `source-refs.js` imports them.
  - `shared-privacy.js`: `sharedBlock` runs `withSharedSourceRef(publicExplainBack(block))`, so shared readers keep only the source name. `learn-boards.js`: `saveOwn` computes `sourceRefCards(body.state)` and rewrites the source-to-card index in the same guarded batch; the copy path (`forkState` caller) carries the index for your own copy only. Both files had no cleanup-P2 or R1 changes, so the R3 hunks apply as authored.
  - `AdaptiveCanvas.jsx` `LessonBlockCard` (chip slot beside `SourcesDisclosure`, R1's `CardFeedback` slot untouched), `LearnPage.jsx` `startExplain` (new `sourceRef` option sends `sourceRefId`) and the `EXPLAIN_PASSAGE_EVENT` listener, `dev-worker.js` route mount: Lead patches applied by content, one commit.
- Migration: `packages/control-plane/learn-migrations/0038-source-refs.sql` only (CREATE-only: `learn_source_refs`, `learn_source_ref_cards`). Applied to the **dev** Learn D1 by the Lead (dev only); **not applied to production**: it is applied to production LEARN_DB before this release goes live. Latest main Learn migration is 0035; R1 adds 0036; 0037 (R2) is absent on this branch.
- `repository-schema.sql` mirror order: 0035, then R1's 0036, then R3's 0038 (0037 absent). R2 lands later and inserts its 0037 block before 0038.
- Recovery branch: `feat/tutor-r3-release-recovery` (strict descendant; one commit removing the LearnPage passage listener, the AdaptiveCanvas chip, hook and `sourceDraft`, and the dev-worker route, so no ref is minted and no chip renders; the server module and the FileDocMarkdown/LearnPaper code stay inert).
