# ci-speed P0 report (phase 1, read-only), 5 Nov 2026

Lane `ci-speed`, worktree `C:\Users\cyudhist\Desktop\workspace\ci-speed`, branch `feat/ci-speed` at `d3bfea9be` (= `rabbit-hole/main`). I changed nothing in the repository and dispatched or reran no workflow. (I briefly created two local read-only note refs to read the notes and deleted them again.) Brief read: `OWNER-BRIEF.md` VERSION 2 (md5 17f61eb3..., 11:29 PT); item numbers below are v2's. Sources: `gh api .../runs/<id>[/attempts/<n>]/jobs`, job logs, the d3bfea9be release-receipt artifact, `refs/notes/{dev-deploys,gates}` on rabbit-hole, and the code at d3bfea9be plus the harness `rabbit-hole/fix/ctrlk-gate-selection` (fc0ff0a62).

## 1. P0 table (real timestamps; s = seconds of wall time, rm = runner minutes, each job rounded up to a whole minute)

Fast-e2e shard cell: job s / install s (npm ci + natives + browsers + engine libs + cache steps) / build s (both bundles, run in parallel) / checks s / number of checks (count of `run-part.sh` result lines in the job log).

| | verify | fast-e2e shards 1-6 | fast-e2e total | gate (gate-sharded.yml) | dev deploy (deploy-dev.yml) | prod: prepare + release (deploy-prod.yml) |
|---|---|---|---|---|---|---|
| **W0 binding 71162c729** (feat/w0-whiteboard-bindings) | 41936306012: 323 s wall (unit suites 209 s, page builds 11 s, setup-uv 47 s, npm ci 19 s), 7 rm, success | 1: 817/31/10/752/15; 2: 810/40/11/734/15; 3: 883/41/12/804/16; 4: 884/58/12/791/16; 5: 870/75/10/759/16; 6: 821/29/10/762/16 | 41936306030: 919 s wall, **94 checks** (broad), 89 rm | 41938211033: 937 s wall (00:01:35-00:17:12Z), 93 rm raw, all on windows-2022 except preflight and collect | 41940460606: 83 s (Deploy step 56 s), 2 rm | 41940668346: 119 s job; prepare 20 s, release 35 s, checkout 27 s, npm ci 22 s; 2 rm |
| **W1 candidate a82e6f414** (feat/w1-whiteboard) | 41988071370: 332 s, 7 rm, **failure** (unit suites: the Motion renderer hash test "this checkout renders with the code that was measured") | 1: 905/41/11/832/16; 2: 785/35/11/720/16; 3: 732/32/10/665/16; 4: 789/42/8/721/16; 5: 862/66/10/765/16; 6: 856/37/11/787/16 | 41988071411: 934 s, **96 checks**, 89 rm, success | none (no gate run on this SHA) | none | none |
| **W1 flip d3bfea9be** (feat/w1-whiteboard) | 41997063680: 335 s (unit 216 s: web 5170 tests 109 s, control-plane 3628 tests 74 s, rest small; builds 12 s), 7 rm, success | attempt 1: 1: 895/28/11/835/16; 2: 792/25/10/726/16; 3: 732/25/10/675/16; 4: 910/47/12/824/16; 5: 824/60/11/734/16; 6: 798/24/12/739/16 **failed: project-menu**. Attempt 2 (failed-only rerun): 6: 825/21/11/775/16 | 41997063688 a1: 941 s, 96 checks, 88 rm, failure; a2: 836 s (17:03:24-17:17:20Z, **8 h 01 min after a1 ended**), about 15 rm (shard 6 + verdict) | 42073187357: 899 s wall (17:17:39-17:32:38Z), 96 rm raw | 42087106404: 116 s (Deploy 84 s), 2 rm; started 71.6 min after the gate | 42087503547: 126 s; prepare 17 s, release 41 s, checkout 41 s, npm ci 19 s; 3 rm |
| **lane feat/w1-server f4d25c0e1** | 41992625826: 389 s (unit 262 s), 7 rm | 1: 811/25/11/753/15; 2: 792/26/11/737/15; 3: 744/21/10/695/16; 4: 886/41/10/816/16; 5: 836/51/10/756/16; 6: 874/27/10/819/16 | 41992625822: 944 s, **94 checks**, 87 rm | n/a | n/a | n/a |
| **lane feat/w1-web 1ee87b07a** | 41991857437: 336 s (unit 215 s), 7 rm | 1: 894/29/11/832/16; 2: 791/31/10/729/16; 3: 776/26/10/721/16; 4: 942/65/11/839/16; 5: 937/102/11/799/16; 6: 878/24/11/806/16 | 41991857360: 972 s, **96 checks**, 91 rm | n/a | n/a | n/a |
| **lane feat/w1-render 25850469e** (`packages/learn-render/whiteboard/contracts.mjs` only) | 41948459139: 483 s wall (job 378 s, unit 272 s), 8 rm: the whole `run.sh test:unit`, which **does not run** `packages/learn-render/whiteboard/*.test.mjs` | no shard (plan selected 0 checks: the path is class `none`) | 41948459127: 49 s, 0 checks, 2 rm | n/a | n/a | n/a |

