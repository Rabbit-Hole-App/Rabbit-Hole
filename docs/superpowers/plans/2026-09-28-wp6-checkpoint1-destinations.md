# WP6 checkpoint 1 - destinations Implementation Plan

> For agentic workers: use superpowers:executing-plans.

**Goal:** Build the checkpoint-1 destination shell on the Rabbit Hole preview:
- **Project:** Overview | Learn | Map. Map has a right Context panel and the Mothership is its only input. "Learn this" hands the node to Learn.
- **Canvas:** opens directly in Learn, with a light parent row and the not-in-this-browser gate.
- **App / Job / Server:** operational detail. On the preview it changes nothing live.

The gate is the 14 Figma captures of the deployed clone. The knowledge-graph layers are checkpoint 2: this plan leaves seams for them and builds none.

**Architecture:** Everything new hangs off the existing literal `learnPreview &&` branches in `SharePage.jsx`, so it is folded out of the live build. No new lazy chunks.
- `RepositoryPage.jsx` gains:
  - a tab model (`projectTab` in `routes.js`)
  - an `Overview` local component
  - a Learn wrapper: header, tabs, canvas picker
  - an always-mounted Map Context panel that hosts the bar's results (`resultsHost:'panel'`, with one `panelHosts` rule in `agent/bar.js`)
- New `CanvasPage.jsx` holds the gate (`CanvasLearn`), which both the canvas route and the project Learn picker use.
- New `AppOps.jsx` holds every preview-only App addition: app scope for the bar, last run, Built from, and the D7 line. That keeps `agent/commands.js`, `surface.js` and the fixtures out of `SharePage`'s own imports.
- `SharePage.jsx` gets only literal-guarded one-liners.

**Tech Stack:**
- React 19, Vite 8 (Rolldown), Tailwind v4, Radix Tabs through `ui.jsx`
- `node:test` (`src/**/*.test.mjs`)
- Playwright harness `packages/web/e2e/rabbit-hole-check.mjs` against the clone `small-cp-dev-smart-home`
- `e2e/live-bundle-check.mjs`

**Spec:**
- `docs/features/rabbit-hole-checklist.md` (WP6): "## WP6 destinations", plus the checkpoints paragraph. "### Map = conversational knowledge graph" is checkpoint 2.
- `docs/features/rabbit-hole-t02-spec.md` §1 (tab aliases), §6.5 (the panel), §8.3 (the gate), §12 (Project / App pages), §16 (D7).

Base: `feature/smart-home` @ `0a4a524`. Line anchors below were read at this HEAD. `SharePage.jsx`, `RepositoryPage.jsx` and the harness are unchanged since `c0046b4`.

## Global Constraints

**Live build**
- The live build stays unchanged.
- Every hunk in a live-shared file (`SharePage.jsx`, `run.jsx`, `routes.js`) must fold on a literal `learnPreview` at the site. Never use a prop, a default parameter or a variable.
- New components are imported statically and reached only through `learnPreview &&`, like `RepositoryPage` at `SharePage.jsx:608`. No new `lazy()`. If one is ever needed, it takes a literal `import.meta.env` guard (`main.jsx:15,68,75`).
- `e2e/live-bundle-check.mjs` stays green after every task. Each task adds its marker and proves the marker is real: the check against `DIST=dist-dev` must FAIL and list it.
- `agent/commands.js` is not in the live graph today. `Shell.jsx:34` only names it in a comment, and the live index has no "Blocked on this preview". Import it only from preview-only components (`AppOps.jsx`, `RepositoryPage.jsx`), never from `SharePage.jsx`.

**D7** (T02 §16): the review clone binds the live D1 (`wrangler.dev.jsonc` DB = `small`) and the live R2 `small-runs`. So:
- No live D1 or R2 write from the preview.
- Canvases go to `LEARN_DB` (`small-learn-dev`) only. Every check or capture deletes what it creates.
- Learn asks in checks and captures are aborted or held in the browser. The clone's model is not called, no thread is written, and DELETE never returns 405 (`canvases.js:101-103`).
- Nothing clicks Run, Open, Refresh branch, Duplicate, Trash, Share or Request access.
- Repository snapshots now go to the dev bucket `small-repositories-dev` (`1f21d70`), so Refresh is D7-allowed. It still re-indexes, so checks never click it.

**Files this plan never touches**
- Never edit `packages/web/src/LearnPage.jsx` or `packages/web/src/ask.jsx` (Learn-owned). Verify with OWNED.
- `flags.js` is unchanged: `learnHandoff=false`, `askLiveOnPreview=false`.
- No schema migration. No control-plane change.

**Naming and location**
- New copy names no workspace. If a name is ever needed, use `workspaceLabel` / `audienceOf` (`api.js`), never an email-domain name.
- The sidebar keeps one location state. Nothing here edits `Sidebar.jsx`; Task 11 guards it.

**Tests**
- Every visible change gets a harness check in the WP6 block, and each check is written to fail first.
- Logic changes get `node:test` unit tests next to their module.
- Run `make test-unit` from the repo root before every commit.

**Line endings** (`git ls-files --eol`; `core.autocrlf=true`, the index is LF). Keep each file's working-tree ending.
- CRLF: `SharePage.jsx`, `RepositoryPage.jsx`, `ui.jsx`, `main.jsx`, `e2e/rabbit-hole-check.mjs`, `docs/features/{rabbit-hole-checklist,rabbit-hole-t02-spec,coaching}.md`.
- LF: `routes.js`, `routes.test.mjs`, `run.jsx`, `agent/{AgentBar.jsx,bar.js,bar.test.mjs}`, `home/{canvas-local.js,continue.js,review-fixtures-data.js}`, `e2e/live-bundle-check.mjs`.
- New files (`CanvasPage.jsx`, `AppOps.jsx`) are LF.
- After each task, `git ls-files --eol <file>` must still show the same `w/` ending.

**Style and commits**
- Minimum code (ponytail). Match the dense one-line style of `RepositoryPage.jsx`. Mark every deliberate skip with a `ponytail:` comment.
- Commits are plain: no co-author or session trailers, and no double quotes inside the message (PS 5.1 splits them).
- Commit only named paths: `git commit --only <paths>`. Commit green work in the same turn. Push only when told.
- Leave the untracked `e2e/_*-shots.mjs` files alone.

**Deploys**
- Deploy only to `small-cp-dev-smart-home` (`docs/features/parallel-dev-deploys.md`). Never run a bare `wrangler deploy` and never deploy live.
- Promotion to the shared `small-cp-dev` needs the user's explicit approval (Open decision 1).

**Commands** (bash, from `C:/Users/cyudhist/Desktop/workspace/smart-home/packages/web`. Env vars do not persist between tool calls, so each block runs as one call.)

UNIT:
```bash
node --test "src/**/*.test.mjs"
```
Also run `make test-unit` from the repo root before each commit.

LIVE. The live build is local only and deploys nothing:
```bash
env -u VITE_COACHING_DEV -u VITE_BYOC_DEV -u VITE_TLDRAW_LICENSE_KEY npm run build && node e2e/live-bundle-check.mjs
```
It must print `ok`. Then run the proof below, after DEPLOY has rebuilt `dist-dev`. It must FAIL, and the failure list must name this task's new marker:
```bash
DIST=dist-dev node e2e/live-bundle-check.mjs
```

DEPLOY (clone only). The key is never printed:
```bash
export VITE_COACHING_DEV=true VITE_BYOC_DEV=true
export VITE_TLDRAW_LICENSE_KEY="$(node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util'; const k = parseEnv(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env','utf8')).TLDRAW_LICENSE_KEY; if (!k) throw new Error('missing TLDRAW_LICENSE_KEY'); process.stdout.write(k);")"
npm run build -- --outDir dist-dev && npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-smart-home
```
This worktree has no root `.env`; the key lives in `small-deploy/.env` (presence verified).

CHECK. The `build` label polls about 60 s for the new bundle, because of rollout lag:
```bash
SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=build,<labels> node e2e/rabbit-hole-check.mjs
```

OWNED, from the repo root. It must exit 0:
```bash
git diff --quiet 0a4a524 -- packages/web/src/LearnPage.jsx packages/web/src/ask.jsx packages/web/src/flags.js
```

**Cycle for every task**
1. Write the unit test, then run UNIT: it FAILs.
2. Write the harness check, then run CHECK `ONLY=build,<label>` against the clone as last deployed: it prints `FAIL: <label>`.
3. Implement.
4. Run UNIT and LIVE.
5. Run DEPLOY, then CHECK: it prints `ok: <label>`, and the listed neighbours stay green.
6. Run `DIST=dist-dev` live-bundle-check: it FAILs on the new marker.
7. Run OWNED, then `make test-unit`, then commit.

