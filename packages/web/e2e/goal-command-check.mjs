// /goal and goal management (owner, 2026-10-21) against the LOCAL stack only: typed /goal and /goal <words>, the / picker's
// Goal pill (x and Backspace remove it), Progress's Set a goal, then add, edit, a goal changed in another tab, switch, delete
// (inactive and current) and a reload, by mouse and keyboard, at a narrow width and in both themes. Real goals through the
// real /api/learn/coaching on local D1; nothing is stubbed. Every model-capable request (and the chat router) is aborted and
// counted, and none may happen: opening goal management and saving goals make zero AI calls. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/goal-command-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('goal-command-check runs against the local stack only');
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `goalcmd-${Date.now().toString(36)}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();

const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Goals ${Date.now().toString(36)}` }) });
const catalog = await api('/api/apps');
const CARD = { id: 'c-goal', type: 'explanation', dx: 0, dy: 0, title: 'Balance sheets', body: 'Assets equal liabilities plus equity.' };
const SEEDS = { [`small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`]: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [CARD] } };
const coachingOf = async () => (await api(`/api/learn/coaching?app=${canvas.name}&board=main`)).state;
const listed = state => state.goals.filter(goal => goal.lifecycle !== 'archived');

const browser = await chromium.launch();
const errors = [], model = [];
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(seeds => { for (const [key, value] of Object.entries(seeds)) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, SEEDS);
const modelRoute = (path, method) => path === '/api/learn/ask' || path === '/api/learn/chat/route' || path.startsWith('/api/learn/tutor/') || path === '/api/learn/artifact'
  || path === '/api/learn/home-ask' || path === '/api/ask' || path.startsWith('/api/learn/inline') || (path === '/api/learn/journey' && method === 'POST');
await context.route('**/api/**', route => {
  const request = route.request(), url = new URL(request.url());
  if (modelRoute(url.pathname, request.method())) { model.push(`${request.method()} ${url.pathname}`); return route.abort(); }
  return route.continue();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));

const total = 13;
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (name, target = page) => { if (SHOTS) await target.screenshot({ path: `${SHOTS}/${name}.png` }); };
// Waits for a condition the step asserts (polled, bounded), never a fixed pause.
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; for (;;) { const value = await fn(); if (value) return value; if (Date.now() > end) throw Error(`timed out: ${label}`); await new Promise(resolve => setTimeout(resolve, 100)); } };
const chatPane = (p = page) => p.locator('[data-chat-pane]');
const field = (p = page) => chatPane(p).locator('[data-chat-composer] textarea').first();
const pill = (p = page) => chatPane(p).locator('[data-chat-composer] [data-command-pill="goal"]');
const manager = (p = page) => p.locator('[data-goal-manager]');
const item = (label, p = page) => manager(p).locator('[data-goal-item]').filter({ hasText: label });
const newGoal = (p = page) => manager(p).locator('[data-goal-new]');
const progressPane = (p = page) => p.locator('[data-progress-pane]');
const title = (p = page) => p.locator('#progress-title');
const open = async (p = page) => { await p.goto(`${BASE}/apps/${canvas.name}`); await chatPane(p).waitFor({ state: 'visible', timeout: 60000 }); await field(p).waitFor({ timeout: 30000 }); };
const send = async (text, p = page) => { await field(p).click(); await field(p).fill(text); await field(p).press('Enter'); };
// A bare /goal: Enter on the open picker makes the Goal pill, and Enter again runs it.
const goalCommand = async (p = page) => { await field(p).click(); await field(p).fill('/goal'); await field(p).press('Enter'); await pill(p).waitFor(); await field(p).press('Enter'); };

