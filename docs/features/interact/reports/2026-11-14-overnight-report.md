# /interact fast path: overnight report (2026-11-13 22:00 PT to 2026-11-14 09:30 PT)

For review. Everything here is on branches of the `rabbit-hole` remote. Nothing was pushed to `main` and nothing was deployed to production. Figures come from the evidence folders named in each section; where a figure is an estimate it says so.

## 1. State

| Item | State |
|---|---|
| Branch with all the work | `design/fast-path` |
| Release candidate | `release/interact-131`, `4ea5f05572f1db50ac2e28b7b993fc23cb224a78` (contains `main` `2a31d4d7bb38d1ef0a981b92a03a2dfae90f3c97`) |
| Rollback branch | `rollback/pre-interact-131` at the `main` it was cut from (`2a31d4d7b`) |
| Recovery branch | `recovery/interact-131-c` (`fbf68ba53`), a strict descendant of the release candidate carrying main's tree |
| MVP preview record for the candidate | Record `714cba6943e4851a` exists for `4ea5f0557` (preview passed). The launcher's `--check` then refused it: `main` moved again to `ee9966384`, so the candidate no longer contains `main`. See section 11. |
| `verify` and `fast-e2e` on the candidate | Both still running on `4ea5f0557` when this was written. On the earlier candidate `2780a7f83`: `verify` green, `fast-e2e` red on the same 34 assertions as `main`'s own probe run `43557031994` (the known 27 checks). |
| Codex's curve family (`design/family-curve`) | Last seen at `303762f73`. Deliverables 4 to 6 had not landed, so the curve measurements were not run and `open-curve.cmd` does not exist. |
| Third family | The brief for Codex is `docs/features/interact/briefs/family-3-stepper.md`. |

