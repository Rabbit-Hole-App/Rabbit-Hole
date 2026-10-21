// The Tutor's codebase route in the browser (C:/s/spec/tutor-workflow/draft.md "Starting from a codebase", Task 12;
// acceptance 37-40 and 43), against the LOCAL keyless stack only. The keyless stack has no indexer or GitHub access, so the
// import is stubbed: each repository's row, version and indexed snapshot are seeded in the stack's local D1 and R2, as
// repo-canvas-cards-check does (the invented TaskBoard and Ledger repositories, control-plane/test/learn-codebase-fixtures.js).
// Everything after that is the real app and server. Every model-capable request is aborted and counted (none may happen);
// /api/learn/ask is answered by a script so a typed question can be sent. Prints no secrets.
//   1. A project canvas in Tutor (On) offers the five goals, Learn something else, Continue my own work and Not now; opening
//      it reads no source and calls no model.
//   2. Learn something else returns the general welcome. A typed unrelated question skips the menu and carries no code.
//   3. Understand a feature: the clarifying question, then one saved activity: a titled teaching question with no commit hash,
//      path or line range (owner brief 2026-10-21), Start here and More relevant code (2) as chips, and a collapsed Source
//      details with the exact commit, file hashes, Not run here, tentative inferred links and the listed omissions (no secret
//      shown); two code cards placed; the entry choices are gone.
//   4. Ask about this attaches the source to Chat without sending; Open source shows the file in Files.
//   5. Every source chip opens its file and range: a code card already on the canvas is focused, any other opens the code
//      reader at the cited lines; no card is added. Keyboard too.
//   6. Selecting lines in the reader or a code card shows "lines a–b", Use in answer and Copy; Use in answer adds a removable
//      pill; overlapping lines are refused; a pill reopens its exact lines.
//   7. An explicit submission carries the citations; forged citations are refused by the server; feedback offers Revise this
//      answer and Try another question, an edit makes it Check revised answer; a reload keeps the citations and the feedback.
//      Then the repository moves on: only the changed file is stale; the saved revision can be kept; Update the activity keeps
//      the unsent answer and the earlier activity with its attempt.
//   8. A README-only change marks nothing stale and changes nothing saved.
//   9. Returning: Continue where I left off (primary), Short recap, Quick check, Continue my own work, Not now; a choice
//      removes the card; Not now only pauses, Continue my own work turns proactive Tutor Off.
//  10. Light, dark and a narrow panel: the activity card fits with no horizontal overflow.
//  11. A second, differently built repository: Prepare to contribute starts from its docs, manifest and tests; Try another
//      question gives the next question on the same sources.
//  12. Tutor Off shows no codebase menu; Not now keeps it away across a reload.
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
  if (path === '/api/learn/tutor/attempts' && request.method() === 'POST') attempts.push(JSON.parse(request.postData() || '{}'));
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
const reader = () => page.locator('[data-sources-pane] [data-source-reader="code"]');
const pill = key => card().locator(`[data-tutor-citation="${key}"]`);
const raw = async (path, body) => { const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

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
  // Owner brief 2026-10-21 "Question presentation": a title and a teaching question; no commit hash, path or line range in it.
  const title = await card().locator('[data-tutor-activity-title]').innerText(), question = await card().locator('[data-tutor-activity-prompt]').innerText();
  assert.equal(title, 'Trace the completion indicator');
  for (const words of [title, question]) {
    assert.doesNotMatch(words, /\b[0-9a-f]{7,40}\b/, 'no commit hash in the question');
    assert.doesNotMatch(words, /[\w-]+\/[\w./-]+|\w\.(js|jsx|py|md)\b|:\d+-\d+/, 'no raw path or line range in the question');
  }
  assert.match(question, /separately as the intended behaviour/);
  assert.doesNotMatch(text, /\d+\s*%/, 'no output value is claimed');
  assert.deepEqual(Object.keys(await statuses()).sort(), ['src/TaskList.jsx', 'src/progress.js', 'test/progress.test.js']);
  // Start here (the most relevant source) and More relevant code (2), collapsed; Source details collapsed.
  assert.equal(await card().locator('[data-codebase-start-here] [data-codebase-chip]').getAttribute('data-codebase-chip'), 'src/progress.js');
  assert.match(await card().locator('[data-codebase-start-here]').innerText(), /^Start here:\s*progress\.js/);
  assert.equal(await card().locator('[data-codebase-more] > summary').innerText(), 'More relevant code (2)');
  assert.deepEqual(await card().locator('[data-codebase-more], [data-codebase-map]').evaluateAll(nodes => nodes.map(n => n.open)), [false, false], 'secondary sources and Source details start collapsed');
  // The entry choices are gone once an activity starts (validation 8).
  assert.deepEqual([await page.locator('[data-tutor-entry]').count(), await menu().count()], [0, 0], 'no entry card or codebase menu beside the activity');
  await shot('codebase-03a-question');
  await card().locator('[data-codebase-map] > summary').click();
  // Source details keep the exact revision, each file's hash and the execution status (validation 2).
  assert.equal(await card().locator('[data-codebase-revision]').getAttribute('data-codebase-revision'), COMMITS.v1);
  assert.equal(await card().locator('[data-codebase-execution]').getAttribute('data-codebase-execution'), 'not_run_here');
  const listed = await sources().innerText();
  assert.match(listed, new RegExp(`About the current code · example/taskboard at commit ${COMMITS.v1} · 3 sources · Not run here`));
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
  assert.deepEqual(await card().locator('[data-codebase-hash]').evaluateAll(nodes => nodes.map(n => n.dataset.codebaseHash)), first.sourceRefs.map(ref => ref.hash), 'each file hash in Source details');
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
  await sources().locator('[data-codebase-source="src/progress.js"] [data-codebase-open]').click();
  await page.locator('[data-companion-view="files"][aria-pressed="true"]').waitFor({ timeout: 15000 });
  await page.locator('[data-companion]').getByText('completionPercent').first().waitFor({ timeout: 15000 });
  await shot('codebase-04-open-source');
});

