// /explain's interactive explanation (L10, owner 2026-10-21) against the LOCAL stack only. The board save is REAL; the
// /api/learn/artifact answer is replayed in the browser - by default the authoring contract's own example, or with
// SCENES=<dir> each recorded real /explain answer there (<id>.json: { args, response }) - and every other model-capable request
// is aborted and counted, so this check never calls a model.
//   1. the selected-command pill reads "Add explanation", with no /;
//   2. an interactive /explain answer becomes an Animation card drawn by the scene renderer, with its controls;
//   3. every control setting, every combination of the controls included (inputStates, as the gates and the verifier see them):
//      the card's values and texts are the ones the scene evaluator computes for it (scene-evaluate.js);
//   4. a moved control is saved with the board, and a fresh browser shows the card in that state;
//   5. a refused scene (validation_error: the verifier pass's words) adds no card and saves nothing, keeps the line, says what
//      failed, makes no further request until the learner clicks, and its plain-explanation offer makes a text card;
//   6. View > Slash commands: /explain's Interactive visual examples work there, and opening it generates nothing.
// Steps 2-4 run for every replayed scene. THEME=dark runs it in the dark theme.
// Usage: BASE=http://127.0.0.1:9311 SMALL_CP=http://127.0.0.1:9313 VARS=<stack .dev.vars> [SCENES=<dir>] [THEME=dark] node e2e/explain-scene-check.mjs [shotsDir]
import { openSlashHelp } from './canvas-menu-helpers.mjs';
import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { evaluateScene } from '../src/scene-evaluate.js';
import { formatCell } from '../src/scene-format.js';
import { SCENE_EXAMPLE } from '../../control-plane/src/agents/learn-scene-author.js';
import { inputStates } from '../../control-plane/src/learn-scene-gates.js';

const BASE = process.env.BASE || 'http://127.0.0.1:9311';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9313';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('explain-scene-check runs against the local stack only');
const THEME = process.env.THEME === 'dark' ? 'dark' : 'light';
const OUT = process.argv[2] || 'explain-scene-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `xsc-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, origin: BASE, 'content-type': 'application/json' } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(`${init.method || 'GET'} ${path}: HTTP ${response.status} ${body?.error || ''}`);
  return body;
};

// The answers replayed: recorded real outputs, or the contract's example (a fixture, said so in the output).
const fixture = { id: 'contract-example', origin: 'fixture', args: 'interactive: how weights decide a final grade',
  response: { result: 'artifact', primitive: 'animation', block: { type: 'animation', title: SCENE_EXAMPLE.title, scene: SCENE_EXAMPLE, time: SCENE_EXAMPLE.duration, selectedObject: null, marked: null, calculation: 'live' } } };
const scenes = process.env.SCENES
  ? readdirSync(process.env.SCENES).filter(name => name.endsWith('.json')).map(name => ({ id: name.replace(/\.json$/, ''), origin: 'generated', ...JSON.parse(readFileSync(join(process.env.SCENES, name), 'utf8')) }))
    .filter(entry => entry.response?.result === 'artifact' && entry.response.primitive === 'animation')
  : [fixture];
if (!scenes.length) throw Error('no interactive scene to replay');

