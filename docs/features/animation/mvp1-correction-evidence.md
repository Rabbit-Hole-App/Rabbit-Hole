# Animation MVP1 correction: evidence summary (v3, 2026-11-03)

Branch `fix/animation-sgd-rca`, final SHA `cad855a1e3ada884c4b75ec15c4929801c9224f2`. Offline fixture and dev preview only: no model call was made, nothing is merged to main, nothing is released, nothing runs in production. Paid generation is paused until the owner approves it.

This page is the short, GitHub-readable summary. The full report, captures and the evidence ZIP stay in the local evidence folder (not in the repository).

## What this round fixed (owner review of the v2 evidence)

1. **Take one step ran on by itself.** Clicking "Take one step" three times read step 11, not 3. Cause: `session.js` started the host step clock after every accepted action of a stepped scene (added in 321bf2651 so that a Launch or Drop moves). The action itself was dispatched exactly once; the extra steps were the clock playing on. The earlier readings 25, 29 and 11 were all playback.
2. **Card legibility.** The label in the card's 3D viewport was clipped at the right edge and the scale-bar explanation never appeared. Cause (shared label layout, `scene.js` `layoutLabels` / `declutterLabels`): a plate was never clamped to the viewport, and the label-area budget broke at the first plate that did not fit, so every later label was dropped, including live values and captions, in favour of object names. Fix at that layer: essential labels (live values, labels with no parent) are admitted first and always shown; a plate that would leave the viewport is flipped to the other side of its point, then pushed in; a plate wider than the viewport wraps onto more lines. In the SGD fixture the scale-bar label is now a root (essential) label at the bar's right end reading "Arrow this long = update of 1.0" (an arrow as long as the bar is an update of 1.0, the one disclosed scale). Arrows are untouched: they stay proportional, with no minimum length. Measured in a real browser on the real card (real hydration of the sealed fixture, the real QuickJS runtime and the real renderer) at four card sizes (small 320, phone 374 at dpr 2, default 640, large 960) and five states (20 size by state cases per side): every drawn plate inside the viewport 20/20 after versus 9/20 before; status line, scale explanation and every shown arrow label drawn and inside 20/20 after versus 5/20 before; no plate under the card's own overlays, no page error. Readouts (step, passes through the data, loss, distance): unchanged by this fix and present in all 20 cases. Loss is the primary readout over the viewport; the other three are DOM text under "More readouts" (one press on its summary). On the small, default and phone cards "Passes through the data" lies below the visible card area and is reached by scrolling the card's controls (see the known limits below). Captures (before and after PNGs for each size and state) and `measurements.json` are in the local evidence folder (`legibility/`), not in the repository.

## The rule for issue 1 (general, no name or id special-casing)

- An action may declare `startsMotion` (optional boolean, `contract.js`). In a stepped scene the host starts the step clock after an accepted action unless the action declares `startsMotion: false`.
- `startsMotion: false` means "this action only changes the state once" (one step of a process, keep a path, switch a view): a paused scene stays paused and each press is exactly one dispatch. Absent or `true` keeps the old behavior (Launch, Drop).
- The author and repair prompts state the rule (`ACTION_RULES`, `agents/animation-author.js`); the planner prompt and schema are untouched. The SGD qualification (`animation-sgd-qualification.mjs`) fails a one-step action that does not declare it, so a generated SGD scene that would play on is caught offline.
- Existing artifacts: the shipped watch, experiment and game fixtures declare nothing, and neither does the stepped Launch test game; they behave as before (`session.test.mjs`, "startsMotion: no shipped fixture ..." and the Launch tests). Pendulum, bicycle and watch scenes are not stepped, so the rule never applies to them.

## Two verified commits, and what changed between them

1. `cad855a1e3ada884c4b75ec15c4929801c9224f2`: issue 1 (`startsMotion`) and issue 2 (label layout). Verified: verify run 41620275081 success, fast-e2e run 41620275028 success (88 of 88, `animation-mvp-check` 42/42, `shared-header-check` 39/39). Deployed to the dev preview as version 08ccc689-92ab-4732-8994-24502157911f at about 02:55 PT; launcher `--check` OK; old-tab check 12/12 (three clicks read Step 3, paused; saved and restored 3 and 3). This is the earlier verified deployment and stays on record.
2. **Final commit** (the one this file is committed with; its SHA, CI runs and preview version are in the section "Final commit record" at the end, added by a docs-only follow-up): since `cad855a1e` it changes only:
   - **"New run, keep old path" no longer runs by itself**: it declares `startsMotion: false` (a routine decision made while the owner slept, easy to revert: one declaration; see the decisions below). The fixture is regenerated through the generator (plan hash unchanged), the SGD qualification now also fails a new-run action that does not declare it, and the tests that pin the fixture and the session behavior are updated (the SGD session test now reads: a new run is at step 0 and paused three seconds later, and Play runs it).
   - the single-step browser steps also assert the card's Playing / Paused badge (`data-animation-playback-status`), not only the Play button and the step count.
   - this evidence file.
   No application code beyond the fixture declaration changed. Local `animation-mvp-check` with the badge assertions: 42/42 on the integrated tree (a third local run, on an idle machine).

