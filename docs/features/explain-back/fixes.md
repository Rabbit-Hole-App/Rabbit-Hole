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

**FX-EB-03 · EB-02 / EB-10 · open (owner action at release)** — Production `LEARN_DB` (`rabbit-hole-learn-prod`) needs
migration `learn-migrations/0034-explain-back.sql` (3 tables, 2 indexes; additive) before the Explain-back code reaches
production: `purgeTutorRows` deletes from these tables, so a permanent canvas delete would fail without them. Dev is
applied and verified (2026-10-30 1:05 AM PT). Launcher prepared and tested in an isolated harness (9/9 scenarios):
`C:\s\spec\explain-back\apply-prod-migration-0034.cmd` (`--check` is read-only; apply asks for `APPLY PROD`). The
coordinator's attempt to run `--check` was refused by the session's production-read guard, so the production state is
unverified. Owner action: at release, run `C:\s\spec\explain-back\apply-prod-migration-0034.cmd --check`, then the same
command without `--check`, typing `APPLY PROD`. Keep the `eb-data` worktree until then (the launcher uses its config).

**FX-EB-04 · EB-06 · open (owner decision, not blocking)** — The ordinary Challenge card still offers Speak answer, which
answers "Speech to text is not configured on this environment." after recording (unchanged since 2026-10-26; O-8 now
covers Explain-back voice notes only, so the legacy dictation route stays refused). Options: (A) remove the microphone
from ordinary Challenge (recommended; it is a dead control); (B) give ordinary Challenge the retained voice note too.
Owner action: choose A or B; nothing is changed until then.

**FX-EB-05 · EB-08.4 · open (scope gap)** — "Open on canvas" for teaching aids is wired in the card but the stored review
carries no teaching-card references, so no teaching aid is ever listed. Building it needs a review field naming existing
linked teaching cards (no generation). Not started; recorded so it is not mistaken for done.

**FX-EB-07 · EB-09 · open (pre-existing, owner rule)** — The canvas style panel opens out of the tools column over the
cards it styles: with two grouped cards selected at 68% zoom it covered their ports (round 7, check fixed by deselecting
first). Possibly conflicts with the owner rule that canvas utilities never cover content. Not Explain-back code; needs its
own task. Owner action: decide whether to open one.

**FX-EB-08 · process · resolved in practice** — Each push to a worker branch runs its own verify + fast-e2e; worker
branches that equalled the integration SHA doubled runner minutes. Duplicate runs were cancelled (41044776909/41, 41047053473/511,
41049082261/317, 41051073532/377, 41051369789/770) and workers now push only new commits on request.

## Resolved

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
