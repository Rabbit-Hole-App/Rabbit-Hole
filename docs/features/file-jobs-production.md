# FILE_JOBS production contract

Ledger task 6570266e-f94c-4d55-9ee8-f3197f1339b4, parent audit 2c188ed7-c5b4-4bcd-8d7b-a0ce4b81d11d.
Base: rabbit-hole/main 29622d8e92d637cb433824c7835f012285e2f5dd. Written 2026-10-25 (PT evening). Read-only research; nothing deployed, nothing set.
Plumbing candidate: branch `infra/file-jobs-plumbing` (binding, migration, export, config tests; every feature disabled).

## 0. Read this first

**Binding the FILE_JOBS Durable Object completes none of the three features.** It is shared plumbing only. After it ships:
- file conversion still needs a deployed production conversion service (new Fly app, not yet created), two secrets and three vars;
- Ctrl+K image editing/background removal still needs `OPENAI_API_KEY`, a reservation var, the enable flag, and a real-provider acceptance run (paid);
- Ctrl+K JavaScript execution still needs Dynamic Workers (Workers Paid plan; plan state unconfirmed, section 5), a `worker_loaders` binding, four vars, and a deployed-runtime acceptance run.
Deployed-but-disabled is incomplete (CLAUDE.md "Production GO means a usable feature"). The plumbing candidate is a prerequisite, not a deliverable of any feature.

## 1. Facts verified (read-only)

| Fact | Evidence |
|---|---|
| ONE Durable Object class `FileJobs` (control-plane/src/file-jobs.js:229) serves all three features, multiplexed by object NAME and URL prefix: conversion = `idFromName(fj_<24 hex>)`; image edit = `image-edit:<id>` via `/image-edit/*` (inline-image-jobs.js:33); inline code = the single object `inline-code:global-v1` via `/inline-code/*` (inline-code-route.js:54). `fetch` and `alarm` dispatch to the inline modules first. | file-jobs.js:229-253 |
| So the production need is exactly one binding `FILE_JOBS`/`FileJobs` and one migration. Nothing per feature. | same |
| State uses only `state.storage.get/put/list/setAlarm/deleteAll` (KV-style API). Dev and parallel create it with `new_sqlite_classes` tag `file-jobs-1`; canvas-file-imports.md section 5.3 already specifies the same. | wrangler.dev.jsonc:66, wrangler.parallel.jsonc, canvas-file-imports.md:346 |
| `app-worker.js` is the production entry (`"main": "app-worker.js"`). It re-exports only `RepositoryImports, LearnScenes, LearnVideos, CadJobs, ExplainJobs, ImageJobs` from dev-worker.js; **`FileJobs` is exported by dev-worker.js:20 but NOT by app-worker.js**. Binding it in prod without that export fails the deploy. | app-worker.js:8 |
| The routes already run in production code (dev-worker.js:340-344, reused by app-worker): `/api/learn/code-runs`, `/api/learn/files/image-edits`, `/api/learn/files/*`. They answer unavailable today because `env.FILE_JOBS` is absent. All three feature routes run in the APP Worker (`rabbit-hole-app`), not in `rabbit-hole-cp`; every var/secret below goes on the app Worker only. | dev-worker.js, cp index.js has no import of file-jobs |
| Production LEARN_DB (`rabbit-hole-learn-prod`) ALREADY has `file_sources, file_jobs, file_derivatives, file_documents, file_document_revisions, file_source_refs` (read-only SELECT on sqlite_master, 2026-10-25). **No D1 migration is needed.** | wrangler d1 execute --remote, SELECT only |
| Prod app Worker today: 6 DO bindings (LEARN_VIDEOS, LEARN_SCENES, REPOSITORY_IMPORTS, CAD_JOBS, EXPLAIN_JOBS, IMAGE_JOBS), 25 plain vars + 23 secrets (names read from the deployed settings), no `worker_loaders`. Prod migration tags in order: learn-videos-1, learn-scenes-1, repository-imports-1, cad-jobs-1, explain-jobs-1, image-jobs-1. | prod config, API settings (names only) |
| CAD does not depend on FILE_JOBS: it has its own `CadJobs` DO and `CAD_JOB_SECRET`; it reuses only the token functions from file-jobs.js. | cad-jobs.js:21 |
| With `FILE_JOBS` bound but the converter unconfigured, the conversion submit is NOT refused: it returns 201, then the job settles `failed` with "File conversion is not configured on this server." (stepJob, file-jobs.js:158). Today (unbound) submit answers 503 "not available". Both are unavailable to the user, but binding adds D1 rows and a DO alarm per attempt. `file-step-retry-check.mjs` asserts this failure/retry identity, so the behaviour is deliberately NOT changed by the plumbing candidate. | file-jobs.js:158, :453; check-map.json:859 |
| Image edit and inline code are gated by explicit env flags that are absent in prod, so with the binding alone they still answer "not available / not configured". | inline-image-jobs.js:12, inline-code-route.js:71 |