// Add goal is the house primary Button (ui.jsx variant primary): --color-primary-fill with white text in both themes, a darker
// hover, a visible keyboard focus ring. Its white-on-blue contrast is measured and printed; the check holds the WCAG 1.4.3
// 4.5:1 floor for small text (white on the accent blue was 3.9:1; the owner decided to raise it, 2026-10-22 "contrast yes").
const primaryLooks = async () => {
  const add = manager().locator('[data-goal-add-save]');
  // Add goal is disabled until the saved goals have loaded (GoalManager `ready`), and a disabled button is skipped by Tab:
  // wait for that observable state, then assert the order.
  await until(() => add.isEnabled(), 'Add goal enabled once the saved goals load');
  await newGoal().focus();
  await page.keyboard.press('Tab'); // the outcome field
  await page.keyboard.press('Tab'); // Add goal, by keyboard: focus-visible
  assert.equal(await add.evaluate(node => node === document.activeElement), true, 'Add goal is next in the Tab order');
  const [bg, fg, outline] = await add.evaluate(node => [getComputedStyle(node).backgroundColor, getComputedStyle(node).color, getComputedStyle(node).outlineStyle]);
  assert.deepEqual([bg, fg], ['rgb(27, 111, 194)', 'rgb(255, 255, 255)'], 'the primary fill with white text');
  assert.notEqual(outline, 'none', 'a visible focus ring');
  const ratio = await page.evaluate(([a, b]) => { const lum = c => { const [r, g, bl] = c.match(/\d+/g).slice(0, 3).map(n => { n /= 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; }; const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }, [fg, bg]);
  console.log(`primary button contrast ${ratio.toFixed(2)}:1`);
  assert.ok(ratio >= 4.5, `contrast ${ratio.toFixed(2)}:1`);
  await add.hover();
  await until(async () => (await add.evaluate(node => getComputedStyle(node).backgroundColor)) === 'rgb(22, 92, 163)', 'the hover blue');
  await page.mouse.move(0, 0);
};

await check('typed /goal <words> opens goal management with the words in a new goal, not saved; the composer is cleared', async () => {
  await open();
  await send('/goal read a balance sheet with confidence');
  await manager().waitFor({ timeout: 15000 });
  // The words land in a passive effect after the manager mounts (GoalManager.jsx seed), so wait for them, as step 3 does.
  await until(async () => (await newGoal().inputValue()) === 'read a balance sheet with confidence', 'the words fill the new goal field');
  await until(async () => (await page.evaluate(() => document.activeElement?.id)) === 'goal-new', 'focus in the new goal field');
  assert.equal(listed(await coachingOf()).length, 0, 'not auto-saved');
  assert.equal(await field().inputValue(), '');
  await shot('goal-01-typed-light');
});

await check('the / picker offers Goal; picking it makes the inline Goal pill, which x and Backspace remove, keeping the words', async () => {
  // Owner 2026-10-22: Progress is a tab of Chat's panel, so /goal left Chat behind it; the Chat tab brings the composer back.
  await page.locator('[data-panel-tab="chat"]').click();
  await field().click();
  await field().fill('/go');
  await chatPane().locator('[data-slash-command="goal"]').click();
  await pill().waitFor();
  assert.equal((await pill().innerText()).trim(), 'Goal');
  await chatPane().getByRole('button', { name: 'Remove Goal', exact: true }).click();
  await until(async () => (await pill().count()) === 0, 'x removes the pill');
  await field().fill('/goal');
  await field().press('Enter'); // Enter on the open picker picks Goal
  await pill().waitFor();
  await field().fill('learn chess openings');
  await field().press('Home');
  await field().press('Backspace');
  await until(async () => (await pill().count()) === 0, 'Backspace at the start removes the pill');
  assert.equal(await field().inputValue(), 'learn chess openings', 'the words stay');
});

await check('the picked pill with words, sent, opens the same goal management with the new words', async () => {
  await field().fill('/');
  await chatPane().locator('[data-slash-command="goal"]').click();
  await pill().waitFor();
  await field().fill('learn chess openings');
  await field().press('Enter');
  await until(async () => (await newGoal().inputValue()) === 'learn chess openings', 'the new words fill the field');
  assert.equal(listed(await coachingOf()).length, 0, 'still nothing saved');
});

await check('add two goals (button, then Enter); each is saved and the newest is current; Add goal is the blue primary button', async () => {
  await primaryLooks();
  await manager().locator('[data-goal-add-save]').click();
  await item('learn chess openings').waitFor();
  await newGoal().fill('Read a balance sheet');
  await newGoal().press('Enter');
  await item('Read a balance sheet').waitFor();
  const state = await coachingOf();
  assert.deepEqual(listed(state).map(goal => goal.label), ['learn chess openings', 'Read a balance sheet']);
  assert.equal(await item('Read a balance sheet').getAttribute('data-goal-current'), 'true');
  assert.equal(state.activeGoalId, listed(state)[1].goalId);
  assert.equal(await newGoal().inputValue(), '', 'the field clears after a save');
});

await check('edit by keyboard: Escape cancels without closing Progress; Enter saves the new words', async () => {
  await item('learn chess openings').locator('[data-goal-edit]').click();
  const label = manager().locator('[data-goal-edit-label]');
  await label.fill('Chess: the Italian opening');
  await label.press('Escape');
  await until(async () => (await label.count()) === 0, 'Escape closes the edit');
  assert.equal(await manager().isVisible(), true, 'Progress stays open');
  await item('learn chess openings').locator('[data-goal-edit]').click();
  await label.fill('Chess: the Italian opening');
  await label.press('Enter');
  await item('Chess: the Italian opening').waitFor();
  assert.ok(listed(await coachingOf()).some(goal => goal.label === 'Chess: the Italian opening'));
});

await check('a goal changed in another tab: the saved version is shown, the edit is kept, and Save again saves it', async () => {
  await item('Read a balance sheet').locator('[data-goal-edit]').click();
  await manager().locator('[data-goal-edit-label]').fill('Balance sheets, my words');
  let state = await coachingOf();
  const goal = listed(state).find(entry => entry.label === 'Read a balance sheet');
  await api('/api/learn/coaching', { method: 'POST', body: JSON.stringify({ app: canvas.name, board: 'main', actionId: `other-tab-${Date.now()}`, expectedRevision: state.revision, action: 'edit_goal', payload: { goalId: goal.goalId, revision: goal.revision, label: 'Balance sheets (other tab)' } }) });
  await manager().locator('[data-goal-save]').click();
  await manager().locator('[data-goal-conflict]').waitFor();
  assert.match(await manager().locator('[data-goal-conflict]').innerText(), /Balance sheets \(other tab\)/);
  assert.equal(await manager().locator('[data-goal-edit-label]').inputValue(), 'Balance sheets, my words', 'the edit is kept');
  await manager().locator('[data-goal-save]').click();
  await item('Balance sheets, my words').waitFor();
  state = await coachingOf();
  assert.ok(listed(state).some(entry => entry.label === 'Balance sheets, my words'));
});

await check('switch the current goal; Progress shows it as current at once', async () => {
  await item('Chess: the Italian opening').locator('[data-goal-switch]').click();
  await until(async () => (await item('Chess: the Italian opening').getAttribute('data-goal-current')) === 'true', 'the chess goal is current');
  const state = await coachingOf();
  assert.equal(listed(state).find(goal => goal.goalId === state.activeGoalId).label, 'Chess: the Italian opening');
  // Owner 2026-10-22: the panel header names the view; Back (in place of Done) returns to the overview.
  assert.equal(await title().innerText(), 'Progress: Learning Goals');
  assert.equal(await page.getByText('Your learning goals', { exact: true }).count(), 0, 'no second heading');
  await manager().locator('[data-goal-back]').click();
  await page.locator('[data-progress-goal]').waitFor();
  assert.equal(await title().innerText(), 'Progress');
  assert.match(await page.locator('[data-progress-goal] option:checked').innerText(), /Chess: the Italian opening \(current\)/);
  // One current indicator: the selector's "(current)"; no "Your current goal" line under it.
  assert.equal(await progressPane().getByText('Your current goal', { exact: true }).count(), 0);
  // A goal with no skills says so, never "0 of 0" over an empty "Your skills".
  await progressPane().locator('[data-progress-no-skills]').waitFor({ timeout: 15000 });
  assert.match(await progressPane().locator('[data-progress-no-skills]').innerText(), /^No skills tracked yet\n/);
  assert.equal(await progressPane().locator('[data-progress-count]').count(), 0, 'no count');
  assert.equal(await progressPane().getByText('Your skills', { exact: true }).count(), 0, 'no empty skills section');
  await page.locator('[data-progress-manage]').click();
  await manager().waitFor();
});

await check('Back returns to the overview and Close leaves Progress; neither saves nor discards the add and edit drafts, which also survive the Chat tab', async () => {
  const before = listed(await coachingOf()).map(goal => goal.label);
  await newGoal().fill('Draft goal, unsaved');
  await manager().locator('[data-goal-new-outcome]').fill('Explain it to a friend');
  await item('Balance sheets, my words').locator('[data-goal-edit]').click();
  await manager().locator('[data-goal-edit-label]').fill('Balance sheets, draft edit');
  const drafts = async () => [await newGoal().inputValue(), await manager().locator('[data-goal-new-outcome]').inputValue(), await manager().locator('[data-goal-edit-label]').inputValue()];
  const DRAFTS = ['Draft goal, unsaved', 'Explain it to a friend', 'Balance sheets, draft edit'];
  // Back by keyboard: the first control under the header, after Close in the Tab order; focus returns to the heading.
  await progressPane().locator('[data-progress-close]').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-goal-back')), true, 'Tab from Close reaches Back');
  const [backBox, titleBox] = [await manager().locator('[data-goal-back]').boundingBox(), await title().boundingBox()];
  assert.ok(backBox.y >= titleBox.y + titleBox.height - 1 && Math.abs(backBox.x - titleBox.x) <= 12, `Back sits left-aligned below the header (${JSON.stringify([backBox, titleBox])})`);
  await page.keyboard.press('Enter');
  await page.locator('[data-progress-goal]').waitFor();
  await until(async () => (await page.evaluate(() => document.activeElement?.id)) === 'progress-title', 'focus on the Progress heading after Back');
  await page.locator('[data-progress-manage]').click();
  await manager().waitFor();
  assert.deepEqual(await drafts(), DRAFTS, 'Back kept both drafts');
  await progressPane().locator('[data-progress-close]').click();
  await chatPane().waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-panel-tab="chat"]').getAttribute('aria-selected'), 'true', 'Close goes back to Chat');
  await page.locator('[data-panel-tab="progress"]').click();
  await manager().waitFor();
  assert.equal(await title().innerText(), 'Progress: Learning Goals', 'reopens where it was');
  assert.deepEqual(await drafts(), DRAFTS, 'Close kept both drafts');
  await page.locator('[data-panel-tab="chat"]').click();
  await page.locator('[data-panel-tab="progress"]').click();
  assert.deepEqual(await drafts(), DRAFTS, 'a tab switch kept both drafts');
  assert.deepEqual(listed(await coachingOf()).map(goal => goal.label), before, 'nothing saved or discarded');
  await manager().locator('[data-goal-edit-label]').press('Escape');
  await newGoal().fill('');
  await manager().locator('[data-goal-new-outcome]').fill('');
});

await check('delete an inactive goal with the inline confirmation (Cancel first); the current goal stays', async () => {
  await newGoal().fill('Spanish verbs');
  await manager().locator('[data-goal-add-save]').click();
  await item('Spanish verbs').waitFor();
  await item('Chess: the Italian opening').locator('[data-goal-switch]').click();
  await until(async () => (await item('Chess: the Italian opening').getAttribute('data-goal-current')) === 'true', 'chess current again');
  await item('Spanish verbs').locator('[data-goal-delete]').click();
  await item('Spanish verbs').locator('[data-goal-confirm]').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await item('Spanish verbs').count(), 1, 'Cancel deletes nothing');
  await item('Spanish verbs').locator('[data-goal-delete]').click();
  await item('Spanish verbs').locator('[data-goal-confirm-delete]').click();
  await until(async () => (await item('Spanish verbs').count()) === 0, 'deleted');
  const state = await coachingOf();
  assert.deepEqual(listed(state).map(goal => goal.label).sort(), ['Balance sheets, my words', 'Chess: the Italian opening']);
  assert.equal(listed(state).find(goal => goal.goalId === state.activeGoalId).label, 'Chess: the Italian opening');
});

