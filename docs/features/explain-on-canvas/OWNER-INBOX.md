# Tutor ladder and cleanup: owner inbox

Self-contained status for the owner and for a reviewer who has not seen the chat. Written by Claude (Lead). Times are Pacific.

- **Last updated:** see the git log of this file (the Lead updates it after every event).
- **Where:** branch `feat/tutor-owner-inbox` on `rabbit-hole`, file `docs/features/explain-on-canvas/OWNER-INBOX.md`. Desktop mirror: `C:\Users\cyudhist\Desktop\TUTOR-OWNER-INBOX.md`.
- **Authority in force:** the Tutor ladder (R1-R16) and cleanup P1-P7 are MVP-labelled (MVP fast path; broad CI and the broad gate are recorded as bypassed, never passed). Claude never sets `MVP_ALLOWED_SHA`, pushes `main`, deploys production, applies a migration to dev or prod D1, or spends beyond an approved cap. Those are owner actions, listed per release below.
- **Documents (all on the Desktop):** `cleanup-v0.5.md` (cleanup), `tutor-roadmap-v1.4.md` (ladder), `tutor-implementation-checklist.md` (executable tasks), `tutor-ladder-manifest.md` (task map, migration reservations, single file writers).
- **Rule:** I tick a box and add a dated line when something resolves. Overnight I keep working on everything that does not depend on an open item.

---

## 1. Morning summary (kept current)

### Ready for your release commands
| Release | State | SHA |
| --- | --- | --- |
| Cleanup P1 | RELEASED 2026-11-05 23:13 PT (main 9b798f77; production smoke passed) | 9b798f776 |
| Cleanup P2 | Built, pushed, CI running (verify passed; fast-e2e informational). Release package (smoke, recovery branch, preview launcher, commands) is being finalised; see section 3 | cdeb77274 |

### Blocked or waiting (details in sections 2 and 3)
R1 (waits for the P2 merge), R3 (waits for the P2 merge), R2 (waits for P4), R4 (owner records D2, D43 and the paid cap), cleanup P3-P7 (not started).

### Exact release commands
Section 3 holds the per-release command blocks. They are valid only once a release's status there says READY.

---

## 2. Decisions and blockers needing you

Format per item: ID, exact blocker, evidence, recommended resolution, precise decision or command needed. None of these stops other work.

- [ ] **D-R4-1 (R4, D2 routing exception).**
  - Blocker: R4 cannot activate without the owner record.
  - Evidence: `contracts/decision-records.md` on branch `feat/tutor-r4-contracts`; code facts in `contracts/adapter.md` (`generateArtifact` has no allowlist parameter; `allowedPrimitives` is read nowhere on main).
  - Recommended: adopt. A trusted server-only roadmap text/table adapter (formats `explanation` and `table` only); typed and Quick Edit `/explain` unchanged.
  - Decision needed: reply "adopt D2" (or amend the wording in decision-records.md).
- [ ] **D-R4-2 (R4, D43 contextual safety policy).** Same file. Recommended: adopt. Decision needed: reply "adopt D43".
- [ ] **D-R4-3 (R4, first real-model candidate spend).**
  - Blocker: no paid check may run without an approved cap.
  - Evidence: decision-records.md estimate: 12 scenarios (8 development + 4 holdout); typical about $9.80, worst single pass about $23.10, expected with one repair pass about $14.70; stop and report at $20.
  - Recommended: approve **$25**. Decision needed: "approve $25" or another cap. No spend happens before this.