**What the gate ran (both gates, same shape).** It is a dispatch of `gate-sharded.yml` on the harness branch with `APP_SHA` set to the candidate: 71162c729 for 41938211033, d3bfea9be for 42073187357 (from the log). It has a Linux preflight (7-10 s; it needs verify and fast-e2e already green on the SHA), then 9 Windows parts in parallel: `units` (make test-unit + fixture regression; 462/485 s), `checkpoints` (preflight 101/113 s + instrumented Dive 237/227 s; 458/498 s), and `shard-1..7` (457-890 s; shard-4 is the longest, 890/834 s: rh-dev, selected-pill, analytics-ui, card-context-menu, slash-sheet, library-folders, share-revocation). Each part spends 32-75 s installing. Then `collect` runs (27/47 s). There are 45 stages in all (`scripts/r36-gate/shards.mjs` ORDER; the same 45 that `dev-deploy.mjs` GATE_STAGES:58-72 attests). Windows minutes are raw here. GitHub's published Windows rate is 2x Linux; I did not read the billing.

**End-to-end critical path**
- W0 71162c729: push 23:46:10Z, verify done +5.4 min, fast-e2e done +15.3, gate +15.6 (it started 6 s after fast-e2e), launcher gap 2.2, dev 1.4, prod 2.0. **36.9 min from push to production.** About 193 raw rm (verify 7 + fast-e2e 89 + gate 93 + 2 + 2).
- W1 flip d3bfea9be: push 08:46:29Z, a fast-e2e flake (project-menu), an 8 h 01 min wait before the rerun, rerun 13.9 min, gate 15.0, a 71.6 min wait, dev 1.9, prod 2.2. Machine time on the critical path: 15.7 + 13.9 + 15.0 + 1.9 + 2.2 = **48.7 min**; **10 h 02 min elapsed**. About 216 raw rm.
- Lane push (broad): about 15.5-16 min of fast-e2e and about 95 rm, every push, for informational CI.

