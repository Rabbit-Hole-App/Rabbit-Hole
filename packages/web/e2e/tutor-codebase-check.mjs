// The Tutor's codebase route in the browser (C:/s/spec/tutor-workflow/draft.md "Starting from a codebase", Task 12;
// acceptance 37-40 and 43), against the LOCAL keyless stack only. The keyless stack has no indexer or GitHub access, so the
// import is stubbed: each repository's row, version and indexed snapshot are seeded in the stack's local D1 and R2, as
// repo-canvas-cards-check does (the invented TaskBoard and Ledger repositories, control-plane/test/learn-codebase-fixtures.js).
// Everything after that is the real app and server. Every model-capable request is aborted and counted (none may happen);
// /api/learn/ask is answered by a script so a typed question can be sent. Prints no secrets.
//   1. A project canvas in Tutor (On) offers the five goals, Learn something else, Continue my own work and Not now; opening
//      it reads no source and calls no model.
//   2. Learn something else returns the general welcome. A typed unrelated question skips the menu and carries no code.
//   3. Understand a feature: the clarifying question, then one saved activity with current-code wording, its cited sources at
//      the commit, tentative inferred links, the listed omissions (no secret shown), Not run here, two code cards placed.
//   4. Ask about this attaches the source to Chat without sending; Open source shows the file in Files.
//   5. An explicit submission; then the repository moves on: only the changed file is stale; the saved revision can be kept;
//      Update the activity keeps the unsent answer and the earlier activity with its attempt.
//   6. A README-only change marks nothing stale and changes nothing saved.
//   7. A second, differently built repository: Prepare to contribute starts from its docs, manifest and tests.
//   8. Tutor Off shows no codebase menu; Not now keeps it away across a reload.
// Usage: BASE=http://127.0.0.1:9381 SMALL_CP=http://127.0.0.1:9383 VARS=<stack .dev.vars> PERSIST=<stack>/local
//   D1_CONFIG=<stack>/fu-integ-local-cp.jsonc [WRANGLER_BIN=<wrangler.js>] node e2e/tutor-codebase-check.mjs [outDir]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { COMMITS, SECRET_VALUE, ledger, taskboard } from '../../control-plane/test/learn-codebase-fixtures.js';

const BASE = process.env.BASE || 'http://127.0.0.1:9381';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9383';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('tutor-codebase-check runs against the local stack only');
const OUT = process.argv[2] || 'tutor-codebase-shots';
mkdirSync(OUT, { recursive: true });
const varsText = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8');
if (/^(ANTHROPIC_API_KEY|TYPESAFE_API_KEY|VERCEL_TYPESAFE_API_KEY)=/m.test(varsText)) throw Error('tutor-codebase-check runs on the keyless stack only');
const secret = varsText.match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { PERSIST, D1_CONFIG } = process.env;
if (!PERSIST || !D1_CONFIG) throw Error('PERSIST and D1_CONFIG (the stack persist dir and config) are required to seed the repositories');
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WRANGLER_BIN = process.env.WRANGLER_BIN || `${ROOT}node_modules/wrangler/bin/wrangler.js`;
const run = Date.now().toString(36);
const EMAIL = `tcode-${run}@example.com`;
const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, secret }) })).json()).session;
if (!session) throw Error('the control plane minted no session (is the stack up with SMALL_ENV=test?)');
const api = async (path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(`${init.method || 'GET'} ${path}: HTTP ${r.status} ${d.error || ''}`);
  return d;
};
if (!(await api('/api/profile')).handle) await api('/api/profile', { method: 'PUT', body: JSON.stringify({ handle: `tcode_${run}` }) });
const catalog = await api('/api/apps');

