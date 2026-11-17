// Intake v2, Run or Learn (C:/Users/cyudhist/Downloads/intake-run-or-learn-spec.md section 6; Rehearsal MVP, owner 2026-11-15): the Tutor's first question on a repository canvas has two rows,
// Run it and Learn from it. Run it is today's flow (the route question); Learn from it offers the options the catalogue document's `learn` section lists, a typed line is read against them
// (confirmed, cannot, or the learn_fit miss path), a click saves the goal and opens the topic in one paragraph, and the intake is asked once.
//
// UNRUN (written 2026-11-15, not executed; the owner clicks the same steps on 8878). Claude does not run browser automation (CLAUDE.md, Browser verification).
//
// It drives the REAL local app on the owner stack (app 127.0.0.1:8878, control plane 8879; the stack has model keys), against a nanoGPT canvas and a datasette canvas.
// Nothing is stubbed and no model route is aborted: the router (JEV), learn_fit and learn_intro calls are real. SPEND (the owner stack's provider keys):
//   - the typed lines and clicks: 5 router calls (fractions of a cent each), at most 4 learn_fit calls (each capped at US$0.05 by the server, usually about a cent) and 3 learn_intro calls
//     (about a cent each): at most a few cents, worst case about US$0.25.
//   - ONLY when CANVAS_NANOGPT / CANVAS_DATASETTE are not set: the check imports both repositories itself (POST /api/repositories pinned to a commit, which this stack accepts through
//     REHEARSAL_PIN_COMMIT=1), and the catalogue (route catalogue + learn call) is then generated for each: the spec's cap is US$0.50 each, the stored documents of the earlier runs show about US$0.02-0.03
//     for the learn call alone. Name existing canvases with CANVAS_* and the stored catalogues are reused: no catalogue spend at all.
//   No rehearsal is ever started: Run it is clicked only where there are two or more practical routes, and no route is picked.
//
// Usage (the owner stack, from packages/web; values are never printed):
//   BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 TEST_BYPASS_SECRET=<owner stack secret> node e2e/intake-run-or-learn-check.mjs [outDir]
//   or VARS=<the owner stack's packages/control-plane/.dev.vars> in place of TEST_BYPASS_SECRET (default C:/s/explain-layout-web/packages/control-plane/.dev.vars).
//   Optional: CANVAS_NANOGPT=<canvas-xxxxxxxx>, CANVAS_DATASETTE=<canvas-xxxxxxxx> (a canvas of an already imported repository: only its project is used; the steps make their own fresh canvases in it),
//   COMMIT_NANOGPT (default 3adf61e), COMMIT_DATASETTE (default e9d45fe), OUT (default intake-run-or-learn-shots).
// The check makes a new canvas for every step (a goal saved or the asked-once memory of one step never leaks into the next) and deletes what it made.
//
// What it reads from the stack, never from this file: the catalogue document (POST /api/learn/rehearsal action catalogue -> catalogueDoc, with its `learn` section). The Learn rows and every
// sentence are compared with that document; no option label is written here. The only repository-shaped data below is the kind vocabulary of spec section 2 (expected-learn.json: nanoGPT science + data
// options and testing cannot; datasette structure + testing + data options and science cannot), matched on `kind`, never on words.
// Where the spec's wording is a judgement ("names what the repository is", "cites a train-related file") the check uses the plainest reading and says which in the step.
// Not as the spec reads: GET /api/learn/codebase returns the activity without its checkpoint, so the saved goal is read from the coaching state (GET /api/learn/coaching, state.activities[].checkpoint.learn).
//
// Steps (each prints `ok N. ...` or `FAIL N. ...`; the last line is the count):
//   1 nanoGPT: the intake message has exactly two rows, Run it and Learn from it; Run it shows the route question (the practical routes and Something else), the intake rows grey; nothing is started
//   2 nanoGPT: Learn from it: the rows equal doc.learn.options (1-4), "From this codebase you can learn:" and "Or tell me what you'd like to learn.", no route question, the doc's kinds (science, data; testing cannot)
//   3 nanoGPT: a click on an option row: rows grey, a pending line, ONE learn-intro paragraph citing an anchor file, no clarifying form; the goal is saved (checkpoint.learn.id is the option)
//   4 nanoGPT: typed lines while the options are open: attention math (confirmed or fit, one Start row), tests (the doc's cannot thing + the option rows), "teach me Rust" (a no + what the repository is, rows)
//   5 nanoGPT: the narrower line (learning-rate warmup): a fit sentence citing a train file, ONE Start row; after Start the saved checkpoint.learn.focus is the learner's words
//   6 nanoGPT: after Run it a reload does not ask again (intake rows grey); "what can I do here?" re-opens it
//   7 datasette: Learn from it: the rows equal the doc; structure, testing and data options, no science option (science is a cannot)
//   8 datasette: "the server": an answer with one to four option rows (near, or a fit sentence with rows), never silent
//   9 wording gate over every DOM snapshot above: the gate words only inside document-derived text, no path, backtick or command in a row label, no dollar figure
//  10 no page error and no 5xx from the learn routes during the run
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(url)) throw Error('intake-run-or-learn-check runs against the local stack on 127.0.0.1 only (never localhost)');
const OUT = process.argv[2] || process.env.OUT || 'intake-run-or-learn-shots';
mkdirSync(OUT, { recursive: true });
let secret = process.env.TEST_BYPASS_SECRET;
if (!secret) { try { secret = readFileSync(process.env.VARS || 'C:/s/explain-layout-web/packages/control-plane/.dev.vars', 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1].trim(); } catch { /* named below */ } }
if (!secret) throw Error('set TEST_BYPASS_SECRET, or VARS to the owner stack .dev.vars that holds it (the value is never printed)');
const run = Date.now().toString(36);

