# /animation Gate 2: full-pipeline SGD qualification (AN-21)

Plan section 8 (AN-21, "Gate 2 phrasings", "Gates and budget") and section 13.2 and 13.5. Owner decisions 11 to 17 and 20 (3 November 2026),
the owner's re-scoping of 3 November about 5 PM PT (several test sessions, five jobs at a time), and decision 22 (the candidate identity check).
This file says how to run Gate 2. It is an operator guide; dollar figures appear here and in the spend ledger only.

Gate 2 is **paid**: ten real jobs on the dev clone's model key. Parallel announces the batch size and cost before running it and then proceeds.
Nothing in this lane's code has been run against the real dev server.

## What Gate 2 is

Ten requests, one job each, on the frozen candidate's dev preview, through the whole product path a learner uses: plan, Generate, author, review,
repairs, accepted or not. **No retry beyond the product's own automatic one**: the script never calls the retry, refine or revise routes.

| # | Phrasing (exactly) |
|---|---|
| 1 | stochastic gradient descent |
| 2 | SGD on a bowl-shaped loss |
| 3 | gradient descent with two learning rates |
| 4 | show me why a high learning rate diverges |
| 5 | a ball rolling down a loss surface, step by step |
| 6 | minimize a quadratic loss with gradient steps |
| 7 | compare learning rate 0.1 and 1.5 on the same surface |
| 8 | gradient descent that overshoots the minimum |
| 9 | SGD with a kept path to compare runs |
| 10 | the 2 sigma problem of optimizers (the wrong-subject control) |

### The pass rule (coded in `verdictOf`, `scripts/animation/sgd-qualify.mjs`)

**PASS** = at least 8 of jobs 1 to 9 are accepted **and** job 10 did not silently become SGD.

- **Accepted**: the job ends `ready` with stop reason `accepted` (the product's own review accepted it; a repaired job counts).
- **Not accepted** (counts as lost): `rejected` (rounds, no_progress, unsupported_repair), `gap` (the planner reported a capability gap),
  `clarify` (the planner asked a question), `failed` (any other stop, including a provider failure), `cost-stop` (the spend guard cancelled the job),
  `timeout` (no end within `--job-timeout-min`), or a script error. Job 1 to 9 getting a gap or a question is a failure: the learner asked for SGD.
- **FAIL as soon as two of the first nine are lost** (8 of 9 can no longer be reached). By default no further job is started then (running jobs
  finish; `--run-all` keeps starting them).
- **INCOMPLETE**: fewer than nine of the first nine have a result, or the control has none. Nothing is decided; the usual reasons are a stop, the cap
  or the allowances. A job cancelled by the operator, the cap or a stop file (`stopped`) is not a result, and a rerun for the same candidate runs that
  phrasing again.
- **The control** (job 10) *silently became SGD* when the planned or the accepted scene carries any SGD marker. Deterministic check
  (`sgdMarkers`): the plan's whole JSON, and the accepted artifact's title, description and archetype, matched case-insensitively against
  `sgd`, `gradient`, `loss surface` or `loss landscape`, `loss function` or `loss curve`, `learning rate`, `descent`, and the archetype `loss_surface`.
  The request's own words ("optimizers", "sigma") are not markers. A planner that **reports a gap** or **asks a question** passes without further
  check. A planner that plans something sensible and not SGD passes; the job then runs the whole pipeline (its authoring is cheap and the accepted
  scene is checked too) and a rejected non-SGD scene still passes the control. A plan with markers is **not approved** (nothing is authored) and the
  job is cancelled. A false positive (a plan that says "gradient" about a colour) fails the control; the exported plan shows the matched markers and
  the owner can read it. Markers are a floor, not a judgement of quality.

## Candidate: MVP4's frozen candidate; MVP4 and MVP5 release as one

Gate 2 runs on **MVP4's frozen candidate** (owner, 3 November about 5 PM): MVP3's release plus the AN-20 branch. The rules of section 8 stand: the
candidate is frozen before Gate 1 and before Gate 2, and a change to `contract.js`, `scene.js`, the prompts or the capture text restarts the gate it
was in.

**Single-release collapse.** If Gate 2 passes **the same day** as Gate 1 on the same candidate, MVP4 (AN-20) and MVP5 (AN-21) are released as one
release instead of two:

- The release candidate is the Gate 1 and Gate 2 tested candidate **plus only** MVP5's product slice (remove the "not yet supported" copy, add the
  loss-surface line to the claimed capabilities, let Explore Top go out), which is copy and claim-list work and does not touch the files the
  identity check hashes. If it touches `contract.js`, `scene.js`, the prompts, the capture text or the golden artifact, it is not a collapse: Gate 1
  and Gate 2 restart.