`main` moved twice during the morning (`a8ef11d64` to `bbd2c581b` to `2a31d4d7b`), and each move made the earlier release SHA stale. The launcher refuses a candidate that does not contain `main`. Pins files `131-`, `131b-` and `131c-interact-fast-path.pins` under `C:\s\spec\release-queue\` track the successive candidates; only `131c` matches this one.

## 2. What the fast path is

Under `INTERACT_DESIGN_KIND=fast`:

1. A pick (`packages/control-plane/src/interact-design-pick.js`, System One JEV, about 55 to 145 ms) names the family or `none`. A gap goes to the Opus design.
2. One call to `design_fill` (Gemini Flash Lite) fills a plan brief. Code expands it (`expandBrief`) and checks it: schema, plan checks, reference formulas, description fit, and a design-time precheck of the template build (including a lane word budget).
3. A refusal gets one correction naming the fix. A second refusal sends the job to one Opus-written plan brief (`INTERACT_FAST_OPUS_BRIEF=on`), not the old full design.
4. A pass is approved by the system (`approvedBy=fast-path`) and builds at once, with zero model calls (`INTERACT_BUILD_KIND=template`).

New settings, all defaulting to today's behaviour: `INTERACT_DESIGN_KIND`, `INTERACT_PICK_THRESHOLD`, `INTERACT_FAST_OPUS_BRIEF`, `INTERACT_CHAIN` (off), `INTERACT_CHAIN_BUDGET_MS`, and a dev-only `INTERACT_FAST_FORCE_FILL_FAIL`. `wrangler.dev.jsonc` (not prod) sets the fast-path settings so the owner's local stack runs it.

## 3. Fast path against the Opus design (brief 12)

Final clean set on the clone, toss prompt, three depths, three runs each (`evidence/2026-11-14-fast-path/fast/results.jsonl`):

| Result | Count |
|---|---|
| Ready, one fill call | 8 of 9 |
| Fell back to Opus after the correction (Balanced run 3) | 1 of 9 |

- Prompt to ready card: 9.0 to 10.3 s, median 9.8 s. Design cost about US$0.0025 to 0.0033 per card (rows that carry a cost). Build cost 0. `msTotal` 8.3 to 9.4 s.
- The Balanced fallback: first problem `template build: [arrow_direction] the arrow "vec.a.toss" is not drawn at cp-fastTop ...`; the Opus plan was then refused with `scene.template and scene.slots come together or not at all`.
- Opus baseline, once per depth, same build settings (`evidence/2026-11-14-fast-path/opus/results.jsonl`): 247 s, 362 s, 291 s prompt to end; design cost US$0.77, 1.07, 0.99; all three failed at the build step (the build runs on the cheap model).

Caveat: 8 of 9 is not a blind rate. Four fix cycles happened between run sets, each prompted by a failure: the evidence ids a real job does not supply, a limits block in the fill text, a design-time precheck of the template build, and a gravity floor. Earlier sets are kept in `evidence/2026-11-14-fast-path/fast-*-attempt-*`. In-process samples (real Gemini and JEV, Opus stubbed): Brief 10 of 10, Detailed 10 of 10, Balanced 29 of 30 at best and 17 of 20 on a later round.

## 4. Pick (brief 13)

`benchmarks/bench-pick.md`, 1,080 JEV calls, median 58 ms, p95 104 ms, 0 timeouts. After relabelling prompt 33 as `curve-sliders` and 11 as `either`:

| List | Threshold | Wrong fits | Missed fits |
|---|---|---|---|
| `[vertical-throw]` | 0.7 | 0 | prompts 4, 12, 15, 16 |
| `[vertical-throw, curve-sliders]` | 0.9 | 0 | 11 prompts |

The wiring default is 0.7 with one family and 0.9 with two or more (`INTERACT_PICK_THRESHOLD` overrides). Clone run at Balanced, once each (`evidence/2026-11-14-fast-path/pick/`): prompts 1, 5, 9 built straight through (9.5 to 12.1 s); prompts 49 and 50 gapped (below threshold); 35 and 46 gapped (`none`); 4 gapped and its Opus plan was refused with the template/slots/words error. The gap plans cost about US$4.1 (about US$0.45 to 1.12 each).

## 5. No approval pause and one place per number (brief 14)

- A fast pass is approved by `fast-path` and builds at once. A fallback plan still stops at `awaiting_approval`. A learner who tries Edit on a ready fast card is refused by the server (409, "This brief can no longer be changed"); what the client shows was not checked.
- The readouts row omits readouts a callout already shows. Card block heights at 1440 by 900 with Chat open (`evidence/2026-11-14-fast-path/heights/`): Overview 637 to 637, Standard 731 to 681, Deep 792 to 770, Moon ledge 618 to 618. The "before" figures come from an earlier measurement, not a rerun.

## 6. Overnight work

- **1a, Opus fallback.** A forced fill failure with the Opus-written brief reached a ready card in 26.7 s for US$0.077. Gap prompts 35 and 46 produced no card (US$0.65 and US$0.91): a `none` pick has no family, and the model build behind it is unreliable. A guard drops a template that has no slots or words. First deploy of this measurement shipped the wrong code (`deploy-clone.mjs` hard-codes the coordinator's checkout); those rows are labelled and a `DEPLOY_REPO` override was added.
- **1b, fill corrections.** Corrections name the fix for the 33-node formula, a marker before 0, the unbuildable arrow, an unknown formula name, a wrong value after the switch, and a short description. The 30 of 30 target was not reached (see section 3).
- **1c and 1d.** The lost ledger row was restored; the ledger has 96 rows. Spend is reconciled in `benchmarks/spend-2026-11-14.md`. A secret scan of committed and evidence files at four branch tips passed (`benchmarks/secret-check-2026-11-14.md`); seven keys have hits that are identifiers or public values. The Claude session transcript was not scanned. An `HF_TOKEN` value was printed once into the session by the coordinator; rotate it.
- **2, latency.** `INTERACT_CHAIN=on` runs the next stages inside one alarm. Clean rerun (`evidence/2026-11-14-chain/after2`): Brief 4.3, 4.4, 4.6 s; Balanced 4.9, 5.1, 8.0 s; Detailed 5.1, 5.0, 5.2 s, against 8.4 to 9.9 s unchained. An earlier set had 2 of 9 rows stall about 30 s inside the validating stage; the cause is unexplained and a deploy-timing hypothesis was not supported. Chaining stays off.
- **3, judge.** The shadow judge now receives callout texts, readouts, scrubber range and offset, and state words. Re-run on 12 existing cards (`benchmarks/judge2.md`): 22 majors, 0 wrong physics, 6 content, 1 wording, 15 cannot-judge. It passes 1 of the 4 approved template cards and 2 of the 8 fast cards. It found real clipped lane words on the fast cards, now guarded by a design-time check. The pinned Deep card already draws "Back at launch" for "Back at launch height"; left as is.
- **4, coverage.** 155 unique prompts (`benchmarks/bench-coverage.md`): stepper through states about 35% for both classifiers; none 17 to 18%; graph with active path 10 to 13%; before/after 10 to 12%; grid of values 11 to 17%; curve with sliders 8 to 9%; scene over time 3 to 4%. JEV and Sonnet agree on 71.6% of prompts. Sonnet spend about US$0.56.

## 7. Release gate (candidate `6ceb15352`, a precursor)

`scripts/release/gate-interact-131.sh <sha>` ran in a clean checkout with a real `npm ci`. The web, control-plane, scripts, evals, viz, render, file-convert and Python suites, both builds, the production bundle check and all three wrangler dry-runs passed. Two reds: the `check-map` class test (the gate script itself was unclassified; fixed) and one machine-local motion test that reads `C:/s/spec/budget` (environmental, in an area this branch does not touch). The gate was not rerun on `4ea5f0557`; later changes are merges of `main` and small fixes.

Bundle sizes against `main` `a8ef11d64`: dev Worker +114,548 bytes (9,108,453 to 9,223,001); production app Worker +114,548; production control plane 0; web dist +3,637.

Also: `scripts/ci/check-map.test.mjs` failed with `spawnSync git ENOBUFS` because the tracked file list passed 1 MiB; the test now reads with a larger buffer.

## 8. Spend

About US$18.3 for 22:00 PT to 03:10 PT (`benchmarks/spend-2026-11-14.md`), plus an unaudited estimate of about US$6 since. The ledger misses US$4.91 on jobs that never finished. Brief 12 ended about US$0.47 over its US$12 stop line, under its US$15 cap.

## 9. Known problems and things not checked

- A gap-pick prompt (about 18% of prompts) produces no card; the Opus design for it costs US$0.65 to 1.40.
- About a quarter of Balanced fills still fail a check on the first try (a one-line description, a 33-node formula); one fell back to Opus in the final set.
- The chain stalls (section 6) are unexplained.
- Merges dropped and re-added content twice (38 ledger rows and evidence in one, old page captures in another); both repaired, but the history of `design/fast-path` has those extra commits.
- Ten finished agent worktrees under `small-deploy/.claude/worktrees/` and the gate checkout `C:\s\r131-0a58fd6` are still on disk (locked by their sessions).
- Not run: browser e2e locally (owner rule), the `/explain` smoke tier, the curve family acceptance.

## 10. Where to look

`docs/features/interact/benchmarks/` (ledger, bench-pick, bench-coverage, judge2, spend, secret check), `docs/features/interact/evidence/2026-11-14-fast-path/`, `evidence/2026-11-14-chain/`, `evidence/2026-11-14-overnight/`, `docs/features/interact/briefs/family-3-stepper.md`, `docs/features/interact/build-half.md`.

## 11. Tasks, status and blockers (everything asked, in order)

| # | Task (owner message) | State | Result or where |
|---|---|---|---|
| 1 | Brief 11, design MVP: can a fast model write the ScenePlan from prompt and depth | Done | Flash Lite passed 2 of 10 (Brief), 1 of 10 (Balanced), 0 of 10 (Detailed) on the strict match rule; 20 of 39 attempts failed only the range-match rule. `benchmarks/bench-design-mvp.md`. Two cards delivered on a clone canvas. |
| 2 | Brief 12, fast design path in the job, Opus as measured fallback | Done | Sections 2, 3, 6. |
| 3 | Brief 13, the pick (JEV) | Done and wired | Section 4. The original stop rule (0 wrong fits and at most 3 missed) failed; the owner overrode it and the pick is wired. |
| 4 | Brief 14, no approval pause; one place per number | Done | Section 5. |
| 5 | Family contract (owner 00:50, 02:35): schema, generator context, fill text, registry from the family module | Done, pushed `42a8d0c48` then `05aa537c4` | The toss fill text is NOT byte-identical to before: the names sentence is now derived per depth, and the gravity floor sentence moved under Formulas. The snapshot was refreshed. `formulaRules` is now a function of depth. |
| 6 | Coverage measurement (brief 15, 02:55) | Done | Section 6, `benchmarks/bench-coverage.md`. |
| 7 | Overnight 1a to 1d | Done, one target missed | 30 of 30 in-process not reached. |
| 8 | Overnight 2, latency chain | Done, off by default | Section 6. |
| 9 | Overnight 3, readable judge | Done | Section 6. |
| 10 | Overnight 4 and the 03:10 addendum, stepper brief for Codex | Done | `briefs/family-3-stepper.md`; `cv-j` merged into `design/fast-path`. |
| 11 | Overnight 5, Codex's curve family: merge, acceptance, bench, clone runs, `open-curve.cmd` | **Blocked on Codex** | His branch had not moved past `303762f73` (deliverable 4 pin commit; his merge note says deliverable 6 was next). |
| 12 | Overnight 6, prepare main: merge `main`, release branch, rollback, gate, dev config | Done for the no-curve candidate, **stale** | Section 1 and below. |
| 13 | Earlier close-out items: trash `canvas-b504c917`; delete `probe/main-all-checks`; production checks as `@yuvish_demo` only | Branch deleted; canvas **not trashed** (the Chrome tab froze twice); rule recorded | Owner can trash the canvas from Home. |
| 14 | Remove unused worktrees to save space | Mostly done | 64 removed in the first sweep, 7 more later; ten finished agent worktrees are locked by their sessions and remain, plus `C:\s131-0a58fd6`. |

### Blockers

1. **Release 131 cannot be pushed as pinned: `main` keeps moving.** `main` has gone `a8ef11d64`, `bbd2c581b`, `2a31d4d7b`, `ee9966384` since the candidate was first cut. The launcher requires the candidate to contain `main`, and each re-cut means a merge, a recovery branch, an MVP preview (about 8 minutes) and a new pins file. The current candidate is `4ea5f0557` (contains `2a31d4d7b`); `main` is now `ee9966384`. The exact commands for a candidate are: set `MVP_ALLOWED_SHA` to the candidate SHA (owner only), run `C:\s\specelease-queueelease-mvp.cmd <pins-name>`, then delete the variable. A re-cut needs to be done at push time, or main pushes paused while the release lands.
2. **`MVP_ALLOWED_SHA` is owner-set.** Agents never set it.
3. **`fast-e2e` is red** on the known 27 checks (same 34 failing assertions as `main`'s probe run `43557031994`), so the MVP fast path is required, under the 2026-11-13 waiver.
4. **Codex's curve deliverables 4 to 6**, for the curve measurements and the curve launcher.
5. **Owner actions:** rotate `HF_TOKEN` (printed once into the Claude session by the coordinator); trash `canvas-b504c917` on the `chin@` account.

### Not blockers, but unresolved

- The gap path (a `none` pick) produces no card; Balanced fill failures at about a quarter of first tries; the unexplained chain stalls; the pinned Deep card's clipped "Back at launch" word; `ledger.jsonl` carries the two restored rows at the end rather than in time order; fast rows after the no-approval change read design cost 0 in the ledger (the true cost is about US$0.003).

## 12. Work done by parallel agents (who did what)

- Brief 12: A (fast wiring), B (ledger columns and the `drive-design.mjs` driver), G (detailed-depth precheck), F and H (one place per number; no approval pause).
- Brief 13: A (pick module, registry, 60 prompts), B (bench harness), C (wiring), D (relabel, prompts mode, `open-pick.cmd`).
- Family contract: E.
- Overnight: A (Opus fallback and corrections), B (ledger restore, spend, secret check), C (stage chaining), D (readable judge), E (stepper brief), F2 (lane word budget), G (gate script and discovery).
- Coverage: J.

Branches of the agents on the remote: `on-a`, `on-b`, `on-c`, `on-d`, `on-e`, `on-f`, `gate-g`, `pk-a` to `pk-d`, `dt-g`, `fc-e`, `ro-f`, `na-h`, `cv-j`.

## 13. Decisions taken without the owner

Chaining kept off; the Opus brief set on in dev config and the clone only; fourth fill line and a limits block added to the fill text (owner approved the first at 00:15); the confidence threshold made a function of the family count; the Overview-only readout row left as is; the `check-map` test given a larger buffer; the ledger conflict resolved by taking the union by job ID; `release/interact-131` and `rollback/pre-interact-131` moved forward by fast-forward each time `main` moved (no history rewritten); recovery branches `recovery/interact-131`, `-b`, `-c` created for each candidate.

## 14. Mistakes by the coordinator

An environment dump printed an `HF_TOKEN` into the session; a merge dropped 38 ledger rows and evidence (repaired); I discarded uncommitted ledger changes once; the clone lock was introduced only after two agents had deployed over each other, which invalidated one measurement; and two agents' deploys shipped the wrong code until the script's hard-coded checkout path was found.
