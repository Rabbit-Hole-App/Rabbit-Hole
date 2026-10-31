# /animation receipt: M3 (MVP ready for owner decision) at 81df661ba

**Update 2026-10-30 ~6:25 PM PT — final candidate `81df661ba8599d9f66401aad43f23be3ec39347f`** (supersedes 8ed7e52ed, whose evidence below still holds). Added since: FX-AN-016 (a refused /animation start now says why; LearnPage saves a never-saved board before starting) and a browser step that starts /animation on a brand-new canvas through the real app. CI on 81df661ba8599d9f66401aad43f23be3ec39347f: verify 41153839402 success; fast-e2e 41153839322 success — animation-mvp 32/32, slash-sheet 593/593, motion-command 50/50, inline-ai 237/237. Preview redeployed from 81df661ba8599d9f66401aad43f23be3ec39347f with the same flags. Owner try-it launcher: `C:sspecanimationopen-preview.cmd` (dev clones refuse /login; the launcher opens the preview signed in).

- Milestone: M3
- Candidate: branch `feat/animation`, full SHA `8ed7e52edec5baccc08109310581cee325f3577a`
- Lane SHAs merged into it: R `8fc92fca9d2f84aed2540a45c8c14cf7756e58f8`, G `c7c24b9d0f5ab14682da0cc6c490c220a5aea084`, U `8ebfeef330a68cc95baffd7f4aabcb62a2006fde`,
  A `7ceb2b57e8ecd17d0f85e9a38bd4de15d1540cdf`, V `5a9d096558a821e584f5fe65474a944436f1233d`
- Written: 2026-10-30, PT, by Parallel
- Preview: https://rabbit-hole-web-dev-animation.tryrabbithole.workers.dev, built from `8ed7e52edec5baccc08109310581cee325f3577a`
  (deploy log C:/s/spec/animation/deploy-preview.log)
- Activation on the preview: `ANIMATION_ENABLED=true`, `ANIMATION_DIAGNOSTICS=true` (deploy `--var` on this clone only);
  `ANTHROPIC_API_KEY` on this clone only. Production: not configured, not deployed.
- Spend: see "Spend" below. Open fix.md IDs: none (FX-AN-008 deferred, minor)

## Exact-SHA CI

| Workflow | Run ID | SHA | Result | Selected checks (executed) |
|---|---|---|---|---|
| verify | 41147580337 | `8ed7e52edec5baccc08109310581cee325f3577a` | success | unit + build + production bundle check (incl. render/animation3d.html) |
| fast-e2e | 41147580048 | `8ed7e52edec5baccc08109310581cee325f3577a` | success | `animation-mvp-check.mjs` 31/31; slash-sheet 593/593; motion-command 50/50; inline-ai 237/237; explain-program 25/25, explain-program-card 21/21, explain-program-state 15/15, explain-program-render 38/38, explain-proposal-card 8/8, explain-back-sketch 28/28, explain-back-layout 10/10, explain-back-media 8/8 |

Unit suites (local, on `2e86f4ef25d85852d104ff1915f4ffbc435af613`; later commits touch animation3d files only and their
suites are rerun per commit): `packages/control-plane` `npm test` 3215 pass / 0 fail / 1 skipped; `packages/web`
`npm run test:unit` 4831 pass / 1 fail (`explain-program/genuine-card.test.mjs`, a known load-timing flake, FX-EB-02;
3/3 alone) / 27 skipped; animation suites at `8ed7e52edec5baccc08109310581cee325f3577a`: web `src/animation3d/*.test.mjs` + `Animation3DCard*.test.mjs` 135/135; control-plane `test/animation-*.test.js` 51/51.

## Evidence categories

1. **Fixture / unit (mocked):** contract, runtime (real pinned QuickJS), renderer scene compilation, storage, oracle sweeps
   (32 watch times, 3,600 beam inputs, 1,370 game move sequences; 9 plausible-wrong programs rejected).