**WP6 harness block.** It is created in Task 0 and every later task appends to it. Insert it as one `{ }` block directly above the marker `// ── journey checks: each area inserts its block above this line` at `e2e/rabbit-hole-check.mjs:1628`:
```js
{
  // ── WP6 destinations, checkpoint 1 (rabbit-hole-checklist.md "WP6 destinations"). D7: test canvases go to
  // LEARN_DB only and are deleted; Learn asks are aborted or held in the browser (no model call, no thread, so
  // DELETE never 405s); nothing clicks Run, Open, Refresh branch, Duplicate, Trash, Share or Request access. ──
  const { NOT_HERE, NOT_HERE_WHY, canvasKeys } = await import('../src/home/canvas-local.js'); // pure, like flags.js at :1125
  const D7 = 'Blocked on this preview: it would change live apps.'; // agent/commands.js D7_REASON (commands.js pulls api.js, so not imported)
  const ASK_OFF = 'Asking about the workspace or apps is off on this preview: it would write to live chat history.'; // agent/slash.js ASK_OFF
  const ready = apps.find((a) => a.kind === 'repository' && a.status === 'ready' && a.commit_sha && /^karpathy\/nanogpt$/i.test(a.repo || ''))
    || apps.find((a) => a.kind === 'repository' && a.status === 'ready' && a.commit_sha);
  const job = apps.find((a) => a.kind === 'job' && a.hosting !== 'aws' && a.lastRun) || apps.find((a) => a.kind === 'job' && a.hosting !== 'aws');
  const server = apps.find((a) => a.kind === 'server');
  const api6 = (page, path, method = 'GET', body) => page.evaluate(async ([p, m, b]) => {
    const r = await fetch(p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  }, [path, method, body]);
  const canvas6 = async (page, body) => { const r = await api6(page, '/api/canvases', 'POST', body); must(r.status === 201, `create canvas: HTTP ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
  const drop6 = async (page, name) => { const r = await api6(page, `/api/apps/${name}`, 'DELETE'); must(r.status < 300, `delete ${name}: HTTP ${r.status}; remove it from small-learn-dev by hand`); };
  // Non-GET /api/ calls, except RepositorySource's read (POST .../file) and Learn asks aborted in the browser.
  const writes6 = (page) => { const w = []; page.on('request', (r) => { const p = new URL(r.url()).pathname; if (r.method() !== 'GET' && p.startsWith('/api/') && !/\/file$|^\/api\/learn\/ask$/.test(p)) w.push(`${r.method()} ${p}`); }); return w; };
  const noAsks = (page) => page.route('**/api/learn/ask', (r) => r.abort());
  const ptab = (page, name) => page.locator('[data-project-tabs]').getByRole('tab', { name, exact: true });
  const isSelected = async (loc) => (await loc.getAttribute('aria-selected')) === 'true';
  const composers = (page) => page.locator('[data-chat-composer]').count();
  const ownComposers = (page) => page.locator('[data-chat-composer]:not([data-agent-bar] [data-chat-composer])').count();
  const pickNode = async (page, label = 'CausalSelfAttention') => { // _wp5naming-shots.mjs mapNode
    await page.getByRole('textbox', { name: 'Search repository' }).fill(label);
    await page.waitForTimeout(800);
    await page.getByText(label, { exact: true }).first().click({ timeout: 10000 });
    await barOf(page).locator('[data-scope-chip="selected"]').waitFor({ timeout: 10000 });
  };
  console.log(`wp6: project ${ready?.repo || 'none'} · job ${job?.name || 'none'}${job?.lastRun ? ' (ran)' : ''} · server ${server?.name || 'none'}`);
  // Checks from Tasks 1-11 go here, in task order.
}
```

**Out of scope / seams for checkpoint 2** (nothing below is built):
- The Map panel's `TabsList` is where Why | Questions | Sessions go. Its empty Conversation state is where the starter prompts go.
- `panelHosts` plus `resultsHost:'panel'` is the one results-host rule.
- The `patchSurface` handlers at `RepositoryPage.jsx:28` take `onMapFilter` / `onSelect` beside `onGraph`.
- `selected` gains `kind:'map_node'` (`slash.js:13`) once entity selections exist. `askBody` must then send `nodeId` only for code nodes.
- The Selected relationships split into solid (extracted or recorded) and dashed (inferred).
- The Map toolbar row (`RepositoryPage.jsx:45`) takes the Layers control.
- `MAP_MEMORY` fixtures go in `review-fixtures-data.js`, behind its literal guard, loaded by `useFixtures` the way `AppOps` loads `BUILT_FROM`. They are labelled "Fixture · UI preview".
- All Decision, Session and shared-Question entities are dev-only fixtures, because nothing records them today (KG scope premise check).

## Review Focus

These are the five failure modes the tests do not cover.

1. **Live parity of the shared files.** `live-bundle-check` only proves the named markers are absent. Review every `SharePage.jsx`, `run.jsx` and `routes.js` hunk line by line for a literal `learnPreview` at the site:
   - the `shown` default tab
   - the `canEdit` override
   - `runChat`
   - the RunForm fieldset
   - `initialAppTab`
   - the Graph tab ternary
   - the Request access guard
   - the removed `LearnPage` import, `:735` trigger and `:729` navigate
   - the `secs` export
   - the `learnPreview` import into `run.jsx`

   `baseSurfaceFor` runs only under `learnPreview` (`main.jsx:103`), so the `routes.js` change is preview-only. Compare the size of `dist/static/index-*.js` at Task 0 and at the end, and grep the live index for 'Built from', 'Project canvas', 'Learn this', 'From Map' and 'Fixture · UI preview'.
2. **Result routing on the Map.** `resultsHost:'panel'` hides both the sheet and the result line. That is only safe while the panel is mounted whenever `tab==='map'`, so the panel must never be gated on `snapshot` or `error`.
   - Answers for another scope (the router's `aboutScope`) still open the sheet over the Map.
   - A stream that crosses Overview and Map lands wherever its host is at push time.
   - A sheet opened on Overview reappears on Overview.
   - Below lg the panel stacks at 45% height, with `bg-white` in dark mode. There is no drawer below md, so on a phone an answer can land below the fold.
3. **Node context fidelity.** "From Map: \<node\>" states what `RepositoryPage` passes.
   - `LearnPage` replaces `repositoryContext` for nanoGPT lesson ids (`nanoActive` and `course-*`, `LearnPage.jsx:310,897`, Learn-owned), so Learn can drop the node while the label shows it. Inspect one Learn ask body in DevTools.
   - A picked canvas drops the node by design: `canvasAskSeam` ignores the project.
   - `asking` survives a branch refresh, so a stale commit can 409 (`ask-stream.js`).
4. **Canvas gate coverage.**
   - The gate is decided once per mount, so the `key` on `CanvasPage` / `CanvasLearn` is load-bearing.
   - Every `LearnPage` mount of a canvas row must go through `CanvasLearn`: the canvas route, `?tab=learn` from `learn-hook.js:48`, and the project frame's `?canvas=`.
   - `opensHere` → `deviceId` writes `small.device` on a gated view.
   - `create_canvas` stamps `device_id`, so a canvas made in the UI gates in a fresh browser.
   - `routes.js` classifies canvases by the `canvas-` prefix while `SharePage` uses `kind`.
   - `/apps/canvas-x/runs/<id>` still reaches the generic page.
   - The project's own Learn (keyed by the repository slug) is never gated.
5. **D7 and Coaching blast radius.** `learnPreview` is the Coaching dev build, so Tasks 1-2 change Coaching on any promotion (Open decision 1). These live exposures remain and are not covered here:
   - Open on a server, which the live app logs into `request_logs`
   - the `/chat?app=` page, when typed as a URL
   - the Library row Run (`App.jsx` `onRun`, WP4)

   The `canEdit` override hides real permissions in review screenshots, and captions must say so. `?fixtures=1` persists (`small.preview:review-fixtures`) until `?fixtures=0`, so meanwhile every job and server shows the labelled Built from.

## Figma captures (14)

Captures come from the deployed clone `https://small-cp-dev-smart-home.zeroshothq.workers.dev`, taken by the throwaway, untracked `e2e/_wp6-shots.mjs`, which copies the `_wp5naming-shots.mjs` scaffold with these changes:
- Wait for the aside's `Personal`, not the bar, since Learn and canvases have no bar.
- `fixtures` is false by default.
- `context.route('**/api/learn/ask', () => {})` holds every Learn ask, so no model call is made and no thread is written.
- The canvases A, B and C are created with a Node `fetch` (session cookie plus UA) and deleted in `finally`.
- Output goes to the scratchpad folder `wp6-shots/`.

Setup:
- Canvases:
  - A: `{title:'Attention, step by step', project: nano.name}`
  - B: `{title:'Positional encodings', project: nano.name, device_id:'rabbit-hole-check-device'}`
  - C: `{title:'Why softmax?'}`
- Seed, via `addInitScript`: `small.adaptive-canvas:${nano.org}:${email}:${nano.name}:chat` and `:ink`, as `rabbit-hole-check.mjs:145-149` does.
- Sizes: 1440×900 with the sidebar open. Shots 13 and 14 are 390×844.

| # | Figma state | Route | Setup | Steps before the shot | Caption |
|---|---|---|---|---|---|
| 1 | Project Overview | `/apps/<nano>` | seed, A, B; real threads GET | wait for the `Continue learning` region, then networkidle | Real |
| 2 | Learn | `/apps/<nano>?tab=learn` | A, B | wait for `[data-chat-composer]`; the picker shows Project canvas / A / B | Real |
| 3 | Map | `/apps/<nano>?tab=map` | none | wait for `[data-map-panel]` (Conversation) | Real |
| 4 | Node selected | `?tab=map` | none | `pickNode`; Selected shows path:line, relationships and Learn this | Real |
| 5 | Scoped bar | `?tab=map` | ask held | `pickNode`; send "Why does this exist?"; chips `[karpathy/nanoGPT ×][CausalSelfAttention ×]`, the question in the panel, "Answering in…" | Real UI, request held (no model call) |
| 6 | Map → Teach → Learn | `?tab=map`, then Learn this | none | `pickNode`, click Learn this, wait for `From Map: CausalSelfAttention` above Learn | Real |
| 7 | Standalone canvas | `/apps/<C>` | C | wait for `[aria-label="Lesson canvas"]` and the title row | Real |
| 8 | Project-owned canvas | `/apps/<A>` | A | wait for `In karpathy/nanoGPT →` in `[data-canvas-parent]` | Real |
| 9 | Not in this browser | `/apps/<B>` | B | wait for the `[data-canvas-gate]` heading (NOT_HERE) and Open project | Real |
| 10 | App detail | `/apps/<server>` | none | Runbook landing, the D7 line, the bar's app chip | Real; preview actions off |
| 11 | Job detail | `/apps/<job>?tab=run` (job with `lastRun`, else "Never run" and say so) | none | the last-run line with runtime and Outputs →; Run disabled | Real; preview actions off |
| 12 | App → source Project | `/apps/<job>?fixtures=1` | BUILT_FROM fixture | `[data-built-from]`; optional second frame after the click (Overview) | **Fixture · UI preview** |
| 13 | Mobile Project Overview | `/apps/<nano>` at 390×844 | seed, A, B | the top strip, one column, no sideways scroll | Real |
| 14 | Mobile Learn | `/apps/<nano>?tab=learn` at 390×844 | A | the project row below the 40 px strip | Real |