await check('delete the current goal by keyboard: no current goal, the remaining goal offered to choose; it survives a reload', async () => {
  await item('Chess: the Italian opening').locator('[data-goal-delete]').click();
  await page.keyboard.press('Enter'); // focus is on the confirmation's Delete
  await manager().locator('[data-goal-choose]').waitFor();
  assert.equal((await coachingOf()).activeGoalId, null);
  await item('Balance sheets, my words').locator('[data-goal-switch]').click();
  await until(async () => (await item('Balance sheets, my words').getAttribute('data-goal-current')) === 'true', 'chosen');
  await page.reload();
  await open();
  await goalCommand();
  await manager().waitFor();
  // The saved goals load after the reload: wait for the server-confirmed list, never read the loading state as empty.
  await item('Balance sheets, my words').waitFor();
  assert.deepEqual(await manager().locator('[data-goal-item]').evaluateAll(nodes => nodes.map(node => node.innerText.split('\n')[0])), ['Balance sheets, my words']);
  assert.equal(await item('Balance sheets, my words').getAttribute('data-goal-current'), 'true', 'the current goal persisted');
});

await check('Set a goal in an empty Progress opens the same goal management, focused on a new goal', async () => {
  await item('Balance sheets, my words').locator('[data-goal-delete]').click();
  await item('Balance sheets, my words').locator('[data-goal-confirm-delete]').click();
  await manager().locator('[data-goal-empty]').waitFor();
  await manager().locator('[data-goal-back]').click();
  await page.locator('[data-progress-empty]').waitFor();
  await page.locator('[data-progress-set-goal]').click();
  await manager().waitFor();
  await until(async () => (await page.evaluate(() => document.activeElement?.id)) === 'goal-new', 'focus in the new goal field');
  assert.equal(listed(await coachingOf()).length, 0);
  await shot('goal-02-set-a-goal-light');
});

