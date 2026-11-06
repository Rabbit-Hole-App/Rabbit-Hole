# Tutor ladder and cleanup: owner inbox

What I (Claude) need from you, what is waiting on whom, and what is already decided. Tick a box when it is resolved. Tell me in chat and I will tick it and push the update; you can also edit the file on its branch.

- **Branch:** `feat/tutor-owner-inbox` on `rabbit-hole`. Path: `docs/features/explain-on-canvas/OWNER-INBOX.md`. A Desktop mirror is at `C:\Users\cyudhist\Desktop\TUTOR-OWNER-INBOX.md`.
- **Last updated:** 2026-11-05 23:50 PT.
- **Rule:** I keep this file current each time a blocker appears or clears. Times are Pacific.

Plans: `cleanup-v0.5.md` (cleanup), `tutor-roadmap-v1.4.md` (Tutor ladder R1-R16), `tutor-ladder-manifest.md` (who writes which file).

---

## 1. Needs you now

Nothing blocks building. These are the decisions I would like when you next check in. None stops the lanes that are running.

### R4 decisions (separate from R1-R3; none delays them)
Paste-ready texts are in `docs/features/explain-on-canvas/contracts/decision-records.md` on branch `feat/tutor-r4-contracts`.

- [ ] **D2 routing exception.** Adopt a trusted server-only roadmap text/table adapter over `generateArtifact` (allowed formats `explanation` and `table` only; typed and Quick Edit `/explain` unchanged). Recommended: adopt.
- [ ] **D43 contextual safety policy.** Adopt the policy text in `decision-records.md`. Recommended: adopt.
- [ ] **Paid-testing cap for the first real-model R4 candidate.** Proposed: **$25** (12 scenarios: 8 development + 4 holdout). Typical about $9.80, worst single pass about $23.10, expected with a repair pass about $14.70. I stop and report at $20. No spend happens until you approve. Approve $25, or give another cap.
- [ ] **R4 learner strings S1-S30.** Approve S1-S10 and S28 now (already specified or existing). Approve S11-S25 and S29 as one bundle. You write S26-S27 (safety wording, including the personal-risk support text).

### R1 and R2 learner strings (go with their release handoffs)
- [ ] **R1 strings:** "Rate this card"; "Good card" / "Bad card"; "Your rating was not saved. Try again."; "Your ratings of cards"; "Private to you. What you said about a card, not an assessment of what you know."; "Good cards (n)" / "Bad cards (n)".
- [ ] **R2 strings:** "Depth"; "Overview" (hint: The short version: the central idea and what matters most); "Standard" (A balanced explanation); "Deep" (Thorough: reasoning, a worked example and edge cases); "Auto-suggest" (Offer suggestions without being asked, on every canvas; tooltip: Offer suggestions without being asked. Your questions are always answered.); "Could not load your Depth setting."; "Not saved: this change applies in this tab only."; "Retry".

### Cleanup P2 question
- [ ] **Static Tutor entry card.** v0.4 said the `resolveTutorEntry` / `guidedOpening` flow goes, but the Keep table keeps `learn-coaching-entry.js` and the codebase menu depends on the entry card. P2 removed only the guided-opening part and kept the static entry card. Recommended: keep it until the Tutor rebuild (R4). Confirm, or tell me to remove it.

### R2 product questions
- [ ] **Two Tutor switches.** The per-canvas "Proactive Tutor suggestions" and the new per-learner Auto-suggest can both show in Tutor mode. Recommended: merge them when R4 reworks Tutor. Confirm.
- [ ] **Auto-suggest in Auto mode.** It controls nothing deployed in Auto today. Recommended: keep it shown in Auto and Tutor per the roadmap (D22); narrow it to Tutor only if P4 leaves nothing unasked in Auto. Confirm.

---

## 2. Coming up: needs you at release time

I prepare the preview, the focused-check results, the recovery branch and the exact commands together. You run them; I never set `MVP_ALLOWED_SHA` or run `release-mvp`.