Upload to Figma:
- Load `figma:figma-use` first. The file is `ef9SfiemEsPQF2bd8B1os3`, and the frames go in a section "WP6 · checkpoint 1" on the existing review page. The Starter plan allows only 3 pages, and MCP reads are scarce, so batch them.
- Each frame gets a caption: real or fixture.
- Send the node URL and the clone URL, then wait for the user's approval.
- Keep the clone until the user approves, then delete it: `npx wrangler delete --name small-cp-dev-smart-home --config wrangler.dev.jsonc`.

## Open decisions (with the default taken)

1. **Promotion is blocking.** The preview App page changes Coaching dev when it is promoted:
   - it lands on Runbook;
   - the Graph tab's Graph Agent input becomes a pointer to the bar (T02 §12);
   - run chat and RunPeek chat are hidden;
   - Run, Schedule, Share edits, Duplicate, Trash, rename, description, Watch dismiss and Runbook edit are off (D7).

   Default: build on the clone and update `coaching.md`. Nothing reaches the shared `small-cp-dev` without approval.
2. **App landing tab.** Default: Runbook (T02 §12 D3). The alternative is Logs or Run, a one-token change in `shown`.
3. **"Runtime"** means the last run's duration. **Server status** is the existing "deployed \<ago\>" line, because no health field exists (ponytail).
4. **`?tab=sources`** opens Overview, because WP6 lists no Sources tab. T02 §1:47 said Sources.
5. **The project's own Learn canvas** is labelled "Project canvas".
6. **Gate actions.** Only [Open project]. T02 §8.3's [New canvas here] and [About local-only storage] are skipped (ponytail): the checklist does not list them.
7. **Overview omissions.** Overview has no [New canvas], Start here or Map status panel (T02 §12), because they are not in the WP6 Overview list. Recent activity is the viewer's own project threads only.
8. **Stale "device" copy.** Library, Home and the Continue heading still say "On another device" or "on this device" (`LibraryViews.jsx:169`, `continue.js:69`, `Home.jsx:78`), against the new "never device" rule. Default: leave them (WP4 is closed). Each is a one-line fix if wanted.
9. **Relationships split.** Selected keeps one relationships list, with the confidence shown per edge. The solid and dashed split is deferred to checkpoint 2's layers.
10. **Given, and applied:**
    - Learn this and /teach this go to the project's Learn tab, with the node as context.
    - A picked project canvas stays in the frame at `?tab=learn&canvas=<slug>`.
    - The gate copy is settled by the spec. `8c476ab` (checklist WP6) chose "This canvas's content isn't available in this browser." with the line "The canvas exists, but its local content was created in another browser or has been cleared.", and the copy never says "device". It is one constant pair, `NOT_HERE` / `NOT_HERE_WHY`, in `home/canvas-local.js`.

---

## Task 0: Preflight, live-bundle proof switch, green baseline

**Files:** `e2e/live-bundle-check.mjs:6` (LF). The harness WP6 block is scaffolded here with no checks yet.

- **Read first:** `docs/features/parallel-dev-deploys.md` and `docs/features/coaching.md` (Environments section, `:1088-1110`), before Tasks 1-2, as CLAUDE.md requires.
- **Implement:**
  ```js
  // DIST=dist-dev node e2e/live-bundle-check.mjs must FAIL: it proves every marker below is real, not vacuous.
  const dir = new URL(`../${process.env.DIST || 'dist'}/static/`, import.meta.url);
  ```
  Also paste the WP6 harness block (Global Constraints) above `:1628`.
- **Verify:**
  - Run LIVE: it prints `ok`, and `DIST=dist-dev` FAILs on `data-agent-bar`.
  - Record the size of `dist/static/index-*.js`.
  - Run DEPLOY at HEAD, then CHECK with `ONLY=build,bar,d7,sh-naming,library,provenance,wp6`. Record the baseline. Any pre-existing red is noted, not fixed.
  - The `wp6:` console line must name a ready nanoGPT, a non-AWS job (with `(ran)` if possible) and a server. If one is missing, its checks and captures degrade. Never deploy or run an app to make one (D7).
- **Commit:** `test(web): live-bundle-check can prove its markers against dist-dev; WP6 harness block`. Paths: `packages/web/e2e/live-bundle-check.mjs packages/web/e2e/rabbit-hole-check.mjs`.

## Task 1: App D7 - the preview changes no live app

**Files:**
- `src/SharePage.jsx`: `:13-20` imports, `:392`, `:538`, `:563`, `:577-600`, `:620`, `:689`, `:768`, `:812`
- new `src/AppOps.jsx`
- `src/run.jsx`: import and `:759`
- `e2e/live-bundle-check.mjs:8`
- `docs/features/coaching.md` Environments
- the harness

**Fail first:** append to the WP6 block.
```js
  if (job) await check('wp6-app-d7: on the preview a job changes nothing live - the D7 line shows; rename, description, Schedule, Duplicate, Trash and Run are off; the run peek and run page have no chat; only GETs reach /api', async () => {
    const page = await open(), writes = writes6(page);
    await loaded(page, `/apps/${job.name}`);
    await page.locator('[data-app-ops]').getByText(D7).waitFor({ timeout: 20000 });
    must(await page.locator('h1[title="Click to rename"], [title="Click to edit"]').count() === 0, 'rename or description editing is offered');
    await page.getByTitle('More').click();
    for (const name of ['Duplicate', 'Move to Trash']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) must(await b.isDisabled(), `${name} is enabled`); }
    must(await page.getByRole('button', { name: 'Schedule', exact: true }).count() === 0, 'Schedule is offered');
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Run', exact: true }).click();
    must(await page.getByRole('button', { name: 'Run', exact: true }).isDisabled(), 'Run is enabled');
    if (job.lastRun) {
      await page.getByRole('tab', { name: 'Logs', exact: true }).click();
      await page.locator('tbody tr').first().click();
      await page.getByRole('button', { name: 'Copy run ID' }).waitFor({ timeout: 20000 });
      await page.waitForTimeout(1000);
      must(await ownComposers(page) === 0, 'the run peek offers live chat');
      await loaded(page, `/apps/${job.name}/runs/${job.lastRun.runId}`);
      await page.getByRole('heading', { name: /^Run / }).first().waitFor({ timeout: 20000 });
      await page.waitForTimeout(1000);
      must(await ownComposers(page) === 0, 'the run page offers live chat');
    }
    must(!writes.length, `writes: ${writes.join(', ')}`);
    await page.context().close();
  });

  await check('wp6-app-denied: a 403 app names its owner but offers no live Request access on the preview', async () => {
    const page = await open(), writes = writes6(page);
    await page.route('**/api/apps/rabbit-hole-check-denied', (r) => r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'no access', owner: 'owner@example.com' }) }));
    await loaded(page, '/apps/rabbit-hole-check-denied');
    await page.getByText(/have access\. Ask owner@example\.com/).waitFor({ timeout: 20000 });
    must(await page.getByRole('button', { name: 'Request access' }).count() === 0, 'Request access is offered');
    must(!writes.length, `writes: ${writes.join(', ')}`);
    await page.context().close();
  });
```

**Implement:**
- **`SharePage.jsx`.** Each change folds away in live.
  - `:538`: `setApp(learnPreview && (d.kind === 'job' || d.kind === 'server') ? { ...d, canEdit: false } : d); // D7: the clone binds the live D1; rename, description, Schedule, Watch, Runbook and Share all read canEdit`
  - Duplicate `MenuItem` (`:577-590`): add `disabled={learnPreview} className={learnPreview ? 'opacity-50' : undefined}`.
  - Trash `MenuItem` (`:596-600`): add `disabled={learnPreview}`, and change `className="text-danger"` to `className={cn('text-danger', learnPreview && 'opacity-50')}`. The live DOM string is unchanged.
  - After `:563` (`isAws`): `const runChat = !learnPreview && (!isAws || app?.run_chat); // D7: run chat writes live /api/ask history`. Use it at `:620` (`runChat && 'lg:mr-[416px]'`) and at `:689` (`{runChat && <div …`).
  - `:392`: `{owner && !asked && !learnPreview && <Button …>Request access</Button>}`. The "Ask \<owner\>" line stays, and it already says who to ask.
  - `:812`: `const runForm = <RunForm …unchanged props…/>;`, then `{learnPreview ? <fieldset disabled className="min-w-0">{runForm}</fieldset> : runForm}`.
  - `:17`: add `import AppOps from './AppOps.jsx';`. At the end of the meta line, before its closing `</div>` at `:769`, add `{learnPreview && <AppOps app={app} />}`.
- **`run.jsx`:** add `import { learnPreview } from './flags.js';`, and at `:759` add `{!learnPreview && (app.hosting !== 'aws' || app.run_chat) && <div …`. With no AskPanel, `chatted` stays false and the Chat tab never shows.
- **New `src/AppOps.jsx`:**
  ```jsx
  // Preview-only additions to a job or server page (WP6 checkpoint 1). SharePage renders this behind a literal
  // learnPreview, so none of it - commands.js included - reaches the live build.
  import { D7_REASON } from './agent/commands.js';

  export default function AppOps() {
    return <span data-app-ops className="basis-full text-ink-3">{D7_REASON}</span>;
  }
  ```
- **MARKERS:** add `'data-app-ops'`.
- **`coaching.md` Environments,** after `:1101`, one paragraph: "On Rabbit Hole preview builds (`learnPreview`: `VITE_COACHING_DEV` without private BYOC), app pages change nothing live (D7): Run, Schedule, Share edits, Duplicate, Trash, rename, description, Watch dismiss and Runbook edits are off with the reason shown, and run chat is hidden. Promoting this to the shared small-cp-dev needs the user's approval."

