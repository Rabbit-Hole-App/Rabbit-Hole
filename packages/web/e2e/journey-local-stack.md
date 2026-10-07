# Journey acceptance: the keyless local stack

How `e2e/journey-check.mjs` (LP1 J1-J8, docs/features/adaptive-learning-path-v1-architecture.md §16) is run. Local only:
no `--remote`, no deploy, no model key. `<ws>` is a scratch folder outside git (the LP1 runs used the SDD workspace).

## Rules

- **Unique Worker names.** `wrangler dev` keeps one machine-wide registry keyed by Worker name. A second stack that
  reuses `small-cp-dev` or `rabbit-hole-cp-dev` crashes the owner's stack on 8828/8829 when it stops. This stack is
  `alp1-local-app` and `alp1-local-cp`, on ports 8868 (app) and 8869 (control plane). Give no `--inspector-port`:
  wrangler then picks a free one (an explicit 9269 was already held by the owner's 8828 process during the LP1 run).
- **No keys.** The vars file holds only `SMALL_ENV=test`, `TEST_BYPASS_SECRET`, `MASTER_KEY` (both random, made for
  this stack), `OAUTH_MOCK=true` and `JOURNEY_MODEL_STUB=fixtures`. The journey planners then answer from
  `learn-journey-fixtures.js`, and every other model route has no key, so no paid call is possible.
- `.dev.vars` is read from the directory of each config, so the configs live in their own folders under `<ws>`. Nothing
  reads `packages/*/.dev.vars` or any `.env`.
- Never print a vars file. Check it by key name only: `grep -o '^[A-Z0-9_]*=' <file>`.

## 1. Configs and vars

Copies of `packages/web/wrangler.dev.jsonc` and `packages/control-plane/wrangler.rabbit-hole-dev.jsonc`, renamed, with
absolute paths (a config's relative paths resolve from its own folder), `account_id` dropped, and the app's
`CONTROL_PLANE` pointed at the renamed control plane. Run from the repo root:

```bash
node -e '
const fs = require("fs"), crypto = require("crypto"), R = process.cwd().replace(/\\/g, "/"), W = process.argv[1];
const strip = s => { let o = "", q = false; for (let i = 0; i < s.length; i++) { const c = s[i];
  if (q) { o += c; if (c === "\\") o += s[++i]; else if (c === "\"") q = false; continue; }
  if (c === "\"") { q = true; o += c; continue; }
  if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") i++; o += "\n"; continue; } o += c; }
  return o.replace(/,(\s*[}\]])/g, "$1"); };
const read = f => JSON.parse(strip(fs.readFileSync(f, "utf8")));
const app = read("packages/web/wrangler.dev.jsonc"), cp = read("packages/control-plane/wrangler.rabbit-hole-dev.jsonc");
delete app.account_id; delete cp.account_id;
Object.assign(app, { name: "alp1-local-app", main: R + "/packages/web/dev-worker.js", preview_urls: false,
  services: [{ binding: "CONTROL_PLANE", service: "alp1-local-cp" }], vars: { ...app.vars, SMALL_ENV: "test", JOURNEY_MODEL_STUB: "fixtures" } });
app.assets.directory = R + "/packages/web/dist-dev";
Object.assign(cp, { name: "alp1-local-cp", main: R + "/packages/control-plane/src/index.js", vars: { SMALL_ENV: "test", BASE_URL: "http://127.0.0.1:8868" } });
cp.assets.directory = R + "/packages/web/dist";
cp.d1_databases = cp.d1_databases.map(d => (d.migrations_dir ? { ...d, migrations_dir: R + "/packages/control-plane/migrations" } : d));
const vars = ["SMALL_ENV=test", "TEST_BYPASS_SECRET=" + crypto.randomBytes(24).toString("hex"), "MASTER_KEY=" + crypto.randomBytes(32).toString("hex"),
  "OAUTH_MOCK=true", "JOURNEY_MODEL_STUB=fixtures", ""].join("\n");
for (const [dir, config] of [["app", app], ["cp", cp]]) {
  fs.mkdirSync(`${W}/alp1-config/${dir}`, { recursive: true });
  fs.writeFileSync(`${W}/alp1-config/${dir}/wrangler.jsonc`, JSON.stringify(config, null, 2));
  fs.writeFileSync(`${W}/alp1-config/${dir}/.dev.vars`, vars);
}' <ws>
grep -o '^[A-Z0-9_]*=' <ws>/alp1-config/*/.dev.vars   # key names only
```

## 2. Local D1s (`--local --persist-to` only)

`bootstrap.sql` then every migration builds the main D1 (`test/migrations-bootstrap.test.js` proves the result equals
`schema.sql`; `schema.sql` followed by the migrations would fail on columns that already exist). `repository-schema.sql`
holds learn-migrations 0006 (`learning_journeys`, `learning_path_versions`).

```bash
C=<ws>/alp1-config/cp/wrangler.jsonc P=<ws>/alp1-local
CI=true npx wrangler d1 execute rabbit-hole-dev --local -c $C --persist-to $P --file packages/control-plane/bootstrap.sql
CI=true npx wrangler d1 migrations apply rabbit-hole-dev --local -c $C --persist-to $P
npx wrangler d1 execute rabbit-hole-learn-dev --local -c $C --persist-to $P --file packages/control-plane/repository-schema.sql
npx wrangler d1 execute rabbit-hole-byoc-dev --local -c $C --persist-to $P --file packages/byoc/schema.sql
```

**Reset after a 0006 change.** A persisted LEARN DB that applied an earlier draft of 0006 (for example the
`owner_email` key, now `owner_user_id` = users.id) keeps its old tables, because `CREATE TABLE IF NOT EXISTS` adds no
columns. Drop the two journey tables (their index goes with them), then re-apply `repository-schema.sql`. Use `--local`
only; never run this against a shared or remote database:

```bash
npx wrangler d1 execute rabbit-hole-learn-dev --local -c $C --persist-to $P --command "DROP TABLE IF EXISTS learning_path_versions; DROP TABLE IF EXISTS learning_journeys;"
npx wrangler d1 execute rabbit-hole-learn-dev --local -c $C --persist-to $P --file packages/control-plane/repository-schema.sql
```

## 3. Build, then start (restart after every rebuild: the worker bundles `dist-dev/index.html`)

```bash
cd packages/web && npx vite build && VITE_COACHING_DEV=true VITE_BYOC_DEV=true npx vite build --outDir dist-dev && cd ../..
# the app (app worker + control plane in one process), and the control plane on its own origin, where sessions are minted
npx wrangler dev -c <ws>/alp1-config/app/wrangler.jsonc -c <ws>/alp1-config/cp/wrangler.jsonc --local --persist-to <ws>/alp1-local --ip 127.0.0.1 --port 8868
npx wrangler dev -c <ws>/alp1-config/cp/wrangler.jsonc --local --persist-to <ws>/alp1-local --ip 127.0.0.1 --port 8869
```

Check that no key reached the workers, by name and by behaviour (both answer "not configured" without a model call):
the startup binding table lists no `*_API_KEY` or `ELEVENLABS_*`; with a session, `POST /api/learn/home-ask` answers 503
"Home answers are not configured on this server." and `POST /api/learn/image` with `confirmed: true` answers 503
"Image generation is not configured on this environment."

## 4. Run

```bash
cd packages/web
node e2e/journey-check.mjs --base http://127.0.0.1:8868 --cp http://127.0.0.1:8869 --vars <ws>/alp1-config/cp/.dev.vars --out <ws>/screens [--prefix lp1-final-]
```

The page also answers `/api/learn/ask` (canned SSE), `/api/learn/home-ask` and the Tutor planner `/api/learn/tutor/plan`
(a canned respond_text plan) itself and refuses artifact, voice, assess and image requests, so even a misconfigured stack
makes no model call from the browser. `/api/learn/tutor/evaluate` reaches the stack: without a JEV key it answers status
`error` with no call, and probe options are graded from the server-only key.

The Tutor slice check runs on the same stack in stub mode. Hand it this stack's secret through the environment (it
then never reads `packages/control-plane/.dev.vars`; never create, overwrite or delete that file for this):

```bash
TEST_BYPASS_SECRET=$(sed -n 's/^TEST_BYPASS_SECRET=//p' <ws>/alp1-config/cp/.dev.vars) TUTOR_BASE=http://127.0.0.1:8868 \
  SMALL_CP=http://127.0.0.1:8869 node e2e/tutor-slice-check.mjs <ws>/screens/slice
```

## 5. Stop

Stop only this stack's processes: the `npx`/`node`/`workerd` trees whose command line names `alp1-config` (the
listeners on 8868 and 8869). Never touch 8828/8829 or their processes. A forced stop leaves the stack's own entries in
`%APPDATA%/xdg.config/.wrangler/registry/`: delete `alp1-local-app` and `alp1-local-cp` there, nothing else.
Then check that `http://127.0.0.1:8828` still answers, if it was up.