- [ ] **Cleanup P2 release.** P2 is built and committed locally (3 commits, 142 files, tip `cdeb77274`). I am pushing the branch for CI information and preparing the release package (smoke list, recovery branch, preview launcher, exact commands). Steps (same as P1): run the preview launcher, `gh variable set MVP_ALLOWED_SHA`, `release-mvp.cmd <name> --check`, `release-mvp.cmd <name>`, then `gh variable delete MVP_ALLOWED_SHA` (delete only after the launcher prints its final line).
- [ ] **Run the P2 Windows checks.** About 30 `windows-only` checks and 13 `fork` checks were rewritten without being executed (static edits and `node --check` only). The 13 fork checks run in Linux CI. The Windows ones need the `run-checks` launcher (below). Highest risk: `chat-persistence-check` (its lost-save fault step was removed), then `next-steps-check`, `tutor-controls-check`, `voice-check`.
- [ ] **R1 card feedback release.** Needs P2 merged, then rebase, then the preview. Needs migration `0036` applied to the dev D1 (announced first) and to production before release.
- [ ] **R3 source references release.** Needs P2 merged. Migration `0038` provisional.
- [ ] **R2 Depth settings release.** Needs P4 merged. Migration `0037` provisional.
- [ ] **First run of the Windows checks launcher** (`C:\s\spec\owner-local\run-checks.cmd`). Being built. When ready I will give the exact command per phase.
- [ ] **`fast-e2e.yml` `only` input** (cleanup N3): a workflow push needs your `!` command. I will prepare it when that phase is ready.
- [ ] **Cleanup P6a/P6b database steps.** Not pre-approvable: needs your GO at the moment of each step, per environment: archive backfill verified, then P6a (joins removed), then P6b schema source and the controlled table drop in one window.

---

## 3. Decided (done)

- [x] Cleanup plan section 5 items 1-6: retire the nanoGPT course, remove `coaching/*`, remove the curriculum scripts, keep Progress's next activity, delete the evaluation archive data.
- [x] Journey joins stay until P6; archive backfill is verified first, in each environment.
- [x] Home "teach me" is kept and **prefills** ordinary Chat without sending; canvas title is the raw sentence (80-character limit, no model call).
- [x] `/api/learn/tutor/handoff` is retired with its last caller; `learn-tutor-handoff.js` is deleted in P3 after a final import check.
- [x] `learnHandoff` enables `teach` only; the unused `research` branch is removed.
- [x] Syllabus checks are deleted (`toc-plan-check.mjs` only after confirming nothing the ToC needs is lost).
- [x] Covering checks are rewritten with the affected phase and executed (Windows launcher or corrected Linux tier). Your browser **try** is waived; verification is not.
- [x] Cleanup P1-P7 (including P6a) and the whole Tutor ladder are MVP-labelled; broad CI and the broad gate are nonblocking. Focused checks, database authority and the backfill/drop order are unchanged.
- [x] Dependencies are per release, not a blanket M0/P7 gate: R1 and R3 after P2, R2 after P4. Each release writes a short prerequisites receipt. P7 is only cleanup's closeout.
- [x] Standing yes: push lane branches (`feat/tutor-*`, `feat/tutor-cleanup-*`) to `rabbit-hole`.
- [x] Cleanup v0.5 N1-N5: keep the small AgentBar rewrite and leave the bar hidden; trim the Settings notice in P3 and rewrite `tutor-telemetry-check.mjs` in place; add the `only` input; promote a check or trim `Md.jsx` rather than change the area-threshold constant; build the Windows checks launcher.
- [x] R1 gives the thumbs pair to every generated card (including quiz, flashcards, challenge, code); imported cards stay without it.
- [x] tldraw stays as it is (no deletion, license key setup unchanged).
- [x] **Cleanup P1 released to production** 2026-11-05 23:13-23:15 PT. Main `9b798f77`; production smoke passed; rollback via `feat/tutor-cleanup-p1-recovery`.

---

## 4. Status snapshot

| Item | State |
| --- | --- |
| Cleanup P1 | Released (main `9b798f77`) |
| Cleanup P2 | Built locally (tip `cdeb77274`). Cp 3589/3591 pass, web 4787/4816 pass (flakes pass singly), build exit 0, check-map 70/70. 26 cp and 336 web tests were removed with the Tutor code. Release package in preparation |
| R1 card feedback | Built locally (5 commits). Waiting on P2 merge, then rebase plus the two Lead-only edits |
| R2 Depth settings | Built locally (4 commits). Waiting on P4 merge |
| R3 source refs | Building locally |
| R4 contracts | Done and pushed (`feat/tutor-r4-contracts`); no release yet |
| Windows checks launcher | Being built |
| v0.5 plan | Written (`cleanup-v0.5.md`) |

## 5. How I update this file
When something resolves, I tick the box, add a dated line under Decided, move anything newly blocked into section 1 or 2, and push the branch.
