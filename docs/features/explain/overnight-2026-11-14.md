# Overnight train 2026-11-14: morning report

Written 2026-11-14 about 06:50 PT, from the fork reports plus my own checks on the remote. Everything named here is on the remote: release branches (code), `release/evidence` (gate reports), `film/evidence` (screenshots, film). Nothing was pushed to main or to `refs/notes/dev-deploys`. No production write of any kind. The owner's 8878 stack was not touched.

## 1. Releases, in the order to run them

Nine candidates, each stacked on the previous one. Release them in this order; each release moves main to that candidate's SHA, which is the next candidate's base. Main now is `a8ef11d64995c1e1bd1784ec9c8840b1af0b6a36` (release 133).

| # | Candidate SHA | Base | Content | MVP build / record (dev clone) |
|---|---|---|---|---|
| 134 | bbd2c581b00be9689b6712c4f68ac52ab7e82208 | main a8ef11d64 | CV-1, CV-2, CV-4, CV-5, CV-8 | fce6b0806250 / e2268f2093fae030 |
| 135 | 2a31d4d7bb38d1ef0a981b92a03a2dfae90f3c97 | 134 | PL-1 renderer | 860ed797e0b6 / 69c46b7a7d8ac8c4 |
| 136 | ee9966384ca8c2127ee0b8e6c4ff378089c76ec7 | 135 | C01 composition data + rule-11 allowlist plumbing | 860ed797e0b6 / 5b9053b126e19bc7 |
| 136b | 3534ca428e09c44662252db7b522cc1d28c147d9 | 136 | C02 composition data | 860ed797e0b6 / ae36caba2f87af72 |
| 137 | 40a77cecb0a8d9cf6836bc0e9aabc5124179c5a1 | 136b | UX-1, UX-2, UX-3, markdown anchor 46109a502 | 4bee4b8b0c6a / 1c907117cc5c5ddc |
| 138 | 03fc4642f53806bc86317b4e3a4ffe2201b75c5a | 137 | CV-6, CV-7 | d7045a21ad1c / e3d3240061aed4b7 |
| 139 | 4ec260c089631e662809ac382b00aabe14fc905d | 138 | CV-3 | 3428ae176b84 / 9616c65369896504 |
| 140 | 4204cd37b3accafb988cc1c8567563d43daac574 | 139 | AR-2 (+ one test fix, see caveats) | 3428ae176b84 / 3c6fec4501e47738 |
| 141 | 24294b113128fcf1162fc218b53cb8ae3c032ea1 | 140 | CC-1, CF-1 | 3428ae176b84 / 090881654db8ad6a |

Each release has `release/explain-<n>` and `release/explain-<n>-rollback-<first 8 of its SHA>` on the remote (verified by fetch for 134 through 141; 136b: `release/explain-136b`). Chain verified: each candidate descends from the previous one.

The four owner commands per release, in order, with `<SHA>` and `<pin>` from the table (pins: `134-explain`, `135-explain`, `136-explain`, `136b-explain`, `137-explain` ... `141-explain`):

1. `gh variable set MVP_ALLOWED_SHA --body <SHA> -R Rabbit-Hole-App/Rabbit-Hole`
2. `C:\s\spec\release-queue\release-mvp.cmd <pin> --check`
3. `C:\s\spec\release-queue\release-mvp.cmd <pin>`
4. `gh variable delete MVP_ALLOWED_SHA -R Rabbit-Hole-App/Rabbit-Hole`

After the last release (141): ONE update of the owner's 8878 stack (merge final main into `owner/local` in `C:/s/explain-layout-web`, rebuild bundles). I did not do it.

### Gate table per release (every step; first run unless stated)