// ---------------------------------------------------------------- the stubbed import: rows, versions and snapshots
const wrangler = args => execFileSync(process.execPath, [WRANGLER_BIN, ...args, '--local', '--persist-to', PERSIST, '--config', D1_CONFIG],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, WRANGLER_LOG_PATH: OUT } }).toString();
const sql = command => wrangler(['d1', 'execute', 'rabbit-hole-learn-dev', '--command', command]);
const rows = command => JSON.parse(wrangler(['d1', 'execute', 'rabbit-hole-learn-dev', '--json', '--command', command]))[0].results;
const TASKBOARD = `repo-${run}-taskboard`, LEDGER = `repo-${run}-ledger`;
const appRow = name => `SELECT id FROM repository_apps WHERE org='${catalog.org}' AND name='${name}'`;
// One indexed version, as the indexer's finish stores it (repositories.js RepositoryImports.alarm): the snapshot in R2, its
// version row, and the project pointing at that commit.
function publish(name, snapshot) {
  const key = `tcode-${run}-${name}-${snapshot.commit.slice(0, 7)}`, file = `${OUT}/${key}.json`;
  writeFileSync(file, JSON.stringify(snapshot));
  wrangler(['r2', 'object', 'put', `rabbit-hole-dev-repositories/${key}`, '--file', file, '--content-type', 'application/json']);
  sql(`INSERT OR IGNORE INTO repository_versions(app_id,commit_sha,storage_key) ${appRow(name).replace('SELECT id', `SELECT id,'${snapshot.commit}','${key}'`)}; UPDATE repository_apps SET commit_sha='${snapshot.commit}' WHERE org='${catalog.org}' AND name='${name}'`);
}
for (const [name, snapshot] of [[TASKBOARD, taskboard('v1')], [LEDGER, ledger()]]) {
  sql(`INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${catalog.org}','${name}','${catalog.email}','${snapshot.repo}','main','${snapshot.commit}','ready')`);
  publish(name, snapshot);
}
console.log('seeded TaskBoard and Ledger imports (local D1 + R2; the indexer is stubbed on this stack)');
const canvasIn = async (project, title) => (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title, project }) })).name;
// The title is unrelated on purpose: a title never sets the topic (acceptance 41).
const CANVAS = await canvasIn(TASKBOARD, `Logistic Regression ${run}`);
const coachingOf = async name => (await api(`/api/learn/coaching?app=${name}&board=main`)).state;

// ---------------------------------------------------------------- the browser, with every model route counted
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const errors = [], model = [], asks = [], plans = [], hooks = [], codebasePosts = [], attempts = [];
const MODEL = path => path.startsWith('/api/learn/tutor/') && !path.startsWith('/api/learn/tutor/attempts')
  || ['/api/learn/artifact', '/api/learn/home-ask', '/api/ask', '/api/learn/assess', '/api/learn/inline/generate', '/api/learn/inline/route'].includes(path)
  || /^\/api\/repositories\/[^/]+\/(ask|learn-course)$/.test(path);
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
await context.route('**/*', route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) return request.method() === 'GET' ? route.abort() : (model.push(`outside ${request.method()} ${url.hostname}`), route.abort());
  const path = url.pathname;
  if (path === '/api/learn/codebase' && request.method() === 'POST') codebasePosts.push(JSON.parse(request.postData() || '{}').action);
  if (path === '/api/learn/tutor/attempts' && request.method() === 'POST') attempts.push(1);
  if (path === '/api/learn/ask') {
    const body = JSON.parse(request.postData() || '{}'), n = asks.push(body);
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: frame('chunk', { text: `Scripted answer ${n}.` })
      + frame('answer_meta', { messageId: `m-${n}`, actions: [], followUps: [], alternatives: [`m-${n}`], kind: 'answer', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id || `tcode-thread-${run}`, userMessageId: `u-${n}`, messageId: `m-${n}` }) });
  }
  // Proactive hooks (owner 3a): in selected, enabled Tutor a finished Tutor turn may refresh them (learn-next-steps.js
  // hooksTrigger); answered empty and counted, so the check can show what does and does not ask.
  if (path === '/api/learn/tutor/next-steps') { hooks.push(1); return route.fulfill({ json: { set_id: `tcode-set-${hooks.length}`, generated_at: new Date().toISOString(), options: [] } }); }
  // The teaching Tutor's planner on a repository canvas (tutor-entry-check's script): one plain answer, no handoff.
  if (path === '/api/learn/tutor/plan' && request.method() === 'POST') {
    const body = JSON.parse(request.postData() || '{}'), n = plans.push(body);
    const plan = { strategy: 'none', move: 'explain', reason: '', actions: [{ type: 'respond_text', text: `Scripted Tutor answer ${n}.` }] };
    return body.stream ? route.fulfill({ contentType: 'application/x-ndjson', body: `${JSON.stringify({ type: 'plan', ...plan })}
` }) : route.fulfill({ json: plan });
  }
  if (MODEL(path)) { model.push(`${request.method()} ${path}`); return route.abort(); }
  return route.continue();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const pane = () => page.locator('[data-chat-pane]');