// ---------------------------------------------------------------- preflight (before any spend): the stack answers and mints a session
const up = await fetch(`${BASE}/sign-in`).then(r => r.status, () => 0);
if (up !== 200) throw Error(`the app on ${BASE} does not answer /sign-in (status ${up}); start the owner stack first`);
const minted = await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `intake-${run}@example.com`, secret }) }).then(r => r.json(), () => ({}));
const session = minted.session;
if (!session) throw Error(`the control plane on ${CP} minted no session (is the owner stack up with TEST_BYPASS_SECRET?)`);
const api = async (path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(`${init.method || 'GET'} ${path.split('?')[0]}: HTTP ${r.status} ${d.error || ''}`);
  return d;
};
const sleep = ms => new Promise(done => setTimeout(done, ms));
const waitFor = async (read, what, ms = 30000) => { const end = Date.now() + ms; for (;;) { const value = await read().catch(() => null); if (value) return value; if (Date.now() > end) throw Error(`timed out: ${what}`); await sleep(400); } };
const norm = text => String(text ?? '').replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
const noStop = text => norm(text).replace(/[.\s]+$/, '');
const repoName = doc => String(doc.repo || '').split('/').pop();

// ---------------------------------------------------------------- the two repositories: imported here, or named by CANVAS_* (the stored catalogue is then reused)
const REPOS = {
  nano: { env: 'CANVAS_NANOGPT', url: 'https://github.com/karpathy/nanoGPT', branch: 'master', commit: process.env.COMMIT_NANOGPT || '3adf61e' },
  data: { env: 'CANVAS_DATASETTE', url: 'https://github.com/simonw/datasette', branch: 'main', commit: process.env.COMMIT_DATASETTE || 'e9d45fe' },
};
// spec section 2 (expected-learn.json), matched on `kind` only
const EXPECT = { nano: { options: ['science', 'data'], cannot: ['testing'], absent: [] }, data: { options: ['structure', 'testing', 'data'], cannot: ['science'], absent: ['science'] } };
const made = { canvases: [], projects: [] };
const canvasIn = async (project, title) => { const name = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title, project }) })).name; made.canvases.push(name); return name; };
if (!(await api('/api/profile')).handle) await api('/api/profile', { method: 'PUT', body: JSON.stringify({ handle: `intake_${run}` }) });