**Verify:** UNIT; LIVE; DEPLOY; CHECK with `ONLY=build,wp6-app-d7,wp6-app-denied,d7,library`; `DIST=dist-dev` lists `data-app-ops`; OWNED; the `index-*.js` size is unchanged or within a few bytes. Commit.

## Task 2: App pages show the bar; Runbook landing; the Graph Agent input gives way

**Files:**
- `src/routes.js`: `:34-36` comment, `:60`
- `src/routes.test.mjs`: `:51`, `:62-63`
- `src/SharePage.jsx`: `:65-69`, before `:562`, `:562`, `:729`, `:830-852`, `:860`
- `src/AppOps.jsx`
- the harness: `:1205-1207` flip, new check
- `e2e/live-bundle-check.mjs:8`
- `docs/features/rabbit-hole-t02-spec.md:274`
- `docs/features/coaching.md`

**Fail first:**
- Unit (`routes.test.mjs`):
  - `:51` becomes `assert.deepEqual(at('/apps/counter'), ['app', false]); // WP6: app pages show the bar`
  - in `:62-63`, `barHidden: true` becomes `barHidden: false`
  - The run subpage, canvas and `?tab=learn` rows are unchanged.
- Harness flip at `:1205-1207`: remove `['an app page', …]` from `hides`, and change the label to "hidden on /chat, Learn, a canvas and a run subpage (T02 §6.1); back on /members".
- New check:
```js
  if (plain) await check('wp6-app-bar: an app page lands on Runbook with the bar naming the app; an app ask is off and reaches no /api/ask; the Graph tab has no composer of its own; ?tab=logs deep-links; a server has no Run', async () => {
    const page = await open();
    let asks = 0;
    page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/ask') asks++; });
    await loaded(page, `/apps/${plain.name}`);
    await barOf(page).locator('[data-scope-chip="resource"]').getByText(plain.name, { exact: true }).waitFor({ timeout: 20000 });
    must(await isSelected(page.getByRole('tab', { name: 'Runbook', exact: true })), 'the app does not land on Runbook');
    await barInput(page).fill('what does this app do?');
    await barInput(page).press('Enter');
    await page.locator('[data-result-sheet]').getByText(ASK_OFF).waitFor({ timeout: 10000 });
    await page.getByRole('tab', { name: 'Graph', exact: true }).click();
    await page.getByText('Questions about this app go through the bar below.').waitFor({ timeout: 10000 });
    must(await composers(page) === 1 && await page.getByRole('heading', { name: 'Graph Agent' }).count() === 0, 'the Graph tab keeps its own composer');
    await loaded(page, `/apps/${plain.name}?tab=logs`);
    await page.getByRole('tab', { name: 'Logs', exact: true, selected: true }).waitFor({ timeout: 20000 });
    if (server) {
      await loaded(page, `/apps/${server.name}`);
      await page.getByRole('tab', { name: 'Runbook', exact: true }).waitFor({ timeout: 20000 });
      must(await page.getByRole('tab', { name: 'Run', exact: true }).count() === 0, 'a server offers Run');
    }
    must(asks === 0, `${asks} requests reached /api/ask`);
    await page.context().close();
  });
```

**Implement:**
- **`routes.js`:**
  - `:60` drops `'app'`: `barHidden: ['learn', 'canvas', 'chat', 'run'].includes(place)`.
  - Replace the ponytail note at `:34-36` with: `// App pages show the bar (WP6): on the preview their Graph tab's Graph Agent input gives way to it (SharePage). The run subpage keeps its own chat and its hidden bar.`
- **`SharePage.jsx`:**
  - `:68`: `return tab === 'graph' || (learnPreview && ['learn', 'runbook', 'run', 'logs'].includes(tab)) ? tab : null; // T02 §1: working ?tab=runbook|run|logs` Add `// ponytail: a server's ?tab=run shows an empty tab`.
  - Before `:562`: `const shown = tab && tab !== 'learn' ? tab : learnPreview ? 'runbook' : 'graph'; // T02 §12 D3: the preview lands on Runbook`. Live never sets `'learn'`, so this is `tab ?? 'graph'` there.
  - `:562`: `const graphFull = !runId && shown === 'graph';`. `:729`: `value={shown}`. `:860`: `shown !== 'graph'`.
  - `:830`: `{learnPreview ? <p className="text-sm text-ink-2">Questions about this app go through the bar below.</p> : isAws && !app.app_chat ? … : <div …><AskPanel …/></div>}`, which keeps the existing two branches. Add `// T02 §12: on the preview the bar replaces the Graph Agent input (one input; its asks would write live chat)`.
- **`AppOps.jsx`** gains the app scope:
  ```jsx
  import { useEffect } from 'react';
  import { patchSurface } from './agent/surface.js';
  // inside AppOps({ app }), before the return:
  // App scope for the bar (T02 §6.2). Root resets the surface on every URL change (main.jsx:101-104), so this re-runs on the path.
  const path = window.location.pathname + window.location.search;
  useEffect(() => { patchSurface({ resource: { kind: 'app', slug: app.name, title: app.name } }); }, [path, app.name]);
  ```
- **MARKERS:** add `'Questions about this app go through the bar below'`. It proves the SharePage ternary folds.
- **Docs:**
  - `t02-spec.md:274`: the interim row becomes "App pages (WP6) | Shown with the app chip; asks off on the preview; on the preview the Graph tab's Graph Agent input is replaced by the bar | One input".
  - `coaching.md`: add to the Task 1 paragraph: "They land on Runbook, and the Graph tab's Chat shows a pointer to the bar instead of the Graph Agent input."

**Verify:** UNIT; LIVE; DEPLOY; CHECK with `ONLY=build,wp6-app,bar:,d7-app-learn,bar-page`. `d7-app-learn` still finds the Graph tab, and composers ≤ 1 on `?tab=learn` because the bar is hidden there. `DIST=dist-dev` lists the new marker; OWNED. Commit.

## Task 3: Canvas opens directly in Learn, with a light parent row and the not-in-this-browser gate

**Files:**
- `src/home/canvas-local.js`: `:42`, append after `:45`
- new `src/CanvasPage.jsx`
- `src/SharePage.jsx`: `:16-17`, `:607`, `:609-613`, `:729`, `:735`
- `e2e/live-bundle-check.mjs:8`
- the harness

**Fail first:**
```js
  await check('wp6-canvas: a canvas opens straight into Learn under a light row with its title; a project canvas names its project, which opens; content from another browser shows the not-in-this-browser state at /apps/<c> and ?tab=learn and never mounts Learn', async () => {
    const page = await open();
    await noAsks(page);
    await loaded(page, '/library');
    const solo = await canvas6(page, { title: 'wp6 standalone' });
    const owned = ready && await canvas6(page, { title: 'wp6 owned', project: ready.name });
    const away = await canvas6(page, { title: 'wp6 away', ...(ready ? { project: ready.name } : {}), device_id: 'rabbit-hole-check-device' });
    try {
      await loaded(page, `/apps/${solo.name}`);
      await page.getByLabel('Lesson canvas').waitFor({ timeout: 30000 });
      const row = page.locator('[data-canvas-parent]');
      must(await row.getByText('wp6 standalone').count() === 1 && await row.getByRole('button').count() === 0, `standalone row: ${await row.innerText()}`);
      must(await composers(page) === 1 && await barOf(page).count() === 0 && await page.getByRole('tab', { name: 'Runbook' }).count() === 0, 'not Learn, or the generic app page');
      if (owned) {
        await loaded(page, `/apps/${owned.name}`);
        await row.getByRole('button', { name: `In ${ready.repo} →` }).click();
        await page.waitForURL(`**/apps/${ready.name}`);
      }
      for (const q of ['', '?tab=learn']) {
        await loaded(page, `/apps/${away.name}${q}`);
        const gate = page.locator('[data-canvas-gate]');
        await gate.getByRole('heading', { name: NOT_HERE }).waitFor({ timeout: 20000 });
        await gate.getByText(NOT_HERE_WHY).waitFor();
        must(await composers(page) === 0 && await page.getByLabel('Lesson canvas').count() === 0, `Learn mounted behind the gate${q}`);
        must(await page.evaluate((k) => localStorage.getItem(k), canvasKeys({ org: away.org, email, slug: away.name }).ink) === null, 'Learn wrote the foreign canvas');
      }
      if (ready) { await page.locator('[data-canvas-gate]').getByRole('button', { name: 'Open project' }).click(); await page.waitForURL(`**/apps/${ready.name}`); }
    } finally { for (const c of [solo, owned, away].filter(Boolean)) await drop6(page, c.name); await page.context().close(); }
  });
```
Today it fails: a bare canvas route renders the generic app page, and `?tab=learn` mounts Learn with no gate.

**Implement:**
- **`canvas-local.js`.** Change the `:42` comment to `// Learn, or the NOT_HERE state below (T02 §8.3). …`, and append:
  ```js
  // The canvas gate's copy (checklist WP6, user 2026-09-28): content is browser-local, so it never says "device".
  // One place for the gate and the harness.
  export const NOT_HERE = "This canvas's content isn't available in this browser.";
  export const NOT_HERE_WHY = 'The canvas exists, but its local content was created in another browser or has been cleared.';
  ```