## CI on the first verified commit (cad855a1e)

- verify: [run 41620275081](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41620275081): success
- fast-e2e: [run 41620275028](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/41620275028): success, 88 checks selected in 6 parts, all 88 exit 0, including `animation-mvp-check` 42/42 (the two new single-step steps among them) and `motion-command-check` 50/50. No rerun was needed.
- Header check (`shared-header-check`): 39/39 in the same fast-e2e run.

## Compatibility decision

- `startsMotion` is a second client feature, `action_motion` (`ANIMATION_CLIENT_FEATURES` is now `curve_radius`, `action_motion`). A browser build that does not know the field refuses the artifact (strict action object), so it is gated exactly like tube curves: the author and repair are told, a draft that uses it for a browser without it is refused for repair, and a saved artifact that declares it answers `409 client_update_required` to such a browser (its card says to reload).
- The production bundle check now fails a build that does not declare every client feature; `prod-release.mjs checkCandidate` already refuses dropping one.
- **Limitation awaiting the owner's acceptance (unchanged):** a pre-release production tab that is open when a card is introduced shows an empty card frame (about 380 by 26 px) until it reloads; its saves preserve the card's data (opaque JSON, version lock, id-based merge). A tab running the previous dev build (declares `curve_radius` only) is told to reload for the corrected SGD fixture. Evidence: `docs/features/animation/old-client-compatibility.md` and the old-tab browser check below.

## Tests

Final tree (code SHA above), local, exit 0 each (outputs in the evidence folder):

- control-plane `npm test`: 3346 tests, 3345 pass, 0 fail (1 skipped).
- web `npm run test:unit`: 4982 tests, 4955 pass, 0 fail (the rest skipped).
- `scripts/*.test.mjs` and `scripts/ci/*.test.mjs`: 232 tests, 231 pass, 0 fail (1 skipped).
- New or changed this round: `session.test.mjs` (real runtime: study scene one-step versus Launch; the SGD fixture reads step 1, 2, 3 after 1, 2, 3 presses and stays paused; no shipped fixture declares `startsMotion`; each of the first two fails under the old always-play rule and passes now), `contract.test.mjs`, `animation-old-client.test.js` (action_motion gating), `animation-seed-fixture.test.js`, `animation-mvp1-fixture.test.js` (gate, one-step declaration, a qualification mutant), `label-legibility.test.mjs` and `animation-mvp1-fixture-legibility.test.js` (fail on the old layout), `scene.test.mjs`, `renderer.test.mjs`, `client.test.mjs`, `Animation3DCard.test.mjs`.
- Browser check `packages/web/e2e/animation-mvp-check.mjs` (CI check, already mapped; TOTAL 40 to 42): two new steps for the single-step rule (one click then three seconds stays at step 1, no host tick, paused; three clicks stay at 3, paused, unchanged three seconds later; Launch still plays; a one-step press while playing leaves it playing). It passed 42/42 locally on the tree before the label commits.
- **Unresolved local result on the integrated tree** (not CI, not ignored): two local runs of `animation-mvp-check` gave 40/42 and 41/42. Different steps failed each time (run 1: step 33 the stepped-game Launch landing, and step 42, console errors from a Jupyter notebook toolbar fetch to an external dev worker; run 2: step 17, the game WASD key sequence). Steps 34 and 35 (the two new single-step steps) passed both times. The working hypothesis is machine load, because real-browser captures for the label work ran on the same machine; that is **not proven**. The exact-SHA CI result below is the authority. A third local run later (the badge assertions added, no other load on the machine) was 42/42; that is consistent with the load hypothesis but does not prove it.
- Exceptions: the local control-plane and web suites showed isolated timing flakes earlier (`image-jobs` boundary 2, `genuine-card` "time limit") that passed when rerun alone and did not recur on the final tree.

## What the offline fixture shows, and what generated acceptance still needs