| # | ci | scripts | control-plane | tutor-diagrams | figure-briefs | web unit | build | property count (limit 362) | replay vs base | other |
|---|---|---|---|---|---|---|---|---|---|---|
| 134 | 94/95, 1 skipped | skipped (no script file changed) | skipped (web only) | 1214/1214 | not in the report | 6853 tests, 6825 pass, 27 skipped, 0 fail | exit 0 (dist and dist-dev) | n/a (no card bytes) | n/a | GATE: PASS(web); snapshots untouched |
| 135 | 94/95, 1 skipped | not in the report | skipped | 1217/1217 | not in the report | 6856 tests, 6828 pass, 27 skipped, 0 fail | ok | max 358 | 474 rows, 0 moved | snapshots exactly the 6 PL-1 entries vs base; no first-run failure |
| 136 | 94/95 | 254/254 | skipped (data only) | 1230/1230 | 7/7 | FIRST RUN 1 FAIL (inline-ai-annotation known-readers list lacked the three C01 files with `links`), fixed in ee9966384, rerun green | exit 0 | max 358 | 474 rows, 0 moved | pipeline suite FIRST RUN 82/84 (stale constraints sheet, also fails on base), fixed in fb0fde25f; snapshots +12 (four ids at 320/408/720), 0 removed, 0 changed |
| 136b | first run 93/95 (check-map classes for C02 files), fixed with 10 check-map rows in 3534ca428, then 94/95 | 254/254 | skipped (data only) | 1265/1265 | 7/7 | 6876/6904, 27 skipped, 0 fail | 0 | 358 | 474 rows, 0 moved | pipeline 83/84; snapshots +18 (six ids at 320/408/720), 0 changed/removed |
| 137 | 94/95, 1 skipped | 254/254 | skipped (no server file) | 1265/1265 | 7/7 | 6885 pass, 27 skipped, 0 fail | exit 0 | max 358 | 474 rows, 0 moved | snapshot diff 0 files |
| 138 | 94/95 | 254/254 | skipped | 1265/1265 | 7/7 | 6892 pass, 27 skipped, 0 fail | ok | max 358 | 474 rows, 0 moved | snapshot diff 0 |
| 139 | 94/95 | 254/254 | skipped | 1265/1265 | 7/7 | 6900 pass, 27 skipped, 0 fail | ok | max 358 | 474 rows, 0 moved | snapshot diff 0 |
| 140 | 94/95 | 254/254 | FIRST RUN 1 FAIL (see caveats), rerun 4601/4602, 0 fail | 1265/1265 | 7/7 | 6900 pass, 27 skipped, 0 fail | ok | max 358 | 474 rows, 0 moved | tier-1 smoke with the judge PASS, 66/66 |
| 141 | FIRST RUN 93/95, 1 fail (timing-style, see caveats); serial rerun of the directory 94/95, 0 fail | 255/255 | 4601/4602, 0 fail | 1266/1266 | 7/7 | 6901 pass, 27 skipped, 0 fail | ok | max 358 | 474 rows, 0 moved | no smoke (no control-plane source in the diff) |

Rows for 134, 135 and 136 are taken from their suites reports (`gates/134`, `gates/135` files named `PL1-*`, `gates/136` on `release/evidence`); "not in the report" means that step is not listed there. 136 and 136b ran `pipeline` as an extra step. 136's replay and property count are in its report; 136b's replay is 474 rows, 0 moved.

The e2e checks were NOT run locally for any release (they cannot run on this machine); the release gate on the owner's side is the one that runs them.

### Caveats per release
- 134: CV-8 Ctrl+K PASSAGE card was not driven in the browser; verified by tests only. The lesson's markdown is about 10,500 px tall (reviewer expected about 5,400). CV-4 beside a very tall source needs a free 720 px beside it, not a free column.
- 136/136b: the keyword audit data grew the learner-keyword file from 391 to 395 (136) to 401 (136b) keys. Their gates skipped control-plane (data only), so a hardcoded count in a control-plane test (391) went red; the fix is a one-line test commit inside 140. Until 140 is released, that one control-plane test is red on main after releases 136 and 136b. The release commands do not run the control-plane suite (`release-mvp.sh` has no test step), so this does not block releasing; it only shows in a CI run in between.
- 137: the superseded first UX-1 commit (`c51e6bfd5`) stays in history because the shared-toolbar commit does not apply without it; the net diff is correct and a squash is optional.
- 138: Fit canvas at the 0.2 zoom floor still crops the bottom row of the tallest cards on the screenshot fixture.
- 140: first control-plane run failed `explanation-learner-keywords.test.js` (`401 !== 391`); it fails identically on the 139 base, so it is not AR-2 and not a timing test. Fixed in commit `4204cd37b`, rerun green on the final tip. First-run output is kept (`140-step-cp.first-run.out`).
- 141: first `scripts/ci` run failed `run-part.test.mjs:54` ("dark-ink gets no fork env"), a process-spawning test in a directory 141 does not touch; it passes 8/8 singly on the candidate and on its base, and the serial rerun of the whole directory was green. Accepted under the timing-test rule; both runs are in the report.
- Secret guard: for several releases the full tutor, web unit and build outputs and some record outputs were refused by the guard (they contain test names or key-like lines); summaries or excerpts are pushed instead, the guard was never bypassed.