- **New `src/CanvasPage.jsx`:**
  ```jsx
  // CANVAS destination (WP6): /apps/canvas-<id> opens Learn directly under one light row. The gate is decided once,
  // before Learn mounts: Learn writes empty keys on mount (canvas-local.js), and an empty editable copy of content
  // made elsewhere would look like lost work (T02 §8.3).
  import { useState } from 'react';
  import { navigate } from './api.js';
  import { Button } from './ui.jsx';
  import LearnPage from './LearnPage.jsx';
  import { titleOf } from './agent/catalog.js';
  import { canvasKeys, NOT_HERE, NOT_HERE_WHY, opensHere } from './home/canvas-local.js';

  // ponytail: T02 §8.3 [New canvas here] and [About local-only storage] are left out; add them when asked.
  export function CanvasLearn({ app, project }) { // callers key it by canvas: the decision is made once per mount
    const [here] = useState(() => opensHere({ storage: localStorage, keys: canvasKeys({ org: app.org, email: app.email || app.owner_email, slug: app.name }), record: app })); // LearnPage.jsx:143's key
    if (here) return <LearnPage app={app} />;
    return <main data-canvas-gate className="min-w-0 flex-1 overflow-auto"><div className="mx-auto max-w-md px-6 pt-[18vh] text-center">
      <h1 className="text-lg font-semibold">{NOT_HERE}</h1>
      <p className="pt-2 text-sm text-ink-2">{NOT_HERE_WHY}</p>
      {project && <Button variant="secondary" className="mx-auto mt-4" onClick={() => navigate(`/apps/${project.name}`)}>Open project</Button>}
    </div></main>;
  }

  // A column, not a Fragment: LearnPage brings its own <main>, which no longer matches index.css's
  // [data-shell-sidebar] ~ main phone padding, so the column restores it. The row names the canvas because
  // Learn's header shows the sample course title for canvases (LearnPage.jsx:591, Learn-owned).
  export default function CanvasPage({ app, project }) {
    return <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:pt-(--shell-top-h)">
      <div data-canvas-parent className="flex shrink-0 items-center gap-2 px-8 pt-3 text-xs text-ink-2 max-md:px-4">
        <span className="truncate text-ink">{app.title}</span>
        {project && <button type="button" className="cursor-pointer hover:text-ink hover:underline" onClick={() => navigate(`/apps/${project.name}`)}>In {titleOf(project)} →</button>}
      </div>
      <CanvasLearn app={app} project={project} />
    </div>;
  }
  ```
- **`SharePage.jsx`:**
  - `:16`: remove `import LearnPage` (this change orphans it). Add `import CanvasPage from './CanvasPage.jsx';`.
  - `:607`: `if (learnPreview && (tab === 'learn' || /^canvas-[a-f0-9]{8}$/.test(slug)) && !app && !error) return <LearnLoading />;`. The regex is `canvases.js:34`'s, so a live app named `canvas-foo` is untouched.
  - `:609-613` becomes, keeping the D7 comment and adding one line:
    ```jsx
    // A canvas opens Learn directly, behind its not-in-this-browser gate (WP6).
    if (learnPreview && app?.kind === 'canvas' && !error && !runId) return <CanvasPage key={JSON.stringify([app.email, app.org, app.name])} app={app} project={catalog?.apps?.find((p) => p.name === app.project)} />;
    ```
  - `:735`: delete the canvas Learn trigger, which is now unreachable.
  - `:729`: `onValueChange={setTab}`. Its `learn` navigate served only that trigger.
- **MARKERS:** add `'data-canvas-gate'`.

**Verify:** UNIT; LIVE; DEPLOY; CHECK with `ONLY=build,wp6-canvas,bar:,d7,sh-library,sh-home`. The `bar: hidden` canvas row still holds, through `routes.js`. `DIST=dist-dev` lists `data-canvas-gate`; OWNED. Commit.

## Task 4: Project tabs Overview | Learn | Map, aliases, and the Learn frame header

**Files:**
- `src/routes.js` (append)
- `src/routes.test.mjs` (`:4` import, new test)
- `src/RepositoryPage.jsx`: `:4`, `:16`, `:28`, before `:29`, `:29`, `:34-40`, `:41`, `:44`, `:53`
- `e2e/live-bundle-check.mjs:8`
- the harness

**Fail first:**
- Unit:
  ```js
  test('a project opens on Overview; learn is Learn; map and the legacy code, graph and agent open Map (T02 §1; WP6 has no Sources tab)', () => {
    for (const s of ['', '?tab=overview', '?tab=sources', '?canvas=canvas-1a2b3c4d']) assert.equal(projectTab(s), 'overview', s);
    assert.equal(projectTab('?tab=learn&canvas=canvas-1a2b3c4d'), 'learn');
    for (const t of ['map', 'code', 'graph', 'agent']) assert.equal(projectTab(`tab=${t}`), 'map', t);
  });
  ```
- Harness:
  ```js
  if (ready) await check('wp6-project: bare /apps/<project> is Overview without the Map; map, code, graph and agent open Map; Learn keeps the project tabs above one composer, below the phone top strip', async () => {
    const page = await open();
    await loaded(page, `/apps/${ready.name}`);
    await ptab(page, 'Overview').waitFor({ timeout: 20000 });
    must(await isSelected(ptab(page, 'Overview')), 'Overview is not the default');
    must(await page.getByRole('textbox', { name: 'Search repository' }).count() === 0 && await page.getByText(/excluded files/).count() === 0, 'Overview shows the Map');
    for (const t of ['map', 'code', 'graph', 'agent']) {
      await spa(page, `/apps/${ready.name}?tab=${t}`);
      await page.getByRole('textbox', { name: 'Search repository' }).waitFor({ timeout: 20000 });
      must(await isSelected(ptab(page, 'Map')), `?tab=${t} is not Map`);
    }
    await ptab(page, 'Overview').click();
    await page.waitForURL(`**/apps/${ready.name}`);
    await ptab(page, 'Learn').click();
    await page.locator('[data-chat-composer]').first().waitFor({ timeout: 30000 });
    must(await isSelected(ptab(page, 'Learn')) && await composers(page) === 1 && await barOf(page).count() === 0, 'Learn lost the project tabs, or has two composers');
    await ptab(page, 'Map').click();
    await page.waitForURL(/[?]tab=map$/);
    await page.context().close();
    const phone = await open({ width: 390, height: 844 });
    await loaded(phone, `/apps/${ready.name}?tab=learn`);
    await phone.locator('[data-chat-composer]').first().waitFor({ timeout: 30000 });
    must((await phone.locator('[data-project-tabs]').boundingBox()).y >= 40, 'the project tabs sit under the phone top strip');
    await phone.context().close();
  });
  ```

**Implement:**
- **`routes.js`** (append; LF):
  ```js
  // Project tabs (T02 §1 aliases): Overview is the default; map and the legacy code, graph and agent open Map.
  // ponytail: ?tab=sources lands on Overview - WP6 has no Sources tab.
  export const projectTab = (search) => { const tab = new URLSearchParams(search).get('tab'); return tab === 'learn' ? 'learn' : ['map', 'code', 'graph', 'agent'].includes(tab) ? 'map' : 'overview'; };
  ```
- **`RepositoryPage.jsx`** (dense style; CRLF):
  - Import `projectTab` from `./routes.js`.
  - `:16`: ``const tab=projectTab(window.location.search),go=t=>navigate(`/apps/${app.name}${t==='overview'?'':`?tab=${t}`}`);``
  - `:28`: `if(tab!=='learn')`. The dependency list keeps `path`, so the effect re-runs on tab changes.
  - Before `:29`:
    ```jsx
    const tabs=<Tabs value={tab} onValueChange={go}><TabsList pill data-project-tabs className="mb-4">
      <TabsTrigger pill value="overview">Overview</TabsTrigger>
      <TabsTrigger pill value="learn" disabled={!app.commit_sha}><Tip label="Learn" info="Guided lessons built from this repository"><span>Learn</span></Tip></TabsTrigger>
      <TabsTrigger pill value="map"><Tip label="Map" info="Code graph of this repository"><span>Map</span></Tip></TabsTrigger>
    </TabsList></Tabs>;
    ```
  - `:29`: the Learn frame, with `LearnPage`'s props unchanged:
    ```jsx
    if(tab==='learn')return <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:pt-(--shell-top-h)">{/* LearnPage brings its own <main>, which loses index.css's [data-shell-sidebar] ~ main phone padding */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 px-8 pt-3 max-md:px-4"><span className="mb-4 text-sm font-semibold">{app.repo}</span>{tabs}</div>
      <LearnPage app={app} onGraph={showGraph} repositoryContext={…as today…} onBack={…as today…}/>
    </div>;
    ```
  - `:34-40`: `<h1 className="pb-2 text-2xl font-semibold">{app.repo}</h1>{tabs}`. The old Graph|Learn strip goes.
  - `:41`: the Refresh button only on Map: `{tab==='map'&&app.canEdit&&<Button …`.
  - `:44`: `{tab==='map'&&snapshot&&<>`. `:53`: `{tab==='map'&&source&&<ResizableSidePanel …`.
  - Leave `showGraph` and `onBack` on `?tab=code` (`:15,29`) and `App.jsx:521` alone: the alias opens Map.
- **MARKERS:** add `'data-project-tabs'`.

**Verify:** UNIT; LIVE; DEPLOY; CHECK with `ONLY=build,wp6-project,bar-page,bar:,sh-naming,library`. `bar-page` starts on the bare URL, which is now Overview, and keeps its project chip. `DIST=dist-dev` lists the marker; OWNED. Commit.

## Task 5: Learn - pick a project canvas, staying in the project frame

**Files:**
- `src/SharePage.jsx:608`
- `src/RepositoryPage.jsx`: `:12`, after `:16`, the Learn frame
- the harness