- The fixture (`packages/control-plane/test/fixtures/animation-mvp1-correction-*.json`, built by `build-animation-mvp1-correction-fixture.mjs`) is hand-built, labelled an offline fixture, and passes the real validators and the pinned engine. It shows: tube-wireframe bowl, proportional arrows at one disclosed scale with a scale bar, a zero update hidden and read as 0, an off-plot marker at the true edge crossing, four readouts (step, passes through data, loss, distance), and one step per press.
- It does **not** prove that a model's future generation follows these rules (author and repair following the new action and representation rules, the review accepting a tube-wireframe scene). That needs a paid run after the owner's explicit approval.

## Paid sequence budget (from `animation-policy.js`; no call has been made)

Role bound = (max input tokens + images x 4,784) x $4/Mtok x 1.25 (cache write) + max output tokens x $20/Mtok, in micro-dollars; credits = ceil(micros / 10,000).

| Call | Arithmetic | Micros |
|---|---|---|
| plan (brief), 1 | 40,000 x 4 x 1.25 + 4,000 x 20 = 200,000 + 80,000 | 280,000 |
| plan correction reserve, 1 | same bound again | 280,000 |
| author, 1 | 60,000 x 4 x 1.25 + 24,000 x 20 = 300,000 + 480,000 | 780,000 |
| review, up to 3 | (40,000 + 6 x 4,784) x 5 + 6,000 x 20 = 343,520 + 120,000 = 463,520 each | 1,390,560 |
| repair, up to 2 (the correction/repair reserve) | (50,000 + 2 x 4,784) x 5 + 12,000 x 20 = 297,840 + 240,000 = 537,840 each | 1,075,680 |

- One preparation (plan + its one correction) reserves 560,000 micros = **56 credits** shown on the plan ("using up to 56 AI credits"); the refinement of the owner's sequence (the frozen 40-step refinement) is another preparation: another 560,000 = 56 credits.
- Generation reserves 780,000 + 1,390,560 + 1,075,680 = 3,246,240 micros = **325 credits** shown on Generate.
- Planning + refinement + generation = 560,000 + 560,000 + 3,246,240 = **4,366,240 micros = $4.37 = 437 credits** as the displayed maximum (the earlier "about $4.40"). It is a ceiling, not a forecast: the failed run aj_086fd46 settled at $1.1084 (111 credits) in total. The policy would allow up to 5 refinements (ceiling 6 x 560,000 + 3,246,240 = $6.61); the owner's sequence uses one.

## Owner decisions and known limits this round leaves open