async function prepare(key) {
  const R = REPOS[key], given = process.env[R.env];
  let project;
  if (given) project = (await api(`/api/learn/codebase?app=${encodeURIComponent(given)}&board=main`)).repository?.app;
  else { project = (await api('/api/repositories', { method: 'POST', body: JSON.stringify({ url: R.url, branch: R.branch, commit: R.commit }) })).name; made.projects.push(project); }
  if (!project) throw Error(`${R.env}: that canvas has no repository`);
  const probe = await canvasIn(project, `Intake ${key} ${run}`);
  await waitFor(async () => { const g = await api(`/api/learn/rehearsal?app=${probe}&board=main`); if (g.indexing === 'failed') throw Error(`${key}: indexing failed`); return g.indexing === 'ready'; }, `${key}: the repository is indexed`, 15 * 60000);
  // The catalogue document with its `learn` section (an older stored one gets it through the additive call, so this polls until it is there).
  const doc = await waitFor(async () => { const out = await api('/api/learn/rehearsal', { method: 'POST', body: JSON.stringify({ app: probe, board: 'main', action: 'catalogue' }) }); if (out.catalogue?.status === 'failed') throw Error(`${key}: the catalogue failed`); return out.catalogueDoc?.learn ? out.catalogueDoc : null; }, `${key}: the catalogue document with its learn section`, 10 * 60000);
  const options = doc.learn.options || [];
  assert.ok(options.length >= 1 && options.length <= 4, `${key}: doc.learn.options has 1-4 entries (has ${options.length})`);
  console.log(`prepared ${key}: ${options.length} options, ${(doc.learn.cannot || []).length} cannot, ${doc.routes.filter(r => r.practical).length} practical routes`);
  return { key, doc, name: repoName(doc), options, cannot: doc.learn.cannot || [], practical: doc.routes.filter(r => r.practical), anchors: options.flatMap(o => o.anchors || []), newCanvas: () => canvasIn(project, `Intake ${key} ${run} ${Math.random().toString(36).slice(2, 6)}`) };
}