**Fail first:**
```js
  if (ready) await check('wp6-learn: the canvas picker lists the Project canvas and this project canvases; a pick stays in the project frame at ?tab=learn&canvas=; one from another browser shows the not-in-this-browser state there', async () => {
    const page = await open();
    await noAsks(page);
    await loaded(page, `/apps/${ready.name}`);
    const owned = await canvas6(page, { title: 'wp6 learn owned', project: ready.name });
    const away = await canvas6(page, { title: 'wp6 learn away', project: ready.name, device_id: 'rabbit-hole-check-device' });
    try {
      await loaded(page, `/apps/${ready.name}?tab=learn`);
      const picker = page.getByLabel('Canvas', { exact: true });
      await picker.waitFor({ timeout: 30000 });
      const options = await picker.locator('option').allInnerTexts();
      for (const t of ['Project canvas', 'wp6 learn owned', 'wp6 learn away']) must(options.includes(t), `picker: ${options.join(' | ')}`);
      await picker.selectOption(owned.name);
      await page.waitForURL(new RegExp(`[?]tab=learn&canvas=${owned.name}$`));
      await page.getByLabel('Lesson canvas').waitFor({ timeout: 30000 });
      must(await isSelected(ptab(page, 'Learn')) && await composers(page) === 1, 'the pick left the project frame');
      await picker.selectOption(away.name);
      await page.locator('[data-canvas-gate]').getByRole('heading', { name: NOT_HERE }).waitFor({ timeout: 20000 });
      must(await ptab(page, 'Learn').count() === 1 && await composers(page) === 0, 'the gate left the frame or mounted Learn');
    } finally { await drop6(page, owned.name); await drop6(page, away.name); await page.context().close(); }
  });
```

**Implement:**
- `SharePage.jsx:608`: `<RepositoryPage key={app.name} app={app} catalog={catalog?.apps} />`. This line is already inside `learnPreview &&`.
- `RepositoryPage.jsx`:
  - `:12`: `({ app: initial, catalog = [] })`. Import `{ CanvasLearn }` from `./CanvasPage.jsx`.
  - After `:16`: `const canvases=catalog.filter(c=>c.kind==='canvas'&&c.project===app.name),picked=tab==='learn'&&canvases.find(c=>c.name===new URLSearchParams(window.location.search).get('canvas')); // LibraryViews.jsx:138's filter. ponytail: an unknown ?canvas= falls back to the Project canvas`
  - In the Learn frame row, after `{tabs}`, add a native select (rung 4). `ui.jsx`'s `Select` is string-only and would collide on duplicate titles:
    ```jsx
    {canvases.length>0&&<select aria-label="Canvas" value={picked?.name||''} onChange={e=>navigate(`/apps/${app.name}?tab=learn${e.target.value?`&canvas=${e.target.value}`:''}`)} className="mb-4 h-8 rounded-sm border border-line bg-transparent px-2 text-xs"><option value="">Project canvas</option>{canvases.map(c=><option key={c.name} value={c.name}>{c.title}</option>)}</select>}
    ```
  - Body: `{picked?<CanvasLearn key={picked.name} app={picked} project={app}/>:<LearnPage …as today…/>}`.

**Verify:** LIVE; DEPLOY; CHECK with `ONLY=build,wp6-learn,wp6-project,bar:`; OWNED. Commit.

## Task 6: Map - the right Context panel hosts the bar's answers

**Files:**
- `src/agent/bar.js`: `:5`, after `:11`
- `src/agent/bar.test.mjs`: `:3-6`, new test
- `src/agent/AgentBar.jsx`: `:9-11`, `:110-113`, `:338`, `:364`
- `src/RepositoryPage.jsx`: imports, `:13`, before `:29`, `:28`, `:30`, `:46`, `:47`, `:52-55`
- `e2e/live-bundle-check.mjs:8`
- the harness: `:1519-1539` and `:1560-1573` flips, new check

**Fail first:**
- Unit (it reuses `nano`, `attn`, `counter` and `home` from `bar.test.mjs:9-12`):
  ```js
  test('a page that hosts its results (Map, §6.5) keeps them out of the sheet and the collapsed line', () => {
    const map = { org: 'gmail-com', resource: { kind: 'project', slug: 'repo-1a2b', title: 'karpathy/nanoGPT' }, selected: { id: 'n7' }, resultsHost: 'panel' };
    assert.equal(panelHosts(map, nano), true);
    assert.equal(panelHosts(map, attn), true); // a selection is context, not another list
    assert.equal(panelHosts({ ...map, resultsHost: 'sheet' }, nano), false);
    assert.equal(panelHosts(map, counter), false);
    assert.equal(panelHosts(map, home), false);
  });
  ```
- Harness flips, in the same commit:
  - `:1519` label: "…a Map ask lands in the Context panel…". At `:1527`: `await page.locator('[data-map-panel]').getByText(question).waitFor({ timeout: 10000 });`, then `must(await page.locator('[data-result-sheet]').count() === 0, 'the Map opened the sheet');`. The rest stays: after `/library` the line names the project.
  - `:1560` label: "…Connect is offered in the Context panel". At `:1568`: `const sheet = page.locator('[data-map-panel]');`.
- New check:
  ```js
  if (ready) await check('wp6-map: the Map keeps a Context panel (Selected, Conversation, Source) with no input; an Overview sheet gives way to it; Map answers land in it, never a sheet or a result line; a node opens Selected with path:line; one composer', async () => {
    const page = await open(), writes = writes6(page);
    let asks = 0;
    await page.route('**/api/learn/ask', (r) => { asks++; return r.abort(); }); // no model call, no LEARN_DB thread
    await loaded(page, `/apps/${ready.name}`);
    await barInput(page).fill('Which file defines the model?');
    await barInput(page).press('Enter');
    await page.locator('[data-result-sheet]').getByText('Which file defines the model?').waitFor({ timeout: 10000 });
    await ptab(page, 'Map').click();
    const panel = page.locator('[data-map-panel]');
    await panel.getByText('Which file defines the model?').waitFor({ timeout: 10000 });
    must(await panel.getAttribute('aria-label') === 'Context', 'the panel is not named Context');
    for (const name of ['Selected', 'Conversation', 'Source']) must(await panel.getByRole('tab', { name, exact: true }).count() === 1, `no ${name} tab`);
    must(await page.locator('[data-result-sheet], [data-result-line]').count() === 0, 'the sheet or the result line shows on the Map');
    must(await panel.locator('input, textarea, [contenteditable="true"]').count() === 0 && await composers(page) === 1, 'a second input');
    await pickNode(page);
    await panel.getByText(/\S+\.py:\d+/).waitFor({ timeout: 10000 });
    must(await isSelected(panel.getByRole('tab', { name: 'Selected', exact: true })), 'a node does not open Selected');
    must(await barInput(page).getAttribute('placeholder') === 'Ask about CausalSelfAttention…', 'the bar is not scoped to the node');
    await barInput(page).fill('Why does this exist?');
    await barInput(page).press('Enter');
    await panel.getByText('Why does this exist?').waitFor({ timeout: 10000 });
    must(await page.locator('[data-result-sheet]').count() === 0, 'a Map answer opened the sheet');
    await page.waitForTimeout(1000);
    must(asks === 2 && !writes.length, `${asks} asks; writes: ${writes.join(', ')}`);
    await page.context().close();
  });
  ```

**Implement:**
- **`bar.js`:** add `scopeOf` to the `:5` import, then after `:11`:
  ```js
  // §6.5: a page that hosts its own results (Map's Context panel) keeps them out of the sheet and the collapsed line.
  export const panelHosts = (surface, scope) => surface.resultsHost === 'panel' && resultsKey(scopeOf(surface)) === resultsKey(scope);
  ```
- **`AgentBar.jsx`:**
  - import `panelHosts`
  - `:112`: `if (!panelHosts(page, scope)) setSheet(scope);`
  - `:338`: `{sheet && !panelHosts(surface, sheet) && <ResultSheet …/>}`
  - `:364`: `{!sheet && !streaming && line && !panelHosts(surface, line.scope) && (`
- **`RepositoryPage.jsx`:**
  - Imports: `ResultList` (`./agent/ResultSheet.jsx`), `resultsKey, subscribeTurns` (`./agent/bar.js`), `getSurface` (added to the `surface.js` import), `TabsContent` (`ui.jsx`).
  - `:13`: add `[view,setView]=useState('conversation')`.
  - Before `:29`, so that hooks stay above the Learn return:
    ```js
    const key=resultsKey({org:getSurface().org,kind:'project',slug:app.name}); // the bar's results key for this project, selection excluded
    useEffect(()=>subscribeTurns(({key:k,pushed})=>{if(pushed&&k===key)setView('conversation');}),[key]); // ResultSheet.jsx:11-13
    ```
  - `:28` patch: add `...(tab==='map'?{resultsHost:'panel'}:{})`. Overview keeps the sheet.
  - `:30` `choose`: add `setView(node?'selected':'conversation');` before `if(!node)return;`.
  - `:46` Files click: add `setView('source');`.
  - `:47`: delete the inline selected card. Its label and relationships move into the panel.
  - `:52-55`: replace with the always-mounted panel. Never gate it on `snapshot`, because a hidden panel means invisible answers:
    ```jsx
    {/* One input: questions go through the Agent Bar; while the Map is open, this project's answers land here (T02 §6.5). Checkpoint 2 adds Why | Questions | Sessions tabs. ponytail: no phone bottom drawer (§6.5) - below lg the panel stacks at 45% (ResizableSidePanel.jsx:23). */}
    {tab==='map'&&<ResizableSidePanel data-map-panel aria-label="Context" resizeLabel="Resize repository panel" defaultWidth={420} className="p-5">
      <Tabs value={view==='selected'&&!selected||view==='source'&&!source?'conversation':view} onValueChange={setView} className="flex min-h-0 flex-1 flex-col">
        <TabsList pill className="mb-3 shrink-0"><TabsTrigger pill value="selected" disabled={!selected}>Selected</TabsTrigger><TabsTrigger pill value="conversation">Conversation</TabsTrigger><TabsTrigger pill value="source" disabled={!source}>Source</TabsTrigger></TabsList>
        <TabsContent value="selected" className="min-h-0 flex-1 overflow-y-auto">{selected&&<div data-map-selected><strong className="text-sm">{selected.label}</strong>{selected.path&&<p className="font-mono text-xs text-ink-2">{selected.path}{selected.line?`:${selected.line}`:''}</p>}{/* :47's relationships <details>, moved verbatim. ponytail: one list; the solid/dashed split comes with checkpoint 2's layers */}</div>}</TabsContent>
        <TabsContent value="conversation" className="min-h-0 flex-1 overflow-y-auto"><p className="pb-2 text-xs text-ink-3">Answers from the bar below land here.</p><ResultList scopeKey={key}/></TabsContent>
        <TabsContent value="source" className="flex min-h-0 flex-1 flex-col">{source&&<RepositorySource appName={app.name} {...source} commit={source.commit||snapshot?.commit} onClose={()=>setSource(null)}/>}</TabsContent>
      </Tabs>
    </ResizableSidePanel>}
    ```
