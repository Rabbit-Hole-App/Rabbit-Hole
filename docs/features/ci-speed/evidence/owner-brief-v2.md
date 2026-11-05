Owner brief for the CI and release speed lane, VERSION 2 (5 November 2026, replaces the earlier version; the old one is OWNER-BRIEF.v1.md). Verbatim from the owner:

Parallel - W1 is live; W2 does not start. Before it, one lane: CI and release speed. Today every change costs 35-60 minutes and most of it is the same tests run twice. Target, for every feature in the repo: a lane push waits on nothing, a release is about 5 minutes when I do not need to look first and about 5-6 when I do, a flag flip is one minute, a rollback is two. Everything else runs after the release in the background.

Read first, all of it, before changing anything: .github/workflows/{verify,fast-e2e,deploy-dev,deploy-prod}.yml; scripts/ci/{check-map.json,affected.mjs,run-part.sh}; scripts/{dev-deploy.mjs,dev-deploy-gate.mjs,prod-release.mjs,mvp-fast-path.mjs,verify-reuse.mjs,verify-evidence.mjs}; docs/features/{mvp-fast-path,prod-release}.md; the repo CLAUDE.md release rules. One worktree, branch feat/ci-speed, released through the fast path with a recovery branch. Two candidates per failure family; parked after that; no durations.

P0 - measure before touching anything. From `gh run list --limit 40` and `gh run view --json jobs`, a table for W0 and W1 (71162c729, a82e6f414, d3bfea9be, and three lane pushes): verify duration; each fast-e2e shard's install, build and check times and its check count; the gate duration and what it ran; prepare + release duration. These are the "before" numbers; nothing below counts as faster without an "after" number from a real run on this branch.

Then, in this order, one push point each:

1. The gate runs nothing already green. When verify and fast-e2e passed on the exact SHA, dev-deploy.mjs runs the deploy, the five confirmations and the smoke stages only (sign-in, canvas load, one paid refusal, share-revocation). Its 45 e2e stages and `make test-unit` run only when no green verify/fast-e2e exists for that SHA. The attestation line records which path was taken; prod-release.mjs accepts both. Tests for both paths and for the refusal on a red run or a different SHA.