## 2. The production contract

### 2.1 Durable Object binding and migration (the plumbing candidate)

`packages/web/wrangler.rabbit-hole-prod.jsonc`:

```jsonc
// in durable_objects.bindings (append):
{ "name": "FILE_JOBS", "class_name": "FileJobs" }
// in migrations, APPENDED LAST (after image-jobs-1):
{ "tag": "file-jobs-1", "new_sqlite_classes": ["FileJobs"] }
```

- **`new_sqlite_classes`, not `new_classes`**: same as dev/parallel and the spec; production already uses SQLite classes everywhere; the class uses the storage KV API which SQLite-backed objects support. This choice is permanent for the class (cannot be changed later).
- **Tag `file-jobs-1`** is the same string dev uses. Tags are unique per Worker, not global; prod has never applied it. It goes LAST in prod (a tag listed before an already-applied one is never run: the existing test comment records this). Dev lists it earlier, so the prod config test must append it, as it already does for cad/explain/image.
- `packages/web/app-worker.js:8` must add `FileJobs` to the re-export list. The tripwire entry (`e2e/tripwire-app-worker.js`) does `export *` from app-worker, so it follows automatically; the existing config test ("every Durable Object class a web config binds is exported by its entry") will FAIL without the export, which is the guard.
- **No vars, secrets or loader in the plumbing candidate.** All flags are absent = disabled.

### 2.2 Env contract per feature (names only; all on `rabbit-hole-app`)

| Feature | Vars (wrangler.rabbit-hole-prod.jsonc `vars`) | Secrets (`wrangler secret put`, never in config) | Bindings | Safe default |
|---|---|---|---|---|
| File conversion | `CONVERT_URL` (https URL of the prod converter; http only for localhost), `FILE_JOB_ORIGIN` (`https://digrabbithole.com`, the origin the converter calls back to), `FILE_JOB_CONCURRENCY` (optional; leave unset = 2, matching the converter's 2 slots; change only together with the converter's `CONVERT_SLOTS`) | `CONVERT_TOKEN` (service bearer to the converter, >= 32 chars; the SAME value is a Fly secret on the converter), `FILE_JOB_SECRET` (HMAC key for callback tokens, >= 32 chars; Worker-only; must differ from `CONVERT_TOKEN` and from `CAD_JOB_SECRET`) | FILE_JOBS, LEARN_DB, LEARN_MEDIA (all exist except FILE_JOBS) | Unset: conversion jobs fail with the not-configured message |
| Ctrl+K image edit / background removal | `INLINE_IMAGE_EDIT_ENABLED` (`"true"` to enable), `INLINE_IMAGE_EDIT_RESERVED_USD` (per-edit hold, positive number) | `OPENAI_API_KEY` (already optional for IMG-01 and transcription; ONE shared key, not a second one) | FILE_JOBS, LEARN_DB, LEARN_MEDIA | Flag absent: `GET` answers `available:false` |
| Ctrl+K JavaScript execution | `INLINE_CODE_ENABLED` (`"true"`), `INLINE_CODE_MAX_RUNS`, `INLINE_CODE_MAX_MICROS`, `INLINE_CODE_RESERVE_MICROS` (positive integer strings, reserve <= max) | none | FILE_JOBS plus `"worker_loaders": [{ "binding": "INLINE_CODE_LOADER" }]` (the name the code reads; Dynamic Workers) | Flag/loader absent: 503 `not_configured` |