const field = () => pane().locator('[data-chat-composer] textarea').first();
const menu = () => page.locator('[data-codebase-menu]');
const sources = () => page.locator('[data-codebase-sources]');
const card = () => page.locator('[data-tutor-activity-card]');
const pickMode = async label => { await pane().getByRole('button', { name: 'Mode', exact: true }).click(); await page.getByRole('menuitemradio', { name: new RegExp(`^${label}`) }).click(); await page.waitForTimeout(350); };
const open = async name => { await page.goto(`${BASE}/apps/${name}`); await pane().waitFor({ state: 'visible', timeout: 60000 }); await field().waitFor({ timeout: 30000 }); await page.waitForTimeout(1500); };
const statuses = () => sources().locator('[data-codebase-source]').evaluateAll(nodes => Object.fromEntries(nodes.map(n => [n.dataset.codebaseSource, n.dataset.codebaseStatus])));
const codeCards = () => page.locator('[data-block-id]').filter({ hasText: 'completionPercent' });

await check('a project canvas in Tutor offers the five codebase goals; opening and selecting Tutor read no source and call no model', async () => {
  await open(CANVAS);
  await pickMode('Tutor');
  await menu().waitFor({ timeout: 15000 });
  assert.match(await menu().innerText(), /What would you like to do with this codebase\?/);
  assert.deepEqual(await menu().locator('[data-codebase-goal]').evaluateAll(nodes => nodes.map(n => n.dataset.codebaseGoal)), ['understand_feature', 'debug_behavior', 'make_change', 'prepare_contribute', 'learn_concept']);
  for (const name of ['Learn something else', 'Continue my own work', 'Not now']) assert.equal(await menu().getByRole('button', { name, exact: true }).count(), 1, name);
  assert.equal(await page.locator('[data-tutor-entry]').count(), 0, 'the codebase menu stands in for the general welcome');
  assert.deepEqual([model, plans, hooks, codebasePosts], [[], [], [], []], 'nothing read for a goal, no Tutor turn, no hook, no model');
  await shot('codebase-01-menu');
});

await check('Learn something else returns the general welcome; a typed unrelated question skips the menu and sends no code', async () => {
  await menu().getByRole('button', { name: 'Learn something else' }).click();
  await page.locator('[data-tutor-entry]').waitFor({ timeout: 5000 });
  assert.equal(await menu().count(), 0);
  await page.reload(); await pane().waitFor({ state: 'visible', timeout: 60000 }); await field().waitFor({ timeout: 30000 });
  await menu().waitFor({ timeout: 15000 });
  await field().fill('Explain the water cycle');
  await page.waitForTimeout(500);
  assert.equal(await menu().count(), 0, 'typing skips the menu');
  await field().press('Enter');
  // Tutor mode on a repository canvas answers through the Tutor's planner; the request is the learner's words and the canvas,
  // never repository source (the repository_context handoff refuses an unrelated request on the server: unit-tested).
  await pane().getByText('Scripted Tutor answer 1.').first().waitFor({ timeout: 15000 });
  const plan = plans.at(-1), sent = JSON.stringify(plan);
  assert.equal(plan.context.learner_intent.raw_user_message, 'Explain the water cycle');
  for (const source of ['completionPercent', 'src/progress.js', 'Math.round', SECRET_VALUE]) assert.equal(sent.includes(source), false, `no repository source in the request (${source})`);
  assert.deepEqual([model, codebasePosts], [[], []], 'no codebase route, no handoff, no model');
  await page.waitForTimeout(4000); // the finished Tutor turn's hook refresh (debounced 1.2 s) lands here, not in the next step
  await shot('codebase-02-water-cycle');
});