- [x] **D-DEVDB: AUTHORISED by the owner 2026-11-06 ("yes dev migrations").** Scope: additive CREATE-only migrations 0036, 0037 and 0038 on the DEV D1 (`rabbit-hole-learn-dev`) only, in number order; never production. Claude applies each only after its lane's migration file is final (lane corrections are still editing 0036/0037/0038), announces the run in this file first, and verifies the schema afterwards. Production application remains an owner action at release time. The original item follows.
- [x] **D-DEVDB APPLIED 2026-11-06 about 00:10 PT** (announcement and result in one line): migrations 0036 (card feedback, with revision), 0037 (user settings and per-canvas Depth) and 0038 (source refs and the board-save-derived index) were applied to the dev Learn D1 `rabbit-hole-learn-dev` only, in order, from the lane worktrees at their corrected commits (R1 9763fcf3a, R2 a3f090b8a, R3 91e0eb632). Verified: tables `learn_card_feedback`, `learn_user_settings`, `learn_canvas_depth`, `learn_source_refs`, `learn_source_ref_cards` exist; the script (`C:\s\spec\release-queue\apply-dev-migrations-tutor.sh`) refuses any non-additive statement and any CREATE without IF NOT EXISTS; log in `C:\s\spec\logs\apply-dev-migrations-tutor-*.log`. **Production still needs the same three files applied by you before each release goes live** (commands will be in each release block).
- [x] (original text) **D-DEVDB (R1, R2, R3 previews: additive migrations on the shared dev D1).**
  - Blocker: the previews of R1, R2 and R3 can only exercise their new tables if migrations 0036, 0037 and 0038 exist on the dev D1 (`rabbit-hole-learn-dev`), which every dev clone shares. Without them each preview shows the feature's "unavailable / not saved" path, so the preview cannot verify the feature.
  - Evidence: the clone shares the dev D1 (docs/features/mvp-fast-path.md, Limits). All three files are CREATE-only (schema-check enforces it).
  - Recommended: authorise Claude to apply 0036-0038 to the DEV D1 only, in number order, after announcing it here. Production stays an owner action at release time.
  - Decision needed: "yes dev migrations" (before sleeping) or "no". Without a yes, Claude applies nothing, and the three previews are recorded as partially verified.
- [ ] **D-R4-4 (R4 learner strings S1-S30).** Recommended: approve S1-S10 and S28 now; approve S11-S25 and S29 as one bundle; you write S26-S27 (safety wording including the personal-risk support text). List: `contracts/decision-records.md`.
- [ ] **D-R1-S (R1 strings).** Wording, aligned to the checklist (the R1 lane is applying it): "Understood" / "Still unclear" (thumb labels and Progress states); "Your feedback" (Progress heading); "Rate this card" (pair label); "Your rating was not saved. Try again."; "Private to you. What you said about a card, not an assessment of what you know." Recommended: approve. Needed before the R1 release.
- [ ] **D-R2-S (R2 strings).** "Depth"; "Overview" (The short version: the central idea and what matters most); "Standard" (A balanced explanation); "Deep" (Thorough: reasoning, a worked example and edge cases); "Auto-suggest" (Offer suggestions without being asked, on every canvas; tooltip: Offer suggestions without being asked. Your questions are always answered.); "Could not load your Depth setting."; "Not saved: this change applies in this tab only."; "Retry". Recommended: approve. Needed before the R2 release.
- [ ] **D-R3-S (R3 strings).** "From <name>, p. <label>"; "View passage"; "View explanation"; "Explain"; "Explain this passage"; "Source changed"; "Source not available"; "This source changed after the explanation was written, so the passage is not shown."; "This source is not available here, so the passage cannot be shown."; "You cannot open this source."; "The file this passage is in is not on this canvas."; "This source changed since you selected this passage. Select the passage again."; "This source is not available to you now. Select the passage again from a source you can open." Recommended: approve. Needed before the R3 release.
- [ ] **D-P2-1 (cleanup P2, static Tutor entry card).** Blocker: v0.4 said the guided-entry flow goes, but the Keep table keeps `learn-coaching-entry.js` and the codebase menu depends on the entry card. P2 removed only the guided opening and kept the static card. Recommended: keep until R4. Needed: confirm, or say remove.
- [ ] **D-R2-1 (R2, two Tutor switches).** The per-canvas "Proactive Tutor suggestions" and the per-learner Auto-suggest can coexist, and P2 also relabelled the per-canvas switch "Auto-suggest". Recommended: one control bound to the per-learner setting; the Lead rebases R2 after P4 and writes the exact merge. Needed: confirm.
- [ ] **D-N3 (cleanup, `fast-e2e.yml` `only` input).** A workflow push needs your `!` command. I prepare it when that phase is ready, not before.
- [ ] **D-DB (cleanup P6a and P6b).** The backfill, the joins removal, the schema-source commit and the table drop each need your GO at the moment of the step, per environment. Not pre-approvable.

---

## 3. Release queue

The sequence for every release is the P1 one (verified working):
1. Run the release's preview launcher.
2. `gh variable set MVP_ALLOWED_SHA --body <sha> -R Rabbit-Hole-App/Rabbit-Hole`
3. `C:\s\spec\release-queue\release-mvp.cmd <name> --check`
4. `C:\s\spec\release-queue\release-mvp.cmd <name>`
5. `gh variable delete MVP_ALLOWED_SHA -R Rabbit-Hole-App/Rabbit-Hole` **only after the launcher prints its final line.** Deleting earlier made P1's launcher print a false STOP message, although that release was valid.

Releases fast-forward `main` one at a time, so queue them in the order below.