2. **Browser wiring and persistence (CI, mocked job server):** `animation-mvp-check.mjs` runs in fast-e2e against the
   built app with a fake job server in the page. It proves the UI wiring: `/animation <request>` → one job → plan in the
   review area → edit (version 2) → Generate pressed twice → one approve, one card → controls change readouts to oracle
   values → reload restores the input with **zero** job or model requests. It does **not** call a model.
3. **Real provider on the deployed preview (API path):** the acceptance runner (C:/s/spec/animation/acceptance.mjs)
   drives the same server routes the card uses, on the deployed preview, as a fresh dev test user: create job → real
   plan (proposal on the canvas chat thread) → optional proposal edit → approve the latest version → real author,
   Browser Rendering captures, real review, repair if needed → accepted artifact read through the authorized results
   route, validated against the contract and its hash → independent behaviour check in the pinned QuickJS engine.
4. **Deployed user flow in a browser with a real model:** not run by Claude (browser automation is CI-only under the repo
   rules). This is the owner's try-it path below.

## Real generated artifacts (accepted)

| Case | Request | Build SHA (preview) | Run | Artifact hash | Independent check | Provider US$ |
|---|---|---|---|---|---|---|
| Game | "Make a small game where I move a token across a 3 by 3 grid with buttons to reach a marked goal square, with a hint and a reset." | `a006319c994a0981b487169b49231a120b2839cf` | accept-3, spend row 5 | `ff4c8c09c716c8424d7a39bac62257559ac15cadc365578a1ca06ff321854b54` | starts playing; won after up, up, right, right | ledger row 5 (US$0.3325 incl. unsettled at reserve) |
| Watch | "Show how the blades of a ceiling fan sweep around while its pull chain sways gently, as a calm loop I can just watch." | `c84c0c51a7fddee65bb9cf9562d905fee24df828` | accept-5, row 9 | `1e1e25e71515725182e5cb9c24c0ff34001af03c818dfb155d00d146d277f6c8` | moves between t=0 and t=6.46; loop end matches start | 0.1971 |
| Experiment | "Let me change the length of a simple pendulum and see how its period changes, with the period shown as a number." | `f918c4f54550e41bb632fd1c0883fd5f3b43fee3` | accept-6, row 12 | `da7d7f0ed8fa2e9644de4ed06f7f7aaeb1b152010c577ed0dfe819343c849dd8` | period readout vs 2π√(L/g): L=0.2 m 0.8971 vs 0.8971; L=1 m 2.0061 vs 2.0061; L=3 m 3.4746 vs 3.4746 | 0.3396 |
| Fresh (outside fixtures) | "Show how the gears on a bicycle change how far the back wheel turns for one turn of the pedals." | `45ad75e18c8ced185a146876123211140a086655` | accept-9, row 16 | `0831533567091007d704340086dc37acf4da62e309378629dd2148bd8917133d` | contract + hash checks only (no hand oracle for this prompt) | 0.2735 |

The three fixtures (orbit watch, beam experiment, grid robot) are tests and examples; none of the four accepted requests is
a fixture, and none was selected by keyword. Failed runs are kept in spend.md (rows 1-4, 6-8, 10-11, 13-15) with their
causes in fix.md (FX-AN-002, -004, -005, -009, -010, -011, -012).

## Screenshot evidence

- Cloudflare Browser Rendering draws the scenes (no model call): `POST /api/learn/animation/diagnostics/render-fixture`
  through the production capture path (`env.BROWSER` → `/render/animation3d.html` → `[data-animation3d-frame]`) on the
  preview, 18 captures inspected by Parallel. Copies: `probe-orbit-watch-default-54.png` (orbit angle 194 deg at
  t=4.304 s; expected 193.7), `probe-beam-default-initial.png` (left moment 6.00, right 4.00, tilted down on the
  heavier left), `probe-grid-robot-default-4-events.png`.