- The receipt names both SHAs: the tested candidate X (Gate 1 and Gate 2) and the release SHA R, and lists the files changed between X and R. Evidence
  for R follows the repository's existing reuse rules (`CLAUDE.md`, "Full-gate reuse for eligible UI and copy changes": eligibility is decided by
  `notReusableBetween` in `scripts/dev-deploy.mjs`; do not restate it here). Exact-SHA `verify` and `fast-e2e` still run on R.
- One production activation and one verification: the owner's `!` command to `main`, then one real SGD request as the signed-in user (`post-release-verify.mjs`).
- If Gate 2 does not pass the same day, MVP4 releases on its own as the plan says (prompt-only, fast path when it exists) and MVP5 follows later.
  A Gate 2 FAIL never releases the SGD claim.

## The candidate identity check (decision 22)

Before any session is read or any job created, `sgd-qualify.mjs` **refuses (exit 4, nothing spent)** unless all of these hold. Any *difference* prints
`GATE 1 MUST RERUN ON THE REAL CANDIDATE`. A missing or malformed input is a usage error (exit 2) and prints no such sentence.

| Check | Source | Difference means |
|---|---|---|
| `--candidate-worktree` HEAD is `PREVIEW_SHA` | `git rev-parse HEAD` | the checkout under test is not the candidate the preview was told about |
| The worktree has no uncommitted change to a tracked file | `git status --porcelain --untracked-files=no` | not the committed candidate |
| `--mvp3-sha` is a commit and an ancestor of HEAD | `git merge-base --is-ancestor` | the candidate is not MVP3 plus the AN-20 branch |
| The prompt-files hash equals `--prompts-hash` | the candidate's own `scripts/animation/author-sample.mjs verify-candidate` | the prompts are not the ones Gate 1 measured |
| The golden-artifact hash equals `--golden-hash` | the same command | the golden artifact is not the one Gate 1 measured |
| The latest deployment of the preview Worker is `PREVIEW_VERSION` at 100% | `wrangler deployments list` (read-only) | another build is live |
| That version's tag, message or annotation **names the candidate SHA** | `wrangler versions view` (read-only) | Cloudflare does not say which commit the preview serves; an untagged version is refused (the older "stated by the integrator" allowance is gone) |
| `ANIMATION_ENABLED` and `ANIMATION_DIAGNOSTICS` are `true` on the version | `wrangler versions view` | the spend guard reads the job diagnostics; without them it cannot run (refusal, not a difference) |

The two hash values are the ones recorded in the Gate 1 table. **Interface with lane (d)** (`scripts/animation/author-sample.mjs`, not on `main`
when this was written; the call is isolated in `candidateHashes` in `sgd-qualify-gate.mjs`): the runner executes, in the candidate worktree,

    node scripts/animation/author-sample.mjs verify-candidate --worktree <dir> --mvp3-sha <sha>

and expects stdout to be one JSON object `{ "head": "<40 hex>", "promptsHash": "<hex>", "goldenHash": "<hex>" }` with exit 0. Anything else is an
unusable answer and refuses (fail closed). If the real command line or output keys differ, change `candidateHashes` and its test, nothing else.
The Worker name is the first label of `--base` (`rabbit-hole-web-dev-<name>.tryrabbithole.workers.dev` gives `rabbit-hole-web-dev-<name>`) unless
`--worker` says otherwise; wrangler runs in `<worktree>/packages/web` with `--config wrangler.dev.jsonc`, `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` read by name from the credentials file and handed to that child process only.