await check('every source chip opens its file and range: a code card on the canvas is focused, any other opens the code reader at the cited lines; no card is added; keyboard too', async () => {
  const blocks = await page.locator('[data-block-id]').count();
  if (!(await card().locator('[data-codebase-more]').evaluate(n => n.open))) await card().locator('[data-codebase-more] > summary').click();
  const placed = await page.locator('[data-block-id] [data-cite-line]').evaluateAll(nodes => [...new Set(nodes.map(n => n.closest('[data-block-id]').dataset.blockId))]);
  assert.equal(placed.length, 2, 'the two Tutor-placed code cards are citable');
  const chips = card().locator('[data-codebase-chip]');
  const seen = [];
  for (let i = 0; i < await chips.count(); i += 1) {
    const chip = chips.nth(i), path = await chip.getAttribute('data-codebase-chip'), [from, to] = (await chip.getAttribute('data-codebase-chip-lines')).split('-').map(Number);
    if (i === 0) { await chip.focus(); await page.keyboard.press('Enter'); } else await chip.click();
    const ref = first.sourceRefs.find(r => r.locator.path === path);
    assert.deepEqual([ref.locator.start, ref.locator.end], [from, to], `${path}: the chip names the cited lines`);
    if (ref.locator.role === 'source') {
      // A code card of this file is already on the canvas: it is selected and framed, not duplicated.
      await page.locator(`[data-block-id][aria-current="true"] [data-cite-line="${from}"]`).waitFor({ timeout: 10000 });
      seen.push(`${path}:card`);
    } else {
      await reader().locator('[data-source-title]').filter({ hasText: `${path}:${from}-${to}` }).waitFor({ timeout: 15000 });
      await reader().locator(`[data-source-line="${from}"][data-highlighted="true"]`).waitFor({ state: 'attached', timeout: 10000 });
      assert.equal(await reader().locator(`[data-source-line="${to}"][data-highlighted="true"]`).count(), 1, `${path}: the cited lines are marked`);
      await shot(`codebase-04b-reader-${i}`);
      assert.equal(await reader().locator('[data-source-commit]').getAttribute('data-source-commit'), COMMITS.v1, 'read at the cited commit');
      seen.push(`${path}:reader`);
    }
  }
  assert.deepEqual(seen.sort(), ['src/TaskList.jsx:card', 'src/progress.js:card', 'test/progress.test.js:reader']);
  assert.equal(await page.locator('[data-block-id]').count(), blocks, 'no card was added');
  assert.deepEqual(model, []);
  await shot('codebase-04b-chip-reader');
});

