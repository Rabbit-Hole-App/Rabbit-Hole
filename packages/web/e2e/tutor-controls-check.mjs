// Tutor controls and entry (C:/s/spec/tutor-workflow/draft.md Tasks 03 and 04; owner decisions 1a, 3a, 4a), against the
// LOCAL stack only: local D1, a fresh browser profile, the real GET/POST /api/learn/coaching. No model is called: every
// model-capable request is aborted and counted, and only the steps that are the learner's explicit request may make one.
// Prints no secrets.
// Usage: BASE=http://127.0.0.1:9251 SMALL_CP=http://127.0.0.1:9253 VARS=<cp .dev.vars> node e2e/tutor-controls-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:9251';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9253';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('tutor-controls-check runs against the local stack only');
const SHOTS = process.argv[2] || 'tutor-controls-shots';
mkdirSync(SHOTS, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `tutorctl-${Date.now().toString(36)}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();
const coachingOf = async name => (await api(`/api/learn/coaching?app=${name}&board=main`)).state;
// Tutor ladder R2: the Auto-suggest switch is the learner's own setting on every canvas (GET/POST /api/learn/user-settings), not the canvas record.
const suggestOf = async name => (await api(`/api/learn/user-settings?app=${name}&board=main`)).settings.autoSuggest;

const CARD = { id: 'c-knn', type: 'explanation', dx: 0, dy: 0, title: 'KNN notes', body: 'KNN uses nearby examples.' };
const board = blocks => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks });
const catalog = await api('/api/apps');
const made = async (title, blocks) => { const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title }) }); return { name: canvas.name, key: `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`, blocks }; };
const work = await made(`Logistic Regression ${Date.now().toString(36)}`, [CARD]);
const blank = await made('Untitled', []);
const resume = await made(`Threshold practice ${Date.now().toString(36)}`, [CARD]);
const SEEDS = Object.fromEntries([work, blank, resume].map(c => [c.key, board(c.blocks)]));

// A saved activity for the resume entry, through the real coaching route (no model): a goal, then its activity.
const post = (name, state, action, payload) => api('/api/learn/coaching', { method: 'POST', body: JSON.stringify({ app: name, board: 'main', actionId: `${action}-${Date.now()}`, expectedRevision: state.revision, action, payload }) });
{
  let state = await coachingOf(resume.name);
  state = (await post(resume.name, state, 'create_goal', { label: 'Logistic regression thresholds', criteria: [{ criterionId: 'c1', label: 'Read a threshold', requirement: 'Explain what moving the threshold changes', requiresReasoning: true }] })).state;
  const goal = state.goals[0];
  state = (await post(resume.name, state, 'activate_activity', { activity: { goalId: goal.goalId, objective: 'Threshold comparison', prompt: 'Which threshold catches more positives, and what does it cost?', responseKind: 'text', criterionRefs: [{ criterionId: 'c1', version: 1 }] } })).state;
  state = (await post(resume.name, state, 'save_controls', { event: { type: 'select_mode', mode: 'tutor' } })).state;
  assert.ok(state.activeActivityId, 'the resume canvas has a saved activity');
}

const browser = await chromium.launch();
const errors = [], model = [], coaching = [];
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(seeds => { for (const [key, value] of Object.entries(seeds)) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, SEEDS);
// Every model-capable route is aborted and counted (hooks, Learn ask, artifacts, Home ask, journey actions).
const modelRoute = (path, method) => path === '/api/learn/ask' || path.startsWith('/api/learn/tutor/') || path === '/api/learn/artifact' || path === '/api/learn/home-ask' || path === '/api/ask';
await context.route('**/api/**', route => {
  const request = route.request(), path = new URL(request.url()).pathname;
  if (path === '/api/learn/coaching') coaching.push(request.method());
  if (modelRoute(path, request.method())) { model.push(`${request.method()} ${path}`); return route.abort(); }
  return route.continue();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (name, target = page) => { await target.waitForTimeout(400); await target.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const settle = (ms = 350) => page.waitForTimeout(ms);
const pane = (p = page) => p.locator('[data-chat-pane]');
const field = (p = page) => pane(p).locator('[data-chat-composer] textarea').first();
const modeButton = (p = page) => pane(p).getByRole('button', { name: 'Mode', exact: true });
const tutorSwitch = (p = page) => pane(p).getByRole('switch', { name: 'Auto-suggest' });
const pickMode = async (label, p = page) => { await modeButton(p).click(); await p.getByRole('menuitemradio', { name: new RegExp(`^${label}`) }).click(); await p.waitForTimeout(350); };
const quiet = async (label, before, ms = 3000) => { await page.waitForTimeout(ms); assert.deepEqual(model.slice(before), [], `${label}: no model request`); };
// Start Rabbit Hole from a card's right-click menu (owner spec 2026-10-29: /dive left the commands; the card menu is the way down,
// card-context-menu-check.mjs). id: a card's block id, else the first content card whose menu offers it (a heading has none).
const startHole = async (page, id = null) => {
  const cards = id ? page.locator(`[data-block-id="${id}"]`) : page.locator('[data-block-id]:not([data-chat-block])');
  const item = page.locator('[data-canvas-menu] [data-menu-start-rabbit-hole]');
  for (let i = 0, n = Math.min(await cards.count(), 8); i < n; i++) {
    const strip = cards.nth(i).locator('[data-drag-zone]').last();
    if (!await strip.count()) continue;
    await strip.scrollIntoViewIfNeeded();
    await strip.click({ button: 'right', position: { x: 30, y: 10 } });
    await page.locator('[data-canvas-menu]').waitFor({ timeout: 5000 });
    if (await item.count()) {
      await item.click();
      await page.waitForFunction(() => location.search.includes('hole='), null, { timeout: 15000 });
      return;
    }
    await page.keyboard.press('Escape');
  }
  throw Error(`no card here offers Start Rabbit Hole${id ? ` (${id})` : ''}`);
};
const open = async (name, p = page) => { await p.goto(`${BASE}/apps/${name}`); await pane(p).waitFor({ state: 'visible', timeout: 60000 }); await p.locator('[data-chat-composer] textarea').first().waitFor({ timeout: 30000 }); await p.waitForTimeout(1500); };
const box = async locator => (await locator.boundingBox()) || { x: -1, y: -1, width: 0, height: 0 };

await check('opening a canvas makes no model request; Auto is the default and the Auto-suggest switch is shown', async () => {
  const before = model.length;
  await open(work.name);
  assert.match(await modeButton().innerText(), /Auto/);
  assert.equal(await tutorSwitch().count(), 1, 'the Auto-suggest switch is shown in Auto (R2)');
  assert.equal(await page.locator('[data-tutor-entry]').count(), 0, 'no Tutor entry outside Tutor');
  assert.equal(await page.locator('[data-next-steps]').count(), 0, 'no hooks card in Auto');
  await quiet('open', before);
});

await check('selecting Tutor keeps the On switch immediately beside the mode, keeps the draft and asks no model', async () => {
  const before = model.length;
  await field().fill('my own words, unsent');
  await pickMode('Tutor');
  await tutorSwitch().waitFor({ timeout: 10000 });
  assert.equal(await tutorSwitch().getAttribute('aria-checked'), 'true', 'a new canvas record starts On');
  const mode = await box(modeButton()), sw = await box(tutorSwitch());
  assert.ok(sw.x > mode.x + mode.width - 1 && sw.x - (mode.x + mode.width) < 24, `immediately right of Tutor (gap ${sw.x - mode.x - mode.width}px)`);
  assert.ok(Math.abs((sw.y + sw.height / 2) - (mode.y + mode.height / 2)) < 6, 'on the same control row');
  assert.match(await pane().locator('[data-tutor-switch]').innerText(), /On/, 'On is shown beside it');
  assert.equal(await field().inputValue(), 'my own words, unsent', 'the draft is kept');
  assert.equal(await page.locator('[data-tutor-entry]').count(), 0, 'typing wins: no entry card over a draft');
  await quiet('select Tutor', before);
  await shot('controls-01-tutor-on-light');
});

await check('Tutor On with existing work: no entry card (retired) and nothing is called', async () => {
  const before = model.length;
  await field().fill('');
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('[data-tutor-entry]').count(), 0, 'the old welcome and "no active lesson" entry is retired (owner 2026-11-06: always hide)');
  for (const label of ['Explain this', 'Review my work', 'Build a lesson from this']) assert.equal(await pane().getByRole('button', { name: label, exact: true }).count(), 0, label);
  await quiet('entry', before);
  await shot('controls-02-entry-existing-work-light');
});

await check('after a reload Tutor and the switch are the saved preference, still with no entry card, and no model is asked', async () => {
  const before = model.length;
  await page.waitForTimeout(1200); // the save
  await page.reload();
  await open(work.name);
  assert.match(await modeButton().innerText(), /Tutor/, 'the mode is the saved canvas preference');
  assert.equal(await tutorSwitch().getAttribute('aria-checked'), 'true');
  assert.equal(await page.locator('[data-tutor-entry]').count(), 0, 'the retired entry stays hidden after a reload');
  const saved = await coachingOf(work.name);
  assert.deepEqual([saved.controls.mode, saved.controls.tutorEnabled], ['tutor', true]);
  await quiet('reload', before);
  await shot('controls-03-paused-light');
});

await check('Ask hides the switch and keeps the saved preference; Auto shows it; back in Tutor it returns as saved', async () => {
  const before = model.length;
  await pickMode('Ask');
  assert.equal(await tutorSwitch().count(), 0);
  assert.equal(await page.locator('[data-tutor-status="resume"]').count(), 0, 'the pause line belongs to Tutor');
  await pickMode('Auto');
  assert.equal(await tutorSwitch().count(), 1);
  await page.waitForTimeout(1200);
  await page.reload();
  await open(work.name);
  assert.match(await modeButton().innerText(), /Auto/, 'Auto restored after a reload');
  await pickMode('Tutor');
  assert.equal(await tutorSwitch().getAttribute('aria-checked'), 'true');
  await quiet('mode changes', before);
});

await check('with no entry card the learner\'s Auto-suggest stays On, the mode is unchanged and there is no Undo (R2)', async () => {
  const before = model.length;
  assert.equal(await page.locator('[data-tutor-entry]').count(), 0);
  await settle(900);
  assert.equal(await tutorSwitch().getAttribute('aria-checked'), 'true', 'the switch is the learner\'s Auto-suggest, not the canvas record');
  assert.match(await modeButton().innerText(), /Tutor/, 'the mode is unchanged');
  assert.equal(await page.locator('[data-tutor-undo]').count(), 0, 'no Undo for a per-canvas value that no longer drives suggestions');
  assert.equal(await suggestOf(work.name), true);
  await shot('controls-04-own-work-light');
  await quiet('no entry', before);
});

await check('keyboard and rapid toggles: Space flips the switch; five quick presses save the last state once each, no model', async () => {
  const before = model.length;
  await tutorSwitch().focus();
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Space');
  await settle(2000);
  assert.equal(await tutorSwitch().getAttribute('aria-checked'), 'false');
  assert.equal(await suggestOf(work.name), false, 'the server holds the last choice');
  await page.keyboard.press('Space');
  await settle(1200);
  assert.equal(await suggestOf(work.name), true);
  await quiet('toggles', before);
});

await check('another tab of this canvas follows a change; a failed save says this tab only and Retry saves it', async () => {
  const before = model.length;
  const other = await context.newPage();
  await open(work.name, other);
  assert.equal(await tutorSwitch(other).getAttribute('aria-checked'), 'true');
  await tutorSwitch().click();
  await other.waitForFunction(() => document.querySelector('[data-tutor-switch]')?.dataset.tutorSwitch === 'off', null, { timeout: 10000 });
  await other.close();
  let failOnce = true;
  await page.route('**/api/learn/user-settings', route => { if (route.request().method() === 'POST' && failOnce) { failOnce = false; return route.abort(); } return route.continue(); });
  await tutorSwitch().click();
  // A failed settings save is reported in the Depth menu (DepthMenu.jsx), which carries the shared settings status.
  await pane().getByRole('button', { name: /^Depth: / }).click();
  const note = page.locator('[data-depth-status="error"]');
  await note.waitFor({ timeout: 10000 });
  assert.match(await note.innerText(), /Not saved: this change applies in this tab only/);
  assert.doesNotMatch(await note.innerText(), /devices|everywhere/i);
  assert.equal(await tutorSwitch().getAttribute('aria-checked'), 'true', 'this tab keeps the learner\'s choice');
  assert.equal(await suggestOf(work.name), false, 'the server still holds the earlier tab\'s Off');
  await shot('controls-05-save-failed-light');
  await note.getByRole('button', { name: 'Retry' }).click();
  await settle(1500);
  assert.equal(await suggestOf(work.name), true);
  await page.unroute('**/api/learn/user-settings');
  await quiet('tab sync and retry', before, 500);
});

await check('entry states: a blank canvas shows no welcome (retired); a saved activity offers the three return choices; a failed read is recovery', async () => {
  let before = model.length;
  await open(blank.name);
  await pickMode('Tutor');
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('[data-tutor-entry]').count(), 0, 'the old welcome and "no active lesson" entry is retired (owner 2026-11-06: always hide)');
  await quiet('welcome', before);
  await shot('controls-06-welcome-light');
  await open(resume.name);
  await page.locator('[data-tutor-entry="resume"]').waitFor({ timeout: 10000 });
  // Owner brief 2026-10-21 "Activity states": Continue where I left off (primary), Short recap, Quick check, Continue my own work, Not now.
  for (const label of ['Continue where I left off', 'Short recap', 'Quick check', 'Continue my own work', 'Not now']) assert.equal(await page.locator('[data-tutor-entry]').getByRole('button', { name: label, exact: true }).count(), 1, label);
  await quiet('resume entry', before);
  await shot('controls-07-resume-light');
  await page.locator('[data-tutor-choice="continue"]').click();
  // The saved activity is in progress, so its card (TutorActivity.jsx) shows the prompt, once: Continue adds no second copy.
  await page.locator('[data-tutor-activity-card]').waitFor({ timeout: 5000 });
  assert.match(await page.locator('[data-tutor-activity-card]').innerText(), /Which threshold catches more positives/);
  assert.equal(await page.locator('[data-tutor-entry]').count(), 0, 'after a choice the returning card is gone, so it does not compete with the activity');
  assert.equal(await page.getByText('Which threshold catches more positives, and what does it cost?', { exact: true }).count(), 1, 'one copy of the prompt above the composer');
  await quiet('Continue', before, 1500);
  // A failed read of the saved controls: recovery with Retry, never a new learner's welcome.
  await page.route('**/api/learn/coaching**', route => route.request().method() === 'GET' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'coaching_unavailable' }) }) : route.continue());
  await open(blank.name);
  await page.locator('[data-tutor-status="retry"]').waitFor({ timeout: 10000 });
  assert.match(await page.locator('[data-tutor-status="retry"]').innerText(), /Couldn't load your Tutor settings/);
  assert.equal(await page.locator('[data-tutor-entry]').count(), 0, 'no welcome on a failed restore');
  await page.unroute('**/api/learn/coaching**');
  await quiet('recovery', before, 1000);
  // The explicit recap is the learner's own request: exactly one model-capable request, from that press.
  await open(resume.name);
  before = model.length;
  await page.locator('[data-tutor-choice="recap"]').click();
  await page.waitForTimeout(2500);
  assert.equal(model.length - before, 1, `one request for the chosen recap: ${model.slice(before).join()}`);
});

await check('dark theme: the switch keeps its contrast', async () => {
  await page.evaluate(() => localStorage.setItem('small.theme', 'dark'));
  await open(work.name);
  await page.locator('[data-tutor-switch]').waitFor({ timeout: 10000 });
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await shot('controls-08-tutor-on-dark');
  await page.evaluate(() => localStorage.setItem('small.theme', 'light'));
});

await check('narrow screen: the switch stays beside Tutor and inside the composer', async () => {
  const before = model.length;
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 420, height: 860 });
  await open(work.name, phone);
  await tutorSwitch(phone).waitFor({ timeout: 10000 });
  const composer = await box(pane(phone).locator('[data-chat-composer]')), sw = await box(tutorSwitch(phone)), mode = await box(modeButton(phone));
  assert.ok(sw.x + sw.width <= composer.x + composer.width && sw.x >= composer.x, 'inside the composer');
  assert.ok(sw.x > mode.x + mode.width - 1, 'beside Tutor');
  await tutorSwitch(phone).scrollIntoViewIfNeeded();
  await shot('controls-10-narrow-light', phone);
  await phone.close();
  await quiet('narrow', before, 500);
});

await check('owner 4a, Tutor cleanup P2: a hole made from Tutor On opens with no turn and no waiting prompt; a reload opens with none', async () => {
  await open(work.name);
  const select = page.locator(`[data-block-id="${CARD.id}"] [data-drag-zone]`).last();
  await select.click({ position: { x: 12, y: 8 }, force: true });
  await settle();
  const before = model.length;
  // /dive left the commands (owner spec 2026-10-29): the hole is made from the card's menu. The browser Tutor is gone, so the hole
  // sends no opening question and shows no waiting prompt (hooks are a separate request, left out of the count).
  await startHole(page, CARD.id);
  await page.waitForTimeout(5000);
  assert.deepEqual(model.slice(before).filter(entry => !entry.includes('/next-steps')), [], 'the new hole sends no opening turn');
  assert.equal(await page.locator('[data-tutor-opening-waiting]').count(), 0, 'and shows no waiting prompt');
  const after = model.length;
  await page.reload();
  await page.waitForTimeout(6000);
  assert.deepEqual(model.slice(after).filter(entry => !entry.includes('/next-steps')), [], 'the reload opens with no turn');
  assert.equal(await page.locator('[data-tutor-opening-waiting]').count(), 0);
});

assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
console.log(`coaching requests: ${coaching.length} (${[...new Set(coaching)].join(', ')}); model-capable requests: ${model.length}`);
console.log(`PASS ${results.length}/12 checks`);
await browser.close();
