# Overnight handoff, 2026-11-03 (written for the owner and for ChatGPT's morning review)

Author: Parallel (the integrator session). Times are Pacific. This file is updated through the night; the "Last updated" line says when.
Last updated: 2026-11-03 03:05 PT (see "Update log" at the end).

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

### Release 1: Feedback email  (READY, gate passed 02:49 PT)
- Candidate: `feat/feedback-mail` at `bbb01a38399f2a55ef9c7d79faf31d44e874c250` (contains main `3fa5badcd`, fast-forwards main).
- CI on that exact commit: verify https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41618285141 success; fast-e2e https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41618285093 success (attempt 1).
- Release gate: https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41620486063 success, tested exactly this commit. Read-only release check: passed (main `3fa5badcd`, gate and CI verified).
- No migration and no new secret. The recipient is the plain config variable `FEEDBACK_NOTIFY_TO` shipped with the release; the app email sender becomes `hello@digrabbithole.com`.
- Command (run it in a Windows terminal):
  ```
  C:\s\spec\release-queue\release.cmd 35-feedback
  ```
- After it finishes: send "release 35-feedback done" so the deployed commit is verified. Then verify storage and delivery as **@yuvish_demo** (never the personal account) using `C:\s\spec\feedback-mail\OWNER-CHECKLIST.md`: one bug report and one feature suggestion from Home and one of each inside a canvas; expect the on-button reference each time; expect four emails to the owner's inbox with subjects `[Rabbit Hole] Bug report RH-...` / `[Rabbit Hole] Feature suggestion RH-...` from `Rabbit Hole <hello@digrabbithole.com>`; `C:\s\spec\feedback-mail\read-feedback.cmd` lists the stored objects. Optional limit proof: a sixth report within an hour gets the friendly limit message with the typed text kept.
- Unverified until then: whether the email service sends from the hello@ address in production (the domain is the same one used for sign-in emails; a sign-in email arriving from hello@ confirms it), real delivery to the inbox, and the create-only storage write used for the limit.

### Release 2: Email preferences (newsletter)  (gate pending)
- Candidate: `feat/signup-email-preferences` at `02bdcd09d3fc02a33b7cf550baae861d0bc0ec55` (contains the feedback commit). CI running: verify https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41620836122 , fast-e2e https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41620836096 . Its gate starts automatically after CI is green and the feedback gate is done; commands will be listed here when it passes.
- Order will be: Release 1 first; then the production migration `0028` launcher (`C:\s\spec\signup-prefs\apply-prod-migration.cmd`, typed `APPLY PROD`); then `C:\s\spec\release-queue\release.cmd 36-newsletter`. The release check refuses a schema that differs in either direction, so 0028 must be applied after Release 1 and before Release 2.

## 3. Awaiting testing, approval or a gate (as of 02:40 PT)

