# Explain-back blockers and fixes

Linked from [the checklist](../explain-back-checklist.md). One entry per blocker. Resolved entries keep their history and
name the fixing commit.

Entry format: **ID · task · status (open / resolved)** — evidence or error; attempted fixes; remaining work; owner;
exact action needed from the owner (if any).

## Open

**FX-EB-02 · EB-09 · open, not blocking** — Timing tests under full-suite load fail intermittently in worker and
integration runs: `packages/web/src/explain-program/genuine-card.test.mjs`, `host.test.mjs`, `retention.test.mjs`,
`state-contract.test.mjs`, `interaction`/`drag` tests, and control-plane `subscription.test.js` (deadline launcher) and
`image-jobs.test.js` ("boundary 2"). Every one passed when rerun alone (e.g. 38/38, 36/36, 18/18), and none is in files
this work changed. Pre-existing on main 05c1221fe; cause unclassified (several agents ran suites concurrently on one
machine). No rerun policy change. Owner action: none.
Browser tier, same class: fast-e2e round 9 (run 41051664753) failed `docs-removed-check` step 1 (`page.goto` of the landing
page timed out at 30 s) and `explain-program-state-check` ("the handle did not settle at 540"); both passed in rounds 4-8 on
the same code paths and neither file is touched by this work. Recorded as intermittent, unclassified.

**FX-EB-04 · EB-06 · fixed on branch, release pending** — The ordinary Challenge card still offers Speak answer, which
answers "Speech to text is not configured on this environment." after recording (unchanged since 2026-10-26; O-8 now
covers Explain-back voice notes only, so the legacy dictation route stays refused). Owner chose (A) on 2026-10-30: remove
the microphone from ordinary Challenge, which keeps its text box; Explain-back keeps its voice note. Fixed by 9880092d0 on
`fix/challenge-mic-removal` (SpeakAnswer.jsx deleted; the browser checks assert no microphone on Challenge). It ships with
the next release; production still shows the dead microphone until then. The legacy `/api/learn/transcribe` route stays
and keeps answering not configured; nothing calls it now.

**FX-EB-09 · EB-07 / EB-08 · fix committed, live check pending** — A real provider reply dropped a criterion (dev preview,
live acceptance 2026-10-30 ~10:30 AM PT, voice-only answer, attempt at_fa3ff4ec, 2 criteria): `provenance.unassessed` =
`[{criterionId: "k_2f2f99245d28ecd1", version: 1, reason: "not_returned"}]`, `rejected` = `[]`. The reply's `criteria` held
one entry and its `notes` said the velocity criterion should be added, judged met; the correct answer was Not rated
(`criteria_unassessed`) while its feedback praised that idea. Same family as eval-live-3. Fix (c4a950cae,
feat/eb-teaching-aids): the reply format now writes one entry per rubric criterion with its criterionId and version
filled in, in rubric order, states the exact count, and says a judgement written elsewhere (such as in `notes`) is ignored.
No extra call. Parsing stays strict: a judgement only in `notes` is never credited (test "FX-EB-09 dropped criterion" uses
this reply shape). Remaining: the live eval case `voice-only-every-criterion` (tests/evals/explain-back) has not been run;
the coordinator runs live evals. Owner action: none.

**FX-EB-10 · TUT-16 · fix committed, browser check pending CI** — Owner screenshot 2026-10-30: a Challenge resized tall
kept its question and answer controls in the top half with a large blank area below. Cause: CanvasNode's corner handle
allowed any height up to 1000 px (`clampBox`), saved it as the block's `h`, and drew it as a fixed `height`, so the card's
flex body stretched to it whatever the content needed (reproduced in `card-layout.test.mjs`, "the screenshot case").
Fix (4e9633cb9, `fix/text-card-height`): an explicit per-type policy, `fitContent` on the BLOCK_TYPES entries `challenge`
(every mode, so Explain-back and the Practice card too), `explanation`, `quiz` and `flashcards`. For those cards
(`card-layout.js` `fitFrame`) the saved, dragged or type height is a `max-height` ceiling and the height follows the content:
text wrapping, feedback tabs, the attempt history and an opened section grow or shrink the card, content above the ceiling
scrolls in the body. The drag and its commit are clamped to `naturalHeight` (the unstretched card's height plus its body's
scrolled overflow), so no more than the content needs is stored. Saved oversized heights are clamped when drawn and are
not rewritten until the learner next resizes the card. Notebooks, Sketch, media, diagrams, graphs, code and the
Full/Scrollable card layouts keep fixed frames. Remaining: `text-card-height-check.mjs` (runner fork) runs in fast-e2e;
not yet run. Owner action: none.