let browser, failed = false;
const results = [], seen = [], typed = [], errors = [], bad = [];
const total = 10;
try {
  const nano = await prepare('nano'), data = await prepare('data');

  // ---------------------------------------------------------------- the browser (the real app; nothing is stubbed)
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message.slice(0, 200)));
  page.on('response', response => { const url = new URL(response.url()); if (url.origin === BASE && response.status() >= 500 && url.pathname.startsWith('/api/learn/')) bad.push(`${response.status()} ${url.pathname}`); });
  const step = async (name, fn) => {
    try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
    catch (error) {
      results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message.split('\n')[0]}`);
      await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
    }
  };
  const pane = () => page.locator('[data-chat-pane]');
  const field = () => pane().locator('[data-chat-composer] textarea').first();
  const msg = key => page.locator(`[data-rehearsal-message="${key}"]`);
  const rows = key => msg(key).locator('[data-choice-list] button');
  const rowOf = (key, label) => msg(key).locator('[data-choice-list]').getByRole('button', { name: label, exact: true });
  const labelsOf = async key => (await rows(key).allInnerTexts()).map(norm);
  const disabledOf = key => rows(key).evaluateAll(buttons => buttons.map(b => b.disabled));
  const lineKeys = () => page.locator('[data-rehearsal-message^="line-"]').evaluateAll(els => els.map(e => e.dataset.rehearsalMessage));
  // A message's own sentence (its rows and chips taken out), and every message of the flow with its rows: what the wording gate reads.
  const snap = () => page.evaluate(() => [...document.querySelectorAll('[data-rehearsal-message]')].map(el => {
    const rowsOf = [...el.querySelectorAll('[data-choice-list] button, [data-rehearsal-chip]')].map(b => b.textContent.replace(/\s+/g, ' ').trim());
    const copy = el.cloneNode(true); copy.querySelectorAll('[data-choice-list],[data-rehearsal-chips]').forEach(n => n.remove());
    return { key: el.dataset.rehearsalMessage, text: copy.textContent.replace(/\s+/g, ' ').trim(), rows: rowsOf };
  }));
  const textOf = async key => norm((await snap()).find(m => m.key === key)?.text);
  const remember = async repo => { seen.push({ repo, messages: await snap(), typed: [...typed] }); };
  const shot = async name => { await sleep(300); await page.screenshot({ path: `${OUT}/${name}.png` }); };
  // A fresh canvas of the repository, opened to the intake question (its catalogue is stored: no wait for a model).
  const begin = async repo => {
    const canvas = await repo.newCanvas();
    await page.goto(`${BASE}/apps/${canvas}`);
    await pane().waitFor({ state: 'visible', timeout: 60000 });
    await msg('intake').waitFor({ timeout: 120000 });
    return canvas;
  };
  const chooseLearn = async () => { await rowOf('intake', 'Learn from it').click(); await msg('learn-options').waitFor({ timeout: 60000 }); await rows('learn-options').first().waitFor({ timeout: 30000 }); };
  // A typed line while the options are open: the line, then ONE answer after it (never silent). -> the answer's key, sentence and row labels.
  const say = async words => {
    const before = (await lineKeys()).length;
    typed.push(norm(words));
    await field().fill(words); await field().press('Enter');
    await waitFor(async () => (await lineKeys()).length >= before + 2, `no answer to "${words}"`, 120000);
    const key = (await lineKeys()).at(-1);
    return { key, text: await textOf(key), rows: await labelsOf(key) };
  };
  const cites = (text, anchors) => anchors.some(path => text.includes(path) || text.includes(path.split('/').pop()));
  const savedLearn = canvas => waitFor(async () => (await api(`/api/learn/coaching?app=${canvas}&board=main`)).state.activities.map(a => a.checkpoint?.learn).find(Boolean), 'the goal is saved with its learn checkpoint', 60000);
  const kindsOf = repo => ({ options: repo.options.map(o => o.kind), cannot: repo.cannot.map(c => c.kind) });
  const learnRowsAreTheDocument = async repo => {
    assert.deepEqual(await labelsOf('learn-options'), repo.options.map(o => norm(o.label)), 'the rows equal doc.learn.options');
    assert.equal(norm(await textOf('learn-options')), 'From this codebase you can learn:');
    assert.equal(norm(await textOf('learn-or-type')), "Or tell me what you'd like to learn.");
    assert.equal(await msg('route-question').count(), 0, 'no route question after Learn from it');
    const everyRow = (await page.locator('[data-choice-list] button').allInnerTexts()).map(norm);
    for (const route of repo.doc.routes) assert.ok(!everyRow.some(label => label.startsWith(noStop(route.title))), `no route row anywhere (${route.routeId})`);
    assert.deepEqual(await disabledOf('intake'), [true, true], 'the intake rows grey once Learn from it is chosen');
    const kinds = kindsOf(repo), expect = EXPECT[repo.key];
    for (const kind of expect.options) assert.ok(kinds.options.includes(kind), `an option of kind ${kind} (the doc has ${kinds.options.join(', ')})`);
    for (const kind of expect.cannot) assert.ok(kinds.cannot.includes(kind), `${kind} is a cannot (the doc has ${kinds.cannot.join(', ')})`);
    for (const kind of expect.absent) assert.ok(!kinds.options.includes(kind), `no ${kind} option`);
  };

  // 1
  await step('1 nanoGPT: the intake has exactly two rows, Run it and Learn from it; Run it shows the route question and greys the intake; nothing is started', async () => {
    assert.ok(nano.practical.length >= 2, 'this check needs a repository with two practical routes (one would start a rehearsal at once)');
    await begin(nano);
    assert.deepEqual(await labelsOf('intake'), ['Run it', 'Learn from it']);
    assert.match(await textOf('intake'), /^What do you want to do with this codebase\?$/);
    assert.deepEqual(await disabledOf('intake'), [false, false]);
    assert.equal(await msg('learn-options').count() + await msg('route-question').count(), 0, 'neither list before a choice');
    await rowOf('intake', 'Run it').click();
    await msg('route-question').waitFor({ timeout: 30000 });
    const labels = await labelsOf('route-question');
    assert.equal(labels.length, nano.practical.length + 1, 'one row per practical route and Something else');
    for (const route of nano.practical) assert.ok(labels.some(label => label.startsWith(noStop(route.title))), `the route row for ${route.routeId}`);
    assert.equal(labels.at(-1), 'Something else');
    assert.deepEqual(await disabledOf('intake'), [true, true], 'the intake rows are greyed afterwards');
    assert.equal(await msg('rehearsal').count() + await msg('plan').count(), 0, 'no rehearsal and no plan before a route is picked');
    await shot('01-run-it-route-question');
    await remember(nano);
  });

  // 2
  await step('2 nanoGPT: Learn from it: the rows are doc.learn.options, the two Tutor lines, no route question, the document\'s kinds', async () => {
    await begin(nano); await chooseLearn();
    await learnRowsAreTheDocument(nano);
    await shot('02-learn-options');
    await remember(nano);
  });

  // 3
  await step('3 nanoGPT: a click on an option: rows grey, a pending line, ONE learn-intro paragraph citing an anchor file, the goal saved', async () => {
    const canvas = await begin(nano); await chooseLearn();
    const option = nano.options[0];
    // The pending line can be short: a page observer records that it was there, so the step does not race the model call.
    await page.evaluate(() => { window.__pending = false; new MutationObserver(() => { if (document.querySelector('[data-rehearsal-message="learn-intro"] [data-rehearsal-pending]')) window.__pending = true; }).observe(document.body, { childList: true, subtree: true }); });
    await rowOf('learn-options', option.label).click();
    await waitFor(async () => (await disabledOf('learn-options')).every(Boolean), 'the option rows grey', 10000);
    await waitFor(() => msg('learn-intro').count().then(n => n === 1), 'the learn-intro message', 10000);
    await waitFor(() => msg('learn-intro').locator('[data-rehearsal-pending]').count().then(n => n === 0), 'the opening paragraph arrived', 120000);
    assert.equal(await page.evaluate(() => window.__pending), true, 'a pending line showed before the paragraph');
    assert.equal(await msg('learn-intro-failed').count(), 0, 'the opening did not fail');
    assert.equal(await msg('learn-intro').count(), 1, 'ONE learn-intro message');
    const text = await textOf('learn-intro');
    assert.ok(text.length > 40, 'the paragraph has words');
    assert.equal(await msg('learn-intro').locator('ul, ol, li').count(), 0, 'no list in the paragraph');
    assert.ok(await msg('learn-intro').locator('p').count() <= 1, 'one paragraph');
    assert.ok(cites(text, option.anchors), `the paragraph cites one of the option's files (${option.anchors.join(', ')})`);
    assert.equal(await page.locator('[data-codebase-question]').count(), 0, 'no clarifying form on this path');
    const saved = await savedLearn(canvas);
    assert.equal(saved.id, option.id, 'checkpoint.learn.id is the clicked option');
    assert.ok((await api(`/api/learn/codebase?app=${canvas}&board=main`)).activity, 'GET /api/learn/codebase has the saved activity');
    await shot('03-learn-intro');
    await remember(nano);
  });

  // 4
  await step('4 nanoGPT: typed lines while the options are open are answered: attention math, tests (the cannot), teach me Rust', async () => {
    await begin(nano); await chooseLearn();
    const labels = nano.options.map(o => norm(o.label));
    const hit = await say('I want to understand the attention math');
    assert.deepEqual(hit.rows, ['Start'], 'one Start row');
    assert.ok(hit.text && (labels.some(label => hit.text.includes(label)) || cites(hit.text, nano.anchors)), 'a confirmed line (an option in the document\'s words) or a fit sentence citing a file');
    const tests = await say('how are the tests organised');
    const thing = (nano.cannot.find(c => c.kind === 'testing') || nano.cannot[0]).thing;
    assert.ok(tests.text.toLowerCase().includes(norm(thing).toLowerCase()), `the cannot sentence names "${thing}" (doc.learn.cannot)`);
    assert.deepEqual(tests.rows, labels, 'the option rows follow the cannot sentence');
    const rust = await say('teach me Rust');
    assert.match(rust.text, /\b(no|not|n't|cannot|can't|never|without)\b/i, 'a no');
    const summary = norm(nano.doc.summary).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 6);
    assert.ok(rust.text.toLowerCase().includes(nano.name.toLowerCase()) || summary.some(w => rust.text.toLowerCase().includes(w)), 'it says what the repository is (its name or a word of its summary)');
    assert.ok(rust.rows.length >= 1, 'rows to go on with');
    assert.equal(await msg('route-question').count(), 0, 'no route question anywhere');
    await shot('04-typed-lines');
    await remember(nano);
  });

  // 5
  await step('5 nanoGPT: a line narrower than an option: a fit sentence citing a train file, ONE Start row, the saved focus is the learner\'s words', async () => {
    const canvas = await begin(nano); await chooseLearn();
    const words = 'how does the learning-rate warmup work?';
    const fit = await say(words);
    assert.deepEqual(fit.rows, ['Start'], 'ONE Start row');
    const trainFile = nano.anchors.find(path => /train/i.test(path) && (fit.text.includes(path) || fit.text.includes(path.split('/').pop())));
    assert.ok(trainFile, 'the sentence cites a train-related file (one of the option anchors with "train" in its path)');
    await rowOf(fit.key, 'Start').click();
    await waitFor(() => msg('learn-intro').count().then(n => n === 1), 'the topic opens', 20000);
    await waitFor(() => msg('learn-intro').locator('[data-rehearsal-pending]').count().then(n => n === 0), 'the opening paragraph arrived', 120000);
    const saved = await savedLearn(canvas);
    assert.ok(nano.options.some(o => o.id === saved.id), 'the saved goal is one of the options');
    const same = text => noStop(text).toLowerCase();
    assert.equal(same(saved.focus), same(words), 'checkpoint.learn.focus is the learner\'s words');
    await shot('05-narrow-line');
    await remember(nano);
  });

  // 6
  await step('6 nanoGPT: after Run it a reload does not ask again; "what can I do here?" re-opens the intake', async () => {
    const canvas = await begin(nano);
    await rowOf('intake', 'Run it').click();
    await msg('route-question').waitFor({ timeout: 30000 });
    await page.reload();
    await pane().waitFor({ state: 'visible', timeout: 60000 });
    await msg('catalogue').waitFor({ timeout: 120000 });
    if (await msg('intake').count()) assert.deepEqual(await disabledOf('intake'), [true, true], 'asked once: the intake rows are grey after a reload');
    assert.equal(await msg('route-question').count(), 0, 'the route question is not asked again either');
    await field().waitFor({ timeout: 30000 });
    await field().fill('what can I do here?'); await field().press('Enter');
    await waitFor(async () => (await msg('intake').count()) === 1 && (await disabledOf('intake')).every(d => d === false) && (await disabledOf('intake')).length === 2, 'the intake is open again', 120000);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), `rh-intake-done:${canvas}`), null, 'the asked-once memory is forgotten');
    await shot('06-reopened');
    await remember(nano);
  });

  // 7
  await step('7 datasette: Learn from it: the rows are the document\'s; structure, testing and data options; no science option', async () => {
    await begin(data); await chooseLearn();
    await learnRowsAreTheDocument(data);
    await shot('07-datasette-options');
    await remember(data);
  });

  // 8
  await step('8 datasette: "the server" is answered with one to four option rows (near, or a fit sentence with rows)', async () => {
    await begin(data); await chooseLearn();
    const server = await say('the server');
    assert.ok(server.text.length > 0, 'a sentence');
    assert.ok(server.rows.length >= 1 && server.rows.length <= 5, `option rows (got ${server.rows.length})`);
    assert.equal(await msg('route-question').count(), 0, 'no route question anywhere');
    await shot('08-the-server');
    await remember(data);
  });

  // 9
  await step('9 wording gate: the gate words only inside document-derived text, no path, backtick or command in a row label, no dollar figure', async () => {
    assert.ok(seen.length >= 6, 'snapshots of the earlier steps exist');
    const GATE = /nanogpt|datasette|shakespeare/gi, HAS_GATE = /nanogpt|datasette|shakespeare/i; // the spec's gate words
    // A command (backtick, a tool and what it runs), a path (slash path with an extension, ./, a bare code or config file), file:line: none of these in a row label.
    const SHOWS = /`|\$ |(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]{1,5}\b|(?:^|[\s(])\.{1,2}\/\S+|\b[\w-]+\.(?:py|md|toml|ya?ml|sh|cfg|ini|txt|json|rs|go|rb|java)\b|[\w./-]+:\d+\b|\b(?:pip3?|npm|npx|yarn|pnpm|python3?|cargo|make|docker|pytest|torchrun|uvicorn|brew|bash|conda)\s+\S/i;
    const MONEY = /\$\s?\d|\busd\b|\bdollars?\b/i;
    // Fixed Tutor sentences carry no gate word at all; the others are built from the document or the model's reading of it: a gate word there must be the repository's own name or a word the document itself has.
    const FIXED = new Set(['intake', 'learn-options', 'learn-or-type', 'learn-wait', 'learn-intro-failed', 'route-question']);
    const problems = [];
    for (const { repo, messages, typed: said } of seen) {
      const docText = JSON.stringify(repo.doc).toLowerCase();
      const docLabels = new Set([...repo.doc.routes.map(r => noStop(r.title)), ...repo.options.map(o => norm(o.label))]);
      for (const m of messages) {
        for (const label of m.rows) {
          if (SHOWS.test(label)) problems.push(`${repo.key} row "${label}" shows a path, backtick or command`);
          if (MONEY.test(label)) problems.push(`${repo.key} row "${label}" shows a dollar figure`);
          if (HAS_GATE.test(label) && ![...docLabels].some(doc => label.startsWith(doc))) problems.push(`${repo.key} row "${label}" has a gate word that is not the document's own text`);
        }
        if (said.includes(m.text) || !m.text) continue; // the learner's own words are not a Tutor sentence
        if (MONEY.test(m.text)) problems.push(`${repo.key} ${m.key} shows a dollar figure`);
        for (const word of m.text.match(GATE) || []) {
          const own = word.toLowerCase() === repo.name.toLowerCase() || docText.includes(word.toLowerCase());
          if (FIXED.has(m.key) || !own) problems.push(`${repo.key} ${m.key} says "${word}" outside document-derived text`);
        }
      }
    }
    assert.deepEqual([...new Set(problems)], []);
  });

  // 10
  await step('10 no page error and no 5xx from the learn routes during the run', async () => {
    assert.deepEqual(errors.filter(e => !/ResizeObserver/.test(e)), []);
    assert.deepEqual([...new Set(bad)], []);
  });
} catch (error) {
  failed = true;
  console.log(`setup failed: ${String(error.message).split('\n')[0]}`);
} finally {
  // Cleanup is this run's own: only the canvases and projects it made; a failure here is shown and does not stop the rest.
  await browser?.close().catch(error => console.log(`cleanup: browser ${error.message.split('\n')[0]}`));
  for (const name of made.canvases) await api(`/api/apps/${name}`, { method: 'DELETE' }).catch(error => console.log(`cleanup: canvas ${name}: ${error.message}`));
  for (const name of made.projects) await api(`/api/repositories/${name}`, { method: 'DELETE' }).catch(error => console.log(`cleanup: project ${name}: ${error.message}`));
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${total} intake run-or-learn checks passed${results.length === total ? '' : ` (ran ${results.length})`}${failed ? '; setup failed' : ''}`);
process.exitCode = passed === total && results.length === total && !failed ? 0 : 1;
