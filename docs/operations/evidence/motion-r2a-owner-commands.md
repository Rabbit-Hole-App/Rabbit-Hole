# Motion activation, re-sequenced (owner decision 2026-10-26): owner commands

Script: `C:/s/spec/motion-validation/motion-deploy.sh` (updated; the previous one is `motion-deploy.pre-r2a.sh`). Every command below runs in Git Bash from any directory. Browser = the owner's own browser (Claude runs none). Dry run = add `--dry-run` as the LAST word; it changes nothing and writes no state (proven in an offline stub harness, see handback.md).

Order the owner fixed: ceiling -> refund -> 16:9 owner-only job -> R2a (owner-only measured policy, STILL paused) -> 9:16 owner-only job -> R2b (public flip). Public activation additionally needs both jobs passed AND the corrected credit disclosure on main.

## Branch chain and the values the commands need (integrator, 2026-10-26)

| Step | Branch | SHA | MOTION_BASE (its parent) |
|---|---|---|---|
| ceiling (`post`) | stack/c18-motion-ceiling | 0b5a8daedeb652cd03bda36f329712ef29164dab | 0bd390ed76e46149d964231504cc6c2a2d6b615d (main today) |
| batch B1 | stack/c25-batch-b1 | d0e8b2b02 (integrator releases it) | |
| telemetry binding | stack/c26-telemetry-b1 | 8244c327a6d6843db4faa3223c4cc862c093bf05 | |
| R2a | stack/c22-motion-r2a | ac0892bf3f4fec8de6b4f275855f2ee2dbfdf254 | 8244c327a6d6843db4faa3223c4cc862c093bf05 |
| batch B2 (credit disclosure, integrator creates) | (integrator) | `<B2 sha>` | R2a ac0892bf3f4fec8de6b4f275855f2ee2dbfdf254 |
| R2b (pause flip only, ceiling stays) | stack/c23-motion-r2b | draft b147e9c1f8e18a93b1d243c819dca90ca310532a on R2a; the real one is the integrator's cherry-pick of it onto B2 | `<B2 sha>` |

MOTION_BASE must equal main's tip at the moment you run the release (the Worker release is a fast-forward of main; the script refuses a candidate that is not exactly one commit on MOTION_BASE, and refuses if MOTION_BASE is not yet on main). If main moved (another release landed) the integrator re-cuts R2a/R2b and gives the new three values; nothing else changes. MOTION_GATE_RUN = the integrator's gate run id for that exact SHA (the integrator runs the gates).

## Steps

### 1. post: release the ceiling and redeploy the orchestrator only (DONE: recorded `post:worker-released`, `post:rel=0b5a8dae`, `post:orchestrator-deployed`, `post:orchestrator-verified` in motion-deploy-state.txt at 12:10 PM PT; shown for completeness, do not run again)
```
MOTION_BASE=0bd390ed76e46149d964231504cc6c2a2d6b615d MOTION_BRANCH=stack/c18-motion-ceiling MOTION_REL=0b5a8daedeb652cd03bda36f329712ef29164dab MOTION_JOB_CEILING_USD_APPROVED=3.50 MOTION_WORKER_RELEASE=yes MOTION_GATE_RUN=40372495316 bash /c/s/spec/motion-validation/motion-deploy.sh post
```
Effect: main fast-forwards to the config-only ceiling commit, Worker release, waits for no job in flight, redeploys ONLY the orchestrator with `MOTION_JOB_CEILING_USD=3.50`, verifies without a paid call. Public stays paused. Expected: `POST-FIX INFRASTRUCTURE DONE`, probes `200 200 401 401 405`. 10 to 20 min. Browser: no.
Rollback: `MOTION_ROLLBACK_CONFIRM=yes bash /c/s/spec/motion-validation/motion-deploy.sh rollback-orchestrator` (orchestrator back to the recorded image, ceiling 2.00 returns, so start no job after it). The Worker part is configuration-only and needs no rollback.

### 2. refund of failed job 61f70171 (YOU RUN)
Dry run first (read-only):
```
MOTION_BASE=0bd390ed76e46149d964231504cc6c2a2d6b615d MOTION_BRANCH=stack/c18-motion-ceiling MOTION_REL=0b5a8daedeb652cd03bda36f329712ef29164dab MOTION_JOB_CEILING_USD_APPROVED=3.50 bash /c/s/spec/motion-validation/motion-deploy.sh refund
```
Expected: prints `DRY RUN: nothing was written`, charged 127.8157 credits, would refund 127.8157, then the apply command. Apply: the same with `MOTION_REFUND_CONFIRM=yes` added. Expected `refund applied and verified`. Idempotent, one audit row. Browser: no.
Rollback: none by script (the refund is an audit-row credit; reversing it would be a manual D1 adjustment and your decision).

### 3. 16:9 owner-only acceptance job, 15 s (YOU RUN, BROWSER)
```
MOTION_BASE=0bd390ed76e46149d964231504cc6c2a2d6b615d MOTION_BRANCH=stack/c18-motion-ceiling MOTION_REL=0b5a8daedeb652cd03bda36f329712ef29164dab MOTION_JOB_CEILING_USD_APPROVED=3.50 bash /c/s/spec/motion-validation/motion-deploy.sh accept2
```
prints the instructions: Google sign-in as yudhisteer.chin@gmail.com, `/motion 15s explain photosynthesis`, 16:9, Generate ONCE. Spend about US$0.7 to 1.3 (70 to 130 credits), up to 350 credits, hard stop at 3.50. About 10 to 15 min. Then the same command with `MOTION_ACCEPT2_DONE=yes` added: reads the accounting row (read-only) and records `post:accept2` plus the job's action id. Expected `ACCEPTED: job act-... settled ...`.
Rollback: none (money spent); Stop on the card cancels a running job.

