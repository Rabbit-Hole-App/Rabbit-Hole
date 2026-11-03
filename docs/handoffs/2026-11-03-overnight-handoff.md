# Overnight handoff, 2026-11-03 (written for the owner and for ChatGPT's morning review)

Author: Parallel (the integrator session). Times are Pacific. This file is updated through the night; the "Last updated" line says when.
Last updated: 2026-11-03 02:10 PT (see "Update log" at the end).

Rules this report follows: no secrets, no personal email addresses, no share-link tokens. The owner's personal account is never used for testing; production testing uses the dedicated account **@yuvish_demo**. Production commands are owner-run launchers; nothing here was pushed to `main` by an agent.

## 1. Released tonight, live and verified

| Release | Commit on main | Production release run | Verified how |
|---|---|---|---|
| Shortcuts (View > Shortcuts window, tabs, search, Windows/Mac labels, new keys) | `e66902d18` | https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41591581729 | Served bundle contains the new window text; owner ran the release |
| Footer (Book a call; Analytics preferences link removed), Manifesto text, Privacy-page Analytics preferences button | `ebe98ce27` | https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41598331468 | Served code checked; footer has no preferences link |
| FAQ (ten questions as written) + Blog post "We're building rabbit holes, not courses" (Wonderland hero, serif text) | `b58d74876` | https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41603484335 | Served code checked: new post and FAQ present, old sample post and removed sentences absent; hero image serves |
| Creator Analytics (consent v2, public-board measurement, 90-day retention wording, Settings update state, cleanup outcome recording) | `3fa5badcd` | https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41612294651 | Served code carries the final wording; migration 0035 applied on the production Learn DB (22 of 22 objects); cron registration confirmed on the production worker `rabbit-hole-app`: `0 4 * * *` |

Not done by a browser on production (owner rule: no Claude browser on production). Dev-preview browser check of the Creator Analytics Settings previous-consent state passed 20 of 20 (dev clone, commit `3fa5badcd`).

### Open verification (Creator Analytics)
- **First scheduled cleanup outcome**: after the next 04:00 UTC run (2026-11-03 8:00 PM PT). Owner command: `C:\s\spec\creator-analytics\prod-cleanup-check.cmd outcome`. Verdicts: success with 0 eligible rows (expected), deleted N rows, or missing/failed run (needs follow-up). A scheduled success with nothing to delete proves scheduling, not deletion.
- The registration check printed the expected cron, then the Windows Node process crashed on exit (libuv assertion, exit -1073740791) after printing its result. Cause: `process.exit()` called while the HTTPS connection was closing. Repaired by exiting after the socket closes, exit codes preserved; the read-only registration check was repeated: registered, exit 0.
- Isolated local control-plane failures (different single test each run under CPU load; the same suite passes in CI on Linux): cause UNESTABLISHED, recorded in the Creator Analytics readiness notes. Not expanded into test cleanup.

## 2. Ready releases (copy and paste in order)
_None ready yet. Feedback email and newsletter preferences are in qualification; this section is filled in as each passes its gate._

## 3. Awaiting testing, approval or a gate

| Item | Branch | Commit | State | Blocker |
|---|---|---|---|---|
| Feedback email (stored report is mailed to the owner; sender changed to the hello@ address; per-account limit 5/hour and 20/day) | `feat/feedback-mail` | pending (merging main `3fa5badcd`) | CI to run on the final commit, then the release gate | none known |
| Newsletter / Rabbit Hole Updates preferences (two independent checkboxes, both checked by default, atomic save, affirmative-consent gate) | `feat/signup-email-preferences` | pending (stacks on the feedback release commit) | decisions applied by the agent; dev migration 0028 go given | feedback release goes first |
| Animation MVP1 correction (two focused fixes) | `fix/animation-sgd-rca` | `9f92ad49e` is the last pushed commit; corrections in progress | see section 4 | merge/deploy/paid run paused |

## 4. Animation MVP1 correction

Scope: MVP1 only. Paid generation, Animation merge and Animation deployment are paused pending the owner's explicit approval. MVP2 needs separate approval.