await check('selecting lines in the code reader or a code card shows lines a–b, Use in answer and Copy; Use in answer adds a removable citation pill; a pill reopens its exact lines', async () => {
  const test = first.sourceRefs.find(r => r.locator.path === 'test/progress.test.js').locator;
  // The reader (open on the test file): a line, then Shift to extend, with the keyboard on the line buttons.
  await reader().getByRole('button', { name: `Select line ${test.start + 1}`, exact: true }).focus();
  await page.keyboard.press('Enter');
  await reader().getByRole('button', { name: `Select line ${test.start + 3}`, exact: true }).click({ modifiers: ['Shift'] });
  const bar = reader().locator('[data-range-actions]');
  assert.equal(await bar.locator('[data-cite-lines]').innerText(), `lines ${test.start + 1}–${test.start + 3}`);
  for (const name of ['Use in answer', 'Copy']) assert.equal(await bar.getByRole('button', { name, exact: true }).count(), 1, name);
  await bar.locator('[data-cite-use]').focus();
  await page.keyboard.press('Enter');
  const testKey = `test/progress.test.js:${test.start + 1}-${test.start + 3}`;
  await pill(testKey).waitFor({ timeout: 5000 });
  assert.equal(await pill(testKey).locator('button').first().innerText(), `progress.test.js · lines ${test.start + 1}–${test.start + 3}`);
  // The same lines again overlap: refused, said on the bar.
  await reader().getByRole('button', { name: `Select line ${test.start + 2}`, exact: true }).click();
  await reader().locator('[data-range-actions] [data-cite-use]').click();
  assert.match(await reader().locator('[data-cite-note]').innerText(), /overlap/);
  // A code card on the canvas: a text selection across its lines.
  const progressRef = first.sourceRefs.find(r => r.locator.path === 'src/progress.js').locator;
  const [a, b] = [progressRef.start + 1, Math.min(progressRef.start + 2, progressRef.end)];
  const box = page.locator('[data-block-id]').filter({ has: page.locator(`[data-cite-line="${progressRef.start}"]`) }).filter({ hasText: 'completionPercent' }).locator('[data-citable-lines]').first();
  await box.evaluate((node, [x, y]) => {
    const range = document.createRange();
    range.setStart(node.querySelector(`[data-cite-line="${x}"]`), 0);
    range.setEnd(node.querySelector(`[data-cite-line="${y}"]`), 1);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  }, [a, b]);
  await box.locator('[data-cite-lines]').filter({ hasText: `lines ${a}–${b}` }).waitFor({ timeout: 5000 });
  await box.locator('[data-cite-use]').click();
  const cardKey = `src/progress.js:${a}-${b}`;
  await pill(cardKey).waitFor({ timeout: 5000 });
  assert.equal(await card().locator('[data-tutor-citation]').count(), 2, 'two non-overlapping ranges');
  // Remove with the keyboard, then add it back; a pill reopens its exact range in the reader.
  await pill(cardKey).getByRole('button', { name: `Remove progress.js · lines ${a}–${b}` }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await pill(cardKey).count(), 0, 'removed');
  await box.evaluate((node, [x, y]) => {
    const range = document.createRange();
    range.setStart(node.querySelector(`[data-cite-line="${x}"]`), 0);
    range.setEnd(node.querySelector(`[data-cite-line="${y}"]`), 1);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  }, [a, b]);
  await box.locator('[data-cite-use]').click();
  await pill(cardKey).waitFor({ timeout: 5000 });
  await pill(cardKey).locator('button').first().click();
  await reader().locator('[data-source-title]').filter({ hasText: `src/progress.js:${a}-${b}` }).waitFor({ timeout: 15000 });
  assert.deepEqual(model, []);
  await shot('codebase-04c-citations');
});