**Where the minutes go (what the numbers say).**
- Inside a fast-e2e shard, install plus build is 31-113 s out of about 800-940 s. The rest is the serial checks (12-14 min).
- Every W0/W1 push selected the whole Linux set (94/96) because every one touched a broad path: `packages/control-plane/src/*.js`, check-map.json:25, or `packages/web/src/Whiteboard*.jsx`, :109.
- Prepare + release is already about 2 min (job 113-132 s). The 35-60 min is the chain in front of it: fast-e2e (15.5 min), then the gate (15 min, serialized behind fast-e2e by the owner's rule of 2026-10-14, gate-sharded.yml:53-54), then the human/launcher gaps.

**Duplicated work today (the "minus the duplicate runs" candidates)**
- `make test-unit`: verify (Linux, `run.sh test:unit`, about 3.5-4.5 min) and the gate's `units` part (Windows, about 5-5.5 min). Not duplicated: `fixture regression` (`packages/web/e2e/nanogpt-repository-fixture.test.mjs`, int35.sh:98) runs only in the gate.
- Browser checks in both fast-e2e (Linux) and the gate (int35.sh): analytics-ui, canvas-forking, card-context-menu, card-redesign, card-select, card-thumbnails, creator-profile, cross-device, dive, explain-back-sketch, explore-holes, handle, naming, panel-header, project-canvases, project-menu, sidebar, slash-sheet, visibility, workspace, library-folders and share-revocation: 22 checks, about 1245 s of check-map seconds.
- Builds: verify builds dist + dist-dev, each fast-e2e shard builds both (x6), the gate builds, deploy-dev builds, and prod prepare builds again. Each is cheap (10-20 s on Linux).
- `production-bundle-check`: gate stages `bundle(dist)`/`bundle(dist-dev)` (int35.sh:189-190) and `prod-release.mjs prepare` (prod-release.mjs:265). The prepare copy must stay (owner rule).

**Not covered anywhere in CI.** check-map.json has 150 `windows-only` checks. Only 18 of them appear in the gate's int35.sh; the other **132 run in no workflow**, for example cad-check, cad-viewer-check, explain-entry-check, explain-scene-check and the tutor-* checks. 134 mapped globs select only windows-only checks, so 0 Linux checks; one example is `packages/web/src/CadReview.jsx` -> cad-controls-check. fast-e2e labels all of them "Not covered in this tier (release gate only)" (fast-e2e.yml:83, :175). For the 132 that label is false.

## 2. Ledger entry (draft; the integrator writes it, since the ledger is outside my read-only scope)

```json
{"id":"<new uuid>","parent_id":null,"title":"CI and release speed (owner brief v2, 5 Nov 2026)","owner":"ci-speed","agent":"ci-speed","branch":"feat/ci-speed","sha":"d3bfea9beab286df3c4fca5904f804321265b7e1",
 "scope":"OWNER-BRIEF.md v2 items P0, 1-11; worktree workspace/ci-speed; harness changes on fix/ctrlk-gate-selection","acceptance":"each item one push point with diff, tests run, measured minutes; before/after table from real runs (item 11); money/sign-in/secret/migration/bundle checks listed with where they run",
 "progress":"Doing","phase":"P0 measurement (read-only) done; phase 2 not started","activity":"P0 report C:/s/spec/ci-speed/P0-REPORT.md","depends_on":[],"blocker":"owner rulings on the mismatches in P0-REPORT section 3 before item 1; workflow-file pushes need the owner's ! command","blocker_owner":"owner","next_action":"owner reads P0-REPORT; integrator confirms clone deletions","eta":null,"evidence":["P0-REPORT.md"]}
```

## 3. Clone list

- The owner's list of 5 Nov has 17 clones: `rabbit-hole-web-dev-{add-context, animation, animation-examples, animation-feasibility, cad-integration, creator-analytics, ctrlk-tools, explain-back, explain-sandbox-card, explore-top, pdf-excerpts, signup-prefs, small-parallel, ui-release, usage-analytics, wb-integrate, wb-preview}`. The integrator deletes the nine that have no worktree; I did not read Cloudflare.
- `rabbit-hole-web-dev-small-parallel` is **the stable preview** and must never be deleted. It is served at `https://preview.digrabbithole.com` (dev-deploy.mjs:21, :26; dev-auto-deploy.md:18-21), deployed from the entry `dev-access-worker.js` (dev-deploy.mjs:485), and protected by Access app 58b92e83 on that host only. Its `ACCESS_HOST` secret names the host, and the bridge refuses every other hostname (dev-access.js:50-52). Its old workers.dev host is retired (403).

## 4. Mismatches between the brief and the code, each with a recommended resolution

### Item 1: "the gate runs nothing already green; dev-deploy.mjs runs the deploy, five confirmations and the smoke stages"
1. **dev-deploy.mjs runs no tests and no stages.**
   - What it does: it reads a gate record and attests it (`gateVerdict` dev-deploy.mjs:101-111; every GATE_STAGES entry needs a positive count and a tripwire 0, :86-97), then builds, deploys, waits for 5 confirmations (:22, :333-338) and smokes (:325-378).
   - Where the 45 stages and `make test-unit` actually run: the Windows harness `gate-sharded.yml` on **another branch** (`fix/ctrlk-gate-selection`; int35.sh, shards.mjs SHARDS, collect.mjs). It is triggered only by `workflow_dispatch` with `app_sha`/`app_tree`, or by a push to `parallel/gate-sharded` (gate-sharded.yml:14-28). Today the owner's launcher runs it (`release.sh` -> `day-1021/rel-after-gate.sh`, which also writes `refs/notes/gates` and pushes dev).
   - Resolution: skip in the harness (int35.sh/shards.mjs/collect.mjs on the harness branch), and teach GATE_STAGES/`gateVerdict` to accept a stage attested by fast-e2e. Both are harness and attestation changes, not a dev-deploy.mjs code path.
2. **"Green fast-e2e on the SHA" does not mean the gate's checks ran on that SHA.**
   - fast-e2e selects by diff from the newest green ancestor run on the same branch (affected.mjs:39-41, :87-89). Today everything is broad, so all 96 run. After item 2, a narrow diff runs a few checks and still goes green.
   - Ruling: a gate stage counts as "already green" only when the exact-SHA fast-e2e artifact (`fast.log`, run-part.sh:177) shows that check's own `exit 0  N/N checks passed` line. The run's conclusion alone does not count. Why: otherwise item 1 plus item 2 silently drops the 22 shared checks. Cost if wrong: a stage runs twice (time only).
3. **Items 1 and 3 conflict.** A package-selective verify (item 3) no longer proves `make test-unit`, so "skip make test-unit when verify is green" (item 1) would skip suites that verify never ran.
   - Ruling: the verify note records the suites it ran (item 3), and the gate skips only those. Cost if wrong: a gap in unit coverage on full-gate candidates.
   - Platform note: gate `units` is Windows, verify is Linux. Dropping the Windows copy loses the only Windows run of the unit suites; the Git Bash glob trap is a Windows-only failure (CLAUDE.md gotchas). Ruling: keep `units` for the Full-gate tier, drop it elsewhere.
4. **The smoke stages the owner named do not exist in dev-deploy.mjs.**
   - Sign-in: yes (Access token, signed-in `/api/apps` and `/api/profile`, :373-376).
   - Canvas load, one paid refusal, share-revocation: no.
   - share-revocation is a Playwright fork check against the local stack (`check-map` runner fork; run-part.sh FORK_ENV:115-116 uses `BASE=127.0.0.1:8878`, `PERSIST`, `D1_CONFIG`). It cannot run against a deployed clone without a rewrite, and deploy-dev.yml installs no browser.
   - Resolution: add HTTP-only smoke probes (canvas GET; one POST to a paid route without `confirmed` expecting the paidRefusal 4xx; a revoked share token 404) to dev-deploy.mjs. Keep the share-revocation browser check in the background run.
5. "prod-release.mjs accepts both": prepare accepts only `gates:'pass'`, or `gates:'reused'` with a byte-identical or UI-only base (prod-release.mjs:83-90, :105). A new value such as `gates:'ci-attested'` needs a new branch there and in deploy-prod.yml:33-40.

### Item 2: broad shrinks; unmapped fails
6. **An unmapped file does not fail today.** It runs `defaultChecks` (7 checks, check-map.json:229) and warns (affected.mjs:1-4, :28, :77; fast-e2e.yml:80, :84). The owner wrote "still fails".
   - Ruling: make it fail in the plan job with the one-line fix ("add <path> to scripts/ci/check-map.json"). Why: that is what he wrote, and it is cheaper than 4 min of default checks. Cost if wrong: a lane push fails until it adds one map line.
7. **Why it is broad today.** `packages/control-plane/src/*.js` (check-map.json:25) and `agents/*.js` (:26) make every control-plane file broad. For example: one-file whiteboard-job, animation-job, cad-jobs, motion-provider, explain-job, chat-proposal-route, file-jobs, learn-files and shared-privacy each select **96**. On the web side, broad globs such as `Whiteboard*.jsx` (:109), `Md.jsx` (:207), `SourcesPane.jsx` (:211) and `SourceReader.jsx` also give 96.
   - Already mapped: Animation3DCard 1, `animation3d/*` 1-2, CadCard 5, CadReview **0** (windows-only only), ExplainBackPanel 4, ForkButton 11, SharePanel 13, SharedBoardPage 20.
   - Dead mapping: `WhiteboardVideoCard.jsx` -> whiteboard-mvp-check (:534) is never used, because broad is tested first (affected.mjs:15).
8. **Mapping a file to checks that cannot run in fast-e2e is a silent zero.** cad, explain and tutor checks are windows-only (section 1). A "mapped row naming its own checks" gives 0 Linux checks for cad and explain areas.
   - Ruling: a mapped row must name at least one Linux (fork or harness) check, or the control-plane unit test file that covers it, with a check-map test enforcing it. Otherwise its tier is Preview/Full.
9. **The v2 broad list leaves out entries that are broad today for recorded reasons.** These are not in the owner's list: `packages/cad-execute/**`, the fonts, `uv.lock`, `provider-tripwire.js`/`tripwire-*.js`, the byoc/cli signer files, `lesson-renderer/**`, `math-renderer/**`, the three `docs/courses/nanogpt/*plan.md` files (bundled data), `packages/web/*.html`, `public/*`, `dev-*.js`, `*.css`.
   - Resolution: keep the lockfile, tripwire, fonts, html and bundled-docs entries; move the rest to mapped rows. List each as a reviewed line in the item 2 diff.

### Item 3: package-selective verify
10. **verify cannot select today.**
    - verify.yml:51 runs the whole `run.sh test:unit` (run.sh:119-136), and :58 runs both builds.
    - The evidence has only `unit` and `build` (verify-evidence.mjs:215-219). `checkEvidence` requires both to be `pass` (:153). dev-deploy-gate.mjs:49-53 and verify-reuse.mjs:87-100 consume it.
    - **verify-reuse reuses a note by exact SHA, but a selective plan depends on the branch's baseline** (affected.mjs:87). The same SHA on another branch can need different suites. The reuse check must compare the suites recorded against the suites needed.
11. **"A render-package change runs its own suite": that suite is not in CI.**
    - `packages/learn-render/whiteboard/*.test.mjs` (composition, gate, routes, sandbox.linux) run nowhere. run.sh:130 runs only `learn-render/motion`, and `learn-render` `npm test` is a Remotion render acceptance (scripts/test.mjs).
    - The whiteboard renderer service lives under `docs/features/whiteboard/ops/` (whiteboard-renderer.mjs and its test). That path is class `docs` (0 checks) and is not run by `run.sh`.
    - Lane 25850469e paid a full 8-min verify that ran none of them.
    - Resolution: add the suite to run.sh and to a verify plan row. Ruling: move `docs/features/whiteboard/ops/*.mjs` into a package or a `none` row with a test, out of `docs/**`.

### Item 4: switches as secrets
12. **"Reads it back" is impossible for a secret.** Secret values cannot be read (`wrangler secret list` returns names; docs/operations/evidence/cad-constraint.md:71 shows CAD_MODEL_ENABLED's value is unknown to everyone).
    - `flag.cmd --check` can confirm only the name's presence plus a behavioural probe. Examples: `GET /api/learn/whiteboard/jobs` `{available}` (whiteboard-routes.js:2), the image capability route, `/animation` 404 when off (scripts/animation/post-release-verify-ladder.mjs:58).
    - ANIMATION_EXECUTION_KILL and MOTION_GENERATION_PAUSED have no signed-out probe: unknown until designed.
    - Today's read-backs break when the vars become secrets: release.sh reads the program and image flags through `explain-worker-vars.mjs`, and the post-release ladder and `scripts/animation/recovery-recipes.json` read or patch the vars.
13. **"Absent means off" inverts for the kill and pause switches.** Absent `ANIMATION_EXECUTION_KILL` and `WHITEBOARD_EXECUTION_KILL` mean execution **allowed** (animation-job.js:57, whiteboard-job.js:47). An absent `MOTION_GENERATION_PAUSED` means generation **running**.
    - `MOTION_GENERATION_PAUSED` is read as `'1'`, not `'true'` (generation-proposal.js:68; prod value `"0"`, wrangler.rabbit-hole-prod.jsonc:183; pinned by motion-policy-values.test.js:35 and rabbit-hole-prod-config.test.js:170).
    - Ruling: keep `=== 'true'` for all six. Change MOTION to `'true'` in the same commit, with its tests. `flag.cmd <name> off` for a KILL/PAUSED name means "kill/pause off" (feature running); print that meaning in the launcher.
14. **Not all six are wrangler keys today, and the dev side changes too.**
    - `WHITEBOARD_EXECUTION_KILL` is in no wrangler file; it is read only in code (whiteboard-job.js:47). `ANIMATION_*` are only in prod (wrangler.rabbit-hole-prod.jsonc:89-90). `WHITEBOARD_ENABLED` is in prod (:93) **and dev** (wrangler.dev.jsonc:172). `IMAGE_GENERATE_ENABLED` is in prod (:99), dev (:183) and parallel (:153).
    - Removing WHITEBOARD_ENABLED from wrangler.dev.jsonc turns /whiteboard off on every dev clone, the stable preview included, until a secret is set there.
15. **The W1 whiteboard e2e check cannot prove the server switch.** whiteboard-command-check.mjs fakes `GET /api/learn/whiteboard/jobs` both ways (:38-40), and the CI stack never sets the var (scripts/ci/config/*.jsonc, stack.sh:49).
    - The real proof is the control-plane tests: chat-capability-route.test.js, whiteboard-job.test.js, and rabbit-hole-prod-config.test.js:277-285, which pins `vars.WHITEBOARD_ENABLED` and must be rewritten. Add a production probe of `{available}` before and after.
16. **Migration order risk (unverified).**
    - I expect Cloudflare to refuse a secret whose name is already a plain-text var binding. The likely order is release-without-var, then secret put; between them production has WHITEBOARD, ANIMATION and IMAGE **off**. Test on a clone first.
    - I could not confirm whether `wrangler rollback` restores a version's secrets: the Cloudflare docs search was unreachable. Unknown: it must be measured in the item 6 drill, because a rollback could flip a switch.
    - A `secret put` makes a `triggered_by: secret` deployment. `servedRelease` (prod-release.mjs:146-150) and `servedSha` (dev-deploy.mjs:159-170) already read through it, so a flip does not break forward-only.

### Item 5: three tiers, `--mvp --direct`, background full run
17. **CLAUDE.md forbids the default.** The MVP path is only for work the owner labels MVP, and an agent never decides that (main CLAUDE.md:307-308, :332). OPS-04 requires exact-SHA verify and fast-e2e for every ordinary deploy (:271-273). Tiering by affected.mjs as the default needs the owner's CLAUDE.md change in the same push point as item 5.
18. **`--mvp --direct` cannot pass `mvpVerdict` today.**
    - REQUIRED includes `preview` (mvp-fast-path.mjs:27, :67-72), and the record needs `version` (:73) and a dev-clone target (:77).
    - deploy-prod.yml requires a dev-deploys note to exist at all (:36-37) and selects `--mvp` only on `"mvp":true` (:46).
    - checkRelease requires `prepared.mvp` to name a recovery branch (prod-release.mjs:120).
    - deploy-prod runs no tests: prepare is build + bundle check + dry-run bundles (:263-266).
    - Ruling: a Direct record is written by `mvp-fast-path.mjs` without a deploy and marked `direct:true`, with build and affected-tests required. `mvpVerdict` drops `preview` only for `direct`. Prepare runs the changed package's suites before the build; this is keyless, so it is safe in the no-credential step.
19. **"Confirmations" do not exist in production.** The prod smoke retries until every check passes, at most 120 s (prod-release.mjs:186-193), and has no 5-consecutive loop. The dev path has one (dev-deploy.mjs:333-338) and the MVP clone path uses 2 (mvp-fast-path.mjs:186).
    - The prod smoke is signed-out GET only (:171-184). A "paid refusal" signed-out returns 401 before `paidRefusal` runs, so it would not prove paidRefusal.
20. **The background run after a release has no trigger.**
    - verify and fast-e2e never run on main (verify.yml:8, fast-e2e.yml:9). They ran on the lane/candidate push of the same SHA, but selectively after items 2-3.
    - A full re-run needs a new `workflow_dispatch full=1`. Today verify has no dispatch, and fast-e2e's `readiness=1` runs every check 3 times (45-min limit).
    - The gate is dispatch-only on the harness branch, and its preflight needs green verify and fast-e2e first (dispatch-preflight.mjs NEEDED).
    - Nothing posts to the owner. An agent watcher must do it, using the receipt fields `previous.cp`/`previous.app` (real example, d3bfea9be: cp f5ebfd5c-38d0-40cc-959d-81e2c3424077, app 2aace55e-a011-4e03-9ff4-3c137f17eab3, release 71162c729b71).
21. **The tier lists conflict with the code.**
    - "pricing" matches only `pricing-registry.js`; "index.js" is ambiguous; "share tokens" names no file (tokens live in canvases.js, learn-boards.js, token.js).
    - "approved copy" has no machine marker, and docs are not all docs: the whiteboard renderer lives under docs/ (item 11 above), and three nanogpt plan .md files are bundled.
    - "a feature's own files when it has a kill switch and no money path of its own": whiteboard, animation, motion, image and cad all have money paths (escrow and reservations: animation-escrow.test.js, `IMAGE_GENERATE_RESERVED_USD`). So Direct is in practice docs, prompts and fixtures only.
    - The tier must be computed offline in prepare, which makes no network call (prod-release.mjs:4). affected.mjs's CLI calls `gh` for its baseline (:87). Ruling: tier = classify(changed paths from production's served release sha12, read in release, or `github.event.before` in prepare). Print it in the receipt (:310-311).
    - "Every full-gate path is also broad": v2 item 2 now lists learn-usage* and shared-privacy, so the two lists agree. `pricing`, `share tokens` and `*.sql` must be added to broad explicitly.

### Item 6: rollback drill
22. **A hand rollback without a message blocks the next release.** prod-release.md:182's manual command has no `--message`. The next release reads `release <sha12>` from the deployment message (prod-release.mjs:147), so a rollback without it gets the refusal "a version no release named" (:161).
    - The code's own rollback includes it: `npx wrangler rollback <id> --config wrangler.rabbit-hole-prod.jsonc --message "rollback to release <prev sha12>: <why>" --yes`, from packages/web (app) first, then packages/control-plane (cp) (prod-release.mjs:322-327).
    - The drill must use exactly that, and the receipt keeps the two `previous` ids. The rollback time is unmeasured.

### Item 7: stable preview without the gate; background verdict
23. **Today every step of the dev deploy requires the gate first.**
    - deploy-dev.yml waits 10 min for a gate note and stops without one (:30-37), waits 30 min for a verify note (:41-45) and 30 min for runs (:51).
    - dev-deploy-gate.mjs refuses without verify evidence, green runs and a gate note (:49-60). dev-deploy.mjs requires `--gate` plus `gateVerdict` (:403-411), and the record writes `gates:'pass'` only after that (:493).
    - fast-e2e does not run on dev pushes (fast-e2e.yml:9); verify does (verify.yml:8), and reuses the note.
24. **The gate and the suites cannot run "against" the preview.** They run on local keyless stacks (fork checks on 127.0.0.1 with local D1 and the tripwire app log, run-part.sh:115-116, int35.sh). Pointing them at the deployed clone would drop the provider tripwire and write to the shared dev D1.
    - Resolution: on a dev push, deploy + 5 confirmations + smoke (about 2 min measured), then dispatch the existing gate on that SHA in the background. Write the verdict to `refs/notes/gates` (as rel-after-gate.sh does). prepare accepts a dev record `gates:'pending', smoke:'pass'` plus a gates note that passes `gateVerdict` for that tree, plus green runs. deploy-prod.yml must then fetch `refs/notes/gates`; it fetches only dev-deploys today (:35).

### Item 8: stable preview and warm clones as `--mvp` targets
25. **The refusal is in code and test.** mvp-fast-path.mjs:31, :146; test mvp-fast-path.test.mjs:194-202; doc mvp-fast-path.md:32. `mvpVerdict`'s CLONE regex (:30, :77) already accepts small-parallel, -a and -b.
26. **The MVP deploy is unsafe for the stable preview as written.**
    - (a) It deploys the default entry `dev-worker.js` (wrangler.dev.jsonc:8) instead of `dev-access-worker.js`, so the Access bridge is lost, and passes no `--domain preview.digrabbithole.com` (mvp-fast-path.mjs:241 vs dev-deploy.mjs:485).
    - (b) Its message `mvp <sha> build` has no `main <sha>`. `servedSha` then returns null (dev-deploy.mjs:143), and the **next deploy-dev refuses** ("serves a version whose main commit is unknown", :246).
    - (c) `serves()` polls `https://<worker>.tryrabbithole.workers.dev/library` (:184, :244). For the stable preview that host is refused with 403.
    - (d) There is no shared lock or forward-only check with deploy-dev: lock :450 is a local tmpdir; the workflow concurrency group is `dev-preview`.
    - (e) Its build env lacks `VITE_BYOC_DEV` and `VITE_NOTEBOOK_ORIGIN` (mvp-fast-path.mjs:222 vs dev-deploy.mjs:469), so it is not the stable preview's build.
    - (f) A lane SHA is not on dev. After it, a dev push that does not descend from it is refused (:248).
    - Resolution: for the stable preview, `--mvp` calls dev-deploy.mjs's own build, deploy, smoke and record path with a record `gates:'bypassed', mvp:true`, under the same forward-only and lock rules. Ruling: it requires the lane SHA to be pushed to `dev` first, i.e. the Preview tier is "push to dev" (item 7). Why: one deploy path for one Worker. Cost if wrong: a stuck preview that needs a hand redeploy.
27. **Warm clones a/b have no Access.** The Access app covers only preview.digrabbithole.com, and dev-access.js:52 refuses other hosts. So "the Access login he already has" applies only to the stable preview; on a/b sign-in is via cp-dev `/test/session`, which needs the bypass secret. "Every provider secret" on a/b means real spend from dev clones, which needs its own approval. `previewArgs` defaults the target to the worktree name (:145, :265), so `--worker` must be passed explicitly.

### Items 9-10: documentation and lane rule
28. **The lane rule needs main's CLAUDE.md rewritten,** not only appended: the MVP-only lines (:305-332) and OPS-04 (:271-273) are still there.
    - Lane pushes do not block anything mechanically. They still trigger verify (about 5.5 min, 7 rm) and fast-e2e (about 15.5 min, about 90 rm) on every push, with cancel-in-progress (verify.yml:13-15, fast-e2e.yml:19-21).
    - "Informational" CI costs about 95 rm per broad lane push. Ruling: keep it, because items 2-3 cut it to the touched area. Disabling it on lanes is the owner's choice.
29. **The owner's launchers encode today's order.** `release.sh` needs the gate, verify and fast-e2e on the SHA and pushes dev, then main. `release-mvp.sh` never touches dev. The new Preview tier (push to dev) and Direct tier need new or changed owner launchers outside the repo.

### Workflow constraint
30. The harness is on `fix/ctrlk-gate-selection`, not main, so item 1's skip lands there. Every workflow-file change (verify, fast-e2e, deploy-dev, deploy-prod, gate-sharded) needs the owner's `!` push (CLAUDE.md:269-270), and is itself broad and full-chain.

## 5. Where the money, sign-in, secret, migration and bundle checks run today

| Check | Runs in |
|---|---|
| paidRefusal (learn-paid.js) | control-plane unit tests (learn-artifact, learn-spend-boundary, openai-key-install-effects) inside `run.sh test:unit`: verify and gate `units`. MVP: only if the one-hop affected tests reach it. **In no smoke (dev or prod)** |
| Escrow tests (animation-escrow, animation-recovery, animation3d/client) | verify, gate `units`; MVP only if affected |
| Auth tests (auth-fail-closed, dev-access, embed-session) | verify, gate `units`; plus smokes: dev (Access, barrier 403s, signed-in 200, dev-deploy.mjs:340-376), prod (`/login` 302, `/api/me` 401, prod-release.mjs:180-182) |
| Secret-name preflight | `prod-release.mjs release` (:294-298), every prod release including MVP |
| Schema/migration preflight | `prod-release.mjs release` (:299-306), every prod release; dev smoke reports schema "blocked" (:360-376) |
| Production-bundle check | `prepare` (:265), every prod release; gate `bundle(dist)`/`(dist-dev)` |
| Smoke | dev: dev-deploy.mjs:325-378; MVP clone: `serves()` + the caller's `--smoke`; prod: :171-193 + matched rollback :322-341 |

## 6. Recommended order and risks

Order:
- **Item 2 first** (map rows + unmapped fails): the biggest lever. 96 -> a few checks per one-file push, so a lane fast-e2e drops from about 15.5 min / 90 rm to minutes.
- Then **item 3** (verify plan + suites recorded), then **item 1** (per-check attestation from the fast-e2e artifact; gate skip in the harness).
- Then **item 7** (dev push without the gate, background gate verdict note) and **item 8** (stable preview via dev-deploy.mjs's path).
- Then **item 6** (drill, which also measures whether rollback reverts secrets), then **item 4** (switches; tested first on a clone for the var/secret conflict), then **item 5** (tiers, Direct, background run) once 6 is measured.
- Items 9-10 go with 5 and 7.

Risks:
- Items 1+2+3 compound into silent coverage loss unless attestation is per-check on the exact SHA.
- 132 windows-only checks already run nowhere.
- The switch migration can briefly disable W1, Animation and Image in production, and a rollback may or may not restore secrets (unknown).
- The stable-preview MVP deploy as written would wedge deploy-dev.
- Every workflow change rides the full chain plus an owner `!` push.
- Nothing in this report is an "after" number.

Not checked: Cloudflare state (clone list, secrets present on the stable preview, the var/secret conflict, rollback secret behaviour), billing multipliers, and the gate's per-stage times (only part totals).
