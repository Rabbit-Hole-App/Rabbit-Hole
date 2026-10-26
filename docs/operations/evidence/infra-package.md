# Infrastructure and provider package: one priced package for the approved features

Written 2026-10-25 about 10:45 PM PT by the infrastructure + provider analyst (read-only, NO SPEND: no deploy, no secret write, no purchase, no paid call, no
production mutation; nothing printed a credential). Basis: main 29622d8e (worktree stack-c13, read only); live reads of Fly (`fly machine list`,
`fly volumes list`, `fly secrets list` names only), Cloudflare (`wrangler secret list`, `d1 list`, `r2 bucket list`, account/subdomain GETs), the budget
ledger (`node C:/s/spec/budget/budget.mjs status`), and the specs and receipts named in each section. Official pages were fetched on 2026-10-25 (PT) and
are cited with their URL. Where a number is my own arithmetic from a cited rate it says so; where I could not verify something it says so (section 11).

## 0. Answer in five lines

1. **Necessary NEW recurring infrastructure is about US$2.6 to US$4.6 per month at expected early volume (US$1.2 floor, US$15 if every service ran at its high
   scenario). That is inside the US$30/month target.** It is two small Fly apps (file converter, maths renderer) billed only while running, plus their
   stopped-disk charge. Telemetry, FILE_JOBS and Dynamic Workers add US$0 inside the Cloudflare plan the account already pays.
2. **The audit's "~US$9/month" for the converter is only the 100-bursts-a-day compute figure** (I reproduce US$8.96 from the config). At 20 bursts a day it is
   US$1.79 compute, about US$2.6 all-in. It is not a price until you pick the volume.
3. **The one-time test budget is far below the proposed US$100 shared cap.** Required (non-optional) tests are about US$22.1 at calculated maximums
   (expected about US$8.8), the optional coverage adds about US$29.6 at maximums; with the US$18.25 already spent or reserved the worst required total is about
   US$40.4 (US$70 with every optional line). Motion is the only large line; image and "other" acceptance together are under US$4 required.
4. **Money does not block most of the list; engineering does** (section 10): there is no `fly.prod.toml` for the converter or the maths renderer,
   `context.sh` is hard-wired to the dev toml, the FILE_JOBS plumbing candidate and export are unwritten, `/generate-image` still has three closed gates, Motion 60 s
   needs a renderer code change, and nothing has ever proved Dynamic Workers termination.
5. **Owner actions that are money or access** are in section 9 (one consolidated approval text and every prepared command) and the final table in section 8.

## 1. FILE CONVERSION (production converter, FILE_JOBS)

### 1.1 What exists today (verified)

- Only the dev app exists: `rabbit-hole-convert-dev`, Fly org `rabbit-hole`, one machine `812d65b9275d98`, `shared-cpu-2x:4096MB`, `iad`, state stopped
  (`fly machine list`, 2026-10-25). Secrets on it, names only: `CONVERT_ALLOWED_ORIGINS`, `CONVERT_TOKEN`. No volume.
- No `rabbit-hole-convert-prod` exists (`fly apps list -o rabbit-hole`: cad-prod, convert-dev, lesson-renderer-dev, lesson-renderer-prod, motion-orchestrator,
  motion-renderer, motion-renderer-dev). Global uniqueness of the proposed name is not verified until `fly apps create` runs.
- The production Worker `rabbit-hole-app` has none of `CONVERT_URL`, `FILE_JOB_ORIGIN`, `CONVERT_TOKEN`, `FILE_JOB_SECRET` (secret list, section 7) and does not
  export or bind `FileJobs` (file-jobs contract section 1). **Owner of FILE_JOBS export, binding and migration is the FILE_JOBS lane; I reference
  `C:/s/spec/file-jobs/contract.md` sections 2.1 (binding `FILE_JOBS`/class `FileJobs`, `new_sqlite_classes` tag `file-jobs-1` appended last, `FileJobs` added to the
  `app-worker.js` re-export) and 3 (single owner). Nothing is redesigned here. No D1 migration is needed (the file tables already exist in `rabbit-hole-learn-prod`).**

### 1.2 Fly configuration actually needed (derived from the dev config and the measurements)

Template: `packages/file-convert/fly.dev.toml` (committed). Production differs only in the `app =` line (the repo pattern; a test should equate them).