- Frozen candidate: `51b6560cf` (SGD generation failed review; root cause report and correction evidence exist).
- Last pushed correction: `9f92ad49e` on `fix/animation-sgd-rca`. CI on it: verify https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41607592513 success; fast-e2e https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41607592456 success (88 of 88 checks, including shared-header 39/39 and animation-mvp 40/40).
- Dev preview deployed at `9f92ad49e` (offline fixture on a labelled canvas, "not model-generated"); launcher is owner-local.
- Two issues found by the owner's evidence review, being fixed now in parallel:
  1. Single-step: "Take one step" free-ran (3 clicks gave 11 steps). Root cause: `session.js` starts the step clock after every accepted action on a stepped artifact. Fix: an optional `startsMotion` action field (absent keeps old behavior), gated as a second client feature; host dispatches once.
  2. Label legibility: labels clip at the frame edge and the scale explanation is dropped. Root cause: `layoutLabels` never clamps to the viewport and its budget drops essential labels at the first miss. Fix in the shared renderer plus the fixture's scale-bar label.
- ETAs (lead's estimate at 02:00): integrated commit about 04:15, green CI about 05:00, usable preview about 05:15, evidence ZIP about 06:00 (preview is delivered before packaging).
- Fixture versus real generation: the fixture is hand-built and offline. It lets the owner inspect rendering, controls, persistence, arrows, readouts, off-plot behaviour, Keep Path and Reset. It does NOT prove the corrected generation pipeline. Generated acceptance (one paid SGD run with the frozen 40-step refinement, the checker on the generated artifact, three model-review states, browser acceptance) has NOT been run.
- Spend: Animation testing spend about 18.80 USD of the 100 USD shared budget (including the failed SGD run, 1.11 USD). Paid-sequence upper bound from the real policy code is stated in the correction report (planning up to 0.56 USD, generation up to 3.25 USD, correction reserve included).
- Compatibility: no thin-line fallback; first production Animation build must be the v2 correction (release check added); never roll back one worker alone once tube scenes exist. An already-open pre-release production tab shows an empty frame until reload; data is preserved (12 of 12 old-tab browser checks on the dev clone). **Awaiting the owner's acceptance of that limitation.**

## 5. Decisions and commands still needed from the owner
- Production commands will be listed in section 2 when ready.
- Accept or reject the empty-frame limitation for old tabs (Animation).
- Approve one controlled paid SGD qualification run (only after reviewing the final correction evidence).
- After 8:00 PM PT: run the cleanup outcome check (section 1).
- Optional: queue the `CLAUDE.md` rule branch `docs/claude-md-preview-rule` (content-only dev previews deploy without waiting for CI).
- Production testing: use @yuvish_demo only.

## 6. Production hygiene done tonight (with the approvals relied on)
- **Canvas cleanup, approved by the owner in chat and confirmed by the owner's own typed phrase in each launcher.** Two owner-run launchers moved canvases to Trash (the product's own "Move to Trash": restorable, nothing permanently deleted):
  1. `trash-canvases.cmd` (2026-11-03 08:38 UTC): exactly the two test canvases the owner named (a public "prod-check ... composer" canvas and the public "PUBLIC TEST - code cards" canvas). Verified: both public links now answer 404; 32 other canvases unchanged.
  2. `trash-other-canvases.cmd` (2026-11-03 08:40 UTC): 27 other top-level canvases of the owner's main account (all private test and acceptance canvases from earlier work), after the owner chose option A in chat ("A") and typed the count-bound confirmation `TRASH 27 CANVASES`. Projects (1), project canvases (3) and folders were not touched.
  - Authorization relied on: the owner's chat messages "also delete all canvas from my account", "correction also delete my account's other canvases", then answer "A" to the question offering a separate second launcher. A later automated review warned that only the first two were authorized; the owner confirmed in chat that both were approved and that no recovery is needed. Everything remains in Trash (restorable from the app); nothing was permanently deleted. Canvas ids and titles are in the owner-local launcher logs and are intentionally not published in this public repository.
- Four finished dev preview clones (FAQ, Blog, Manifesto, Shortcuts) were deleted.

## Update log
- 02:00 PT first version.
- 02:10 PT section 6 clarified: both cleanup launchers ran with the owner's explicit approval; no recovery needed (owner confirmed).