**FX-EB-07 · EB-09 · open (pre-existing, owner rule)** — The canvas style panel opens out of the tools column over the
cards it styles: with two grouped cards selected at 68% zoom it covered their ports (round 7, check fixed by deselecting
first). Possibly conflicts with the owner rule that canvas utilities never cover content. Not Explain-back code; needs its
own task. Owner action: decide whether to open one.

**FX-EB-08 · process · resolved in practice** — Each push to a worker branch runs its own verify + fast-e2e; worker
branches that equalled the integration SHA doubled runner minutes. Duplicate runs were cancelled (41044776909/41, 41047053473/511,
41049082261/317, 41051073532/377, 41051369789/770) and workers now push only new commits on request.

## Resolved

**FX-EB-03 · EB-02 / EB-10 · resolved 2026-10-30** — Production `LEARN_DB` (`rabbit-hole-learn-prod`) needed migration
`learn-migrations/0034-explain-back.sql` (3 tables, 2 indexes; additive) before the Explain-back code reached production:
`purgeTutorRows` deletes from these tables, so a permanent canvas delete would fail without them. The owner ran
`C:\s\spec\explain-back\apply-prod-migration-0034.cmd` before release 22-eb; it reported `RESULT OK applied and verified
5/5`. Release 22-eb (`a3376817f`) followed at 9:57 AM PT.

**FX-EB-05 · EB-08.4 · resolved (c4a950cae, feat/eb-teaching-aids)** — "Open on canvas" was wired in the card but the
stored review carried no teaching-card references, so no teaching aid was ever listed. Now the browser sends a bounded list
of the canvas's existing teaching cards (explanation, animation, scene, video, notebook; at most 12; never the Explain-back
card or a card still being made) with each submission or reassessment, outside the saved answer. The one assessment call
reads it as data; the review keeps at most 2 picks whose ids were in that list, only beside a gap to revisit, with a short
reason (`review.teachingAids`; unknown or malformed picks are dropped and never fail the assessment). Open on canvas
selects and frames the existing card: no request, no model call, no new card. A card later removed shows unavailable, not a
substitute. Reviews stored before the field render as before. Browser wiring is covered by `explain-back-sketch-check`
("EB-08.4 teaching aids"); whether a real evaluator picks sensibly is the live eval case `teaching-aid-reuse` (not run).

**FX-EB-01 · EB-06 / EB-07 (voice notes) · resolved** — Transcription was refused before the provider in every
environment: `paidSubmissionRefusal(env)` is the fail-closed guard for unpriced transports. Fixed by a priced, bounded
admission (`transcribeSpendTransport`, feat/eb-media 021fc27d8, reservation from stored bytes 0e327df59) used only for
Explain-back voice notes at assessment; prices re-read from the official OpenAI page 2026-10-30. `TRANSCRIBE_ENABLED`
is set to `"true"` in the dev, parallel and production configs (64bcd7d4b) — production takes effect only with the
release. The legacy dictation route keeps answering not configured.

**FX-EB-06 · EB-09 · resolved** — First fast-e2e on integration `0ffffcc14` (run 41028919464): 79/84 checks passed.
Failures and fixes: `explain-back-media` (Submit read a removed voice note one effect late — card reads controllers in
render, feat/eb-ui 74ea61306); `slash-sheet` (Explain-back card built its Sketch panel without a canvas in the /practice
preview — built only while open; preview withholds the durable store, 74ea61306); `explain-back-sketch` (check drew on the
answer card, not empty canvas — check fixed, 74ea61306); `canvas-forking` (owner page seeded without the Explain-back
card — check fixed, feat/eb-canvas c34f4ba8b); `canvas-editing` (read the save before it landed; targets the docked panel —
c34f4ba8b). Verified in the next CI run on `fa27d0657` (see checklist).