await check('dark theme: goal management renders with the dark tokens; Add goal stays blue with white text', async () => {
  await page.evaluate(() => localStorage.setItem('small.theme', 'dark'));
  await open();
  await send('/goal practise mental arithmetic');
  await manager().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
  const [fg, bg] = await newGoal().evaluate(node => [getComputedStyle(node).color, getComputedStyle(node).backgroundColor]);
  assert.notEqual(fg, bg, 'readable field');
  await primaryLooks();
  await manager().locator('[data-goal-add-save]').click();
  await item('practise mental arithmetic').waitFor();
  await shot('goal-03-dark');
  await page.evaluate(() => localStorage.setItem('small.theme', 'light'));
});

await check('narrow screen: /goal shows goal management at full width with no sideways scroll; Back returns to Progress', async () => {
  const phone = await context.newPage();
  phone.on('pageerror', error => errors.push(error.message));
  await phone.setViewportSize({ width: 390, height: 844 });
  await open(phone);
  await goalCommand(phone);
  await manager(phone).waitFor();
  const pane = await manager(phone).boundingBox();
  assert.ok(pane && pane.x >= 0 && pane.x + pane.width <= 390 + 1, `inside the screen (${JSON.stringify(pane)})`);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways scroll');
  assert.equal(await chatPane(phone).isVisible(), false, 'Progress takes the column');
  await item('practise mental arithmetic', phone).waitFor();
  for (const control of ['[data-goal-back]', '[data-goal-add-save]', '[data-goal-new-outcome]']) {
    const box = await manager(phone).locator(control).boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390 + 1, `${control} inside the screen`);
  }
  await shot('goal-04-narrow-light', phone);
  await manager(phone).locator('[data-goal-back]').click();
  await phone.locator('[data-progress-goal]').waitFor();
  await phone.close();
});

assert.deepEqual(model, [], `no model request: ${model.join()}`);
assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
console.log(`${results.length}/${total} checks passed`);
await browser.close();
if (results.length !== total) process.exit(1);