Details feature owners need:
- `FILE_JOB_SECRET` and `CONVERT_TOKEN` are length-checked at 32 chars (file-jobs.js:52,72). Generate with a CSPRNG, 48 random bytes base64url (64 chars).
- The inline-code policy (`MAX_RUNS/MAX_MICROS/RESERVE_MICROS`) is **frozen into the object's storage on first use** (`code:budget`, inline-code-actor.js:13); changing the vars later does not change an object that already stored a policy. Choose the values once, before the first enabled run, or plan a new object name.
- Worker env limit: Free allows 64 vars+secrets per Worker, Paid 128. The app Worker has 48 today (25 + 23). All three features add up to 12 (3 conversion vars + 2 conversion secrets, 2 image vars, 4 code vars, plus OPENAI_API_KEY if not yet set = 11-12). Total about 60: inside 64 but with only ~4 spare if the account is on Free (section 5). Other lanes adding vars (telemetry, Motion) count against the same cap.
- Money: the image reservation is a dollar figure internally. Per the standing rule users see AI credits only; the image/code owners must verify nothing in the UI or the `GET` availability payload shows dollars to a non-operator (`maximumReservedUsd` is returned by `GET /api/learn/files/image-edits` today: owner of inline image must check what the client does with it and whether it must be converted to credits).

### 2.3 Secrets: owner command (design, NOT RUN)

A single owner command in the style of `C:/s/spec/day-1021/with-cf.mjs`, to be written by the converter owner (first deliverable) and run by the owner with `!`:

- reads `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` by name from small-deploy/.env (never printed);
- generates `FILE_JOB_SECRET` and `CONVERT_TOKEN` with `crypto.randomBytes(48).toString('base64url')`, never printed or logged, never written to disk; hands each to `wrangler secret put <NAME> --config wrangler.rabbit-hole-prod.jsonc` on stdin, and `CONVERT_TOKEN` also to the Fly app (`fly secrets import -a <prod converter app>` on stdin);
- `OPENAI_API_KEY` is NOT generated: it is a provider key; the owner supplies it with a hidden prompt (no echo), separately, and only when the image owner reaches paid acceptance;
- refuses to run without the typed phrase `SET FILE JOBS SECRETS`; supports `--dry-run` that provably mutates nothing; refuses to overwrite an existing secret unless `--rotate` is typed (check with `wrangler secret list`, names only);
- **CLAUDE.md rule applies**: before the owner is asked to run it, the script is tested only in the enforced offline harness (no production credentials in env, PATH holding stubs of wrangler/fly, mocks and test in the same process, no env/flag/file-answerable confirmation in the production entry). Incident 2026-10-25 is the reason. Until that harness test exists the script must not be executed with real credentials by anyone but the owner.

### 2.4 Concurrency

The runner is bounded by D1: `FILE_JOB_CONCURRENCY` default 2 active attempts across ALL jobs (claim and slot count in one UPDATE, file-jobs.js ~160). The planned converter is one 4 GB machine with `CONVERT_SLOTS=2`, so the default is right; extra dispatches get 429 and wait (not an attempt). Image and code jobs are separate objects and do not consume conversion slots. Inline code is one global object (`inline-code:global-v1`) by design (a global run budget), so it serialises its own accounting.

## 3. Migration sequencing (single owner)