| Setting | Value (from the committed dev config) | Why it is right |
|---|---|---|
| VM | `shared-cpu-2x`, 4 GB (`[[vm]] memory 4gb, cpu_kind shared, cpus 2`) | measured peaks in canvas-file-converter.md section 3: LibreOffice 166-302 MiB, OpenCascade 290-373 MiB, FFmpeg 24-144 MiB. Per job cgroup limit 1.5 GiB, 1 CPU, 512 tasks; 2 slots (`CONVERT_SLOTS=2`) fit 4 GB with headroom. A 2 GB machine (US$13.39/month always-on vs US$25.39) holds every fixture measured but not a large STEP assembly (doc section 3.1), so I keep 4 GB. |
| Auto-stop / min machines | `auto_stop_machines = "off"`, `auto_start_machines = true`, `min_machines_running = 0`, app self-exits after `CONVERT_IDLE_STOP_SECONDS = 300` with no active attempt | Fly must not stop the machine mid-conversion (the dispatch returns 202 before the work); the service exits itself; measured cold start 2.7 s, dispatch to a stopped machine answered 202 in 2.68 s (doc section 3). |
| Machines | exactly one (`--ha=false`) | `CONVERT_SLOTS=2` matches `FILE_JOB_CONCURRENCY` default 2 (contract section 2.4). |
| Storage / volume | none. Scratch only (1 GiB private `/tmp` per job); sources/derivatives live in R2 | no volume cost |
| Stopped disk | rootfs `$0.15/GB-month` while stopped | image size is NOT measured: compressed 226 MB (doc section 3); I assume 4 GiB uncompressed (the repo's CAD doc used the same assumption) = US$0.60/month. |
| Bandwidth | source download from the Worker is inbound (free); derivatives uploaded back are Fly outbound at US$0.02/GB (North America) | measured output sizes: PDF/PNG tens to hundreds of KB, 600 s of audio 9.7 MB, GLB 0.2 MB |

Converter families on this one machine (no per-family split is needed):

| Family | Converter | CPU/RAM actually used (measured) | Wall (measured) | Fits current config? |
|---|---|---|---|---|
| Word / legacy Word to PDF | `office-pdf` (DOC/DOCX/ODT/RTF) | 166-302 MiB, 1 CPU | 2.2 s DOCX; 11.6 s first DOC after deploy | yes (ODT/RTF untested) |
| PPTX slides | `slides` (PPTX/PPT/ODP) | 166-174 MiB | 2.5 s (3 slides); 5.7 s (40 slides, two at once) | yes (PPT/ODP untested) |
| STEP to GLB | `step-glb` | 290-373 MiB for 442 KB model | 4.5 s | small models yes; large assemblies unmeasured and will fail with `memory_limit_exceeded` at 1.5 GiB (a deterministic bounded failure, not a spend) |
| Audio playback | `audio-playback` | 24-144 MiB | 8.4 s for 600 s of audio (89.6x real time) | yes; 4 h cap fits the 300 s attempt timeout |

### 1.3 Expected monthly cost, derived from the real config

Official rates (https://docs.fly.io/about/pricing and https://fly.io/pricing/, fetched 2026-10-25): shared-cpu-2x 512 MB US$0.0061/hour (US$4.39/month);
additional RAM US$6.00/GB/month; so 4 GB = 0.0061 + 3.5 x 6/720 = **US$0.03527 per running hour (US$25.39 if it never stopped)**, equal to the repo's
US$0.0000098/s. Stopped machine rootfs US$0.15/GB-month. Outbound North America US$0.02/GB. No platform fee, no minimum bill stated, no free tier for new orgs
(trial of 2 hours / 7 days only).

A "burst" = one wake: 300 s idle tail + ~5 s of work = 305 s x US$9.8e-6 = **US$0.00299 per burst** (my arithmetic). Conversions that arrive inside the same 5-minute
window share one wake, so bursts are fewer than jobs.

| Scenario | Bursts/day | Compute/month | Rootfs (assumed 4 GiB) | Egress (jobs x ~5 MB) | **Total/month** |
|---|---|---|---|---|---|
| Low | 5 | US$0.45 | US$0.60 | ~US$0.05 | **US$1.10** |
| Expected early use (planning figure) | 20 | US$1.79 | US$0.60 | ~US$0.18 | **US$2.57** |
| High (the audit's case) | 100 | US$8.96 | US$0.60 | ~US$0.90 | **US$10.46** |

Levers (not applied): `CONVERT_IDLE_STOP_SECONDS` 300 to 60 cuts the idle tail by 80% (US$0.0006 per burst) at the price of more 2.7 s cold starts; unchanged here
because it changes a measured, approved configuration.
Other costs of the conversion path: one-time remote image build about US$0.2 (repo estimate from the CAD build of 223 s; not verified on Fly's page). Cloudflare side (FileJobs
Durable Object requests/duration, R2 operations, D1 rows) is a few operations per job inside the Workers Paid inclusions (1 M DO requests, 400,000 GB-s,
https://developers.cloudflare.com/workers/platform/pricing/), so US$0 incremental.

### 1.4 Names the Worker and Fly need (names only)

| Where | Name | Kind | Source |
|---|---|---|---|
| Worker `rabbit-hole-app` | `CONVERT_URL` = `https://rabbit-hole-convert-prod.fly.dev` (proposed app name) | var | contract 2.2 |
| Worker | `FILE_JOB_ORIGIN` = `https://digrabbithole.com` | var | contract 2.2 |
| Worker | `CONVERT_TOKEN` (>= 32 chars, same value as the Fly secret) | secret | contract 2.2 |
| Worker | `FILE_JOB_SECRET` (>= 32 chars, differs from `CONVERT_TOKEN` and `CAD_JOB_SECRET`) | secret | contract 2.2 |
| Fly `rabbit-hole-convert-prod` | `CONVERT_TOKEN` | secret | doc section 6 |
| Fly | `CONVERT_ALLOWED_ORIGINS` = `https://digrabbithole.com` | secret | contract 6 item 2 |
| Worker | `FILE_JOB_CONCURRENCY` | optional var; leave unset (= 2) | contract 2.4 |

Worker env budget: the app Worker has 48 vars+secrets today (contract 1) and Paid allows 128 (per the file-jobs contract section 2.2; I did not re-fetch the limits page); everything in this package adds about 20 more.

## 2. JAVASCRIPT EXECUTION (Dynamic Workers)

### 2.1 Which account, and the Workers plan evidence

- Production is Cloudflare account **`c08d3dbdc53a3afd3cb09a536ac42318`, name "rabbit-hole", workers.dev subdomain `tryrabbithole`** (live GETs
  `/accounts/{id}` and `/accounts/{id}/workers/subdomain` with the credentials-file token; the id in `small-deploy/.env` equals it; it is the `account_id`
  pinned in `packages/web/wrangler.rabbit-hole-prod.jsonc`; 32 Worker scripts, 7 D1 databases, 6 R2 buckets live there). Account created 2026-09-29.
- **The plan statement, quoted** from `C:/s/spec/day-1021/webcard-blockers.md` section 1 (heading "Account access: Browser Rendering - CLEARED 01:27 PT (owner upgraded to Workers Paid; Worker redeployed)"):
  "Owner upgraded the account to Workers Paid (about 01:20). Cloudflare applies it to a Worker on its next deploy: this lane redeployed the clone at 2ff087c4
  (version fc29034e, 01:26)." and "`puppeteer.limits()` = `{"activeSessions":[],"maxConcurrentSessions":200,...}` (Paid: 200 concurrent ...)"; before it, on the same date,
  "Free tier: 10 browser-minutes a day, exhausted" with `usedBrowserTimeSeconds 962, maxConcurrentSessions 4`. Date: 2026-10-22 (the file header says "Times PT, 2026-10-22").
- **Is that THIS account?** Yes by three links: the dev clone it redeployed is `rabbit-hole-web-dev-webcard-int.tryrabbithole.workers.dev` (same subdomain as the
  account above); dev and prod configs pin only this account id; and there is no second Cloudflare account in the credentials file. It is not another account.
- Error 10195 "In order to use Dynamic Workers, you must switch to a paid plan" is recorded in `evidence/ctrlk-source-derivative-dev-2026-10-19.md` and
  `ctrlk-capability-status.md` (deploy of the temporary loader, 2026-10-19), i.e. before the upgrade.
- **Not API-proven.** The subscriptions endpoint returns 403 with our token, `usage_model` is "standard" either way, the script count (32) does not discriminate. Treat
  Workers Paid as *strongly evidenced, not proven*. The isolated retest below is also the proof: if the throwaway deploy is rejected with 10195 the account is Free and the
  owner must decide on US$5/month (Workers Paid, minimum charge per account, https://developers.cloudflare.com/workers/platform/pricing/). **No duplicate purchase:
  do not buy anything until the retest says 10195.**

### 2.2 Dynamic Workers usage charges and restrictions (official)

https://developers.cloudflare.com/dynamic-workers/pricing/ (fetched 2026-10-25): "Dynamic Workers are currently only available on the Workers Paid plan." Included per
month: 1,000 unique Dynamic Workers created, 10 million requests, 30 million CPU ms. Beyond: **US$0.002 per unique Dynamic Worker per day**, US$0.30 per million requests,
US$0.02 per million CPU ms (requests and CPU appear on the normal Workers bill). Billing of "created daily" started 2026-05-26. The page's "per month" vs daily reset is
ambiguous (the page itself); I could not resolve it.
Limits page https://developers.cloudflare.com/dynamic-workers/usage/limits/: custom `limits: { cpuMs, subRequests }` per invocation, exceeding "immediately throws an
exception". Egress control https://developers.cloudflare.com/dynamic-workers/usage/egress-control/: `globalOutbound: null` makes every `fetch()`/`connect()` throw. The docs I fetched say
nothing about memory limits or account restrictions (so "memory/size limits" stays an open acceptance item). The product loader call already uses
`globalOutbound:null, limits:{cpuMs:1000,subRequests:0}` (`inline-code-runtime.js:76`).
Cost link to policy: a Dynamic Worker is unique per distinct program. `INLINE_CODE_MAX_RUNS` (frozen on first use) bounds creations: **at <= 1,000 runs/month the usage charge is US$0**;
10,000 distinct runs would be about 9,000 x 0.002 = US$18/month. Recommendation: set `INLINE_CODE_MAX_RUNS` to a value <= 1,000 for the first month.

### 2.3 New recurring cost: US$0 (Workers Paid already evidenced). One-time test cost: US$0 (4 unique Dynamic Workers of the 1,000 included).

### 2.4 What this does NOT unlock

Passing the retest only removes the platform blocker. The feature still needs FILE_JOBS (shared plumbing), the four `INLINE_CODE_*` vars, the `worker_loaders` binding line
in the production config (do not add it before the retest passes: a Free account rejects the whole deploy with 10195, contract section 5) and a deployed-runtime acceptance
(CPU termination, memory, no network, cancel). That is code and release work (section 10).

### 2.5 ISOLATED retest plan (the integrator runs it; I ran nothing)

Disposable Worker `rabbit-hole-dynw-probe-1025` (not a product name; not `rabbit-hole-web-dev-*`, not `rabbit-hole-cp-dev*`) on the same account, files in
`C:/s/spec/day-1021/dynw-probe/` (`wrangler.jsonc` with `worker_loaders` binding `LOADER`, and `worker.mjs`, which loads four tiny programs: `sum`, `loop` (infinite), `net`
(outbound fetch), `mem` (allocation) with the product's exact loader limits and a 10 s host deadline). It binds no D1/R2/DO and reads no product secret. It is public on
workers.dev for the minutes it exists and is guarded by a random `?k=` key.

```bash
# run from Git Bash; reads CLOUDFLARE_* by name through the existing helper; prints no secret
cd C:/s/spec/day-1021
K=$(node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))")
# T1 deploy. EXPECT success. 10195 here = the account is NOT on Workers Paid: STOP (nothing else is touched), report to the owner.
node with-cf.mjs C:/s/spec/day-1021/dynw-probe wrangler deploy --var PROBE_KEY:$K
URL=https://rabbit-hole-dynw-probe-1025.tryrabbithole.workers.dev
sleep 20   # new versions serve ~15-20 s after deploy returns (memory: wrangler-deploy-rollout-lag)
curl -s "$URL/?k=$K&case=sum"    # PASS: {"case":"sum","outcome":"returned","status":200,"body":"4",...}
curl -s "$URL/?k=$K&case=net"    # PASS: body starts "blocked:" (globalOutbound null). FAIL: "NETWORK REACHED"
curl -s "$URL/?k=$K&case=loop"   # PASS: outcome "threw" with a CPU-limit message and elapsed_ms well under 10000.
                                 # FAIL/INCONCLUSIVE: message "HOST DEADLINE 10 s: no termination observed" (termination NOT proven; the feature stays blocked)
curl -s "$URL/?k=$K&case=mem"    # RECORD only: returned/threw/caught, or an HTTP 5xx if the isolate died. Memory limit is not documented; this is an observation, not a pass.
# T2 clean up. Exact name only; never a shortened name.
node with-cf.mjs C:/s/spec/day-1021/dynw-probe wrangler delete --name rabbit-hole-dynw-probe-1025
node with-cf.mjs C:/s/spec/day-1021 wrangler deployments list --name rabbit-hole-dynw-probe-1025   # EXPECT: not found
unset K
```
Cost: 4 unique Dynamic Workers (inside the 1,000 included) and a handful of requests: US$0. Record the four JSON bodies as the receipt. Per CLAUDE.md, a script that can
mutate is tested only in the enforced offline harness; these are single wrangler commands against a throwaway name, not a production script, but the integrator must still read
`worker.mjs` and `wrangler.jsonc` first. `wrangler deploy` reads `wrangler.jsonc` in that directory only, so it cannot touch `rabbit-hole-app`.

## 3. MATHS ANIMATION (manim)

### 3.1 What a production renderer needs (from packages/math-renderer and the dev app)

- Image: `debian:bookworm-slim` + python3, ffmpeg, build-essential, cairo/pango dev packages, texlive-latex-base/extra/fonts-recommended/science, dvisvgm, `manim==0.18.1`
  (`Dockerfile`). Service `server.py`: `MATH_WORKER_TOKEN` env (single bearer, `hmac.compare_digest`), one render at a time (`BoundedSemaphore(1)`), `RENDER_TIMEOUT=420`,
  `MAX_ASSET=25 MB`, child process run with a clean env (no token), TeX with `shell_escape=f`.
- Dev config `packages/math-renderer/fly.dev.toml`: app `small-math-renderer-dev`, `shared-cpu-2x` **4 GB**, `auto_stop_machines="stop"`, `auto_start_machines=true`,
  `min_machines_running=0`, health grace 60 s, concurrency soft 10 / hard 20. No volume, no mounts. **The dev app lives in the PERSONAL Fly org** (`fly apps list`: owner `personal`,
  suspended, machine `1850e67a0e6998` shared-cpu-2x:4096MB stopped), not in `rabbit-hole`; production must be a new app in the `rabbit-hole` org (memory: Fly belongs to the Rabbit Hole org).
- Worker names consumed: `MATH_WORKER_URL` (https required, `math-provider.js:15`) and `MATH_WORKER_TOKEN`; neither exists on `rabbit-hole-app` today. Proposed app: `rabbit-hole-math-renderer-prod`
  (not verified free), config `packages/math-renderer/fly.prod.toml` = dev toml with the `app =` line changed (does not exist yet).
- Evidence of a real render: 2026-09-29, the shipped sample, 18.9 s, 854x480, on the dev app (`learn-math-animation.md`). Unmeasured: peak RAM and image size (the dev doc gives neither).

### 3.2 Can existing infrastructure serve it? Evidence says no: separate app.

| Candidate | Evidence | Verdict |
|---|---|---|
| `rabbit-hole-lesson-renderer-prod` (Blender scenes + repository indexing) | `shared-cpu-1x:2048MB` (fly machine list) vs the maths worker's 4 GB / 2 CPU; image is Blender + a graphifyy venv, no ffmpeg/TeX/manim; the process also clones and indexes user repositories (`index_repository.py`, `repository_jobs.py`); one token `SCENE_WORKER_TOKEN` covers scenes and repositories; a one-slot render queue shared with Blender jobs | **No.** Adding texlive+manim (the Dockerfile's own comment says the LaTeX layer and slow renders should stay off the Blender machine, `learn-math-animation.md` "Deploying the worker") would triple the image, force a bigger machine, share one queue and one bearer with code that handles untrusted repositories. |
| Motion renderer `rabbit-hole-motion-renderer` | Node 24 image (Remotion/Chromium), a *measured, hash-pinned* configuration: the orchestrator refuses any renderer whose code hash differs (`deploy-package.md` steps 2-3 and `handback-full.md` section 9: code hash `02d5069eeb4d`), one job store volume, `MOTION_RENDERER_TOKEN`, 1.5 CPU/3 GiB cgroup limits, sandbox with namespaces | **No.** Any change to its image or code changes the hash and invalidates every measurement, and Python/TeX/manim are not in it. |
| Reuse a *token*? | the maths worker takes its own `MATH_WORKER_TOKEN`; Motion and scene tokens are separate Fly/Worker secrets | keep a fresh dedicated token (token scoping stays one service, one secret) |

### 3.3 Expected monthly cost

Same shared-cpu-2x 4 GB rate as the converter: US$0.03527/hour. A render keeps the machine up for its duration plus the Fly proxy's idle stop; I assume the same 300 s tail
(unmeasured for this app). Per render: 19 s sample: US$0.0031; 120 s: US$0.0041; 420 s timeout: US$0.0071 (my arithmetic). Stopped rootfs (texlive image, assumed 4 GiB): **US$0.60/month**.
Egress: <= 25 MB per MP4 at US$0.02/GB (typically 1-5 MB). Cost is platform-funded (owner 5A decision C), bounded by one render at a time and the existing render fairness.

| Renders/month | Compute | Rootfs | Egress | **Total/month** |
|---|---|---|---|---|
| 50 | US$0.16-0.36 | US$0.60 | ~US$0.01 | **US$0.8-1.0** |
| 200 | US$0.62-1.42 | US$0.60 | ~US$0.05 | **US$1.3-2.1** |
| 500 | US$1.55-3.55 | US$0.60 | ~US$0.13 | **US$2.3-4.3** |

Plus authoring: the Tutor's maths specification is a model call that spends the learner's allowance, not platform money (learn-math-animation.md).

## 4. /VIDEO (FAL Seedance)

- Provider names: Worker var `LEARN_VIDEO_PROVIDER` = `fal-seedance-lite` (exact string required, `video-provider.js:7`) and secret `FAL_API_KEY`; optional `LEARN_VIDEO_RESOLUTION` (default `480p`).
  The adapter calls `https://queue.fal.run/fal-ai/bytedance/seedance/v1/lite/{text-to-video|reference-to-video}`; duration 2-12 s (`learn-video-schema.js:7`), default 2 s, aspect 16:9 / 1:1 / 9:16.
- Official price (https://fal.ai/models/fal-ai/bytedance/seedance/v1/lite/text-to-video and https://fal.ai/docs/model-api-reference/video-generation-api/bytedance-seedance-v1-lite, fetched 2026-10-25):
  **US$1.80 per million video tokens; "US$0.18 per 720p 5-second video"; tokens = height x width x FPS x duration / 1024.** Per-clip cost (my arithmetic: formula at 24 fps, and the same
  prices scaled from the page's US$0.18 point):

| Clip | Formula (24 fps) | Scaled from the page's US$0.18 |
|---|---|---|
| 480p, 2 s (product default) | US$0.035 | US$0.032 |
| 480p, 5 s | US$0.087 | US$0.080 |
| 480p, 12 s (product maximum at the default resolution) | **US$0.208** | US$0.192 |
| 720p, 5 s | US$0.194 | US$0.180 |
| 720p, 12 s (only if `LEARN_VIDEO_RESOLUTION` is raised) | US$0.467 | US$0.432 |

  Use **US$0.21 as the calculated maximum per clip** at the default 480p. The one real clip in dev (2026-09-17, 2 s 480p) has no recorded cost in the doc.
- **Conflict I could not resolve:** one fetch of the model page returned "The endpoint is marked deprecated, and requests are being re-routed to Seedance 1.0 Pro Fast" ($1.00 per million tokens,
  "roughly $0.245" per 1080p 5 s clip, https://fal.ai/models/fal-ai/bytedance/seedance/v1/pro/fast/text-to-video); the docs page for Lite states no deprecation. If re-routed the price per clip is lower
  per token but the adapter's request shape is unverified. Verify in the fal dashboard before the first paid run (a test, not a guess).
- Billing model: fal bills prepaid credits ("Purchased credits expire in 365 days", pro/fast page); minimum top-up not stated on the pages fetched. Server errors (5xx) are not charged, client errors (422) are.
- New recurring: **no fixed charge**; usage only. 100 clips/month of 5 s 480p is about US$8.7. Today the command is offered and then fails "Video generation is not configured" (audit row 36).

## 5. MOTION (capacity)

### 5.1 State (verified 2026-10-25)

- `rabbit-hole-motion-renderer`: one machine `899760b64210e8`, `performance-2x:4096MB`, **volume `motion_jobs` 1 GB `vol_r685dglze9d313n4` attached** (the approved US$0.15/month item is done),
  secret `MOTION_RENDERER_TOKEN`, image `deployment-01M5TZ7ZXNYSSV0G4B2CTX77V7`, stopped. Production canaries ran: `receipts/acc-D01-32d86ee7.json` (16:9 15 s, success, wall 139.1 s, service total 136.29 s), `acc-D02`
  (9:16 15 s, 135.16 s), `acc-store` (restart check). `rabbit-hole-motion-orchestrator`: `shared-cpu-2x:2048MB`, secrets `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`, `MOTION_ORCHESTRATOR_TOKEN`, `MOTION_RENDERER_TOKEN`.
  `motion-deploy-state.txt` ends `accept:restart-check`, `worker-r1b:released`. The ledger shows an entry `motion-prod-accept-1` settled **US$1.278157** at 04:39Z (9:39 PM PT): the owner-path R1 acceptance job.
- Ledger now: `spent 17.9994, reserved 0.25, remaining 1.7506` against the old cap 20 (the figure in the brief, 16.7213, is older; the difference is `motion-prod-accept-1` 1.2782). By bucket: Motion US$17.396
  (model runs 15.8629, renders 0.2549, prod acceptance 1.2782), image US$0.6034 (img-A..E 0.4803 and imgact 0.1231), reserved 0.25 (dev volume).

### 5.2 Measured service times vs the 420 s limit (config 1.5 CPU / 3 GiB; receipts in `C:/s/spec/motion-validation/receipts`)

| Duration | Fixture, 16:9 medium (40 layers) service total | Margin to 420 s | Real model-built video |
|---|---|---|---|
| 5 s | 63.9 s (D10) | 85% | none |
| 10 s | 94.6 s (E10) | 77% | M5: renderer 88.5 s |
| 15 s | 120.7 s (D01); production canary 136.3 s | 71% / 68% | M1, M4 (9:16) |
| 20 s | 144.3 s (E20) | 66% | none |
| 25 s | 166.8 s (E25) | 60% | none |
| 30 s | 197.2 s (D11); other ratios 161-181 s | 53% | M6: 188.4 s; M2-r2 9:16 |
| 45 s | 271.3 s (D12) | 35% | none |
| 60 s | 347.7 s (D13); 9:16 344.97 s | 17% | **M3-r6: 322.6 s (23%)**, failed only the container-duration check |
| any, heavy (160 layers) | D18 (15 s), D20, D21 (60 s) **time out at ~426 s** | negative | the static gate calls these `simple` |

### 5.3 Is additional machine capacity genuinely needed?

- **Approved durations 5-30 s: no.** Worst measured is 197 s of 420 s; throughput is one job at a time platform-wide (a 30 s job takes 10-18 minutes wall, so 3-6 jobs/hour), not a cost problem.
- **Cost of the capacity we have, per job (renderer billed while a job polls it; the ledger bound counts the whole job wall):** renderer `performance-2x` US$0.0917/hour (https://fly.io/pricing/; the ledger uses 0.0904) +
  orchestrator `shared-cpu-2x` 2 GB US$0.0186/hour. M4 15 s (wall 441 s): 0.0112 + 0.0023; M6 30 s (1058.5 s): 0.0270 + 0.0055 = **~US$0.03 per 30 s job**; M3-r6 60 s (935 s): 0.0238 + 0.0048. 1,000 30 s jobs would be ~US$32 of
  compute against ~US$1.7 of model cost *each* (M6). The "US$66.00/month" in deploy-package.md is the always-on ceiling of the machine, not a recurring charge (`auto_stop_machines="stop"`).
- **45 s / 60 s:** the medium fixture and the one real 60 s run fit (23-35% margin), heavy scenes do not even at 15 s. A bigger machine would not be a drop-in: the cgroup limits are pinned by the
  hash-checked measured configuration, so more CPU needs a new config id, a dev redeploy and a re-measured matrix.

| Item | Class | Cost | Decision |
|---|---|---|---|
| Keep `performance-2x`, 1 machine, 1 GB volume | existing, permanent | usage only (~US$0.03/30 s job) + US$0.15/month volume (done) | **no permanent increase now** |
| Validation-only: temporarily size the DEV renderer to `performance-4x` (4 CPU / 8 GB, US$0.1833/hour, https://fly.io/pricing/) to find a safer 45/60 s configuration, about 5 hours of fixture matrix, then scale back | one-time, validation only | ~US$0.9 + fixtures (~US$0.01-0.03 each at 0.1833/h x 350 s) = **<= US$1.00** | optional, only if the 60 s margin is judged too thin after the container fix |
| Permanent `performance-4x` for the production renderer | would be a permanent increase | no standing cost (auto-stop); per 60 s job US$0.048 instead of US$0.024; needs new config id + re-measurement | **not proposed** |
| 60 s container fix on the DEV renderer (`60s-container-fix.patch`: new hash, dev redeploy, re-run enabled-pair fixtures) | one-time | ~25 fixture runs x ~US$0.005-0.009 = **~US$0.2** | needed before any 45/60 s enablement |
| Second renderer machine for throughput | would break the single-machine volume/job-store design (`--ha=false`) | not proposed | - |

## 6. TELEMETRY (adopted D1 `rabbit-hole-telemetry`, bucket `rabbit-hole-telemetry-archive`; do not recreate)

- Verified live: D1 `rabbit-hole-telemetry` uuid `e4c585cf-6078-43dd-b5c0-d30e0f80e778`, file_size 176,128 bytes (migrated, empty); dev D1 323,584 bytes; the R2 bucket exists; all seven D1 databases in the account total about 5.6 MB.
  The Worker does not bind them yet (incident record 2026-10-25). No secret needed from this package (`SUBSCRIPTION_OWNER_EMAIL` already exists on `rabbit-hole-app`, P6 is skipped when the name exists, activation-package.md).
- Design (docs/features/telemetry.md): each event is ~4 rows written (1 + <= 3-4 index rows) and ~1.5 KB; projections add ~6 rows per paid attempt; browser errors are throttled client-side (50/page load, one per 6 s after a burst
  of 10, batch <= 50 events/64 KB); retention events 30 d / archives 90 d / aggregates 395 d, **pruning is increment 5 and not built**; `TELEMETRY_ARCHIVE` is not read by any code yet.
- Official rates (https://developers.cloudflare.com/d1/platform/pricing/ and https://developers.cloudflare.com/r2/pricing/, fetched 2026-10-25): D1 on Workers Paid includes 25 billion rows read, **50 million rows written/month**,
  5 GB storage; overage US$0.001 per million rows read, **US$1.00 per million rows written**, US$0.75/GB-month; no D1 egress charge. R2 Standard US$0.015/GB-month, free 10 GB-month, 1 M Class A / 10 M Class B operations free, US$4.50 per million Class A, no egress fee.

| Events/day | Rows written/month | % of the 50 M included | Stored (30 d x 1.5 KB) | % of the 5 GB included (shared) | Incremental cost within inclusions | If every row were charged at overage (the doc's bound) |
|---|---|---|---|---|---|---|
| 2,000 | 0.24 M | 0.5% | 0.09 GB | 2% | **US$0** | US$0.31 |
| 10,000 | 1.2 M | 2.4% | 0.45 GB | 9% | **US$0** | US$1.54 |
| 100,000 | 12 M | 24% | 4.5 GB | 90% | **US$0** (inside, but near the shared 5 GB) | US$15.38 |

  Arithmetic is mine from the doc's per-event constants. R2: nothing writes yet; later archives (a few GB at most, <= 90 days) fit the 10 GB-month free tier: US$0. Dashboard reads: indexed queries; an unindexed scan of 3 M rows
  per view x 1,000 views would be 3 billion rows, 12% of the 25 billion included. **Engineering risk, not money now:** without the increment-5 pruning job, 10,000 events/day crosses the shared 5 GB in about 11 months
  (then US$0.75/GB-month, D1 limit per database 10 GB); the Cloudflare rate-limit rule for `POST /api/telemetry/client` (activation-package P10) is on a Free-plan zone and I did not verify the rule quota.
- New recurring: **US$0.** One-time test budget: US$0 (no paid provider call).

## 7. PROVIDER ACCESS LIST (secret NAMES only)

Credentials file `small-deploy/.env` key names present (checked with `grep -o '^NAME='`, values never read): `OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID, FAL_API_KEY, FISH_AUDIO_API_KEY,
ELEVENLABS_API_KEY, RESEND_API_KEY, DESMOS_API_KEY, TYPESAFE_API_KEY, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, FLY_ORG_TOKEN, FLY_API_TOKEN, HEYGEN_API_KEY, EXA_API_KEY, PEXELS_API_KEY` (and others unrelated to this package).
Installed names, read now: `rabbit-hole-app` (`wrangler secret list`): `ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID, CAD_BUDGET_ALERT_TOKEN, CAD_DIAGNOSTIC_READ_TOKEN, CAD_EXECUTOR_TOKEN, CAD_JOB_SECRET, CAD_MODEL_API_KEY, CAD_MODEL_ENABLED,
CAD_MODEL_WORKSPACE_ID, CAD_PRODUCTION_ENABLED, CAD_PRODUCTION_FIXED_INFRA_USD, CAD_PRODUCTION_SETUP_INFRA_MONTH, CAD_PRODUCTION_SETUP_INFRA_USD, CAD_PRODUCTION_STORAGE_USD_PER_GB_MONTH, DESMOS_API_KEY, ELEVENLABS_API_KEY,
FISH_AUDIO_API_KEY, INLINE_DECISION_KEY, MOTION_ORCHESTRATOR_TOKEN, SCENE_WORKER_TOKEN, SUBSCRIPTION_OWNER_EMAIL, TYPESAFE_API_KEY, USAGE_PLATFORM_DAY_USD`; `rabbit-hole-cp`: `CAD_BUDGET_ALERT_EMAIL, CAD_BUDGET_ALERT_TOKEN,
GITHUB_CLIENT_ID/SECRET, GOOGLE_CLIENT_ID/SECRET, MASTER_KEY, RESEND_API_KEY, USAGE_PLATFORM_DAY_USD`. Fly (`fly secrets list`): motion-orchestrator `ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID, MOTION_ORCHESTRATOR_TOKEN, MOTION_RENDERER_TOKEN`;
motion-renderer `MOTION_RENDERER_TOKEN`; convert-dev `CONVERT_ALLOWED_ORIGINS, CONVERT_TOKEN`; lesson-renderer-prod `SCENE_WORKER_TOKEN`.

| Provider | Needed by (approved feature) | Credential in credentials file | Installed in the consuming service | Billing / balance evidence | Quota / cap / restriction (provider-side, SEPARATE from our internal test budget) | Top-up or limit change the planned runs need | Install command |
|---|---|---|---|---|---|---|---|
| **OpenAI** | /generate-image (gpt-image-2.5-sunburst, -flare); Ctrl+K image edit and background removal (pinned `gpt-image-2.5-sunburst-2026-09-08`); recorded-answer transcription (`gpt-4o-transcribe`) | `OPENAI_API_KEY` yes | **NO**: absent from `rabbit-hole-app` (the secret list above); consumers: image-providers.js, inline-image-edit-provider.js, `/api/learn/transcribe` | working: real calls ran 2026-10-23 (img-A-1, img-B-1) and 2026-10-25 8:21 PM PT (imgact-sunburst1k-1, imgact-flare169-1) with this key. Prepaid balance NOT readable by me | rate limits Build tier 250,000 TPM / 20 IPM for sunburst (https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst); the project's monthly budget/limit is not readable | Planned use is under US$4 (section 8); only confirm the OpenAI project has >= US$10 prepaid/credit and no hard monthly limit below it | `prod-image-secrets.mjs` (below) |
| **Gemini (Google)** | /generate-image (Nano Banana 2.1, Pro) | `GEMINI_API_KEY` yes | **NO**: absent from `rabbit-hole-app` | the key's project was on the free tier ("limit: 0 requests per day", 2026-10-23); owner added **US$5 prepaid on 2026-10-23**; runs then passed. Google prepay: minimum purchase US$5, key stops at US$0 balance for ALL keys on the billing account (https://ai.google.dev/gemini-api/docs/billing, fetched 2026-10-25). Estimated used since (upper bounds, ledger): US$0.3722, so ~US$4.6 left (not readable; Google's billing page is the truth) | Tier 1 cap US$250/month; free tier "Not available" for these models (https://ai.google.dev/gemini-api/docs/pricing) | Required plan US$0.8 (+ optional US$4.1): the US$5 prepaid is enough for the required set; **buy one more US$5 only if the optional Gemini coverage is run** | same script |
| **Anthropic** | Motion (orchestrator on Fly: Director/Author/reviewers, `claude-opus-5-5`); existing model calls (`rabbit-hole-app`); CAD uses a separate key/workspace | `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID` yes | **YES**: orchestrator app and `rabbit-hole-app` (and `CAD_MODEL_API_KEY`, `CAD_MODEL_WORKSPACE_ID` for CAD) | working: M5, M6, M3-r6, M4 and `motion-prod-accept-1` ran since the owner raised the workspace limit on **2026-10-25** (~3:50 PM PT); a probe call at that time returned 200. Opus 5.5 US$4 input / US$20 output per million (https://platform.claude.com/docs/en/about-claude/pricing) | **a workspace limit is separate from the internal budget**: the refusal text was `You have reached your specified workspace API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.` (HTTP 400, 2026-10-25 2:26 PM PT, request id in `handback-full.md` section 5). Workspace limits cannot be set on the default workspace; org tier Start caps at US$500/month (https://platform.claude.com/docs/en/api/rate-limits). The new limit value is not readable by me | The workspace's monthly limit must exceed (its month-to-date spend) + (planned Anthropic spend): Motion required max US$18, expected ~US$7, optional +US$18 max; other model calls small. The month rolls over **2026-11-01 00:00 UTC = 2026-10-31 5:00 PM PT**: runs after that draw on a fresh November limit. Owner: raise to the planned maximum for Oct 25-31 and re-check the Console before each Motion batch | already installed |
| **FAL** | /video (Seedance Lite) | `FAL_API_KEY` yes | **NO** (and no `LEARN_VIDEO_PROVIDER` var) | prepaid credits; balance and key validity unverified (last real clip 2026-09-17) | no limits read | US$1 of credits covers the required video tests (calculated max US$0.84) | `prod-image-secrets.mjs` variant (below) |
| **Resend** | passwordless sign-in email (existing); Comments email invites | `RESEND_API_KEY` yes | **YES** on `rabbit-hole-cp` | working in production (sign-in frozen 2026-09-30); plan unknown | Free plan 3,000/month, 100/day; Pro US$20/month for 50,000 (https://resend.com/pricing, fetched 2026-10-25) | none for this package; confirm the plan if Comments invites grow past 100/day | none |
| **ElevenLabs / Fish Audio** | Voice (listening paused by owner 2026-10-12; narration plays) | yes / yes | yes / yes | working (narration) | n/a | none | none |
| **Desmos / Typesafe** | graphs / existing | yes / yes | yes / yes | n/a | n/a | none | none |
| Cloudflare | all Workers/D1/R2/DO | `CLOUDFLARE_API_TOKEN` | n/a | Workers Paid evidence section 2; token lacks billing scope | Workers Paid includes 10 M requests, 30 M CPU ms, 1 M DO requests | none | n/a |
| Fly | converter, maths, Motion | `FLY_ORG_TOKEN` / `fly auth` (works as yudhisteer.chin@gmail.com; the `FLY_API_TOKEN` env var is the personal org's and cannot see `rabbit-hole`) | n/a | org billing/card not readable | no org limit read | none | n/a |

**Exact secure installation commands (prepared only, NOT run; owner `!` commands).** Model: `C:/s/spec/image-activation/prod-image-secrets.mjs` (its dry run reads names only and changes nothing; the real run needs an interactive terminal and the typed phrase `PUT IMAGE SECRETS`;
values travel only over the child's stdin; `SUBSCRIPTION_OWNER_EMAIL` is never touched).
```bash
node C:/s/spec/image-activation/prod-image-secrets.mjs --dry-run      # names + target only: confirm OPENAI_API_KEY, GEMINI_API_KEY present; nothing runs
node C:/s/spec/image-activation/prod-image-secrets.mjs                 # type PUT IMAGE SECRETS; puts OPENAI_API_KEY and GEMINI_API_KEY on rabbit-hole-app
```
Installing the keys does NOT turn image generation on: `IMAGE_GENERATE_ENABLED` stays "false" and three code gates are closed (section 10). It *does* make `POST /api/learn/transcribe` live (it needs only `OPENAI_API_KEY`; audit row 35); migrate that route's model before 2027-02-26.
**FAL:** the same script with `SECRETS = ['FAL_API_KEY']` and a different confirmation phrase, plus the committed var `LEARN_VIDEO_PROVIDER = "fal-seedance-lite"` in `wrangler.rabbit-hole-prod.jsonc`. That copy is a new production-mutating script, so per CLAUDE.md it must first pass the same enforced offline harness test
(`prod-image-secrets.test.mjs` is the model); until then do not run it. It is an engineering item for the image-activation lane.

## 8. ALLOCATION AND ONE-TIME TEST BUDGET

Proposed shared cap US$100, including spending already recorded. Live ledger (read 10:41 PM PT): **spent 17.9994, reserved 0.25, remaining against the old cap 1.7506** (the brief's 16.7213 predates the settled `motion-prod-accept-1` 1.2782).
Provisional allocation: Motion 40, Image 30, other feature acceptance 20, shared reserve 10.

| Bucket | Allocated | Already spent (ledger) | Reserved | Left in bucket |
|---|---|---|---|---|
| Motion | 40.00 | 17.396 | 0.25 (dev volume; destroyed after validation) | **22.354** |
| Image (generation + editing, four models) | 30.00 | 0.6034 | 0 | **29.397** |
| Other feature acceptance | 20.00 | 0 | 0 | **20.00** |
| Shared reserve | 10.00 | 0 | 0 | 10.00 |
| Total | 100.00 | 17.9994 | 0.25 | **81.75** |

Method: runs x calculated maximum per run (the figure each run reserves in the ledger before it starts; unused reservation is released at settlement); then "expected" from measured costs. The cap is consumed by *settled spend plus in-flight reservations*, so the maximums
below are sizing, not what will be spent. Valid evidence that is **reused, never repeated:** Motion model-built videos M1 (16:9 15 s), M5 (16:9 10 s), M6 (16:9 30 s), M4 (9:16 15 s), M2-r2 (9:16 30 s), production canaries acc-D01/D02/acc-store, `motion-prod-accept-1`;
fixtures D01-D21, E10-E25, F30 (receipts); image runs A (flare 1K low), B (sunburst edit 2 refs), C-4 (NB2.1 1K), D-1 (Pro 1K), E-1 (NB2.1 edit 1 ref), imgact sunburst1k, flare169, nb21-1k, nb21-169. **Repeats to avoid:** any 16:9 10/15/30 s or 9:16 15/30 s model run; any 15 s fixture; a second run of
the same image model/setting unless the first failed.

### 8.1 Motion (bucket 40; 22.354 left)

Per-job limits: see 8.4. Rates: Opus 5.5 US$4 input / US$20 output per million (cited above); per-run reservation 3.00 (2.95 model guard + 0.05 render) as in the harness.

| # | Test | Runs | Calculated max/run | Max total | Expected (measured basis) |
|---|---|---|---|---|---|
| M-A | R1 owner-path production acceptance `/motion 15s explain photosynthesis` | 1 | **done** (ceiling 2.00) | 0 left | settled 1.2782 |
| M-B | R2 activation acceptance, 9:16 15 s, production | 1 | 3.00 (proposed ceiling, 8.4) | 3.00 | 0.71 (M4) |
| M-C | 60 s model-built retry on the dev renderer after the container fix (M3 pattern) | up to 2 | 3.00 | 6.00 | 1.3-1.9 each (M3-r6 1.2778 + repair) |
| M-D | 45 s model-built, dev renderer | 1 | 3.00 | 3.00 | ~1.4 (between M6 1.76 at 30 s and M3-r6) |
| M-E | production acceptance of 45 s and 60 s (owner path) once enabled | 2 | 3.00 | 6.00 | ~1.4 each |
| M-F | dev renderer fixture re-run of the enabled pairs after the container fix + temp `performance-4x` option | ~25 fixtures | 0.0138 each (ledger bound) | 0.35 (+ <= 1.00 optional `performance-4x`, section 5.3) | ~0.2 |
| | **Required subtotal (M-B..M-F without the optional 1.00)** | | | **18.35** | **~7.0** |
| M-G (OPTIONAL) | model-built coverage for enabled pairs that only have fixtures (17 of 22: 16:9 at 5, 20, 25 s; seven other ratios at 15 s; seven other ratios at 30 s). Recommended subset: 6 runs (1:1 15, 3:4 15, 4:3 15, 16:9 20, 1:1 30, 4:5 30) | 6 (17 for all) | 3.00 | 18.00 (51.00 for all 17) | ~6.6 (all 17: ~19-25) |

Required max 18.35 vs 22.354 left: fits. The optional subset (18.00) would exceed the bucket's remainder by 14.0 at maximums but not at expected cost (~6.6); the ledger only holds one 3.00 reservation at a time per sequential run. **Do not run all 17**: it is the only item that
would not fit the Motion allocation at expected cost plus the required set (~7.0 + ~19-25).

### 8.2 Image generation and editing across the four models (bucket 30; 29.397 left)

Prices (cited sources in 7 and 4): Nano Banana 2.1 US$30 per million image tokens, US$7.50 text/thinking, US$0.0336 per 1K image; Nano Banana Pro US$120 per million image tokens, US$0.134 per 1K/2K image, US$0.24 per 4K, US$0.0011 per input image;
gpt-image-2.5-sunburst/-flare US$5 text input, US$8 image input, US$30 image output per million (https://developers.openai.com/api/docs/pricing); OpenAI publishes no per-image table for 2.5. Measured: sunburst 1K low US$0.005975 (196 output tokens), flare 16:9 2K low US$0.004805 (157 tokens),
sunburst edit 2 refs low US$0.010171, NB2.1 1K 1:1 upper bound US$0.0555, 16:9 US$0.0569, Pro 1K upper bound US$0.1462.

| # | Run (deployed acceptance of the validated allowlist) | Runs | Calculated max/run | Max total |
|---|---|---|---|---|
| I-1 | sunburst generate 1K low 1:1 | 1 | 0.03 | 0.03 |
| I-2 | sunburst edit, 2 references, 1K low | 1 | 0.07 | 0.07 |
| I-3 | flare generate low (1K or 16:9 2K) | 1 | 0.03 | 0.03 |
| I-4 | NB2.1 generate 1K | 1 | 0.08 | 0.08 |
| I-5 | NB2.1 edit, 1 reference, 1K | 1 | 0.065 | 0.065 |
| I-6 | Pro generate 1K (image 1120 tok x US$120/M = 0.1344 + thinking <= 0.024 + input) | 1 | 0.17 | 0.17 |
| I-7 | Pro edit, 1 reference (**not yet validated**: validate once in the dev harness, then once in production) | 2 | 0.17 | 0.34 |
| I-8 | one repeat allowance for a failed run (the first failure only; stop on the second) | 1 | 0.17 | 0.17 |
| | **Required subtotal** | | | **0.955** (expected ~0.55) |
| I-9 (OPTIONAL) | price/option probes: NB2.1 4K (page US$0.113 vs 2,520 tok x 30 = 0.0756: unresolved), NB2.1 2K, Pro 4K | 3 | 0.14 / 0.08 / 0.27 | 0.49 |
| I-10 (OPTIONAL) | OpenAI quality ladder at 1K and 2K for both models: medium, high (8 runs at an assumed 0.30 reserve) and xhigh, max (8 runs at an assumed 0.50) | 16 | 0.30 / 0.50 (**assumption**: no official token table; run the cheapest first and stop if a measured cost exceeds the assumption) | 6.40 |
| I-11 (OPTIONAL) | Gemini ratio/resolution coverage (2 models x 3 resolutions x 3 ratios) | 18 | NB 0.14, Pro 0.27 | 3.69 |
| | **Optional subtotal** | | | **10.58** |

Total image (required + optional) max 11.6 against 29.397 left: the 30 allocation is about 2.5x what the four models need even with every optional line.

### 8.3 Other feature acceptance (bucket 20)

| # | Test | Runs | Calculated max/run | Max total | Basis |
|---|---|---|---|---|---|
| O-1 | Ctrl+K background removal: dev clone 3 images, then production 2 (fixed `low`, 1024x1024, `inline-image-edit-provider.js:125`) | 5 | 0.05 (assumption: input image <= ~4,000 tokens x US$8/M = 0.032 + <= 400 output x 30/M = 0.012 + text) | 0.25 | measured analog: sunburst edit with 2 refs US$0.0102 |
| O-2 | Ctrl+K regional edit with mask: dev 3, production 1 | 4 | 0.05 | 0.20 | same |
| O-3 | Recorded-answer transcription: 3 runs `gpt-4o-transcribe` + 3 runs `gpt-transcribe` (the replacement), <= 3 min each | 6 | 3 min x 0.006 = 0.018 | 0.11 | OpenAI pricing page: US$0.006/min and US$0.0045/min |
| O-4 | /video (FAL): dev 3 (2 s, 5 s, reference-to-video) + production 1 | 4 | 0.21 (12 s 480p) | 0.84 | section 4; expected 0.25 |
| O-5 | Maths animation: renders dev 2 + production 2, with 4 Tutor authoring model calls | 4 | render 0.0071 + authoring reserve 0.12 | 0.51 | section 3.3; authoring analog: Tutor planner call US$0.0203 for 2.4k in / 0.5k out |
| O-6 | CAD review-first (3 model calls) production job x2: `CAD_MAX_USD` 0.20 must be re-priced (proposal 0.30) | 2 | 0.30 | 0.60 | **counts against CAD's own US$10/month model line**, not the shared cap (cad-production.md); listed so nothing is hidden |
| O-7 | File conversion production fixtures (DOCX, PPTX, WAV, STEP) + format matrix (PPT, ODT, ODP, RTF, MP3, OGG, M4A, FLAC, AIFF, WebM, AP242) | ~20 jobs | Fly compute+egress < 0.02 | 0.30 | section 1.3 |
| O-8 | Dynamic Workers retest | 4 programs | 0 | 0 | section 2.5 |
| O-9 | Telemetry | 0 | 0 | 0 | section 6 |
| O-10 | Tutor general rubric / visual assessment real-model quality check (Task 15) | **not approved, not budgeted**; formula if wanted: runs x (one Opus 5.5 call at ~2.4k in / ~0.5k out = US$0.02) + judge calls | - | - | audit O-6 recommends deferral |
| | **Total** | | | **2.81** (expected ~1.2) | |

### 8.4 Motion per-job limit (separate from the cap; the protection stays)

The validation guard refuses a call if spent + in flight + that call's worst case would pass the per-job ceiling (US$2.95 model + 0.05 render = **3.00**). Peak guard need for the planned paths, from the recorded per-call worst cases (`M3-r6/ledger.json`: 0.3341, 0.3508, 0.3725, 1.3239, 0.453, 0.4573; patch repair <= 24,000 tokens x 20/M = 0.48 + input):

- 5-30 s and 45/60 s **with the patch repair**: peak need ~1.7 on the recorded path, ~2.5 on the worst case (Author at its 64,000-token cap, actual 1.33; then repair worst 0.6; then the second review pair). That is below 2.95. **No planned test exceeds US$3.00; keep 3.00.**
- The only path that exceeds it is a whole-source Author resend after a capped Author (M3-r3 and M3-r4 died exactly there: "$1.7750 spent ... this call may cost $1.38", "$1.7911 spent ... may cost $1.5965"): 0.39 + 1.33 + 0.15 + 1.60 = 3.47, plus a review 0.46 = 3.93. That path is replaced by the patch repair and is not planned. If the owner *wants* it enabled for 45/60 s runs only, the new limit would be **US$4.50** (3.93 rounded up with the render allowance); I do not recommend it.
- Production (Worker/orchestrator) is a different bound: the Worker holds `MOTION_JOB_RESERVATION_USD` 8.96 (policy worst case of 9 calls at their caps; a hold against the learner's allowance, released at settlement, not cash) and the orchestrator ceiling `MOTION_JOB_CEILING_USD` is "2.00" for the R1 window. The package's R2 step *removes* that ceiling before the 9:16 acceptance job. **Proposal: do not remove it for the acceptance job; replace 2.00 by 3.00 (same calculation as above, a 15 s job's peak need ~2.2) and remove it only at public activation.** The protection is never silently dropped.

### 8.5 Totals

| | Max (calculated) | Expected |
|---|---|---|
| Required tests (Motion 18.35 + Image 0.955 + Other 2.81) | **22.12** | ~8.8 |
| Optional (Motion subset 18.00 + temp perf-4x 1.00 + Image 10.58) | 29.58 | ~13 |
| Already spent + reserved | 18.25 | 18.25 |
| **Worst case, required only** | **40.4** | ~27 |
| **Worst case, required + all optional** | **70.0** | ~40 |

The US$100 cap holds every line including all optional ones with US$30 to spare; the realistic outlay is about US$27-40 total (of which US$18.25 is already recorded). The Image (30) and Other (20) allocations will be mostly unused; the shared reserve of 10 is enough. If the owner wants a tighter cap, US$60 covers everything required plus the optional Motion subset.

## 9. OWNER ACTIONS: one consolidated approval, all prepared commands, ownership

### 9.1 Consolidated spending approval text (for the owner to approve or edit)

> I approve, for the approved features only: (1) two new Fly apps in the rabbit-hole org, `rabbit-hole-convert-prod` (shared-cpu-2x 4 GB, one machine, no volume, auto-stop) and `rabbit-hole-math-renderer-prod` (shared-cpu-2x 4 GB, one machine, no volume, auto-stop), with expected new
> recurring cost US$2.6 to US$4.6 per month and a ceiling of US$15 per month; (2) the Cloudflare Workers plan I already pay for, with no new purchase, and US$0 incremental for FILE_JOBS, telemetry and Dynamic Workers (<= 1,000 unique programs per month); (3) prepaid provider credit: Google Gemini +US$5 only if the
> optional Gemini coverage is run, fal US$1, OpenAI no new credit if the project balance is at least US$10; (4) the Anthropic workspace monthly limit raised to cover the Motion tests (required maximum US$18.35, expected about US$7) for October 25-31 and again from November 1; (5) a shared validation cap of US$100 in total, including US$18.25 already
> spent or reserved, allocated Motion 40, Image 30, other acceptance 20, reserve 10, with the per-job Motion guard kept at US$3.00 and the production acceptance ceiling at US$3.00 until public activation. Anything beyond this needs a new approval.

### 9.2 Prepared commands (NOT run; per CLAUDE.md each mutating script is tested only in the enforced offline harness before the owner is asked to run it, and the owner runs it)

Setup (names only, prints nothing; same pattern as the telemetry package):
```bash
export CLOUDFLARE_API_TOKEN="$(grep -m1 '^CLOUDFLARE_API_TOKEN=' C:/Users/cyudhist/Desktop/workspace/small-deploy/.env | cut -d= -f2-)"
export CLOUDFLARE_ACCOUNT_ID="$(grep -m1 '^CLOUDFLARE_ACCOUNT_ID=' C:/Users/cyudhist/Desktop/workspace/small-deploy/.env | cut -d= -f2-)"
cd C:/Users/cyudhist/Desktop/workspace/<release-worktree>/packages/web      # a checkout of the released SHA
```
Flags below were confirmed with `--help` today: `fly apps create --name --org`, `fly secrets import --stage` (reads NAME=VALUE pairs on stdin), `fly deploy --config --remote-only --ha --app`.

A. File converter (after the engineering items in 10.1 exist: `fly.prod.toml`, a `--target prod` option in `context.sh`, the FILE_JOBS plumbing release):
```bash
fly apps create rabbit-hole-convert-prod --org rabbit-hole                       # fails if the name is taken: then stop and report
T=$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))")   # CONVERT_TOKEN (64 chars), held only in this shell
printf 'CONVERT_TOKEN=%s\nCONVERT_ALLOWED_ORIGINS=https://digrabbithole.com\n' "$T" | fly secrets import --stage -a rabbit-hole-convert-prod
printf '%s' "$T" | npx wrangler secret put CONVERT_TOKEN --name rabbit-hole-app
unset T
node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))" | npx wrangler secret put FILE_JOB_SECRET --name rabbit-hole-app
CTX=$(mktemp -d); sh ../file-convert/context.sh "$CTX"   # prints the deploy line; the prod toml must be the one it copies
fly deploy "$CTX" --config "$CTX/fly.prod.toml" --remote-only --ha=false -a rabbit-hole-convert-prod
curl -s https://rabbit-hole-convert-prod.fly.dev/health      # EXPECT ok:true, converters office-pdf/3 slides/3 audio-playback/1 step-glb/1, slots 2
npx wrangler secret list --name rabbit-hole-app               # EXPECT CONVERT_TOKEN and FILE_JOB_SECRET listed (names only)
```
The Worker vars `CONVERT_URL` and `FILE_JOB_ORIGIN` are committed config in the FILE_JOBS/converter candidate, not commands (contract 2.2/7.1). The file-jobs contract designs one owner command with the typed phrase `SET FILE JOBS SECRETS` that does the secret steps above; use that script once it passes its harness test instead of typing the lines by hand.

B. Maths renderer (needs `packages/math-renderer/fly.prod.toml`, 10.1):
```bash
fly apps create rabbit-hole-math-renderer-prod --org rabbit-hole
T=$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))")
printf 'MATH_WORKER_TOKEN=%s\n' "$T" | fly secrets import --stage -a rabbit-hole-math-renderer-prod
printf '%s' "$T" | npx wrangler secret put MATH_WORKER_TOKEN --name rabbit-hole-app
unset T
printf '%s' 'https://rabbit-hole-math-renderer-prod.fly.dev' | npx wrangler secret put MATH_WORKER_URL --name rabbit-hole-app
cd C:/Users/cyudhist/Desktop/workspace/<release-worktree>/packages/math-renderer
fly deploy --config fly.prod.toml --remote-only --ha=false -a rabbit-hole-math-renderer-prod
curl -s https://rabbit-hole-math-renderer-prod.fly.dev/health     # EXPECT version math-1-<hash>/0.18.1 (the dev app reported math-1-93addb3f515d/0.18.1)
```
C. Provider keys: section 7 (`prod-image-secrets.mjs --dry-run`, then the real run). D. Dynamic Workers retest: section 2.5. E. Motion R2 and the 45/60 s steps: `bash C:/s/spec/motion-validation/motion-deploy.sh activate` (existing; the owner binding order in `deploy-package.md`). F. Telemetry: nothing to create; production binding candidate and `RELEASE` per activation-package.md.
G. Console actions (no command): Anthropic Console (workspace monthly limit), Google AI Studio billing (balance/top-up only if optional), fal dashboard (credits, deprecation notice on the Lite endpoint), OpenAI (prepaid balance and project limit), Cloudflare Billing page (confirm Workers Paid is active; read-only look).

## 10. BLOCKED BY ENGINEERING, NOT BY MONEY

1. **File converter:** no `packages/file-convert/fly.prod.toml` (and the repo pattern's test equating it to the dev toml); `context.sh` copies only `fly.dev.toml` and prints dev app names, so it needs a prod target; `FileJobs` is not exported by `app-worker.js`, no `FILE_JOBS` binding, no `file-jobs-1` migration in the prod config (the FILE_JOBS lane's plumbing candidate; full gate; owner `RELEASE`); the secrets owner script and its offline-harness test; format fixtures never run for PPT/ODT/ODP/RTF/most audio/AP242.
2. **Maths animation:** no `fly.prod.toml`; `maths_animation` is already `ready:true` while unconfigured (a paid proposal that fails), no availability preflight (audit O-7); the playback/placement checklist item in learn-math-animation.md is open; peak RAM and image size unmeasured.
3. **/video:** the adapter is pinned to the Lite endpoint whose deprecation status conflicts across fal pages; `LEARN_VIDEO_PROVIDER` is not in the prod config; same preflight gap; shared review card deferred (O-9).
4. **/generate-image:** three code gates closed (`IMAGE_GENERATION=false` build constant, primitive `image_generate ready:false`, server flag false) plus `IMAGE_GENERATE_RESERVED_USD` unset and the owner-only acceptance gate (image-activation lane, unpushed); OpenAI has no price row for anything beyond measured low quality; Pro edit and NB2.1 4K/with-references are unvalidated or unpriced.
5. **Ctrl+K image edit / background removal:** needs FILE_JOBS, `INLINE_IMAGE_EDIT_ENABLED` and `INLINE_IMAGE_EDIT_RESERVED_USD`, and a check that `GET /api/learn/files/image-edits` (`maximumReservedUsd`) never shows dollars to users; real segmentation quality never verified.
6. **Ctrl+K JavaScript:** the retest in 2.5; then `worker_loaders` in the config, four `INLINE_CODE_*` vars (policy frozen on first use), deployed termination/memory proof; run-cost shown in micros today while users see credits only.
7. **Motion:** the 60 s container-duration fix changes the renderer hash (dev redeploy, fixture re-run, `MEASURED_RENDERER_CODE_HASH` update); the static composition gate classifies the timing-out heavy fixtures as `simple`; 45/60 s are not in the policy; R2 config-only release and `motion-deploy.sh activate`; open items in `motion-open-gaps.md`.
8. **Telemetry:** the production binding candidate (4739b415) waits for the safeguards re-review and the owner's GO; retention pruning, exports and billing reconciliation (increment 5) do not exist.
9. **Transcription:** `gpt-4o-transcribe` shuts down 2027-02-26 (audit); migrate to `gpt-transcribe` (US$0.0045/minute) before January.
10. **CAD review-first:** `CAD_MAX_CALLS` 2 to 3 and re-priced `CAD_MAX_USD`; executor transfer budget 96% reserved until Nov 1.

## 11. FINAL TABLE (owner's format)

New monthly cost = new recurring infrastructure only (usage charges that scale with learners' actions are in the notes). One-time test budget = calculated maximum (expected in brackets). ETA PT = conditional clock times; "not derivable" where the dependency has no known completion time.

| Item | What it unlocks | One-time test budget | New monthly cost | Exact owner action | Owner | ETA PT |
|---|---|---|---|---|---|---|
| File conversion (prod converter + FILE_JOBS) | Word/legacy Word to PDF, PPTX to slide cards, STEP to 3D mesh, audio playback in production; also the shared dependency of Ctrl+K image edit and JS | US$0.30 (O-7) | **US$1.10 / 2.57 / 10.46** (5 / 20 / 100 bursts per day); planning figure US$2.6 | Approve the Fly app `rabbit-hole-convert-prod`; run commands 9.2-A once the prod toml, `context.sh` target and FILE_JOBS plumbing release exist; `RELEASE` for the plumbing candidate | owner (approve, secrets, RELEASE); file-jobs and file-convert lanes (code) | provisioning: about 15 min after GO (image build measured 3 min 44 s on a comparable CAD image); live: not derivable until the plumbing candidate exists (then ~13 min CI + ~10 min gate + RELEASE) |
| JavaScript execution | Ctrl+K "Run" on a JavaScript code object | US$0 | **US$0** (<= 1,000 unique programs/month; US$18 per extra 9,000) | Run the 2.5 probe (integrator, ~10 min); if 10195: decide on Workers Paid US$5/month, otherwise nothing to buy | integrator runs; owner decides only on 10195 | probe result 10-15 min after the integrator starts; feature live: not derivable (code, FILE_JOBS, deployed proof) |
| Maths animation | Tutor "maths animation" actually renders (stops failing) | US$0.51 | **US$0.8-1.0 / 1.3-2.1 / 2.3-4.3** (50 / 200 / 500 renders); floor US$0.60 | Approve `rabbit-hole-math-renderer-prod`; run commands 9.2-B after `fly.prod.toml` is committed | owner; scene/video lane (toml) | ~15 min after GO and the toml; live: not derivable |
| /video (FAL) | `/video` clips; removes the "not configured" failure | US$0.84 (expected 0.25) | **US$0** fixed; ~US$8.7 per 100 five-second 480p clips (usage) | Confirm fal credit >= US$1 and the Lite endpoint status in the fal dashboard; run the key script (after its harness test); config candidate adds `LEARN_VIDEO_PROVIDER` | owner (credit, key); scene/video lane (script, config) | not derivable (script test + candidate + release) |
| Motion | Public Motion at 5-30 s (22 pairs), then 45/60 s | required US$18.35 (expected ~7.0); optional +US$19 | **US$0** fixed (1 GB volume US$0.15 already done); ~US$0.03 per 30 s job compute | Raise the Anthropic workspace limit (Console); approve the Motion line and the US$3.00 acceptance ceiling; run `motion-deploy.sh activate` (R2) | owner; Motion lanes | R2 + 9:16 acceptance: about 1 hour after the owner's GO (the R1 infrastructure steps ran 7:06-9:12 PM PT per the Fly machine create/update timestamps and the acceptance job settled at 9:39 PM PT; a 15 s job takes 7-10 min wall (M4 441 s, M1 577 s)); 45/60 s: not derivable (renderer change + re-measure) |
| Telemetry | Owner dashboard with real rows | US$0 | **US$0** (within Workers Paid inclusions at <= 100,000 events/day); doc bound US$1.54 at 10k/day if all rows were overage | Nothing to buy; give the production GO after the safeguards re-review (`RELEASE` of the binding candidate) | owner (GO); telemetry lane | not derivable: safeguards review + owner GO |
| Image generation + editing (4 models) | `/generate-image` after the three gates are opened | required US$0.96 (expected 0.55); optional +US$10.58 | **US$0** fixed (usage is learners' credits / platform per image US$0.005-0.17) | Run `prod-image-secrets.mjs` (dry run, then real); Gemini +US$5 only if the optional coverage is run; confirm OpenAI balance >= US$10 | owner; image-activation lane (gates, owner-only path, candidate) | keys: ~5 min after the owner's go; feature: not derivable (O-1, candidate, gate) |
| Ctrl+K image edit + background removal | Edit/remove background on images | US$0.45 (O-1 + O-2) | **US$0** fixed (~US$0.01-0.05 per edit) | same OpenAI key as above (one key, not two); approve `INLINE_IMAGE_EDIT_RESERVED_USD` (proposal US$0.05) | owner; image lane | after FILE_JOBS: not derivable |
| Recorded-answer transcription | Speak-answer mic stops returning 503 | US$0.11 | **US$0** fixed (US$0.006 per minute; US$0.0045 after migration) | comes with the OpenAI key; decide keep vs remove mic (O-8) | owner | with the key: ~5 min; model migration before 2027-01 |
| CAD review-first | CAD controls, Quick edit, dimensions | US$0.60 (CAD's own US$10/month line) | **US$0** (inside the existing CAD authorization US$45/month) | none for money; owner decision O-5 | owner; CAD lane | after Nov 1 (executor budget) |
| Provider limits | nothing alone: it is the access that lets every paid run proceed | included above | US$0 | Anthropic workspace limit; Google balance; fal credit; OpenAI balance (section 7) | owner | 5-10 min each, owner-timed |
| **Package total** | | **Required US$22.12 max (~8.8 expected); optional +US$29.58; already spent/reserved US$18.25** | **US$2.6-4.6 expected; US$1.2 floor; US$15 high ceiling (target <= US$30 met)** | the approval text in 9.1 | | |

**Existing recurring costs (not new; listed to separate them):** Cloudflare Workers Paid US$5/month (account minimum, evidenced not proven); CAD ongoing authorization up to US$45/month (US$35 infrastructure + US$10 model; machine `rabbit-hole-cad-prod` shared-cpu-2x 4 GB + 1 GB `cad_budget` volume US$0.15);
Motion renderer `performance-2x` 4 GB (US$0.0917/hour only while a job runs; US$66/month would be the never-stop ceiling), orchestrator `shared-cpu-2x` 2 GB (US$0.0186/hour running; US$13.39/month ceiling), prod volume US$0.15/month, dev renderer + 1 GB dev volume US$0.15/month (destroy after validation; ledger reserve 0.25);
`rabbit-hole-lesson-renderer-prod` `shared-cpu-1x` 2 GB (US$0.0176/hour running, US$12.66/month ceiling); stopped-disk charges for the dev apps (`convert-dev`, `lesson-renderer-dev`) and for 15 suspended `small-*` apps in the *personal* Fly org (one of them is the dev maths renderer, whose machine is stopped, so rootfs is billed);
Resend plan (unknown); AI provider usage (credits). Telemetry D1/R2 already exist and cost US$0 (empty).

## 12. What I could not verify

- The Workers plan through any API (billing scope absent, subscriptions 403): the evidence is the owner's upgrade recorded in webcard-blockers.md plus the Browser Rendering limits; the throwaway retest in 2.5 is the proof.
- Fly: the org's actual billing, any credit, the real uncompressed image sizes (rootfs costs use an assumed 4 GiB), the Fly per-second table (the page's table rendered empty; hourly/monthly prices are from fly.io/pricing and docs.fly.io), remote-builder pricing, the proxy's exact idle-stop delay (assumed 300 s tail), and whether `rabbit-hole-convert-prod` / `rabbit-hole-math-renderer-prod` are free names globally.
- Math renderer: peak RAM, render times beyond the single 18.9 s sample, image size.
- Provider balances and limits: OpenAI prepaid balance and project limit, Google remaining prepay (estimated US$4.6 from ledger upper bounds), fal credit balance, Anthropic's new workspace limit value and month-to-date usage; fal's Lite deprecation (two fetches disagree); OpenAI per-image cost for any quality above `low`; Gemini NB2.1 4K price (page contradicts its own token arithmetic); Resend plan.
- Ctrl+K edit per-run maximum (US$0.05) is a bound I derived from token rates, not a measured figure; the OpenAI higher-quality reserves (0.30 / 0.50) are assumptions to be replaced by the first measured run.
- Dynamic Workers: memory limits, account restrictions and the per-month vs per-day meaning of the 1,000 allowance are not stated on the pages I fetched.
- The Cloudflare WAF rate-limit rule quota on the Free zone; that the `shared` ledger figures stay fixed while other lanes run (it moved from 16.7213 to 17.9994 during this work).
- Anything signed-in, browser, or deployed behavior (not mine to run).