### P2 cleanup (Browser Tutor off): BUILT, release package in preparation
- Branch `feat/tutor-cleanup-p2`, tip `cdeb7727494e6f4f79abc084a3661b4fe504cc40`, on top of main 9b798f77 (pushed).
- Results: cp 3589/3591, web 4787/4816 (flakes pass singly), build exit 0, check-map/fast-e2e/run-part/affected 70/70. 26 cp and 336 web tests were removed with the Tutor code.
- Risk: about 43 browser checks were rewritten without ever being executed. 13 fork checks run in Linux CI (informational); about 30 windows-only checks need the Windows launcher.
- Windows launcher: `C:\s\spec\owner-local\run-checks.cmd --worktree C:/Users/cyudhist/Desktop/workspace/tutor-cleanup-p2 <check files>` (add `--dry-run` first). The per-phase list is being finalised from cleanup-v0.5 section 10.
- **Open item (P2, CI): `allowance-enforcement` failed in `fast-e2e` (run 42182472387).** 95 of 96 checks passed, including all 13 blind-edited fork checks. The failing step: with the AI allowance exhausted, the first Chat Send showed no refusal toast within 30 s (`allowance-enforcement-check.mjs:91`). It passed on P1. Likely cause: P2 sends every Chat turn to `/api/learn/ask`, while the check may have relied on the removed Tutor planner route for the refusal, or the ask path's refusal is not shown. A fixer agent is diagnosing it from the code. Recommended resolution: fix the product if a learner at exhausted allowance sees no refusal; otherwise update the check to assert the same visible refusal through the retained route. A fix changes the P2 SHA, so the release package below is regenerated. Until then the commands below are PROVISIONAL.
- **RESOLVED (P2 CI item above), 2026-11-06:** the failure was a check-stack problem, not a product regression. On P1 the exhausted-allowance Send went through the browser Tutor to `/api/learn/tutor/plan`, which the real server refused with the toast. After P2 every Chat Send first calls `POST /api/learn/chat/route`; the keyless CI stack has no router key, so the route returned its fallback ("Couldn't check whether this asks for a video...") and `/api/learn/ask` was never sent, so no toast. Fix: commit `409f4e8` (check only) stubs the chat route as the sibling checks do; the refusal, credit and reservation assertions still come from the real server. P2's new tip is `409f4e8f3e4638bcc4b0477a2d2a26041ab40ec3` and the release package below is being regenerated for it. Product note: the router call is admitted against the platform ledger, so if the router is down a learner sees the fallback notice and must press "Answer normally" (existing behaviour in Ask mode); not changed by P2 beyond making it apply to Auto canvases.
- (superseded by the item above) Provisional release package for tip `cdeb7727494e6f4f79abc084a3661b4fe504cc40` (valid only if no fix is needed): smoke = 5 non-browser commands, all exit 0 (dangling-import proof, 350 web tests, 35 cp tests, 70 map tests, worker bundle); affected-tests selection 980 web + 35 cp pass, uncovered: `TutorActivity.jsx`; recovery branch `feat/tutor-cleanup-p2-recovery` pushed at `1978ff65` (revert of all three P2 commits, tree identical to main 9b798f77).
  1. `C:\s\spec\release-queue\preview-54-tutor-cleanup-p2.cmd`
  2. `gh variable set MVP_ALLOWED_SHA --body cdeb7727494e6f4f79abc084a3661b4fe504cc40 -R Rabbit-Hole-App/Rabbit-Hole`
  3. `C:\s\spec\release-queue\release-mvp.cmd 54-tutor-cleanup-p2-mvp --check`
  4. `C:\s\spec\release-queue\release-mvp.cmd 54-tutor-cleanup-p2-mvp`
  5. `gh variable delete MVP_ALLOWED_SHA -R Rabbit-Hole-App/Rabbit-Hole` (only after the launcher prints its final line)
- Learner-visible changes in P2: a Next Steps hook click is one plain Chat turn; the Tutor switch is now "Auto-suggest" (aria-label `Auto-suggest`, tooltip `Auto-suggest on this canvas. Your questions are always answered.`); the dive suggestion card and the guided opening ("Start with:" bar) are gone; the mic shows paused; a broad learning request in Chat no longer starts a journey until P4. Optional glance on the preview: the switch reads Auto-suggest; a hook click becomes a Chat question with an answer; a message sent with the allowance exhausted shows the refusal.