## 6. Professor Next Steps

`e2e/next-steps-check.mjs` runs on this recipe under its own names: `pns-local-app` and `pns-local-cp` on 8868 and 8869,
configs in `<ws>/pns-config/{app,cp}`, D1s in `<ws>/pns-local`. §1-§3 and §5 apply with those names in place of `alp1-*`.
It covers N1-N7 (hooks, docs/features/professor-next-steps.md), N8-N13 (the Auto Tutor on a plain canvas: the plan request, a
broad request, the learning-path chip, the Research gate, /ask and /teach, insert-only material) and N14-N16 (the Tutor
handoff route, only the paths that call no model) and N17-N19 (the Tutor-side handoff: the offer, the failure path through the
real route, and no selection from the words) and N20-N22 (fix round 1: a Stop during the handoff, a dropped handoff recorded as
invalid_action, code in the request). The stack is keyless, so a successful handoff is never checked. A route missing
from an older base reports SKIP, never PASS.

Give a second stack a private wrangler registry, so stopping it never touches another stack's entries: set
`WRANGLER_REGISTRY_PATH` to a folder of its own in the shell that starts each `wrangler dev`.

```bash
cd packages/web
node e2e/next-steps-check.mjs --base http://127.0.0.1:8868 --cp http://127.0.0.1:8869 --vars <ws>/pns-config/cp/.dev.vars --out <ws>/next-steps-shots
```

`e2e/shared-rabbit-hole-check.mjs` takes `TEST_BYPASS_SECRET` from the environment, as the Tutor slice check does
(`BASE` and `SMALL_CP` name the stack), and then never reads `packages/control-plane/.dev.vars`.