- **MARKERS:** add `'data-map-panel'` and `'Learn this in a canvas'`. The second is a `slash.js` string: its absence proves that the new `ResultSheet` / `bar.js` / `slash.js` imports left no top-level code in the live index.

**Verify:** UNIT; LIVE (compare the `index-*.js` size with Task 0); DEPLOY; CHECK with `ONLY=build,wp6-map,bar-page,bar:,sh-naming`; `DIST=dist-dev` lists both markers; OWNED. Commit.

## Task 7: Learn this and /teach this hand the node to the project Learn tab; the node chip only on Map

**Files:**
- `src/RepositoryPage.jsx`: `:28`, the Selected block, the Learn frame row, imports
- `e2e/live-bundle-check.mjs:8`
- the harness

**Fail first:**
```js
  if (ready) await check('wp6-learn-this: Learn this and /teach this open the project Learn tab carrying the node and send nothing; Overview drops the node chip and Map brings it back', async () => {
    const page = await open();
    let asks = 0;
    page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/learn/ask') asks++; });
    await loaded(page, `/apps/${ready.name}?tab=map`);
    await pickNode(page);
    await page.locator('[data-map-panel]').getByRole('button', { name: 'Learn this' }).click();
    await page.waitForURL(/[?]tab=learn$/);
    await page.locator('[data-learn-context]').getByText('From Map: CausalSelfAttention').waitFor({ timeout: 30000 });
    must(await isSelected(ptab(page, 'Learn')) && await composers(page) === 1 && await barOf(page).count() === 0, 'not the project Learn frame');
    await ptab(page, 'Overview').click();
    await barOf(page).locator('[data-scope-chip="resource"]').waitFor({ timeout: 10000 });
    must(await barOf(page).locator('[data-scope-chip="selected"]').count() === 0, 'Overview keeps the node chip');
    await ptab(page, 'Map').click();
    await barOf(page).locator('[data-scope-chip="selected"]').waitFor({ timeout: 10000 });
    await barInput(page).fill('/teach this');
    await barInput(page).press('Enter');
    await page.waitForURL(/[?]tab=learn$/);
    await page.locator('[data-learn-context]').getByText('From Map: CausalSelfAttention').waitFor({ timeout: 30000 });
    must(await page.evaluate(() => sessionStorage.getItem('small.learn.request')) === null && asks === 0, 'a Learn request or ask was sent');
    await page.context().close();
  });
```

**Implement:**
- `:28`: `selected:tab==='map'&&asking?{…as today…}:null`. The checklist gives `[project ×] [node ×]` on the Map only, and Overview answers stay project-scoped.
- Imports: `learnAction` (`./agent/learn-hook.js`), `ctxOf` (`./agent/commands.js`), `toast` (`ui.jsx`).
- In the Selected block, after the relationships:
  ```jsx
  <Button size="sm" variant="secondary" className="mt-3" onClick={()=>learnAction('teach',{app:app.name,prompt:`Teach me ${selected.label}`},ctxOf(getSurface())).then(r=>{if(r.status!=='fallback'&&r.message)toast(r.message);})}>Learn this</Button>
  ```
  Add `{/* One typed action with /teach (learn-hook.js:44). ponytail: while learnHandoff is off (flags.js) it only opens this project's Learn and the node travels as repositoryContext; the fallback line is for a typed prompt, so a click shows none. /teach this still sends the literal "this" - resolve it when the handoff carries prompts. */}`.
- In the Learn frame row, after the picker: `{!picked&&asking&&<span data-learn-context className="mb-4 rounded-full border border-line px-2 py-0.5 text-xs text-ink-2">From Map: {asking.label}</span>}`. This is the same state that feeds `repositoryContext`. Learn's own "Asking about" label (`ask.jsx:796`) is not asserted, because `LearnPage` drops the context for nanoGPT lessons (Review Focus 3).
- **MARKERS:** add `'data-learn-context'`.

**Verify:** LIVE; DEPLOY; CHECK with `ONLY=build,wp6-learn-this,wp6-map,bar-page`; `DIST=dist-dev`; OWNED. Commit.

## Task 8: Overview content - identity and source, Continue learning, learning canvases, recent activity

**Files:**
- `src/RepositoryPage.jsx`: imports, `:41`, after `:43`, a new local `Overview`
- the harness

**Fail first:**
```js
  if (ready) await check('wp6-overview: identity and GitHub source; Continue learning from this browser; learning canvases with one not in this browser; recent activity; no Map or operational clutter; a canvas opens in the project frame; nothing written', async () => {
    const page = await open();
    await noAsks(page);
    await loaded(page, `/apps/${ready.name}`);
    const here = await canvas6(page, { title: 'wp6 overview here', project: ready.name });
    const away = await canvas6(page, { title: 'wp6 overview away', project: ready.name, device_id: 'rabbit-hole-check-device' });
    try {
      const key = canvasKeys({ org: ready.org, email, slug: ready.name });
      await page.evaluate(([chat, ink]) => { // as sh-home seeds it (:145-149)
        localStorage.setItem(chat, JSON.stringify([{ id: '1', question: 'why sqrt(dk)?' }]));
        localStorage.setItem(ink, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [
          { id: 'a', type: 'heading', level: 1, text: 'Tokens', done: true }, { id: 'b', type: 'heading', level: 1, text: 'Masked self-attention' }] }));
      }, [key.chat, key.ink]);
      await page.route('**/api/repositories/*/threads', (r) => r.fulfill({ json: { threads: [{ id: 't1', title: 'Where should I start reading?', created_at: '2026-09-28 10:00:00' }] } }));
      await page.reload();
      const writes = writes6(page);
      const cont = page.getByRole('region', { name: 'Continue learning' });
      await cont.getByText('Last explored: why sqrt(dk)?').waitFor({ timeout: 20000 });
      await cont.getByText('Next: Masked self-attention').waitFor();
      const list = page.getByRole('region', { name: 'Learning canvases' });
      for (const t of ['Project canvas', 'wp6 overview here', 'wp6 overview away']) await list.getByText(t, { exact: true }).waitFor();
      const text = await list.innerText();
      must(text.includes('Not in this browser') && !/device/i.test(text), `canvas copy: ${text}`);
      await page.getByRole('region', { name: 'Recent activity' }).getByText('You asked: Where should I start reading?').waitFor();
      must(await page.locator('a[data-source-link]').getAttribute('href') === `https://github.com/${ready.repo}`, 'no GitHub source link');
      must(await page.getByRole('textbox', { name: 'Search repository' }).count() === 0, 'the Map search on Overview');
      for (const clutter of ['Refresh branch', 'Last run', 'excluded files']) must(await page.locator('main').getByText(clutter).count() === 0, `${clutter} on Overview`);
      must(!writes.length, `Overview wrote: ${writes.join(', ')}`);
      await list.getByRole('button', { name: 'wp6 overview here' }).click();
      await page.waitForURL(new RegExp(`[?]tab=learn&canvas=${here.name}$`));
    } finally { await drop6(page, here.name); await drop6(page, away.name); await page.context().close(); }
  });
```

**Implement:**
- Imports: `ago` (`./api.js`), `Pill` (`ui.jsx`), `learnProgress, onAnotherDevice` (`./home/continue.js:38,23`), `cardModel` (`./home/provenance.js:13`), `SourceLink` (`./home/Provenance.jsx:35`).
- `:41`, the light source line shared by Overview and Map: put `<SourceLink m={cardModel(app)}/>` first, so the line reads `github.com/<repo> · branch · commit7 · status`. On Map, the line also keeps the Refresh button.
- After `:43`: `{tab==='overview'&&<Overview app={app} canvases={canvases}/>}`.
- A local component, placed above `export default`:
  ```jsx
  // Project Overview (WP6): identity and source, Continue learning (this browser), learning canvases, recent activity.
  // Read-only: localStorage and GETs. ponytail: no [New canvas], Start here or Map status panel (T02 §12) - not in the
  // WP6 Overview list; activity is the viewer's own project threads (repositories.js:162), top 5.
  function Overview({ app, canvases }) {
    const [threads,setThreads]=useState(null);
    useEffect(()=>{let active=true;api(`/api/repositories/${app.name}/threads`).then(d=>{if(active)setThreads((d.threads||[]).slice(0,5));}).catch(()=>{if(active)setThreads([]);});return()=>{active=false;};},[app.name]);
    const rows=[{...app,title:'Project canvas',href:`/apps/${app.name}?tab=learn`},...canvases.map(c=>({...c,href:`/apps/${app.name}?tab=learn&canvas=${c.name}`}))];
    const cont=rows.map(r=>({r,p:learnProgress(r,{org:app.org,email:app.email,storage:localStorage})})).find(x=>x.p);
    return <div className="flex flex-col gap-6">
      {app.description&&<p className="text-sm text-ink-2">{app.description}</p>}
      <section aria-label="Continue learning">{/* markup as Home.jsx:77-91 Continue */}…heading "Continue learning"; with cont: "Last explored: <span>…</span>", "Next: <span>…</span>", <Button variant="secondary" onClick={()=>navigate(cont.r.href)}>Continue learning</Button>; without: "Nothing explored in this browser yet." and <Button variant="secondary" onClick={()=>navigate(rows[0].href)}>Start learning</Button></section>
      <section aria-label="Learning canvases">…one <button onClick={()=>navigate(r.href)}> per row: the title, then onAnotherDevice(r,app.email,localStorage)?<Pill>Not in this browser</Pill>:r.kind==='canvas'&&`Created ${ago(r.created_at)}`</section>
      <section aria-label="Recent activity">…threads===null?null:threads.length?threads.map(t=><p key={t.id}>You asked: {t.title} · {ago(t.created_at)}</p>):<p>No questions yet. Ask about this codebase in the bar below.</p></section>
    </div>;
  }
  ```
  - The heading class is `text-sm font-medium`, matching the page. No copy says "device".

**Verify:** LIVE; DEPLOY; CHECK with `ONLY=build,wp6-overview,wp6-project,bar-page,sh-naming`; OWNED. Commit.

## Task 9: App status - last run, status, runtime, outputs

**Files:**
- `src/run.jsx:19` (`export const secs`; a runtime no-op)
- `src/AppOps.jsx`
- the harness

**Fail first:**
```js
  if (job) await check('wp6-app-ops: a job shows its last run with status, runtime and an Outputs link to that run (or Never run); a server shows neither', async () => {
    const page = await open();
    await loaded(page, `/apps/${job.name}`);
    const line = page.locator('[data-last-run]');
    await line.waitFor({ timeout: 20000 });
    const text = await line.innerText();
    if (!job.lastRun) must(text === 'Never run', text);
    else {
      must(text.startsWith('Last run') && text.includes(job.lastRun.status), text);
      await line.getByRole('button', { name: 'Outputs →' }).click();
      await page.waitForURL(`**/apps/${job.name}/runs/${job.lastRun.runId}`);
    }
    if (server) {
      await loaded(page, `/apps/${server.name}`);
      await page.locator('[data-app-ops]').waitFor({ timeout: 20000 });
      must(await page.locator('[data-last-run]').count() === 0, 'a server shows a last run');
    }
    await page.context().close();
  });