2. The broad list shrinks to what is truly broad: packages/control-plane/src/{index,auth*,dev-access*,dev-forwarding,learn-spend*,learn-paid*,learn-usage*,learn-board*,learn-boards,shared-privacy}.js, migrations and *.sql, **/wrangler*.jsonc, lockfiles and package.json files, .github/**, scripts/ci/**, app-worker.js, dev-worker.js, vite.config.js, ensure-natives/lock-natives. Every other control-plane and web source file gets a mapped row in check-map.json naming its own checks (whiteboard, animation, cad, motion, explain, chat and proposals, files and sources, markdown cards, share and fork, each to theirs). An unmapped file still fails the plan step. Report the check count before and after for a one-file change in each area.

3. verify runs only the changed packages' suites, from the same changed-path plan fast-e2e uses: a control-plane change runs the control-plane suite; a web change the web suite and one build (dist-dev; fast-e2e builds both already); a render-package change its own. Lockfile, package.json, .github or scripts/ci changes still run everything. The evidence note records which suites ran.

4. Feature switches leave wrangler*.jsonc. WHITEBOARD_ENABLED, WHITEBOARD_EXECUTION_KILL, ANIMATION_ENABLED, ANIMATION_EXECUTION_KILL, MOTION_GENERATION_PAUSED, IMAGE_GENERATE_ENABLED become secrets read the way CAD_MODEL_ENABLED is ("absent means off", or the string "true"), with one owner launcher `flag.cmd <name> on|off --check` that flips exactly one by name and reads it back. Rule in docs/features/prod-release.md: a switch is never a release. Migrate the six in one commit, wrangler keys removed, tests updated; the W1 whiteboard route behaves identically before and after (its e2e check proves it).

5. The fast path is the default release, in three tiers decided by affected.mjs from the changed paths and printed in the receipt:
   - Direct (docs, prompts, fixtures, approved copy, a feature's own files when it has a kill switch and no money path of its own) -> `--mvp --direct`: build + the changed packages' tests + prod deploy + confirmations + smoke; no preview.
   - Preview (anything I want to try first; new UI paths) -> `--mvp` to the stable preview, then release after my yes.
   - Full gate (learn-spend*, learn-paid*, learn-usage*, pricing, auth*, dev-access*, share tokens, learn-boards.js, shared-privacy.js, migrations, *.sql, wrangler*.jsonc, lockfiles, index.js, app-worker/dev-worker, .github, scripts/ci) -> the full chain minus the duplicate runs. A commit touching any full-gate path takes the full gate whatever else it touches. The tier list lives in check-map.json next to broad, with a test that every full-gate path is also broad.
   After any release, the full verify + fast-e2e + gate run in the background on that SHA; on red, post me the rollback command with the previous version id from the receipt - never roll back on your own.

6. Rollback drill before 5 becomes default: on a clone, release a known-good SHA, then a deliberately broken one, then `wrangler rollback` to the previous version id; time it; the exact command and the time go in the receipt. Then once on production with a no-op commit, during a minute I pick.

7. The stable preview deploys without the gate. A push to dev is build + deploy + confirmations + smoke; the gate's stages and the full suites run against it afterwards in the background and record their verdict on the SHA, which a later main release reads instead of re-running (item 1). I can look at the preview while the checks still run.

8. `--mvp` accepts the stable preview (rabbit-hole-web-dev-small-parallel) as a target when I ask, and two warm clones rabbit-hole-web-dev-a and -b, created once with every provider secret and the renderer token installed by one launcher run of mine, assigned by you (the integrator) per candidate, never deleted. A throwaway rabbit-hole-web-dev-<worktree> is created only when a lane needs isolation and is deleted in that lane's closeout. List the clones that exist today and delete the ones no lane owns. (The integrator, Parallel, does the list and the deletes; the lane designs the warm-clone launcher and the --mvp acceptance. Clone list as of 5 Nov: rabbit-hole-web-dev-{add-context, animation, animation-examples, animation-feasibility, cad-integration, creator-analytics, ctrlk-tools, explain-back, explain-sandbox-card, explore-top, pdf-excerpts, signup-prefs, small-parallel, ui-release, usage-analytics, wb-integrate, wb-preview}; deleting the nine with no worktree is in progress.)

9. Where a change goes, written in docs/features/prod-release.md: lane -> candidate -> production (Direct) or the stable preview then production (Preview, Full gate). The clones are for real paid runs before a candidate (a gate run, a provider smoke) or a second candidate in flight - never a stage every change passes through.

10. Lane rule in the repo's CLAUDE.md: a lane runs the touched files' tests locally at each push point and pushes without waiting for CI; the full suites run once, on the candidate, before a release. CI on a lane branch is informational.

11. After-numbers: on this branch, time a one-file control-plane push, a one-file web push, a `--mvp --direct` release to a clone, a push to the stable preview, and a flag flip. Hand back the before/after table from real runs. A step without an after-number is not done.

Rules for this lane:
- Nothing that checks money, sign-in, secrets, migrations or the production bundle is weakened: paidRefusal, the escrow tests, the auth tests, the schema and secret preflights, the production-bundle check and the smoke stay on every release path. List them in the hand-back with where each still runs.
- A change to a workflow file is itself broad; this lane's own pushes go through today's full chain. Expect it.
- One push point per item; at each, the diff, the tests run, the measured minutes. The owner verifies every push against the files named here before the lane goes on.
- Two candidates per family; park the third. No change to what a learner sees.

First message back: the P0 table, the ledger entry, the clone list, and any place where what the owner has written does not match what the code allows.