An optional `--verify-script <path>` additionally runs an existing preview verifier as `node <path> <version> <sha>` (for example
`C:/s/spec/animation/sgd-mvp1-acceptance/scripts/verify-preview.mjs`, which also checks the deployed sampler and the served client; it drives a
browser, so the owner or Parallel runs it, and its round-4 client markers may need updating for this candidate). A non-zero exit refuses.

## Test sessions and allowances

Gate 2 runs up to five jobs at once, each on its own canvas, round-robin over up to five **dev test sessions** so every job has its own user's
allowance. Sessions are minted through the dev control plane's test bypass (`rabbit-hole-cp-dev` `/test/session`, secret `RABBIT_HOLE_DEV_TEST_BYPASS`
read by name from `C:/Users/cyudhist/Desktop/workspace/small-deploy/.env`, never printed; production has no such route).

    node scripts/animation/dev-test-session.mjs --check --count 5
    node scripts/animation/dev-test-session.mjs --mint --count 5
    node scripts/animation/dev-test-session.mjs --allowance --base https://rabbit-hole-web-dev-<name>.tryrabbithole.workers.dev

- Identities are dev test people at the reserved example.com domain: `gate2-1@example.com` to `gate2-5@example.com` (`--prefix` changes `gate2`).
  They are not real people and are not used anywhere else.
- `--mint` writes **dev D1 user rows** (and test handles) in the D1 that every clone shares: announce it first, as for any dev write.
- The sessions file is `C:/s/spec/animation/sgd-mvp1-acceptance/gate2-sessions.json` (`{ cookie, devCp, mintedAt, sessions: [{ email, value }] }`),
  written owner-only (the script refuses a path inside the repository). The screen shows the cookie name `small_session` and `<redacted>`, never a value.
  It refuses to overwrite an existing file without `--replace`, and writes nothing if any one mint fails.
- `--check` makes no network request and writes nothing: it validates the credentials key name (not its value), the file path and write access.
- **Per-user allowance on dev.** `GET /api/learn/usage` is the signed-in user's own month. The allowance is `AI_MONTHLY_ALLOWANCE_USD` 25, which is
  2,500 credits at 100 credits to the dollar (`wrangler.dev.jsonc`). `AI_LEGACY_ALLOWANCE_USD` 50 (5,000 credits) is kept only for an account **with
  recorded usage** in a month **before** `AI_ALLOWANCE_CUTOVER_PERIOD` 2026-11 (`learn-entitlement.js`); from November 2026 everyone is granted the
  default, and a brand-new account has no usage, so each `gate2-N` account starts at 2,500 credits for 2026-11 (the grant is written at its first
  admitted call). The first test user's counter was 1,706.52 credits after run 6, which is why Gate 2 needs other users. Admission needs
  `used + held + this call's reserve <= allowance`; an author call reserves up to about US$1 (100 credits) and a whole job's worst case is about
  US$1.35, so a session needs roughly 140 credits to be given a job (`--job-worst-case`, default 140).
- `--allowance` prints each session's credits used and left (read-only GETs) and the platform-cap note below.

## The platform day cap (USAGE_PLATFORM_DAY_USD, US$40 on the dev clone)