- Accepted generated artifacts: re-read from storage through the authorized results route (owner, canvas and stored hash checked; hash matches the run log and the stored identity for all four) and rendered through the same Browser Rendering path with no model call (`POST /api/learn/animation/diagnostics/render-result`, 24 captures, inspected by Parallel). Default-view copies and the artifact JSON are in [accepted/](accepted/): game (token one step from the start after a blocked move, "3 steps to go"), watch (fan blades at 27 deg, chain at -5.6 deg), experiment (L = 3.0 m with g at its low end: period 5.65 s = 2π√(3/3.71)), fresh (gear ratio 2.00, 2.00 wheel turns and 4.27 m per pedal turn)
- Every real build's review rounds captured 6 images (2 views × 3 states) through the same path; the reviews' findings
  quote what the images show (accept-2 onwards).

## Acceptance matrix (plan section 12, MVP rows)

| Case | Task | Fixture / unit (mocked) | Real provider (generated) | Deployed preview (user flow) |
|---|---|---|---|---|
| `/animation` help, pill, bare command | AN-03 | pass: slash-sheet 593/593, motion-command 50/50, inline-ai 237/237 (41147580048) | n/a | owner try-it |
| New request; duplicated submit; changed proposal | AN-03/05 | pass: animation-mvp request/Generate steps (one job, one approve of version 2, one card); control-plane `animation-races.test.js` | pass: runner edits the proposal (version 2) then approves (accept-3/6) | owner try-it |
| Novel passive loop | AN-02/04/07 | pass: watch steps vs oracle (absolute tolerance, FX-AN-007) | pass: watch `1e1e25e7` | owner try-it |
| Parameter experiment | AN-04/07 | pass: beam min/default/max vs oracle | pass: pendulum `da7d7f0e` (period formula at 3 lengths) | owner try-it |
| Simple game | AN-04/06/07 | pass: grid game wrong/correct move, hint, reset, reload | pass: game `ff4c8c09` (won) | owner try-it |
| Fresh prompt outside the fixtures | AN-07 | n/a | pass: bicycle gears `08315335` (contract + hash only) | owner try-it |
| Late responses and rapid input | AN-04/06 | pass: runtime/state/session unit tests (stale worker messages, superseded starts FX-AN-013) | not covered by this tier | not covered |
| Save / reload / cancel / board switch | AN-05/06 | pass: reload with zero job/model requests (mocked server); storage unit tests; races test | pass: accepted artifacts re-read through the authorized results route | owner try-it |
| Gestures: outer canvas, Interact orbit, Escape/blur, typing | AN-03 | pass: animation-mvp steps 17-20 (outer canvas pan before Interact, orbit in Interact, Escape, blur, Chat typing) in 41147580048 | n/a | owner try-it |
| Object drag cancel keeps position (FX-AN-015) | AN-03/04 | pass: animation-mvp steps 29-31 (Escape and blur keep the last position, no selection, no movement after cancel; a new drag still moves) in 41147580048; renderer.test.mjs regression fails on the old code | n/a | not covered |
| Legacy compatibility (/explain, /3d, proposal) | AN-01/07 | pass: explain-program checks, slash-3d, explain-proposal-card in the same fast-e2e; full unit suites | n/a | not covered |
| WebGL unavailable | AN-02 | pass: animation-mvp step (honest message, no blank success) | n/a | n/a |

## Spend (decision A: US$10 total)

Total provider charges US$3.6546; ledger total including reservations US$3.7762; remaining US$6.2238 of US$10 (16 runs, 4 accepted). Provider charges and ledger counts (which include unsettled reservations) are separate columns in
[spend.md](../spend.md); the cap check uses the ledger total. Browser Rendering captures are platform cost (US$0 in the
ledger).

## Limitations (MVP)

- FX-AN-008 (deferred): changing a rate mid-play in an analytical scene restarts its motion instead of carrying phase;
  the scene's assumptions say so.
- The fresh prompt's behaviour was checked against the contract and hash only, not a hand-written oracle.
- Walkthrough, physics, imported models, assemblies, share/fork and Tutor evidence are post-MVP (AN-08..AN-16, blocked
  on owner approval); in the MVP they are refused honestly before any spend.
- Shared and forked copies of an Animation card show an "unavailable" placeholder until AN-14.
- Production: nothing deployed or enabled; release needs the owner's launcher after MVP approval.