### 4. R2a: owner-only measured policy (YOU RUN, after the integrator released B1 and the telemetry binding and gave the R2a gate run id)
Dry run first (read-only; builds nothing remote):
```
MOTION_BASE=8244c327a6d6843db4faa3223c4cc862c093bf05 MOTION_BRANCH=stack/c22-motion-r2a MOTION_REL=ac0892bf3f4fec8de6b4f275855f2ee2dbfdf254 MOTION_JOB_CEILING_USD_APPROVED=3.50 bash /c/s/spec/motion-validation/motion-deploy.sh activate-owner --dry-run
```
Then for real:
```
MOTION_BASE=8244c327a6d6843db4faa3223c4cc862c093bf05 MOTION_BRANCH=stack/c22-motion-r2a MOTION_REL=ac0892bf3f4fec8de6b4f275855f2ee2dbfdf254 MOTION_JOB_CEILING_USD_APPROVED=3.50 MOTION_WORKER_RELEASE=yes MOTION_GATE_RUN=<R2a gate run id> bash /c/s/spec/motion-validation/motion-deploy.sh activate-owner
```
Refuses unless: post, refund and accept2 (16:9) are recorded with evidence; MOTION_BASE is on main and R2a is exactly one commit on it touching config, doc and test files only; the renderer/orchestrator code is unchanged since the released ceiling candidate. Effect: (1) orchestrator redeploy with `MOTION_RENDERER_CONFIG=03f2a1efc08e-1.5cpu-3gib-420s` (ceiling stays 3.50), idle-checked, (2) non-paid verification (machine env, health, startup log line, renderer untouched), (3) Worker release: measured policy ON, `MOTION_GENERATION_PAUSED` STILL "1", owner list unchanged. Expected: `R2a DONE up to the recorded steps`, probes `200 200 401 401 405`. About 15 to 25 min. Browser: no. Public users still cannot start anything. Note: a card made before this release is refused as stale; make a new one.
Rollback (Worker first, then orchestrator; paused stays "1" so this is not urgent): from `packages/web`: `npx wrangler rollback <app version before the R2a release, from the release receipt's previous pair> --config wrangler.rabbit-hole-prod.jsonc` (docs/features/prod-release.md "Manual rollback"; UNVERIFIED that it restores vars), then `MOTION_ROLLBACK_CONFIRM=yes bash /c/s/spec/motion-validation/motion-deploy.sh rollback-orchestrator`.

### 5. 9:16 owner-only acceptance job, 15 s (YOU RUN, BROWSER)
```
MOTION_BASE=8244c327a6d6843db4faa3223c4cc862c093bf05 MOTION_BRANCH=stack/c22-motion-r2a MOTION_REL=ac0892bf3f4fec8de6b4f275855f2ee2dbfdf254 MOTION_JOB_CEILING_USD_APPROVED=3.50 bash /c/s/spec/motion-validation/motion-deploy.sh accept916
```
prints the instructions: NEW card, same brief, aspect ratio 9:16, 15 s, Generate ONCE; expected up to 350 credits (typical 70 to 130), plays at 1080x1920; 20 s and 45/60 s show the not-ready line. Then the same command with `MOTION_ACCEPT916_DONE=yes` added: reads the accounting row (read-only, started after the R2a release, not the 16:9 job) and records `ro:accept916`. The row cannot show the ratio: `MOTION_ACCEPT916_DONE=yes` is your statement that it was 9:16.
Rollback: none (money spent); Stop on the card.

### 6. R2b: public activation (YOU RUN, only when steps 1 to 5 are recorded AND the credit disclosure is on main)
Dry run first (it prints every refusal that would apply; read-only):
```
MOTION_BASE=<B2 sha> MOTION_BRANCH=stack/c23-motion-r2b MOTION_REL=<R2b sha on B2> MOTION_JOB_CEILING_USD_APPROVED=3.50 bash /c/s/spec/motion-validation/motion-deploy.sh activate-public --dry-run
```
Real run: the same with `MOTION_WORKER_RELEASE=yes MOTION_GATE_RUN=<R2b gate run id>` and WITHOUT `--dry-run`. It refuses unless (a) post, refund, accept2 and R2a are recorded, (b) the 16:9 and 9:16 jobs are recorded as two different accepted jobs with settled accounting rows, (c) the disclosure markers (MOTION_MAX_CHARGE_USD in the Worker config, `max_credits` in motion-settings.js, motion-credit-disclosure.test.js) are on main and in the R2b tree and the disclosed maximum covers the per-job ceiling, then (d) it asks you to TYPE `ACTIVATE PUBLIC MOTION` at the terminal. Effect: R2b is the pause flip only: the orchestrator already holds the public configuration (ceiling 3.50 stays), so the script checks it and does NOT redeploy it; Worker release with `MOTION_GENERATION_PAUSED` "0". Expected: `R2b DONE up to the recorded steps`, probes `200 200 401 401 405`. About 15 to 25 min.
Browser (REQUIRED, "deployed but unverified is incomplete"): sign in as an account NOT on the owner list; `/motion` is offered; the card shows the estimate, the maximum possible charge and the temporary reservation in credits; Generate is accepted.
Rollback, fastest first: (1) stop new starts: from `packages/web` `npx wrangler rollback <app version before the R2b release> --config wrangler.rabbit-hole-prod.jsonc` (about 1 minute; jobs already running still settle); or fix forward with a config commit setting `MOTION_GENERATION_PAUSED` "1" and a normal release. (2) the orchestrator is unchanged by R2b, so nothing else to undo.

## status (read-only, any directory)
`bash /c/s/spec/motion-validation/motion-deploy.sh status` prints every step DONE or PENDING and the next command.