const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Explain scenes ${run}` }) });
const board = () => api(`/api/learn/boards/${canvas.name}/main`).then(out => out.state);

// A refusal in the verifier pass's own form (learn-artifact.js sceneVerdict), as the binary-search@4 rerun would get it.
const INVALID = { result: 'validation_error', primitive: 'animation', error: 'A check of the card found statements that are false: 1) with step = Step 1, "stepText" says "Range 0..6.", against "[1, 1, 1, 1, 1, 1, 1, 1, 0, 0]": the drawn range keeps index 7, so it is 0..7, not 0..6. 2) with step = Step 2, "stepText" says "Range 4..6.", against "[0, 0, 0, 0, 1, 1, 1, 1, 0, 0]": the drawn range is 4..7.' };
const PLAIN = { result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 'Binary search, in words', body: 'Each step halves the range that can still hold the target.' } };
let next = null; // the answer the artifact route gives next
const posts = [], refused = [], outside = [], errors = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|selection|board$|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|video|transcribe|tts|voice\/|dive|explore|course))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE && !['data:', 'blob:'].includes(url.protocol)) { outside.push(url.hostname); return route.abort(); }
  if (url.pathname === '/api/learn/artifact') { posts.push(request.postDataJSON()); return route.fulfill({ json: next }); }
  if (['/api/learn/tutor/next-steps', '/api/learn/next-steps'].includes(url.pathname)) return route.fulfill({ json: { options: [], suggestions: [], fingerprint: null } });
  if (MODEL.test(url.pathname) && request.method() !== 'GET') { refused.push(url.pathname); return route.abort(); }
  return route.fallback();
};

const results = [];
const total = 3 + 3 * scenes.length;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); }
};
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 150)); } throw Error(label); };

const browser = await chromium.launch();
const open = async () => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, colorScheme: THEME });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', router);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-chat-pane] [data-chat-composer]').first().waitFor({ timeout: 60000 });
  return { context, page };
};
const composerOf = page => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"])').first();
const send = async (page, text) => { const box = composerOf(page); await box.click(); await box.fill(text); await page.waitForTimeout(150); await box.press('Enter'); };
const blockIds = page => page.locator('[data-block-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-block-id')).filter(id => !id.startsWith('slot')));
const newCard = async (page, before) => { let id = null; await until(async () => !!(id = (await blockIds(page)).find(entry => !before.includes(entry))), 'no new card', 30000); return id; };

// What the scene evaluator says the card shows at these inputs: each visible text's words, and each strip or grid's numbers.
const expected = (scene, inputs) => {
  const { state } = evaluateScene(structuredClone(scene), scene.duration, inputs);
  return state.objects.filter(object => object.visible && object.opacity > 0.01).flatMap(object => {
    if (object.type === 'text') return [{ id: object.semanticId, texts: [object.label] }];
    if (['strip', 'grid'].includes(object.type)) return [{ id: object.semanticId, texts: (object.values || []).filter(value => value != null).map(value => formatCell(value, object.numberFormat || undefined)) }];
    return [];
  });
};
const shown = (card, id) => card.locator(`[data-animation-object="${id}"] text`).evaluateAll(nodes => nodes.filter(node => Number(node.getAttribute('x')) > -9000).map(node => node.textContent));
const compare = async (card, scene, inputs) => {
  const want = expected(scene, inputs), problems = [];
  for (const { id, texts } of want) {
    const got = await shown(card, id);
    for (const text of texts) if (!got.includes(text)) problems.push(`${id}: wants "${text}", shows ${JSON.stringify(got.slice(0, 6))}`);
  }
  if (problems.length) throw Error(`${JSON.stringify(inputs)}: ${problems.slice(0, 3).join('; ')}`);
  return want.reduce((sum, entry) => sum + entry.texts.length, 0);
};
// Moves one control on the card to a value, as a learner would: its button, its switch, or its stepper.
const setInput = async (card, declaration, value) => {
  const control = card.locator(`[data-scene-controls] [data-input-control="${declaration.name}"]`);
  if (declaration.type === 'bool') { if ((await control.getAttribute('aria-checked')) !== String(value)) await control.click(); return; }
  if (declaration.type === 'index' && declaration.presentation === 'slider') {
    for (let guard = 0; guard < 80; guard++) {
      const now = Number(await control.inputValue());
      if (now === value) return;
      await card.locator(`[data-input-step="${declaration.name}:${now < value ? 'next' : 'previous'}"]`).click();
    }
    throw Error(`slider ${declaration.name} did not reach ${value}`);
  }
  await card.locator(`[data-scene-controls] [data-input-control="${declaration.name}"][data-input-value="${value}"]`).click();
};
const controlValue = async (card, declaration) => {
  const control = card.locator(`[data-scene-controls] [data-input-control="${declaration.name}"]`);
  if (declaration.type === 'bool') return (await control.getAttribute('aria-checked')) === 'true';
  if (declaration.type === 'index' && declaration.presentation === 'slider') return Number(await control.inputValue());
  const pressed = await card.locator(`[data-scene-controls] [data-input-control="${declaration.name}"][aria-pressed="true"]`).getAttribute('data-input-value');
  return declaration.type === 'index' ? Number(pressed) : pressed;
};

let { context, page } = await open();
const commandWords = 'interactive: how binary search narrows the range';

await step('the selected-command pill reads "Add explanation", with no /', async () => {
  const box = composerOf(page);
  await box.click(); await box.fill('/expl');
  await page.locator('[data-slash-command="explain"]').click();
  const pill = page.locator('[data-chat-pane] [data-command-pill="explain"]');
  await pill.waitFor();
  assert.equal((await pill.innerText()).trim(), 'Add explanation');
  assert.ok(!(await pill.innerText()).includes('/'));
  await page.screenshot({ path: `${OUT}/${THEME}-1-pill.png` });
  await box.fill('');
  await box.press('Backspace');
});

for (const entry of scenes) {
  const { scene } = entry.response.block;
  const declarations = (scene.inputs || []).filter(input => !input.hidden && input.presentation !== 'pager');
  let id = null, saved = null;
  await step(`${entry.id} (${entry.origin}): /explain ${entry.args.slice(0, 60)} makes an Animation card with its controls`, async () => {
    const before = await blockIds(page);
    next = entry.response;
    await send(page, `/explain ${entry.args}`);
    id = await newCard(page, before);
    const card = page.locator(`[data-block-id="${id}"]`);
    await card.locator('svg [data-animation-object]').first().waitFor();
    assert.equal(await card.locator('[data-scene-controls] [data-input-control]').count() > 0, declarations.length > 0, 'controls exactly when the scene declares inputs');
    await page.waitForTimeout(600);
    await card.screenshot({ path: `${OUT}/${THEME}-${entry.id}-0-card.png` });
  });
  await step(`${entry.id}: every control setting shows the values the scene evaluator computes`, async () => {
    const card = page.locator(`[data-block-id="${id}"]`);
    let checked = 0, states = 0;
    // Every setting the gates and the verifier check (inputStates: every combination of the controls), each set as a learner would.
    for (const inputs of inputStates(scene)) {
      const full = Object.fromEntries(declarations.map(declaration => [declaration.name, declaration.name in inputs ? inputs[declaration.name] : declaration.default]));
      for (const declaration of declarations) await setInput(card, declaration, full[declaration.name]);
      await page.waitForTimeout(250);
      checked += await compare(card, scene, full);
      states += 1;
      const moved = Object.entries(inputs).map(([name, value]) => `${name}-${String(value).replace(/[^\w-]/g, '')}`).join('-');
      if (moved) await card.screenshot({ path: `${OUT}/${THEME}-${entry.id}-${states}-${moved}.png` });
    }
    console.log(`   ${states} settings, ${checked} values and texts matched`);
    if (!declarations.length) return;
    // Leave the last declared control off its default, for the save and reload below.
    const last = declarations.at(-1);
    const values = last.type === 'bool' ? [!last.default] : last.type === 'choice' ? last.options.map(o => o.id).filter(v => v !== last.default) : [...Array((scene.exampleData[last.of] || []).length).keys()].filter(v => v !== last.default);
    saved = { name: last.name, value: values.at(-1) };
    for (const declaration of declarations) await setInput(card, declaration, declaration.name === saved.name ? saved.value : declaration.default);
  });
  await step(`${entry.id}: the moved control is saved with the board and a fresh browser shows it`, async () => {
    if (!saved) { console.log('   (no controls: nothing to save)'); return; }
    // Every control, not only the moved one: the walk above ends on a combination, so the others were just set back to defaults.
    const want = Object.fromEntries(declarations.map(d => [d.name, d.name === saved.name ? saved.value : d.default]));
    await until(async () => { const held = (await board()).blocks.find(block => block.id === id)?.inputs || {}; return declarations.every(d => JSON.stringify(held[d.name] ?? d.default) === JSON.stringify(want[d.name])); }, 'the server board does not hold the moved control with the others at their defaults', 20000);
    const fresh = await open();
    const card = fresh.page.locator(`[data-block-id="${id}"]`);
    await card.locator('[data-scene-controls]').waitFor({ timeout: 30000 });
    const declaration = declarations.find(d => d.name === saved.name);
    assert.deepEqual(await controlValue(card, declaration), saved.value);
    const inputs = Object.fromEntries(declarations.map(d => [d.name, d.name === saved.name ? saved.value : d.default]));
    await compare(card, scene, inputs);
    await card.screenshot({ path: `${OUT}/${THEME}-${entry.id}-reloaded.png` });
    await fresh.context.close();
  });
}

await step('a refused scene adds and saves no card, keeps the line, says what failed, retries only on a click, and its plain offer makes a text card', async () => {
  const before = await blockIds(page);
  const saved = (await board()).blocks.length, sent = posts.length;
  next = INVALID;
  await send(page, `/explain ${commandWords}`);
  const result = page.locator('[data-chat-pane] [data-slash-result]');
  await result.getByText('The interactive explanation could not be made', { exact: false }).waitFor();
  await page.waitForTimeout(800);
  assert.deepEqual(await blockIds(page), before, 'no card was added');
  assert.match(await composerOf(page).inputValue(), /binary search/, 'the line is back in the composer to retry');
  assert.equal((await result.locator('[data-slash-detail]').innerText()).trim(), 'What failed: with step = Step 1, "stepText" says "Range 0..6.", against "[1, 1, 1, 1, 1, 1, 1, 1, 0, 0]": the drawn range keeps index 7, so it is 0..7, not 0..6.', 'what failed, in the check words (its first finding)');
  assert.equal(await page.locator('[data-chat-pane] [data-slash-result] [data-slash-open]').count(), 0, 'no card to open: nothing half-made');
  assert.equal((await board()).blocks.length, saved, 'the saved board holds no new block');
  assert.equal(posts.length, sent + 1, 'one request, and no paid retry without the learner');
  await page.screenshot({ path: `${OUT}/${THEME}-invalid.png` });
  next = PLAIN;
  await result.locator('[data-slash-action]').getByText('Make a plain explanation instead').click();
  await until(async () => posts.length === sent + 2, 'the plain explanation was not requested on the click');
  const id = await newCard(page, before);
  await until(async () => (await board()).blocks.find(block => block.id === id)?.type === 'explanation', 'the plain explanation card is not saved as text');
  assert.equal(posts.at(-1).args, `in plain text: ${commandWords}`);
  await page.screenshot({ path: `${OUT}/${THEME}-plain-fallback.png` });
});

await step('View > Slash commands: /explain\'s interactive examples work there, and opening it generates nothing', async () => {
  const before = posts.length;
  await openSlashHelp(page); // // Owner brief 2026-10-22: Slash commands left View for the chat composer's slash palette
  const sheet = page.getByRole('dialog', { name: 'Slash commands' });
  await sheet.locator('[data-slash-help="explain"]').click();
  assert.equal(await sheet.locator('[data-slash-label]').innerText(), 'Add explanation');
  await sheet.getByRole('tab', { name: 'Interactive visual' }).waitFor();
  const examples = sheet.locator('[data-explain-example]');
  const count = await examples.count();
  assert.ok(count >= 1, 'an interactive example to choose');
  for (let index = 0; index < count; index++) {
    await examples.nth(index).click();
    const card = sheet.locator('[data-slash-card="animation"]');
    await card.locator('svg [data-animation-object]').first().waitFor();
    const origin = await examples.nth(index).getAttribute('data-explain-example-origin');
    assert.ok(['generated', 'fixture'].includes(origin));
    const control = card.locator('[data-scene-controls] [data-input-control]').first();
    if (await control.count()) {
      const svg = await card.locator('svg').first().innerHTML();
      const stepper = card.locator('[data-input-step$=":next"]').first();
      if (await stepper.count() && await stepper.isEnabled()) await stepper.click();
      else await card.locator('[data-scene-controls] [data-input-control]:not([aria-pressed="true"])').first().click();
      await until(async () => (await card.locator('svg').first().innerHTML()) !== svg, `example ${index + 1}: moving its control changed nothing`, 5000);
    }
    await sheet.screenshot({ path: `${OUT}/${THEME}-sheet-example-${index + 1}.png` });
  }
  assert.equal(posts.length, before, 'the window posted no artifact request');
  await page.keyboard.press('Escape');
});

console.log(`${results.filter(Boolean).length}/${total} passed (theme ${THEME}; scenes: ${scenes.map(entry => `${entry.id} [${entry.origin}]`).join(', ')})`);
console.log(`model-capable requests refused: ${refused.length}; outside requests aborted: ${new Set(outside).size}; page errors: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(' | ')})` : ''}`);
await browser.close();
process.exit(results.length === total && results.every(Boolean) && !errors.length ? 0 : 1);