await check('drift: after a submission the repository moves on; only the changed file is stale; the saved revision can be kept; Update keeps the unsent answer and the earlier activity', async () => {
  const answerText = 'It divides 1 by 3, rounds that to 0, then multiplies by 100.';
  await card().locator('textarea').fill(answerText);
  assert.equal(await card().locator('[data-tutor-check]').innerText(), 'Check my answer');
  await card().locator('[data-tutor-check]').click();
  await card().locator('[data-tutor-feedback]').waitFor({ timeout: 20000 });
  assert.equal(attempts.length, 1, 'one explicit submission');
  // The citations go with the answer (validation 4); the stored refs are the server's (learn-attempt-store.js).
  const cites = [...attempts[0].sourceRefs].sort((x, y) => x.locator.path.localeCompare(y.locator.path));
  assert.deepEqual(cites.map(r => [r.kind, r.id, r.version, r.hash.length, r.locator.path]), [['repository_file', 'example/taskboard:src/progress.js', COMMITS.v1, 64, 'src/progress.js'], ['repository_file', 'example/taskboard:test/progress.test.js', COMMITS.v1, 64, 'test/progress.test.js']]);
  const pills = async () => card().locator('[data-tutor-citation]').evaluateAll(nodes => nodes.map(n => n.dataset.tutorCitation).sort());
  const before = await pills();
  // After feedback: Revise this answer and Try another question; an edit makes it Check revised answer.
  await card().locator('[data-tutor-revise]').waitFor({ timeout: 15000 });
  assert.equal(await card().getByRole('button', { name: 'Check another answer' }).count(), 0);
  assert.equal(await card().getByRole('button', { name: 'Try another question', exact: true }).count(), 1);
  await card().locator('[data-tutor-revise]').click();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Your answer', 'Revise puts the learner in the answer');
  await page.keyboard.type(' Then it shows 0%.');
  assert.equal(await card().locator('[data-tutor-check]').innerText(), 'Check revised answer');
  await card().locator('textarea').fill(answerText);
  assert.equal(await card().locator('[data-tutor-revise]').count(), 1, 'the reviewed answer again: nothing to recheck');
  // Forged citations never reach a saved attempt (validation 6): the server refuses each.
  const now = (await coachingOf(CANVAS)).activities.find(x => x.activityId === first.activityId);
  const progress = now.sourceRefs.find(r => r.locator.path === 'src/progress.js'), ok = { kind: progress.kind, id: progress.id, version: progress.version, hash: progress.hash, locator: { path: progress.locator.path, start: progress.locator.start, end: progress.locator.end } };
  const forged = { repository: { ...ok, id: 'other/repo:src/progress.js' }, revision: { ...ok, version: COMMITS.v2 }, path: { ...ok, locator: { ...ok.locator, path: 'src/TaskList.jsx' } }, hash: { ...ok, hash: '0'.repeat(64) }, range: { ...ok, locator: { ...ok.locator, end: ok.locator.end + 1 } } };
  for (const [label, ref] of Object.entries(forged)) {
    const out = await raw('/api/learn/tutor/attempts', { app: CANVAS, board: 'main', activityId: now.activityId, activityRevision: now.revision, submissionKey: `forged-${label}-${run}`, submittedContent: { text: 'Forged.' }, sourceRefs: [ref], assistanceRefs: [] });
    assert.deepEqual([out.status, ['unknown_source', 'invalid_citation'].includes(out.body.error)], [400, true], `forged ${label}: ${out.body.error}`);
  }
  assert.equal(rows(`SELECT COUNT(*) AS n FROM learn_attempts WHERE app = '${CANVAS}'`)[0].n, 1, 'no forged attempt saved');
  const feedback = await card().locator('[data-tutor-feedback]').innerText();
  await shot('codebase-05a-feedback');
  // Reload: the submitted citations and the feedback come back (validation 5).
  await page.reload(); await pane().waitFor({ state: 'visible', timeout: 60000 });
  await card().locator('[data-tutor-feedback]').filter({ hasText: feedback }).waitFor({ timeout: 20000 });
  await page.waitForFunction(n => document.querySelectorAll('[data-tutor-activity-card] [data-tutor-citation]').length === n, before.length, { timeout: 15000 });
  assert.deepEqual(await pills(), before, 'the same citations after a reload');
  assert.equal(await card().locator('textarea').inputValue(), answerText);
  assert.equal(await card().locator('[data-tutor-revise]').count(), 1);
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
  await card().locator(`[data-codebase-revision="${COMMITS.v2}"]`).waitFor({ state: 'attached', timeout: 20000 });
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

const controlsOf = async name => (await coachingOf(name)).controls;
await check('returning: Continue where I left off is primary beside Short recap, Quick check, Continue my own work and Not now; a choice removes the card; Not now only pauses; Continue my own work turns proactive Tutor Off', async () => {
  const entry = () => page.locator('[data-tutor-entry="resume"]');
  const back = async () => { await page.reload(); await pane().waitFor({ state: 'visible', timeout: 60000 }); await entry().waitFor({ timeout: 20000 }); };
  await back();
  const labels = await entry().getByRole('button').evaluateAll(nodes => nodes.map(n => n.textContent));
  assert.deepEqual(labels, ['Continue where I left off', 'Short recap', 'Quick check', 'Continue my own work', 'Not now']);
  assert.match(await entry().locator('[data-tutor-choice="continue"]').getAttribute('class'), /bg-ink/, 'Continue is the primary choice');
  await shot('codebase-09a-returning');
  await entry().locator('[data-tutor-choice="continue"]').click();
  assert.equal(await entry().count(), 0, 'Continue removes the returning card');
  await card().waitFor({ timeout: 5000 });
  await back();
  await entry().getByRole('button', { name: 'Not now', exact: true }).click();
  await page.locator('[data-tutor-status="resume"]').waitFor({ timeout: 10000 });
  assert.equal(await entry().count(), 0);
  assert.deepEqual([(await controlsOf(CANVAS)).suggestionsPaused, (await controlsOf(CANVAS)).tutorEnabled], [true, true], 'Not now pauses suggestions; the Tutor stays on');
  await page.locator('[data-tutor-resume]').click();
  await page.waitForFunction(() => !document.querySelector('[data-tutor-status="resume"]'), null, { timeout: 10000 });
  assert.equal((await controlsOf(CANVAS)).suggestionsPaused, false);
  await back();
  await entry().getByRole('button', { name: 'Continue my own work', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-tutor-switch]')?.dataset.tutorSwitch === 'off', null, { timeout: 10000 });
  assert.equal(await entry().count(), 0);
  assert.equal((await controlsOf(CANVAS)).tutorEnabled, false, 'Continue my own work turns proactive Tutor Off');
  await pane().getByRole('switch', { name: 'Proactive Tutor suggestions' }).click();
  await page.waitForFunction(() => document.querySelector('[data-tutor-switch]')?.dataset.tutorSwitch === 'on', null, { timeout: 10000 });
  assert.deepEqual(model, []);
});

await check('light, dark and a narrow panel: the activity card and its sources fit with no horizontal overflow', async () => {
  await page.reload(); await pane().waitFor({ state: 'visible', timeout: 60000 });
  await card().locator('[data-codebase-start-here]').waitFor({ timeout: 20000 });
  const fits = () => card().evaluate(node => [node.scrollWidth <= node.clientWidth + 1, [...node.querySelectorAll('[data-codebase-chip], [data-tutor-citation]')].every(chip => chip.getBoundingClientRect().right <= node.getBoundingClientRect().right + 1)]);
  const background = () => card().evaluate(node => getComputedStyle(node).backgroundColor);
  assert.deepEqual(await fits(), [true, true], 'light');
  const light = await background();
  await card().screenshot({ path: `${OUT}/codebase-10a-card-light.png` });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForFunction(was => getComputedStyle(document.querySelector('[data-tutor-activity-card]')).backgroundColor !== was, light, { timeout: 5000 });
  assert.deepEqual(await fits(), [true, true], 'dark');
  await card().screenshot({ path: `${OUT}/codebase-10b-card-dark.png` });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await page.setViewportSize({ width: 390, height: 844 });
  await card().waitFor({ timeout: 10000 });
  await card().scrollIntoViewIfNeeded();
  assert.deepEqual(await fits(), [true, true], 'narrow');
  await card().screenshot({ path: `${OUT}/codebase-10c-card-narrow.png` });
  await page.screenshot({ path: `${OUT}/codebase-10d-narrow-page.png` });
  await page.setViewportSize({ width: 1600, height: 950 });
  console.log('shot codebase-10a/b/c card light, dark, narrow');
});

await check('a differently built repository: Prepare to contribute starts from its docs, manifest and tests; Try another question gives the next question on the same sources', async () => {
  const name = await canvasIn(LEDGER, `Ledger notes ${run}`);
  await open(name);
  await pickMode('Tutor');
  await menu().waitFor({ timeout: 15000 });
  await menu().locator('[data-codebase-goal="prepare_contribute"]').click();
  await sources().waitFor({ timeout: 20000 });
  assert.deepEqual(Object.keys(await statuses()).sort(), ['README.rst', 'docs/CONTRIBUTING.md', 'pyproject.toml', 'tests/test_report.py']);
  assert.match(await card().innerText(), /which command runs the tests\? A listed script is not proof that it runs here/);
  await shot('codebase-08-ledger-contribute');
  const state = await coachingOf(name), was = state.activities.find(a => a.activityId === state.activeActivityId);
  await card().locator('textarea').fill('A new test goes in tests/, and pytest runs them.');
  await card().locator('[data-tutor-check]').click();
  await card().locator('[data-tutor-another]').waitFor({ timeout: 20000 });
  await card().locator('[data-tutor-another]').click();
  await card().locator('[data-tutor-activity-title]').filter({ hasText: 'Explain how a change here is verified' }).waitFor({ timeout: 15000 });
  const next = await coachingOf(name), now = next.activities.find(a => a.activityId === next.activeActivityId);
  assert.notEqual(now.activityId, was.activityId);
  assert.deepEqual(now.sourceRefs, was.sourceRefs, 'the same sources at the same commit');
  assert.equal(await card().locator('textarea').inputValue(), '', 'a new question starts with an empty answer');
  assert.equal(await card().locator('[data-tutor-check]').innerText(), 'Check my answer');
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
const total = 12;
console.log(`PASS ${results.length}/${total} checks`);
assert.equal(results.length, total);
await browser.close();
