# Explain-back blockers and fixes

Linked from [the checklist](../explain-back-checklist.md). One entry per blocker. Resolved entries keep their history and
name the fixing commit.

Entry format: **ID · task · status (open / resolved)** — evidence or error; attempted fixes; remaining work; owner;
exact action needed from the owner (if any).

## Open

**FX-EB-01 · EB-06 / EB-07 (voice notes) · open** — Transcription is refused before the provider in every environment:
`/api/learn/transcribe` calls `paidSubmissionRefusal(env)` (`packages/control-plane/src/learn-paid-transport.js`), which is
the fail-closed guard for unpriced transports and always refuses while spend is enforced (`spendEnforced` is true except
`SMALL_ENV=test`). Setting `TRANSCRIBE_ENABLED` alone would not make voice-only answers reviewable. Fix in progress
(worker M): a priced, bounded admission for OpenAI transcription in `pricing-registry.js`/`learn-paid-transport.js` from
the official price page, following the Fish pattern; Explain-back transcripts call it only at submission/assessment.
Owner action: none (transcription approved for dev and production under existing spend controls, 2026-10-29).

**FX-EB-02 · EB-09 · open, not blocking** — `packages/web/src/explain-program/genuine-card.test.mjs` intermittently fails
its time-limit assertion under full-suite load in worker worktrees (eb-canvas, eb-media runs, 2026-10-30); it passes 3/3
alone and passed in the integration runs. Pre-existing on main 05c1221fe, unrelated to Explain-back. Recorded, not
classified; no rerun policy change. Owner action: none.

## Resolved

None yet.