let first = null;
await check('Understand a feature: one clarifying question, then a saved activity about the current code, with its cited sources, tentative links, omissions, Not run here and two code cards', async () => {
  await menu().waitFor({ timeout: 15000 });
  await menu().locator('[data-codebase-goal="understand_feature"]').click();
  assert.match(await menu().innerText(), /Which feature or behaviour should we trace first\?/);
  await menu().locator('[data-codebase-question]').fill('the completion indicator');
  await menu().locator('[data-codebase-start]').click();
  await card().waitFor({ timeout: 20000 });
  await sources().waitFor({ timeout: 15000 });
  assert.deepEqual(codebasePosts, ['start']);
  const text = await card().innerText();
  assert.match(text, /A question about the current code at commit 1a1a1a1/);
  assert.match(text, /separately as the intended behaviour/);
  assert.doesNotMatch(text, /\d+\s*%/, 'no output value is claimed');
  assert.deepEqual(Object.keys(await statuses()).sort(), ['src/TaskList.jsx', 'src/progress.js', 'test/progress.test.js']);
  const listed = await sources().innerText();
  assert.match(listed, /About the current code · example\/taskboard at 1a1a1a1 · 3 sources · Not run here/);
  assert.match(listed, /src\/TaskList\.jsx → src\/progress\.js · read from the code/);
  assert.match(listed, /Inspected source at 1a1a1a1\. Not run here/);
  assert.match(listed, /Not included: .*possible secret: never shown or read/);
  assert.equal((await page.content()).includes(SECRET_VALUE), false, 'the secret never reaches the page');
  await codeCards().first().waitFor({ timeout: 10000 });
  assert.ok(await page.locator('[data-block-id]').filter({ hasText: 'TaskList' }).count() >= 1, 'the two source files are on the canvas');
  const state = await coachingOf(CANVAS);
  first = state.activities.find(a => a.activityId === state.activeActivityId);
  assert.deepEqual([first.checkpoint.codebase.goal, first.checkpoint.codebase.question, first.checkpoint.codebase.execution], ['understand_feature', 'current_code', 'not_run_here']);
  assert.ok(first.sourceRefs.every(ref => ref.version === COMMITS.v1 && /^[0-9a-f]{64}$/.test(ref.hash)));
  const hooksBefore = hooks.length;
  await page.waitForTimeout(3000);
  assert.equal(hooks.length, hooksBefore, 'starting a goal and the Tutor-placed code cards ask for no suggestions');
  assert.deepEqual([model, attempts], [[], []]);
  await shot('codebase-03-activity');
});

await check('Ask about this attaches the cited lines to Chat without sending; Open source shows the file in Files', async () => {
  const sent = asks.length;
  await sources().locator('[data-codebase-source="src/progress.js"] [data-codebase-ask]').click();
  await pane().locator('[data-context-chip]').filter({ hasText: 'progress.js' }).first().waitFor({ timeout: 10000 });
  assert.equal(asks.length, sent, 'nothing is sent');
  await pickMode('Tutor');
  await sources().locator('[data-codebase-source="src/progress.js"] button').first().click();
  await page.locator('[data-companion-view="files"][aria-pressed="true"]').waitFor({ timeout: 15000 });
  await page.locator('[data-companion]').getByText('completionPercent').first().waitFor({ timeout: 15000 });
  await shot('codebase-04-open-source');
});

await check('drift: after a submission the repository moves on; only the changed file is stale; the saved revision can be kept; Update keeps the unsent answer and the earlier activity', async () => {
  await card().locator('textarea').fill('It divides 1 by 3, rounds that to 0, then multiplies by 100.');
  await card().locator('[data-tutor-check]').click();
  await card().locator('[data-tutor-feedback]').waitFor({ timeout: 20000 });
  assert.equal(attempts.length, 1, 'one explicit submission');
  publish(TASKBOARD, taskboard('v2')); // src/progress.js fixed upstream; nothing else changed
  await page.reload(); await pane().waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('[data-codebase-drift]').waitFor({ timeout: 20000 });
  assert.match(await page.locator('[data-codebase-drift]').innerText(), /changed since this activity \(1a1a1a1 → 2b2b2b2\): src\/progress\.js\. Your submitted answers stay with 1a1a1a1/);
  assert.deepEqual(await statuses(), { 'src/progress.js': 'changed', 'src/TaskList.jsx': 'current', 'test/progress.test.js': 'current' });
  await shot('codebase-05-drift');
  await page.locator('[data-codebase-keep]').click();
  assert.equal(await page.locator('[data-codebase-drift]').count(), 0, 'kept at the saved revision');
  await page.reload(); await pane().waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('[data-codebase-drift]').waitFor({ timeout: 20000 });
  await card().locator('textarea').fill('Draft: the multiplication should happen before rounding.');
  await page.locator('[data-codebase-refresh]').click();
  await sources().filter({ hasText: 'at 2b2b2b2' }).waitFor({ timeout: 20000 });
  assert.equal(await card().locator('textarea').inputValue(), 'Draft: the multiplication should happen before rounding.', 'the unsent answer is kept');
  await page.waitForFunction(() => { const s = [...document.querySelectorAll('[data-codebase-source]')]; return s.length > 0 && s.every(n => n.dataset.codebaseStatus === 'current'); }, null, { timeout: 15000 });
  assert.deepEqual(Object.keys(await statuses()).sort(), ['src/TaskList.jsx', 'src/progress.js', 'test/progress.test.js'], 'the same files at the current commit');
  const old = rows(`SELECT a.status, a.source_refs_json, (SELECT COUNT(*) FROM learn_attempts t WHERE t.activity_id = a.id AND t.activity_revision = a.revision) AS attempts FROM learn_activities a WHERE a.id = '${first.activityId}'`)[0];
  assert.equal(old.attempts, 1, 'the earlier activity keeps its attempt');
  assert.ok(JSON.parse(old.source_refs_json).every(ref => ref.version === COMMITS.v1), 'and its revision');
  assert.deepEqual(codebasePosts, ['start', 'refresh']);
  assert.deepEqual(model, []);
  await shot('codebase-06-updated');
});