- **The file-jobs lane (this contract owner) is the ONLY owner of `durable_objects.bindings[FILE_JOBS]`, the `file-jobs-1` migration, and the `FileJobs` export in app-worker.js.** Feature owners MUST NOT add a DO binding, a new class, a migration entry, or an export for these features. All three features reuse the one class; a new class or a `renamed_classes`/`deleted_classes` entry for any of them is out of contract.
- Feature owners may add ONLY: their own `vars` lines (and, for inline code, the `worker_loaders` line), and code/tests/docs under the files in section 7. These touch different keys, so rebases do not conflict in practice; if two edits hit `vars`, resolve by union.
- Any later migration in prod (another lane's DO) goes AFTER `file-jobs-1` and gets the next free tag; confirm main's current tail before adding. If main has moved, rebase and move the line, never reorder applied tags.
- A DO migration is a production schema-like change: it needs the FULL gate and the owner's release command; not reusable under the UI/copy gate-reuse rule (`notReusableBetween` treats config as non-reusable).
- D1: none. Production D1 order (0027 Credits, 0028 Stars, 0029 Weekly Top 5, 0030-0032 Comments) is untouched.

## 4. What existing tests assert, and the changes needed

`packages/control-plane/test/rabbit-hole-prod-config.test.js`:
- Test "the app Worker owns digrabbithole.com...": builds `devOnly` from dev's bindings by FILTERING OUT `FileJobs, CadJobs, ExplainJobs, ImageJobs` and re-adding the three prod ones, and builds expected migrations by filtering out `file-jobs-1, cad-jobs-1, explain-jobs-1, image-jobs-1` and re-adding three. Change: stop filtering `FileJobs`, add `{name:'FILE_JOBS',class_name:'FileJobs'}` and append `{tag:'file-jobs-1',new_sqlite_classes:['FileJobs']}` last; update the stale comment ("FileJobs ... is dev and parallel only"). Also (new) assert that production names none of: `INLINE_CODE_ENABLED, INLINE_CODE_*, INLINE_IMAGE_EDIT_ENABLED, INLINE_IMAGE_EDIT_RESERVED_USD, CONVERT_URL, FILE_JOB_ORIGIN, FILE_JOB_CONCURRENCY`, and has no `worker_loaders`, so "features disabled" is a failing-on-old-behaviour check. Feature owners update those negatives in the same commit that enables their feature.
- Test "every Durable Object class a web config binds is exported by its entry and the tripwire entry": already covers prod; it will fail until app-worker.js exports FileJobs. No change.
- Unaffected: forbidden-id scan, `no -dev names` (FILE_JOBS adds none), vars key pattern (`TEST|OAUTH_MOCK|^FLY_|SUBSCRIPTION`).
- Dev/parallel configs: unchanged (still bind FILE_JOBS with tag `file-jobs-1`). Their test (`rabbit-hole-dev-config.test.js`) is not affected.
- Other tests that exercise FileJobs (file-jobs.test.js, file-jobs-integration.test.js, inline-*.test.js) do not read the prod config.
- CI: `check-map.json` maps app-worker.js (line 14) and `packages/file-convert/**`; the two converter checks are `windows-only` and drive the dev converter (not run in fast-e2e). Report which checks fast-e2e actually selected for the candidate; do not claim browser coverage.

## 5. INLINE_CODE_LOADER: Dynamic Workers (re-checked from Cloudflare docs, 2026-10-25)

- Official docs (developers.cloudflare.com/dynamic-workers/pricing): "Dynamic Workers are currently only available on the **Workers Paid plan**." Config is a `worker_loaders` binding (e.g. `"worker_loaders":[{"binding":"LOADER"}]`), used as `env.LOADER.load()` (docs/getting-started). Open beta since 2026-03-24.
- Pricing (same page): included monthly 1,000 unique Dynamic Workers, 10 million requests, 30 million CPU-ms; beyond that **$0.002 per unique Dynamic Worker per day**, $0.30 per million requests, $0.02 per million CPU-ms (requests/CPU on the normal Workers bill). A Dynamic Worker is unique by (Worker ID, code): each distinct user program counts. Billing for the created-daily dimension started 2026-05-26. Workers Paid itself is $5/month minimum per account (workers/platform/pricing); it also includes Durable Objects and the D1 inclusions the repo already prices (50M rows written/month).
- The historical error 10195 "In order to use Dynamic Workers, you must switch to a paid plan" came from a deployment to the SAME Cloudflare account (`rabbit-hole`, c08d3dbdc53a3afd3cb09a536ac42318; dev and prod configs pin the same account id) on 2026-10-19 (evidence/ctrlk-source-derivative-dev-2026-10-19.md). That is the best evidence that the account was on the Workers FREE plan on 2026-10-19.
- **Could not confirm the current plan.** The deploy token lacks billing scope (`GET /accounts/<id>/subscriptions` returns 403 Authentication error); `GET .../workers/account-settings` and script settings return `usage_model: standard` for the app, which does not distinguish Free from Paid. Inconclusive signals: bundle size (the 3 MB/10 MB compressed caps were removed 2026-09-04), 48 of 64 env entries used (consistent with either). Docs in the repo give no statement of the Workers plan; the "Free plan" in rabbit-hole-production.md:263 is the **zone** plan for digrabbithole.com, not the Workers plan.
- Consequence for the plumbing candidate: **do NOT add `worker_loaders` to the production config.** On a Free account a deploy that contains it is rejected with 10195, which would block the whole production app release. The loader line belongs to the inline-code candidate, to be added only after the plan is confirmed Paid.
- Priced proposal (only if inline code is wanted in production; NOT a request to purchase): Workers Paid $5/month (account-wide, benefits every Worker), plus Dynamic Workers usage: at most `INLINE_CODE_MAX_RUNS` runs; if all distinct, runs beyond 1,000/month cost $0.002 each (10,000 runs/month is about $18); requests and CPU are inside the included 10M / 30M CPU-ms at this scale. One owner fact is needed and cheap: whether Workers Paid is already active on the `rabbit-hole` account (Billing page; I cannot read it). If it is, there is no purchase at all.
- Inline code is also the only feature with no deployed-runtime proof (CPU termination, memory) and with its own accounting (micros, global budget, not Credits). It should be sequenced last.

## 6. The conversion service (packages/file-convert)

- Only a DEV app exists and is documented: `rabbit-hole-convert-dev` (Fly org `rabbit-hole`, `packages/file-convert/fly.dev.toml`, canvas-file-converter.md). `fly auth whoami` works (yudhisteer.chin@gmail.com); read-only `fly status -a rabbit-hole-convert-dev`: owner rabbit-hole, host rabbit-hole-convert-dev.fly.dev, one machine, version 9, region iad, started, 1/1 checks passing.
- **No production converter is documented or deployed** ("Production hosting is undecided", canvas-file-converter.md section 1.8 and 4). I did not probe for undocumented apps. There is no `fly.prod.toml` for file-convert (cad-execute and lesson-renderer have one; the repo's pattern is `rabbit-hole-<service>-prod` with a test that the prod toml equals the dev toml except the `app =` line).
- Needed for production (all owner-authorized new infrastructure; CLAUDE.md: "stop only for genuinely new authority (unapproved infrastructure...)"):
  1. A new Fly app, proposed name `rabbit-hole-convert-prod` (proposal, not verified to be free; check with `fly apps list` before creating), config `packages/file-convert/fly.prod.toml` identical to fly.dev.toml except the app line (2 slots, 4 GB shared-cpu-2x, one machine `--ha=false`, auto-stop by idle). Image build is the same remote build (`sh packages/file-convert/context.sh <dir>`, then `fly deploy ... --remote-only --ha=false`).
  2. Fly secrets: `CONVERT_TOKEN` (same value as the Worker secret) and `CONVERT_ALLOWED_ORIGINS=https://digrabbithole.com` (the converter sends callback tokens only to that origin and refuses other source/callback URLs).
  3. Worker side: `CONVERT_URL=https://rabbit-hole-convert-prod.fly.dev` (var), `FILE_JOB_ORIGIN=https://digrabbithole.com` (var), secrets `CONVERT_TOKEN`, `FILE_JOB_SECRET`.
  4. Callback reachability: the converter calls `https://digrabbithole.com/api/learn/files/jobs/<job>/...` with bearer tokens, no cookies. The zone has no known WAF blocking, but this has never been exercised from Fly to the production origin: the first acceptance step must be one tiny real DOCX job (the dev proof harness `packages/file-convert/proof/` is the reference). The converter is Node, so the Cloudflare 1010 stdlib-Python user-agent block does not apply, but check the response codes anyway.
- Cost (documented estimate, canvas-file-converter.md section 3.2; not measured): about $0.035 per running hour; about $9/month at 100 conversion bursts a day; under $0.20/month idle storage. Owner approval is required for the new Fly app before it is created.

## 7. Feature-owner handoffs

Common: base `rabbit-hole/main` 29622d8e (rebase to current main first; confirm the plumbing candidate has merged, or build on it as a stacked branch). Do not touch `wrangler.rabbit-hole-prod.jsonc` `durable_objects`/`migrations`, nor `app-worker.js` exports (section 3). No browser by Claude; browser checks only through CI/designated runner. Report implemented / unit-tested / browser-tested / deployed / enabled / production-accepted separately. One production GO covers deploy + activation + verification (standing rule), but each paid call, new infrastructure and secret still needs its own owner step.

### 7.1 Converter (Word, slides, audio, STEP)

- Task UUID: `<TBD-converter-task-uuid>` (permanent; to be issued by the integrator).
- Base commit: 29622d8e (plus the plumbing candidate SHA once merged).
- Owns: `packages/file-convert/fly.prod.toml` (new) and a test equating it to the dev toml; the secrets owner command (section 2.3) and its offline harness test; the prod `vars` lines `CONVERT_URL`, `FILE_JOB_ORIGIN`; `docs/features/canvas-file-converter.md` (production section, status table); `scripts/ci/check-map.json` entries for any new check.
- Reads (does not own): `packages/control-plane/src/file-jobs.js`, `packages/web/src/file-jobs-client.js`, FileDocCard/MediaCard/ModelCard UI.
- Dependencies: plumbing candidate released; owner GO for the new Fly app and secrets; a converter image that builds (remote Fly build).
- Existing evidence to reuse: docs/features/canvas-file-converter.md (API, measurements at 71c8f11a/da465927, sandbox), docs/features/canvas-file-imports.md section 5, evidence of the dev proofs in `packages/file-convert/proof/`, `e2e/file-converter-ui-check.mjs` and `file-step-retry-check.mjs` (windows-only, dev converter), tests file-jobs.test.js / file-jobs-integration.test.js.
- Open verification gaps to close or state as unsupported: PPT, ODT, ODP, RTF, MP3/OGG/M4A/FLAC/AIFF/WebM, STEP AP242 and large assemblies (canvas-file-converter.md section 5).
- Acceptance: (a) `/health` of the prod converter OK and its `converters` map matches; (b) one real DOCX, PPTX, WAV and STEP job on digrabbithole.com each reach `ready` with derivatives readable by the owner and refused to another account; (c) kill/retry path observed once (job recovers via the next attempt); (d) cancel works; (e) unconfigured/degraded converter shows the honest message, no dollar amounts; (f) rollback = unset `CONVERT_URL` (jobs then fail with the not-configured message); (g) docs updated to "production-accepted" only after (b)-(d) on the production origin.
- First deliverable: `fly.prod.toml` + test + the secrets owner command with its offline-harness test + the owner request for the Fly app and secrets (cost shown). Estimate: not derivable until the owner decides hosting and grants the Fly/secret GO; code part is one candidate and one gate cycle (the sharded gate takes about 10 min wall per the gate notes); live provisioning and the four fixtures are owner-gated steps, not estimable by me.

### 7.2 Ctrl+K image editing and background removal

- Task UUID: `<TBD-inline-image-task-uuid>`.
- Base commit: 29622d8e (plus plumbing).
- Owns: `packages/control-plane/src/inline-image-*.js`, `packages/web/src/inline-image-job-client.js` and the Ctrl+K image UI wiring, the prod `vars` lines `INLINE_IMAGE_EDIT_ENABLED`/`INLINE_IMAGE_EDIT_RESERVED_USD`, `docs/features/ctrlk-capability-status.md` rows, ctrlk-background-removal-receipt.md, ctrlk-regional-image-receipt.md.
- Dependencies: plumbing; `OPENAI_API_KEY` as a production secret (owner-supplied, hidden prompt; shared with IMG-01 and transcription: coordinate so it is set once); the ledger/Credits admission (`admitSpend/settleSpend`, kind `media`); an owner decision on the reservation amount and on whether to show it in credits.
- Existing evidence: `evidence/image-file-jobs-worker-probe.mjs` and `-receipt.md`, ctrlk-background-removal-receipt.md (browser 5/5 with provider fixtures), ctrlk-regional-image-receipt.md (5/5, mocked job), ctrlk-image-action-receipt.md, `evidence/background-removal-*.mjs`, tests inline-image-jobs.test.js. All of these are fixtures; none is a real provider run.
- Acceptance: (a) real provider run on the dev clone first (PAID: list the model `gpt-image-2.5-sunburst-2026-09-08` cost and ask before spending; the audit says no real-provider quality run exists), then production; (b) reservation, settle and refund observable in the ledger for a success and a failure; (c) an unknown outcome keeps its hold and is visible, no auto-retry; (d) non-owner and cross-origin refused; (e) no dollar amounts to users; (f) the original image preserved; preview then Apply then Undo; (g) kill switch = remove the flag.
- First deliverable: verify the `GET /api/learn/files/image-edits` payload and client never expose dollars to users (credits only), and a paid-run request listing cost. Estimate: not derivable until the owner approves the reservation amount and the paid dev run.

### 7.3 Ctrl+K JavaScript execution

- Task UUID: `<TBD-inline-code-task-uuid>`.
- Base commit: 29622d8e (plus plumbing).
- Owns: `inline-code-route.js`, `inline-code-actor.js`, `inline-code-job.js`, `inline-code-runtime.js`, `packages/web/src/inline-code-client.js`, the `worker_loaders` line and the four `INLINE_CODE_*` vars, `ctrlk-capability-status.md` row `run_code`.
- Dependencies: (1) owner fact: Workers Paid active on the `rabbit-hole` account (section 5); if not, a priced proposal ($5/month + usage) the owner may decline, in which case the feature stays unavailable and is reported as such; (2) plumbing; (3) a decision on the policy values (frozen on first use) and on how run cost is shown (micros today, users see credits only).
- Existing evidence: `evidence/inline-code-actor-probe.mjs`/`-receipt.md` (Miniflare SQLite DO + loader, 4/4), `inline-code-runtime-probe.mjs`/`-receipt.md`, `inline-code-component-probe.mjs`, ctrlk-code-run-check.mjs (UI with intercepted jobs 6/6), `evidence/wrangler.ctrlk-pilot.jsonc.disabled` (reference only: never stage or deploy it), docs ctrlk-capability-status.md, ctrlk-expanded-tools-receipt.md.
- Acceptance: deployed runtime proof on a dev clone first: a finite program runs and returns stdout/result; an infinite loop is terminated by the CPU limit (never proven); memory/size limits; no outbound network from the Dynamic Worker (`globalOutbound: null` per the docs; confirm in code); unknown outcome retains its reservation; cancel works; the budget caps stop admissions; non-owner refused; then production.
- First deliverable: the plan fact from the owner, then a dev-clone deploy of the loader binding (a dev clone also needs Paid; this is the same account). Estimate: blocked on the plan fact; after it is unblocked, one candidate and one gate cycle plus the dev runtime proof.

## 8. Rollback and safety of the plumbing candidate

- Rollback: redeploy the previous version. The `file-jobs-1` migration only creates an empty SQLite-backed class; with no objects ever created it holds no data, and removing the binding later needs a `deleted_classes` migration only if objects exist.
- With the binding and no flags: conversion submits create a failed job with the honest not-configured message; image and code answer unavailable. No external calls, no spend, no secret needed.
- States after the plumbing ships: implemented yes; unit-tested yes (config test); browser-tested not applicable (no UI change); deployed no (needs the release); enabled no (all three features).