1. **Decision: the exit label off plot.** Off plot, at the small, default and phone card sizes only the status line and the scale legend are drawn: "slope w", "intercept b", "Lowest point" and "Left the plot here" are dropped by the label budget (essential labels first; they return on the large card). The red exit marker then has no label of its own there; the status line ("Diverged at step 1: off plot ...") explains it. The owner may want the exit label prioritized. Not changed.
2. **Routine decision made while the owner slept, easy to revert: "New run, keep old path" now waits for Play.** In `cad855a1e` (the first verified preview) it declared nothing, so by the rule above it started the step clock: the new run played on by itself and the card read Playing (this is what the "Playing" badge in some legibility captures is: the badge and the Play button read the same state, and after Take one step they read Paused). Both actions are state-only, so in the final commit "New run, keep old path" declares `startsMotion: false` too (the generator's second action, one field; qualification and tests follow). **To revert: delete that one declaration in `build-animation-mvp1-correction-fixture.mjs`, regenerate, and flip the two pinned assertions.** Learning-goal reasoning: (a) the learner's question is "what does a different learning rate or batch size do to the path?", and comparing a new path with the saved one needs the learner to look at the start, predict, and then reveal the path by Play (watch it unfold) or Take one step (inspect each update); a run that starts by itself removes the prediction moment, and the updates then run at about four steps a second (a step every 8 host ticks of 1/30 s), faster than the learner can read the arrows; (b) it was inconsistent: changing the learning rate or batch size also restarts the run, and that restart waits (parameter changes never start the clock), so "New run" was the one restart that played; (c) it re-created the symptom of this review in another form: Take one step pressed on a run that the clock is already driving adds one step on top of the playing ones, so the count jumps; (d) the author and repair rule text already lists "keep a path" among state-only actions, so the fixture and the rule now agree. Against: one press that both resets and replays is convenient for a repeated comparison. The owner can overrule it in the morning.
3. **Known limit: "Passes through the data".** On the small, default and phone cards it sits below the visible card area (existing card layout) and is reached by scrolling the card's controls; it stays accessible as DOM text under "More readouts". A card-layout decision, not changed here.
4. **Known limit: leaders and stacking.** A displaced label is joined to its point by a thin grey leader line; with several labels near one point they read as a column of plates. On the 284 px card off plot, the status wraps to two lines over the top of the bowl.
5. **Recommendation for the next round (not in this change):** add to the author and repair rules that a label which states a scale or an instruction should be a parentless label, since only parentless labels always show. It did not fit this CI cycle.
6. **Open limitation, unchanged:** an old tab shows an empty card frame until it reloads (see the compatibility decision above).
7. **Unproven:** whether a model-generated SGD scene follows the new action rule and the representation rules, and whether the model review accepts it.

## What generated acceptance still needs

1. The owner's explicit approval of the paid sequence (budget above); paid generation stays paused until then.
2. One controlled run of the frozen request and the frozen 40-step refinement on this commit's dev clone, then the SGD qualification checker on every draft it produces (`node packages/control-plane/animation-sgd-qualification.mjs <file>` with the ids the generated artifact uses), now including that its one-step action declares `startsMotion: false`.
3. Reading what the model's review received (the three captures: initial, middle learning rate after steps and Keep Path, the high end) and what the repair was forwarded, in full.
4. The owner's browser acceptance of that generated card: numbers match the picture, controls, proportional arrows at one disclosed scale, labels inside the card at the sizes the owner uses, the tube bowl, Take one step stepping once and staying paused, Keep Path, Reset, reload restoring the saved state, the off-plot marker, the zero case.
5. Stop rules: no extra repair, no retry to get a pass, no weakened review or size check; a failure is reported as a result.

## State of every path (at the end of this round)

- Branch `fix/animation-sgd-rca`: local and remote `rabbit-hole` both at `cad855a1e3ada884c4b75ec15c4929801c9224f2` (CI-verified code SHA); a docs-and-check commit on top follows this preview. Nothing is on main; no PR; nothing in production.
- Branch `fix/animation-rca-legibility` (helper, worktree `animation-rca-legibility`): local only, at `cad855a1e` (fast-forwarded into the branch above; no commits of its own beyond it); never pushed.
- Dev clone `rabbit-hole-web-dev-animation` (never the shared worker): serves `cad855a1e` (version 08ccc689-92ab-4732-8994-24502157911f, deployed 2026-11-03 at about 02:55 PT after verify and fast-e2e were green on the exact SHA), deployed after verify and fast-e2e were green on that exact SHA, with `ANIMATION_ENABLED`, `ANIMATION_DIAGNOSTICS` and a $40 platform day cap; it holds no model credential, so no paid call is possible from it.
- Local test stack: stopped, its data removed. Worktree `animation` (the integration worktree) untouched.
- The frozen candidate `51b6560cf` and the pre-release production client `b58d74876` are only read (checkouts `rca-base`, `rca-main` for the old-client tests and the old-tab check).
- Local only, not in the repository: the evidence folder `C:/s/spec/animation/sgd-mvp1-correction-v2/`, the evidence ZIP `C:/s/spec/animation/sgd-mvp1-correction-v2.zip`, the launcher `C:/s/spec/animation/open-correction-fixture.cmd`.

## How to use the dev preview

The dev preview of the offline fixture is the dev clone `rabbit-hole-web-dev-animation` (never the shared worker, never production). Dev clones refuse sign-in, so use the local launcher on the owner's machine, which opens the canvas already signed in as the fixed dev test user: run `C:\s\spec\animation\open-correction-fixture.cmd` (it finds or creates the canvas titled "MVP1 correction - OFFLINE FIXTURE, not model-generated", re-seeds the fixture as a saved result through the dev-only `seed-fixture` route, places one card and opens the browser). `--check` does the same without opening the browser and reads the saved result back the way the card does. The route exists only where `ANIMATION_DIAGNOSTICS` is set (the dev clone); production config pins it off. A tab that was open before the redeploy declares only `curve_radius` and is told to reload for this fixture.

Preview version: 08ccc689-92ab-4732-8994-24502157911f, deployed 2026-11-03 at about 02:55 PT after verify and fast-e2e were green on the exact SHA

## Files changed this round

Code: `packages/web/src/animation3d/{contract,session,capabilities,scene,renderer}.js`, `packages/control-plane/src/{animation-author,animation-brief,animation-job,animation-repair}.js`, `packages/control-plane/src/agents/animation-author.js`, `packages/control-plane/animation-sgd-qualification.mjs`, `packages/control-plane/build-animation-mvp1-correction-fixture.mjs` and its two JSON outputs in `packages/control-plane/test/fixtures/`, `packages/web/e2e/{animation-mvp-check,production-bundle-check}.mjs`, `scripts/ci/check-map.json` (classifies the two offline tools as none), `docs/features/animation/old-client-compatibility.md`. The rest are tests. Commits since 9f92ad49e: c9a29b3b9, 3145f9c7d, 4889f421a (single step, mine), 76628b991 and cad855a1e (label legibility, separate worktree, fast-forwarded in).