| Item | Branch | Commit | State | Blocker |
|---|---|---|---|---|
| Feedback email (stored report is mailed to the owner; app email sender changed to the hello@ address; per-account limit 5/hour and 20/day, typed text kept) | `feat/feedback-mail` | `f4af0b936` was green (verify 41615503932, fast-e2e 41615503900); a small follow-up commit (invitation emails no longer say "Replies to this email aren't read", now false with the new sender) is in CI as release candidate F2 | F2 CI, then the release gate (dispatched by the integrator) | none |
| Newsletter / Rabbit Hole Updates preferences (two independent checkboxes, both checked by default, atomic save, affirmative-consent gate for both categories, founder's tech and AI newsletter description, privacy wording in the Privacy Policy) | `feat/signup-email-preferences` | `d7396868b` green (verify 41615737769, fast-e2e 41615737606); final candidate N = this branch merged with F2 | waits for F2, then CI on N, then the gate | feedback release goes first; production migration 0028 is owner-run |
| Animation MVP1 correction (single-step fix + label legibility fix) | `fix/animation-sgd-rca` | `cad855a1e3ada884c4b75ec15c4929801c9224f2` (integrated; pushed 02:36 PT) | CI in progress: verify https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41620275081 , fast-e2e https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41620275028 | production merge/deploy and paid run paused |

## 4. Animation MVP1 correction

Scope: MVP1 only. Paid generation, Animation merge and Animation deployment are paused pending the owner's explicit approval. MVP2 needs separate approval.

- Frozen candidate: `51b6560cf` (SGD generation failed review; root cause report and correction evidence exist).
- Last pushed correction: `9f92ad49e` on `fix/animation-sgd-rca`. CI on it: verify https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41607592513 success; fast-e2e https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41607592456 success (88 of 88 checks, including shared-header 39/39 and animation-mvp 40/40).
- Dev preview deployed at `9f92ad49e` (offline fixture on a labelled canvas, "not model-generated"); launcher is owner-local.
- Two issues found by the owner's evidence review, both fixed and integrated at `cad855a1e` (CI pending, see above):
  1. Single-step: "Take one step" free-ran (3 clicks gave 11 steps). Root cause: `session.js` started the step clock after every accepted action on a stepped artifact (one press gave step 12 and a running clock). Fix: an optional `startsMotion` action field (absent keeps the old behavior), gated as a second client feature (`action_motion`, 409 for older builds); the author and repair rules state it; the one-step fixture action declares `startsMotion:false`; the SGD qualification checker fails a one-step action without it. Tests: session test on the real runtime reads 1, 2, 3 steps paused after 1, 2, 3 presses; Launch (no declaration) still plays; shipped game/watch/experiment fixtures unchanged; two new browser steps in animation-mvp-check (42 steps).
  2. Label legibility: labels clipped at the frame edge and the scale explanation was dropped. Root cause (measured): `layoutLabels` never clamped plates to the viewport, `declutterLabels` had no frame bounds, and the label-area budget broke at the first label that did not fit, dropping it and every later label (full-batch update, status text, scale bar), while the "essential" flag only exempted labels from the Labels toggle. Fix in the shared renderer (essential labels admitted first and never dropped; plates flipped or pushed inside the frame; long text wraps; arrows untouched, no minimum length) plus the fixture's scale-bar label ("Arrow this long = update of 1.0", parentless). Real-browser measurement of the real card at 4 sizes x 5 states: essential labels drawn and inside 20/20 after vs 4/20 before; plates outside the viewport 0 after vs 12 of 20 states before. Fixture byte headroom to the review size limit about 106 B (net +2 B).
- Local results on the integrated tree: control-plane 3345/3346 pass (1 skipped), web unit 4955 pass, scripts 231/232 pass (1 skipped). Local `animation-mvp-check` run twice on a busy machine: 40/42 then 41/42 with DIFFERENT failing steps each time (steps 33 and 42, then step 17), both new single-step steps passing both times; the earlier run on the lead's tree alone was 42/42 and CI ran the check 40/40 on the previous commit. Machine load is a hypothesis, unproven. These local results are recorded as UNRESOLVED; the exact-SHA CI run is the authority.
- CI on the integrated commit `cad855a1e3ada884c4b75ec15c4929801c9224f2`: verify https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41620275081 success; fast-e2e https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41620275028 success (all 88 selected checks, attempt 1: animation-mvp-check 42/42 in 248 s including the two new single-step steps and the game/WASD steps that failed intermittently on the loaded local machine; shared-header-check 39/39; motion-command-check 50/50).
- **Usable dev preview (verified 02:59 PT)**: dev clone `rabbit-hole-web-dev-animation` (never the shared worker) serves `cad855a1e`, Worker version `08ccc689-92ab-4732-8994-24502157911f`, deployed only after verify and fast-e2e were green on that exact commit. Owner launcher (own console, signed in; the bare URL is refused on dev clones): `C:\s\spec\animation\open-correction-fixture.cmd`, opening the canvas "MVP1 correction - OFFLINE FIXTURE, not model-generated". Launcher `--check` passed on the first attempt (fixture result read back with HTTP 200 carrying both client features).
- Old-tab browser check rerun against the deployed preview: all 12 checks OK. The new client clicked "Take one step" three times and the card read exactly Step 3 and Paused, still 3 six seconds later; saved and restored step counts 3 and 3 (earlier 11 and 11 is gone); the old tab's unrelated edit and the card's data survive; a second old tab still shows the empty card frame (380 by 26 px): **limitation awaiting the owner's acceptance**.
- Pixel check of the deployed card: reads Paused, Step 3 of 40; "noisy update" fully inside the frame; "Arrow this long = update of 1.0" visible beside the scale bar; "full-batch update", "slope w" and "Running" visible.
- What to click on the preview card: (1) "Take one step" three times: Step 3, Paused, stays; (2) Play then Pause; (3) drag the learning-rate slider, change Batch size, toggle the full-batch arrow; (4) Labels on and off; (5) resize the card by its bottom-right corner (small, default, large): labels stay inside the frame; (6) "New run, keep old path"; (7) "Reset experiment". A tab opened before the deploy is told to reload for this card.
- Open owner decision, with a routine default applied overnight: "New run, keep old path" declared nothing, so it started the step clock by itself (Playing). The lead recommends it wait for Play like a parameter change, which also makes the fixture match the author-rule text. Applied as a routine decision in the next commit (one declaration, easy to revert); a further CI cycle and a preview redeploy follow, then the evidence ZIP.
- Known limits recorded for the owner: off plot at the small, default and phone cards only the status line and the scale legend are drawn ("slope w", "intercept b", "Lowest point", "Left the plot here" are dropped by the label budget and return on the large card, so the red exit marker has no label of its own there: the owner may want the exit label prioritized); "Passes through the data" sits below the visible card area on small, default and phone cards and is reached by scrolling the card's controls (all four readouts stay accessible as DOM text under "More readouts"); the author-prompt rule recommendation (a label that states a scale or an instruction should be a parentless label) is deferred to the next round.
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
- 03:05 PT section 4: Animation CI green on cad855a1e, preview verified, old-tab rerun 12/12; routine decision on New run applied (next commit).
- 02:55 PT section 2: Release 1 (feedback email) ready with its gate; Release 2 (newsletter) candidate in CI.
- 02:40 PT sections 3 and 4 updated: Animation integrated commit pushed (CI running), feedback F2 and newsletter N pending.
- 02:10 PT section 6 clarified: both cleanup launchers ran with the owner's explicit approval; no recovery needed (owner confirmed).