```

**Implement:** in `AppOps`, return a fragment, with the D7 line last:
```jsx
import { ago, navigate } from './api.js';
import { StatusPill } from './ui.jsx';
import { fmtDur, secs } from './run.jsx';
// ponytail: runtime = the last run's duration; a server keeps the existing "deployed <ago>" (no health field).
const lr = app.lastRun;
{app.kind === 'job' && <span data-last-run className="flex items-center gap-1.5">{lr ? <>Last run {ago(lr.startedAt)} · <StatusPill status={lr.status} />{lr.finishedAt && ` in ${fmtDur(secs(lr.startedAt, lr.finishedAt))}`}<button type="button" className="text-accent hover:underline" onClick={() => navigate(`/apps/${app.name}/runs/${lr.runId}`)}>Outputs →</button></> : 'Never run'}</span>}
```
The outputs render on the run page (`RunView`), with its chat hidden since Task 1. Add `// ponytail: outputs are one link to the run; list names inline when asked`.

**Verify:** UNIT; LIVE; DEPLOY; CHECK with `ONLY=build,wp6-app`; OWNED. Commit.

## Task 10: "Built from" - a labelled review fixture only

**Files:**
- `src/home/review-fixtures-data.js` (after `:38`)
- `src/AppOps.jsx`
- `src/SharePage.jsx` (the AppOps line gets `catalog`)
- the harness

**Fail first:**
```js
  if (plain && repo && /^karpathy\/nanogpt$/i.test(repo.repo || '')) await check('wp6-built-from: Built from shows only with ?fixtures=1, labelled Fixture · UI preview, and opens the project Overview; never inferred from the app repository', async () => {
    const page = await open();
    await loaded(page, `/apps/${plain.name}`);
    await page.locator('[data-app-ops]').waitFor({ timeout: 20000 });
    must(await page.locator('[data-built-from]').count() === 0, 'Built from without ?fixtures=1');
    await loaded(page, `/apps/${plain.name}?fixtures=1`);
    const from = page.locator('[data-built-from]');
    await from.getByText('Fixture · UI preview').waitFor({ timeout: 20000 });
    await from.getByRole('button', { name: `Built from ${repo.repo} →` }).click();
    await page.waitForURL(`**/apps/${repo.name}`);
    await ptab(page, 'Overview').waitFor({ timeout: 20000 });
    await page.context().close();
  });
```

**Implement:**
- `review-fixtures-data.js`:
  ```js
  // 6. WP6 App -> source Project: the backend records no app->project relationship yet, so with ?fixtures=1 every
  // job and server claims this one, labelled "Fixture · UI preview". Never inferred from repo_url (provenance.js:3-4).
  export const BUILT_FROM = 'karpathy/nanoGPT';
  ```
- `AppOps({ app, catalog })`:
  ```jsx
  import { learnPreview } from './flags.js';
  import { fixturesOn, useFixtures } from './home/review-fixtures.js';
  import { Pill } from './ui.jsx';
  import { repositoriesOf, titleOf } from './agent/catalog.js';
  const fixtures = useFixtures(fixturesOn(localStorage, window.location.search, learnPreview)); // data loads only through review-fixtures.js:27's literal guard
  const from = fixtures && repositoriesOf(catalog, fixtures.BUILT_FROM)[0];
  // ponytail: a review fixture only; read the app's recorded project when the backend has one.
  {from && <span data-built-from className="flex items-center gap-1.5"><button type="button" className="text-accent hover:underline" onClick={() => navigate(`/apps/${from.name}`)}>Built from {titleOf(from)} →</button><Pill>Fixture · UI preview</Pill></span>}
  ```
- `SharePage`: `{learnPreview && <AppOps app={app} catalog={catalog?.apps} />}`.

**Verify:**
- LIVE: `PREVIEW_CHUNKS` still finds no `review-fixtures-data-` chunk, and `grep -c 'Fixture · UI preview' dist/static/index-*.js` prints 0.
- DEPLOY; CHECK with `ONLY=build,wp6-built-from,provenance`; OWNED. Commit.

## Task 11: Sweep - naming, one location state, phone layout (regression guards)

These add no new UI. They guard what Tasks 1-10 built. If one fails, fix only that failure: `workspaceLabel` / `audienceOf` for naming, `max-md:` classes for layout.

**Files:**
- the harness `sh-naming` (`:337-344`)
- the WP6 block

**Checks:**
- `sh-naming`, after `:343`, inside the `if (repo)`:
  ```js
      for (const [where, path] of [['the Project Overview', `/apps/${repo.name}`], ['project Learn', `/apps/${repo.name}?tab=learn`], ...(plain ? [['an app page', `/apps/${plain.name}`]] : [])]) {
        await loaded(page, path);
        await page.waitForTimeout(1500);
        must(await aside.locator('[aria-current="page"]').count() <= 1, `${where} marks more than one location`);
        await leak(page, where);
      }
  ```
- WP6 block:
  ```js
  await check('wp6-mobile: at 390px Overview, Map, project Learn, a canvas and an app page scroll only vertically and start below the top strip', async () => {
    const page = await open({ width: 390, height: 844 });
    await noAsks(page);
    await loaded(page, '/library');
    const c = await canvas6(page, { title: 'wp6 phone', ...(ready ? { project: ready.name } : {}) });
    try {
      const stops = [...(ready ? ['', '?tab=map', '?tab=learn'].map((q) => [`/apps/${ready.name}${q}`, '[data-project-tabs]']) : []), [`/apps/${c.name}`, '[data-canvas-parent]'], ...(plain ? [[`/apps/${plain.name}`, 'main h1']] : [])];
      for (const [path, top] of stops) {
        await loaded(page, path);
        await page.locator(top).first().waitFor({ timeout: 30000 });
        await page.waitForTimeout(800);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); // sh-shots :448
        must(wide <= 0, `${path} scrolls sideways by ${wide}px`);
        must((await page.locator(top).first().boundingBox()).y >= 40, `${path}: ${top} sits under the top strip`);
      }
    } finally { await drop6(page, c.name); await page.context().close(); }
  });
  ```

**Verify:** DEPLOY (only if something was fixed), then CHECK with `ONLY=build,sh-naming,wp6-mobile,sh-shots`. Commit.

## Task 12: Close checkpoint 1 - docs, full suite, captures, Figma gate

- **Docs** (`docs/features/rabbit-hole-checklist.md`, CRLF): under "## WP6 destinations", add one status line: "Checkpoint 1 built (2026-09-28): the Project/Canvas/App destination shell on clone small-cp-dev-smart-home, commit \<sha\>, browser suite \<n\>/\<n\>. The checks are wp6-app-d7, wp6-app-denied, wp6-app-bar, wp6-canvas, wp6-project, wp6-learn, wp6-map, wp6-learn-this, wp6-overview, wp6-app-ops, wp6-built-from and wp6-mobile. Decisions: see this plan's Open decisions. Figma: \<node URL\>."
- **Final gate:**
  - `make test-unit`
  - LIVE: `ok`, and `index-*.js` is within bytes of Task 0.
  - `DIST=dist-dev` lists every new marker.
  - DEPLOY, then CHECK with no `ONLY` (the full suite, all green, or the Task 0 baseline reds unchanged).
  - OWNED.
  - `git ls-files --eol` shows the same endings as at Task 0 for every touched file.
- **Captures:** write the untracked `e2e/_wp6-shots.mjs` (see Figma captures). Run it, check every PNG by eye from a clean browser state, and confirm that every canvas it made was deleted.
- **Figma:** as described under Figma captures. Send the node URL and `https://small-cp-dev-smart-home.zeroshothq.workers.dev`, and wait for approval. Do not promote to shared `small-cp-dev` without it (Open decision 1).
- **Commit:** `docs: WP6 checkpoint 1 status`, with path `docs/features/rabbit-hole-checklist.md`. Push only when told.