### R1 card feedback: WAITING on the P2 merge, then rebase
- Local branch `feat/tutor-r1-feedback`; being corrected to the checklist (revision, unknown-property rejection, data attributes, imported look-alike proof, Progress tests and wording).
- Needs: migration `learn-migrations/0036-card-feedback.sql` on the dev D1 (announced first) and on production; Lead-only edits (`dev-worker.js` mount, `LearnPage.jsx` provider) after rebase; check-map rows.
- Focused smoke (no browser): control-plane `card-feedback.test.js`, web `card-feedback.test.mjs`, `scripts/schema-check.test.mjs`.

### R3 source references: WAITING on the P2 merge and R1's AdaptiveCanvas
- Local branch `feat/tutor-r3-source-refs`; being corrected (unique-quote wrapper, index in the board-save batch).
- Needs: migration 0038; Lead patches in `dev-worker.js`, `LearnPage.jsx`, `AdaptiveCanvas.jsx`.

### R2 Depth and Auto-suggest: WAITING on P4 (mode and Chat cleanup)
- Local branch `feat/tutor-r2-depth`; being corrected (client-captured Depth, fingerprint, revision guard).
- Needs: migration 0037; dependency on `chat-modes.js`, `ModeSelector.jsx`, `ask.jsx`, `effectiveControls`.

### R4: contracts pushed (`feat/tutor-r4-contracts-2`); Tools lane built (`feat/tutor-r4-tools`, pushed): bounded Markdown read with an honest coverage limit (whole source within 40,000 characters, otherwise a clarification, never a prefix), invitation, subject, plan draft and revise with validators (original instruction preserved), the trusted text/table adapter with 12 escape tests, source-support and safety checks (unknown is held, never published). 154 focused tests pass with injected doubles; no model was called. State and UI lanes are still building. Activation needs D-R4-1 to D-R4-4 and R1-R3 integrated.
  - New R4 string for approval (Tools lane): "Your note is in a different language than your request. Which should the explanations use?"
  - Proposed, unmeasured engineering settings (not approvals): safety thresholds and `MAX_UNCERTAINTY` 0.4; source bound 40,000 characters; 2 MiB Markdown read cap. Real-model qualification stays blocked on D-R4-3.

---

## 4. Decided (done)

- [x] 2026-11-06: `tutor-implementation-checklist.md` adopted as the executable companion; recorded owner decisions supersede it where it says cleanup is not MVP-labelled or that the narrower per-release prerequisites are not adopted.
- [x] Cleanup P1-P7 (including P6a) and the whole Tutor ladder are MVP-labelled; focused checks, DB authority and the backfill/drop order are unchanged.
- [x] Dependencies are per release, not a blanket M0/P7 gate: R1 and R3 after P2; R2 after P4. Each release writes a short prerequisites receipt. P7 is cleanup closeout only.
- [x] Cleanup plan section 5 items 1-6 (nanoGPT course retired, `coaching/*` removed, curriculum scripts removed, Progress next activity kept, eval archive data deleted).
- [x] Journey joins stay until P6; archive backfill verified per environment first; P6a (joins removed) then P6b (schema and drop).
- [x] Home "teach me" prefills Chat without sending; title is the raw sentence (80 characters), no model call. `learn-tutor-handoff.js` is deleted in P3; `learnHandoff` enables `teach` only.
- [x] Syllabus checks deleted; covering checks rewritten and executed (Windows launcher or corrected Linux tier). The owner's browser try is waived; verification is not.
- [x] Cleanup v0.5 N1-N5 accepted (small AgentBar rewrite and the bar stays hidden; Settings notice trimmed in P3 and `tutor-telemetry-check.mjs` rewritten in place; `only` input; promote a check or trim the `Md.jsx` row, never the threshold constant; Windows launcher built).
- [x] R1 thumbs go on every generated card (including quiz, flashcards, challenge, code); imported cards are excluded.
- [x] tldraw stays as is.
- [x] Standing yes: push lane branches (`feat/tutor-*`, `feat/tutor-cleanup-*`) to `rabbit-hole`.
- [x] **Cleanup P1 RELEASED** 2026-11-05 23:13-23:15 PT; rollback branch `feat/tutor-cleanup-p1-recovery`.

---

## 5. Status snapshot

| Item | State |
| --- | --- |
| Cleanup P1 | Released (main 9b798f77) |
| Cleanup P2 | Built (cdeb77274), pushed, CI running; release package in preparation |
| Cleanup P3-P7 | Not started (P3 needs P2 merged) |
| R1 | Built locally; corrections in progress; waits for P2 |
| R2 | Built locally; corrections in progress; waits for P4 |
| R3 | Built locally; corrections in progress; waits for P2 |
| R4 | Contracts pushed; reconciling with the checklist |
| Windows checks launcher | Written and statically validated; has never started a stack |