## 2. Register rows

| Id | Release | Commits | Evidence |
|---|---|---|---|
| CV-1 | 134 | 701885ed4, 6df35aa08 | `release/evidence` gates/134, shots (typed /explain plot card: 440 wide before, 669 after) |
| CV-2 | 134 | 5fd7cf49e | gates/134 (corner drag +260: 646 to 646 before, 646 to 906 after) |
| CV-4 | 134 | bf5cc87cf, b1da8a02e, cb500554d, 6debbf746 | gates/134 (four prompts: before one column above the markdown, after beside it, dy 120, no overlap) |
| CV-5 | 134 | 56f7f3ffc, edd54c9e6, 8f743c7a9 | gates/134 (growth: no other block moved) |
| CV-8 | 134 | e263418e4 (+ follow-up in the report) | gates/134 `134-cv8-report.md`; passage-card path by tests only |
| PL-1 | 135 | explain/plot-point-notes-r2 (75a637633) | gates/135 (`PL1-*` files); snapshots exactly the 6 PL-1 entries |
| C01 / C02 data | 136 / 136b | Codex 767ba06c4 (+ rebases), C02 in 3534ca428 | gates/136, gates/136b; contact sheets in the 136 report |
| UX-1, UX-2, UX-3, markdown anchor | 137 | final fix 40a77cecb, anchor 46109a502 | `film/evidence` 85d0932cc, `film/toolbars/` (explanation and markdown, before/after, report JSONs); gates/137 |
| CV-7 | 138 | 27f396d48 | `film/evidence` eccfae2e1, `canvas-2-138-139/` (after Shift+1: 0 cards visible before, 7 after) |
| CV-6 | 138 | c8568e387 | same directory (cards on screen at open: 0 of 13 before, 2 of 13 after) |
| CV-3 | 139 | e8477cc85, check-map row 4ec260c08 | same directory (card stays at (882,1011) after deleting the card above; before it moved y 1011 to 345) |
| AR-2 | 140 | 738c83528 (+ test fix 4204cd37b) | gates/140 (`140-v2-evidence.json`: two real v2 jobs archived, 2 objects in the local R2, user id, no email; other outcomes by 4 unit tests) |
| CC-1 | 141 | 8c3527976 | gates/141 |
| CF-1 | 141 | 24294b113 | gates/141 `build-report.md` |
| VC-1 | awaiting | none | closes on the owner's production check (section 3) |
| AR-1, VC-2 | not in tonight's train | none | not touched tonight |

Screenshots for CV-6/CV-7/CV-3 use boards DERIVED from the v60 export (each measures JSON says so), on a local keyless stack, no model call.

## 3. Decisions needed (separate list)

1. DECIDED by the owner (Saturday morning): option A, ship CF-1 as built. CF-1 (141): the production deploy command gains `--var RELEASE_SHA:<sha>` for both Workers. Untested against real wrangler (no production writes tonight). A (default, in 141): ship. B: revert `24294b113` (a new commit on a later release if 141 is already released). C: also set the var in dev and MVP deploys (not done; previews keep a null release).
2. Server `DRAFT_LAYOUT` (`packages/control-plane/src/learn-boards.js:509`) strips `at` from a share-link visitor's draft, so a guest's anchored card (CV-3) falls back to column behaviour. Adding `at` is a server change that would turn 139 into a server release. Not made. The owner's own boards are unaffected.
3. CV-4 cards placed beside a source are not anchored at placement, only cards the learner drags (one line if wanted).
4. 136: one-diagram-variant choices (answer panels); the C01 contact sheets predate the 133 formatting; the constraints sheet regeneration changes pipeline input (see decision 7).
5. 136b: the four C02 comparisons' variants need confirmation.
6. 137: no screenshots for the web page card and PDF toolbars (the web card needs captured fixtures; PDF is unchanged by design). The PDF five-button follow-up is unbuilt.
7. Topic pipeline (`topic-pipeline-fixes`): needs the rule-11 allowlist line after 386, and the constraints sheet rebuilt (`node scripts/topic-pipeline/build-renderer-constraints.mjs`) after 141 lands so it carries the CC-1 verb list. Parked and RED, not in any release: the contract rule and two reference edits (`gates/135-parked` README).
8. CV-8 passage card live proof on the dev clone needs the model or a hand-driven text selection; tests only so far.
9. Softmax production check (option A, agreed): the owner types `/explain explain softmax` at Standard on production and sends the screenshot; I push it to `film/evidence` under `docs/features/explain/checks/` and give the SHA; VC-1 closes on it.