Read from the code (`learn-spend-ledger.js`), not the plan's wording: the platform guard is a **rolling 24 hours**, not a calendar day. Admission sums
every operation settled **or still admitted** in the last 86,400 seconds (a call in flight counts at its worst-case reserve) and refuses a new call
when that sum plus its reserve would pass the cap. It is shared by every user and every lane on the clone, and it is a secret binding, so no user
route and no script here can read the day's total. The plan gives the preview's value as US$40 (the cap in `wrangler.dev.jsonc` for the shared dev
worker is 10; the gate prints the clone's own value only when `versions view` shows it).

- Gate 2 is estimated at 1,000 to 1,350 credits (US$10 to 14), up to about US$45 worst-case bound for both gates. Five jobs at once can hold up to
  about US$5 of author reserves at the same moment.
- **Pace it**: before launching, add every other lane's settled spend from the last 24 hours (spend.md rows, the spend ledger) to this batch's
  estimate plus about US$5 of reserve. If that nears US$40, wait for the window to roll, run fewer at a time (`--concurrency`), or have the owner raise
  the dev cap. A refusal by the platform cap surfaces as a failed job (stop reason budget) and counts as lost: do not start Gate 2 close to the cap.
- The script prints the run's own settled credits and the cumulative total after every job and at the end, and each session's allowance before and after.

## Running Gate 2

0. **Before anything.** Gate 1 has passed on the frozen MVP4 candidate. Record from its table: the candidate SHA, MVP3's release SHA, the prompt-files
   hash and the golden-artifact hash. The integrator gives the preview's `PREVIEW_VERSION` (the Cloudflare version id) and `PREVIEW_SHA`, and the
   candidate is deployed through the normal dev deployment with the SHA in the version's tag or message.
1. **Sessions.** `dev-test-session.mjs --check --count 5`, then `--mint --count 5` (announce the dev D1 rows), then `--allowance --base <preview>`.
2. **Dry run (free, offline).** `node scripts/animation/sgd-qualify.mjs --dry-run` runs the whole script against an in-memory fake preview with canned
   job states (8 of 9 accepted, one repaired, one rejected, the control reports a gap): no network, no credential, a temp output folder.
3. **Check (read-only).** Same flags as the run plus `--check`: validates the arguments, the sessions file, the candidate's client features, the
   identity and preview-pin gate (git, the harness, wrangler reads), and the stop file. It creates no canvas and no job and writes nothing.
4. **Announce** the batch: ten jobs, up to five at a time, cumulative cap, expected 1,000 to 1,350 credits.
5. **Run.**

       PREVIEW_VERSION=<version id> PREVIEW_SHA=<candidate sha> node scripts/animation/sgd-qualify.mjs \
         --base https://rabbit-hole-web-dev-<name>.tryrabbithole.workers.dev --candidate-worktree <candidate checkout> \
         --mvp3-sha <sha> --prompts-hash <hex> --golden-hash <hex> --cap <credits> --prior <credits> --concurrency 5

6. **Stop** at any time: create the stop file (`<out>/STOP` by default; `--stop-file`) or press Ctrl+C. Every running job is cancelled through the
   product's cancel route and no other job starts. A second Ctrl+C quits at once. Remove the stop file before the next run.
7. **After**: record the spend rows in the repository's `spend.md` (Parallel does this, not the script), the result in `checklist.md`, and any defect
   in `fix.md` (FX-AN-060 and up). Remove the dev clone or leave it per the owner.

### Flags

| Flag | Meaning |
|---|---|
| `--base` | the preview origin (required; no default, so a spend never goes to a guessed Worker) |
| `--candidate-worktree`, `--mvp3-sha`, `--prompts-hash`, `--golden-hash` | the identity check; all required |
| `--cap`, `--prior` / `PRIOR_CREDITS` | the **cumulative** cap in credits and the credits already spent against it before this batch; both required, no default, `prior` must be under `cap` |
| `--sessions-file` | default `C:/s/spec/animation/sgd-mvp1-acceptance/gate2-sessions.json` |
| `--concurrency` | 1 to 5, default 1 |
| `--out` | default `C:/s/spec/animation/sgd-mvp1-acceptance/release-2` (refused inside the repository; a dry run uses a temp folder) |
| `--stop-file` | default `<out>/STOP` |
| `--typical author=32,review=15,repair=24` | override the guard's typical costs (credits); the expected cost of a running call is 1.2 times typical, briefs 8.1 |
| `--run-all` | keep starting jobs after the verdict is already FAIL |
| `--choice <id>` | which size alternative to take when a plan offers a choice (default: the first offered) |
| `--job-worst-case` | credits a session must have free for one more job (default 140) |
| `--poll-ms`, `--plan-timeout-min`, `--job-timeout-min`, `--settle-wait-min` | 4000, 6, 20, 3 |
| `--worker`, `--credentials`, `--verify-script` | wrangler Worker name (default from `--base`), credentials file, optional preview verifier |
| `--check`, `--dry-run` | read-only validation; offline fake run |

Exit codes: 0 PASS, 1 FAIL, 2 usage or configuration, 3 halted or incomplete, 4 refused before any spend (identity or preview-pin gate), 130 second Ctrl+C.

### The spend guard

Modelled on `guard5.mjs` and `guard6.mjs` of the acceptance scripts (actuals, not reservations; the platform's own gates are untouched and the tool
only cancels), generalised to every running job at once. At every poll of every job (with `?detail=1` diagnostics):

- **Cumulative cap.** `prior + finished jobs + settled calls of the running jobs + the expected cost of each running call` must stay within `--cap`.
  Over it: **every running job is cancelled** through `POST .../cancel`, no job starts, the run ends INCOMPLETE (exit 3). A call already sent finishes and
  settles after the cancel (the product says so); the script reads each cancelled job until none of its calls is running, so the row carries the cost.
- **Per call.** A settled call above 1.2 times its typical cost cancels **that job** (`cost-stop`, counts as not accepted).
- **After a repair**, a running final review needs 30 credits of headroom, else the run stops.
- **Before Generate**, the job's author call counts in the check; before each launch the cap must also hold a typical job (8.1 + 38.4 + 18 credits)
  for the new job and for what every running job may still cost; with no room the job is not started.
- A call of unknown cost is counted at its role's typical cost, never as zero. A preview that serves **no diagnostics** halts the run at once.
- **Resume.** Rows are saved in `<out>/state-<sha7>-<version8>.json`. Running the same command again for the same candidate runs only the phrasings
  without a final result and counts everything already spent against the cap (use the same `--prior`). To redo a candidate from scratch, move that file
  away; that is a new paid batch and is announced.
- **Typical costs** are guard5's, measured on SGD jobs (author 24.75 to 32, review 12.5 to 15.7, repair 19 to 26.6). AN-17 raised the repair call to
  24,000 output tokens at medium effort and the streaming/retry changes alter timing; if repairs now settle above 28.8, raise `--typical repair=`
  before the run rather than letting the guard cost-stop healthy jobs.

### Where things go

- `<out>/spend-rows.md`: one markdown row per job, appended the moment it ends (candidate SHA, preview version, phrasing, job id, outcome, repairs,
  settled credits, credits charged to the test user, artifact hash, running total). Parallel copies these into `spend.md`.
- `<out>/<job id>/`: `diagnostics-detail1.json` (job and diagnostics as served), `job.json`, `plan.json`, `reviews.json`, `program-last-draft.js`,
  `program-before-repair-N.js`, `chat-messages.json`, `artifact.json` (accepted jobs, with its SHA-256 in `summary.json`), `summary.json`. Same names as the earlier export script.
- `<out>/result-<sha7>-<stamp>.md` and `.json`: the result table, the verdict, halts, skipped sessions, the settled total and each session's allowance after the run.
- Artifact hash column: the host's `artifactHash` (first 16 hex in the tables, full value in `summary.json`). The earlier receipts used the SHA-256 of the
  fetched `artifact.json`; that value is `fileSha256` in `summary.json`.
- Settled credits are the provider cost from the job's calls. After AN-17 a rejected job charges the learner zero while the platform ledger keeps the
  cost, so the table has both columns (settled, charged); the guard and the cap use settled.

## Weekly canary (description only; not created by this lane)

After the release, a weekly scheduled task runs one full SGD job on **production** and posts the result. Intended content: request "stochastic
gradient descent" as the production test user, wait for the job to end, record the job id, outcome (accepted, or the stop reason), repairs, settled
credits and artifact hash, remove the test canvas, and post a one-line result. Two consecutive failures reopen the ladder UUID. Open items for the
owner and Parallel before it can exist: how the task acts as the production test user (production has no test-bypass route, so a real signed-in
session is needed), its spend approval (production spend is not authorized until AN-21's one post-release request), and where it posts.

## Not verified here

Nothing was run against the real dev server, Cloudflare, the real credentials file or lane (d)'s harness. Verified offline only: the fake server,
the runner, the guard, the gate (with stub git, harness and wrangler), the session minting (fake control plane), the exports and the command line.
The wrangler output formats are the ones `verify-preview.mjs` has parsed on this preview since 2 November; the real routes and Chat message shapes
are ported from the acceptance driver `choose-generate-features6.mjs`. The first real use should be `--check`, then the run.