await check('a README-only change marks nothing stale and changes nothing saved', async () => {
  const before = rows(`SELECT a.id, a.status, a.revision, a.source_refs_json FROM learn_activities a JOIN learn_goals g ON g.id = a.goal_id WHERE g.app = '${CANVAS}' ORDER BY a.id`);
  const v2 = taskboard('v2');
  publish(TASKBOARD, { ...v2, commit: COMMITS.readme, files: { ...v2.files, 'README.md': `${v2.files['README.md']}\nScreenshots live in docs/.\n` } });
  await page.reload(); await pane().waitFor({ state: 'visible', timeout: 60000 });
  await sources().waitFor({ timeout: 20000 });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-codebase-source]')].every(n => n.dataset.codebaseStatus === 'current'), null, { timeout: 15000 });
  assert.equal(await page.locator('[data-codebase-drift]').count(), 0);
  assert.deepEqual(rows(`SELECT a.id, a.status, a.revision, a.source_refs_json FROM learn_activities a JOIN learn_goals g ON g.id = a.goal_id WHERE g.app = '${CANVAS}' ORDER BY a.id`), before, 'nothing saved changed');
  assert.equal(rows(`SELECT COUNT(*) AS n FROM learn_attempts WHERE app = '${CANVAS}'`)[0].n, 1, 'the evidence stays');
  await shot('codebase-07-readme-only');
});

await check('a differently built repository: Prepare to contribute starts from its docs, manifest and tests', async () => {
  const name = await canvasIn(LEDGER, `Ledger notes ${run}`);
  await open(name);
  await pickMode('Tutor');
  await menu().waitFor({ timeout: 15000 });
  await menu().locator('[data-codebase-goal="prepare_contribute"]').click();
  await sources().waitFor({ timeout: 20000 });
  assert.deepEqual(Object.keys(await statuses()).sort(), ['README.rst', 'docs/CONTRIBUTING.md', 'pyproject.toml', 'tests/test_report.py']);
  assert.match(await card().innerText(), /which command runs the tests\? A listed script is not proof that it runs here/);
  await shot('codebase-08-ledger-contribute');
});

await check('Tutor Off shows no codebase menu; Not now keeps it away across a reload', async () => {
  const name = await canvasIn(TASKBOARD, `Off and paused ${run}`);
  await open(name);
  await pickMode('Tutor');
  await menu().waitFor({ timeout: 15000 });
  await pane().getByRole('switch', { name: 'Proactive Tutor suggestions' }).click();
  await page.waitForTimeout(800);
  assert.equal(await menu().count(), 0, 'Off: no unsolicited offer');
  await pane().getByRole('switch', { name: 'Proactive Tutor suggestions' }).click();
  await menu().waitFor({ timeout: 10000 });
  await menu().getByRole('button', { name: 'Not now', exact: true }).click();
  await page.waitForTimeout(800);
  assert.equal(await menu().count(), 0);
  await page.reload(); await pane().waitFor({ state: 'visible', timeout: 60000 }); await page.waitForTimeout(2500);
  assert.equal(await menu().count(), 0, 'paused across a reload');
  await shot('codebase-09-not-now');
});

assert.deepEqual(model, [], `no model request: ${model.join()}`);
assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
console.log(`codebase posts: ${codebasePosts.join(',')}; attempts: ${attempts.length}; scripted Tutor turns: ${plans.length}; hook refreshes: ${hooks.length}; scripted asks: ${asks.length}`);
console.log(`PASS ${results.length}/8 checks`);
await browser.close();