## 4. Spend

- 134 to 139, 141: no smoke and no model call in any of their gates (136b's report states US$0; the others record no spend).
- 140 tier-1 smoke with the judge: US$0.2584 generation plus US$0.507 judge (157 calls) = US$0.7654.
- Film (v2 renders) and kit equivalence run: local, no model call.
- Total tonight: about US$0.77.

## 5. Not finished, and why

- Film and kit: both done, see section 6.
- 8878 update: after the releases, not before.
- Lock time lost: about 20 minutes to two orphaned lock holders (a film script's child and a leftover acquire loop). I killed the recorded PIDs and replaced `heavy-lock.sh` with a version that exits when the parent shell is dead.
- Worktrees kept for the pins (remove after the releases; `rmdir` each `node_modules` junction first): `C:/s/explain-canvas-2`, `C:/s/explain-canvas-3`, `C:/s/explain-base-40a77c`, `C:/s/explain-140`, `C:/s/explain-140-base`, `C:/s/explain-141`, `C:/s/explain-141-base`, `C:/s/explain-smoke` (do not remove).

## 6. Film and kit (not releases; no gate, no CI)

All on `film/evidence`; paths below are inside `docs/features/explain/film/`.

### Film v2-UNAPPROVED (draft-4 take, not owner-approved)
- Commits on `film/evidence`: `35e0df3909ad9ea3ab13eee4e97fc2c221d0c6f6` (videos) and `a0b529bf9efd0831bd7c6c5decffafb402a5de54` (posters, sheet, checks). Both verified on the remote.
- `videos/explain-around-markdown-v2-UNAPPROVED-4K.mp4`: 3840x2160, 68,992,309 bytes, 95.0 s.
- `videos/explain-around-markdown-v2-UNAPPROVED-1080p.mp4`: 1920x1080, 25,922,137 bytes, 95.0 s.
- `v2-unapproved/`: `poster-v2-4k.jpg`, `poster-v2-1080p.jpg`, `contact-sheet-v2-1080p-3s.png`, `dead-scene-check.txt`, `settings.txt` (holds the sha256 of both MP4s).
- Encode: libx264 slow, CRF 18, yuv420p TV range, +faststart, silent; the same edit as draft 4 (ramp 1.8x, 1.5 s holds, 3 s waits).
- Dead-scene check (fork's result): no still stretch over 2.0 s; longest 1.8 s at 43.3 s.
- Still waiting for the owner's reaction to draft 4 and the numbered notes before anything is called approved.

### film/kit (SOP follow-up: the kit in `packages/web/scripts/film/`)
- Branch `film/kit` = `2bc0a6b00e804909fb801492bd69e315b322f62a` on top of `1f8d2fa10`; the diff is 10 files, +503/-147, all under `packages/web/scripts/film/`. Not merged; main untouched.
- Evidence: `film/evidence` `66b0d01f086f28d2a449845790e6232b203abb2d`, directory `kit/` (compare-vs-take-d7.txt, compare-vs-take-s5.txt, kit-checks.json, kit-marks.json, requests.log, kit-draft-output.txt, the 480p draft mp4 and its contact sheet, and the first refused attempt's output).
- Equivalence against take-d7 and take-s5 (fork's report): 0 UNSCRIPTED, 0 model calls, 0 failed, 0 page errors; 47 routes, 0 flagged; marks 37 reveals, 6 typing, 2 depth; every beat-checklist check passes; output 854x480, 104.9 s, longest still 2.2 s.
- NOT equivalent: timing. The kit's real-time take is 135.3 s of script and 104.9 s of output, against 102.4 s and 95.0 s for the film's frame-stepped draft 4 and 145.6 s for the real-time d7. Matching needs the frame-stepped mode, which is not ported to the kit (frame-stepped 4K in the kit, per-key retry logging, skeleton shimmer and Stop-button hover are untested).
- Verdict: merge-ready for scripts and docs only; the owner's rule (merge only after an equivalence run) is met for requests and beats, not for timing.
- DECISION NEEDED A: merge `film/kit` as a scripts-and-docs-only release (needs a slot, no gate; the owner runs the merge)?
- DECISION NEEDED B: the chat pane's Depth menu is clipped at the right edge of the 1920 viewport; the film's own v1 and 4K frames (take-s5 frame 843) show the same clipping. Fix the film's framing or leave it? The kit prints a `known` note on that beat.
