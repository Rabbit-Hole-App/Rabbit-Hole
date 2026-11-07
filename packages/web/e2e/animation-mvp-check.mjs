// /animation MVP qualification in the real app (AN-07, plan sections 4, 5 and 12), against the LOCAL stack only: local D1, a fresh
// browser profile, no model call. Canvases are seeded with the hand-authored contract fixtures (src/animation3d/fixtures.js: test
// data, not generation evidence) as animation3d cards naming a built-in example (block.fixtureId); the card loads them itself.
// Every expected number comes from e2e/animation-oracle.mjs, hand-written formulas that never call the runtime, so a
// plausible-looking wrong scene fails.
// Covers: /animation in Slash Commands and its composer pill, and a bare /animation makes no generation request; the watch card
// plays, pauses on the visible moment, restarts and loops without resetting its speed; each experiment parameter at its minimum,
// maximum and default moves both the scene's geometry and its readouts to the oracle's values; the mini-game's wrong and winning
// moves, hint, moves counter, a move after winning, reload (an example's state lives in the page only: it comes back at its start)
// and Reset; the dev Insert palette's More > 3D animation example and its example picker; narrow and wide cards in light and dark
// keep every control inside the card; before Interact the wheel and a drag go to the canvas and leave the scene; Interact turns the scene,
// not the canvas; Escape ends it; window blur drops a held drag; a press in Chat ends it and every typed key reaches the composer;
// the beam scene at its default view, near and far through its own camera and the canvas zoom (Z-* shots, judged by a person);
// the real request path with a fake job server in the page: /animation in Chat, its plan (title, experience, reason), an experience
// change saving version 2, Generate pressed twice making one approve and one card from the served artifact, a working control, and a
// reload restoring it with no job or model request; a browser without WebGL keeps the description and says so; no page or console
// error, no model request; before Generate a plan that looks too large offers its changes in Chat and only an accepted one gets a Generate, an unsupported
// request explains itself and offers alternatives with their cost, and a failure's explanation arrives in Chat once and stays once after a reload (fake job server: wiring only).
// Hooks: the card's data-animation-* / data-animation3d-* attributes (Animation3DCard.jsx, animation3d/Controls.jsx; lane U hand-back).
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/animation-mvp-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { openSlashHelp } from './canvas-menu-helpers.mjs';
import { experimentFixture } from '../src/animation3d/fixtures.js';
import { steppedGameArtifact, steppedStudyArtifact } from '../src/animation3d/testdata/stepped-game.mjs';
import { hashProgramSource } from '../src/animation3d/contract.js';
import { FIXTURES, expectedReadouts, expectedNodes, expectedGame, close, within, WATCH_ALLOWANCE as WATCH } from './animation-oracle.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('animation-mvp-check runs against the local stack only');
const SHOTS = process.argv[2] || 'animation-mvp-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 43; // bump with the steps below; the printed line is what CI reads
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `anim-${run}@example.com`, secret, handle: `anim_${run}` }) })).json();
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  return response.json().catch(() => null);
};

// A seeded built-in example card (lane U card.js fixtureIdOf: block.fixtureId names a fixtures.js entry). w sets its width.
const BADGE = { watch: 'Watch', experiment: 'Experiment', game: 'Mini-game' }; // card.js EXPERIENCE_LABELS
const card3d = (id, kind, w) => ({ id, type: 'animation3d', dx: 0, dy: 0, title: FIXTURES[kind].title, fixtureId: FIXTURES[kind].name, ...(w ? { w } : {}) });
const board = blocks => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks, exchanges: [] });
// Three cards per canvas: the shared viewer policy keeps at most three live WebGL viewers (plan section 5).
const catalog = await api('/api/apps');
const main = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Animation MVP ${run}` }) });
const sizes = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Animation sizes ${run}` }) });
const entry = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Animation insert ${run}` }) }); // left empty: the Insert palette fills it
const gen = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Animation request ${run}` }) }); // left empty: /animation fills it
const keyOf = name => `small.adaptive-canvas:${catalog.org}:${catalog.email}:${name}:ink`;
const SEEDS = [[keyOf(main.name), board([card3d('a-watch', 'watch'), card3d('a-exp', 'experiment'), card3d('a-game', 'game')])],
  [keyOf(sizes.name), board([card3d('a-narrow', 'experiment', 360), card3d('a-wide', 'experiment', 960)])]];

// Generation and model routes: none may be called by watching, playing or the controls. A non-GET is aborted and counted.
const MODEL = /^\/api\/(ask$|learn\/(ask|selection|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|artifact|explain|animation|chat\/material-proposals|cad\/jobs|motion))/;
const stray = [], offOrigin = [], errors = [], consoleErrors = [];
const NOTEBOOK_ORIGIN = 'https://small-learn-canvas-notebook-dev.tryrabbithole.workers.dev'; // the app page's own notebook frame (explain-program-card-check)
const results = [];
let current = null; // the page the latest open() made, for failure evidence
const glNotes = []; // console lines about WebGL contexts (Chromium warns, not errors, when it drops one) and card runtime failures
const runtimeNotes = () => glNotes.filter(note => /animation runtime/.test(note)).slice(-5).join(' | ') || 'none'; // session.js logRuntime
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) {
    results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`);
    await current?.screenshot({ path: `${SHOTS}/fail-${results.length}.png` }).catch(() => {});
  }
};
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); };

const browser = await chromium.launch();
async function fit(page) {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Shift+Digit1'); // zoom to fit, so every card is on screen
  await page.waitForTimeout(900);
}
const open = async ({ theme = 'light', canvas = main, first = 'a-watch', webgl = true, extra = null } = {}) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: theme });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(([seeds, mode]) => {
    try { localStorage.setItem('small.theme', mode); for (const [key, value] of seeds) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); } catch { /* the defaults then */ }
  }, [SEEDS, theme]);
  // A browser with no WebGL: every WebGL context request fails, as on a blocklisted GPU.
  // Interact diagnostics (bounded, the last 40 events): each card's live and active state, its Interact button's disabled state, its
  // selection, every press on an Interact button and every focus move, so an Interact that did not start names what happened.
  await context.addInitScript(() => {
    const log = window.__interactTrace = [], t0 = performance.now();
    const push = text => { log.push(`${Math.round(performance.now() - t0)}ms ${text}`); if (log.length > 40) log.shift(); };
    const who = node => node?.closest?.('[data-block-id]')?.dataset.blockId ?? '-';
    const name = node => (node?.tagName ? `${node.tagName.toLowerCase()}${[...node.attributes].filter(a => a.name.startsWith('data-')).slice(0, 2).map(a => `[${a.name}]`).join('')}` : String(node));
    const watch = () => new MutationObserver(records => { for (const { target: n, attributeName: a } of records) {
      if ((a === 'disabled' && !n.matches('[data-animation-interact]')) || (a === 'aria-current' && !n.matches('[data-block]'))) continue;
      if (a === 'disabled' || a === 'aria-current' || n.matches('[data-animation-viewport]')) push(`${who(n)} ${a}=${n.getAttribute(a) ?? 'off'}`);
    } }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-viewer-live', 'data-viewer-active', 'disabled', 'aria-current'] });
    if (document.documentElement) watch(); else document.addEventListener('DOMContentLoaded', watch);
    document.addEventListener('pointerdown', event => { const b = event.target?.closest?.('[data-animation-interact]'); if (b) push(`${who(b)} press Interact disabled=${b.disabled}`); }, true);
    document.addEventListener('focusin', event => push(`focus ${name(event.target)} in ${who(event.target)}`), true);
  });
  if (!webgl) await context.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return /webgl/i.test(kind) ? null : get.call(this, kind, ...rest); }; });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== BASE && !url.href.startsWith(`${NOTEBOOK_ORIGIN}/`) && !['data:', 'blob:'].includes(url.protocol)) { offOrigin.push(url.href); return route.abort(); }
    if (['/api/learn/tutor/next-steps', '/api/learn/next-steps'].includes(url.pathname)) return route.fulfill({ json: { options: [], suggestions: [], fingerprint: null } });
    if (MODEL.test(url.pathname) && request.method() !== 'GET') { stray.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    return route.fallback();
  });
  if (extra) await context.route('**/*', extra); // registered last, so it answers first; what it does not handle falls back to the above
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const tag = `${theme}${webgl ? '' : ' no-webgl'}`;
  page.on('pageerror', error => errors.push(`${tag}: ${error.message}`));
  // Aborted model routes log "Failed to load resource" (counted in stray instead). Without WebGL, three.js may report the refused
  // context as a console error: that refusal is the case under test there, so that context's console is not collected.
  current = page;
  page.on('console', message => { if (/webgl|context lost|too many active|animation runtime/i.test(message.text())) glNotes.push(`${message.type()}: ${message.text().slice(0, 200)}`); });
  page.on('console', message => { if (webgl && message.type() === 'error' && !/Failed to load resource/.test(message.text())) consoleErrors.push(`${tag}: ${message.text().slice(0, 300)}`); });
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await (first ? page.locator(`[data-block-id="${first}"] [data-animation3d-card]`) : page.getByRole('menubar', { name: 'Canvas menu' })).waitFor({ timeout: 60000 });
  await fit(page);
  return { context, page };
};

const parts = (page, id) => {
  const root = page.locator(`[data-block-id="${id}"]`), card = root.locator('[data-animation3d-card]'), viewport = card.locator('[data-animation-viewport]');
  return { root, card, viewport,
    play: card.locator('[data-animation3d-play]'), restart: card.locator('[data-animation-restart]'), speed: card.locator('[data-animation-speed]'),
    reset: card.locator('[data-animation-reset]'), interact: card.locator('[data-animation-interact]'),
    param: pid => card.locator(`input[data-animation-number="${pid}"]`), readout: rid => card.locator(`[data-animation-readout="${rid}"]`),
    action: aid => card.locator(`[data-animation-action="${aid}"]`) };
};
// Presentation time and loop length (needed from lane U), in seconds.
const time = async p => Number(await p.card.getAttribute('data-animation-time'));
const playing = async p => (await p.play.getAttribute('aria-pressed')) === 'true';
// The last applied frame (needed from lane U): { nodes, readouts, goal? }, current whenever the scene is paused or settled.
const frame = async p => JSON.parse(await p.viewport.getAttribute('data-animation-frame'));
const active = p => p.viewport.evaluate(node => node.hasAttribute('data-viewer-active'));
// Press Interact and wait for the scene to interact; on failure, the card's state now and the trace from open()'s init script.
const startInteract = async p => {
  await p.interact.click();
  await until(() => active(p), 'Interact did not start').catch(async error => {
    const state = await p.card.evaluate(card => { const v = card.querySelector('[data-animation-viewport]'), b = card.querySelector('[data-animation-interact]'), a = document.activeElement;
      return `disabled=${b?.disabled} pressed=${b?.getAttribute('aria-pressed')} live=${!!v?.hasAttribute('data-viewer-live')} active=${!!v?.hasAttribute('data-viewer-active')} click=${!!card.querySelector('[data-animation-click-surface]')} selected=${card.closest('[data-block]')?.getAttribute('aria-current') === 'true'} focus=${a?.tagName}${a?.closest?.('[data-block-id]') ? ` in ${a.closest('[data-block-id]').dataset.blockId}` : ''}`; }).catch(e => `unreadable: ${e.message}`);
    const trace = await p.root.page().evaluate(() => (window.__interactTrace || []).join(' | ')).catch(() => 'none');
    throw Error(`${error.message}; card: ${state}; trace: ${trace}; runtime notes: ${runtimeNotes()}`);
  });
};
// Live: the scene drew. A card beyond the visible-viewer budget waits for a click on its scene ("Click to show the 3D view").
const live = async p => {
  const isLive = () => p.viewport.evaluate(node => node.hasAttribute('data-viewer-live'));
  // Only a card that waits for a slot is clicked. A click on a scene still preparing enters Interact the moment it is ready (the click
  // surface's own rule, Animation3DCard.jsx click), which can leave the card interacting, so the next Interact press ends it instead.
  const waits = p.card.locator('[data-animation-viewport] [role="status"]', { hasText: 'Click to show the 3D view' });
  if (!(await isLive()) && await waits.count()) { await p.root.scrollIntoViewIfNeeded(); await p.card.locator('[data-animation-click-surface]').click(); }
  // On failure, every card's state on the page: which hold a live scene, which wait for a click, which failed (a viewer budget or a
  // lost context reads differently from a renderer that never drew).
  await until(isLive, 'the scene never drew its first frame', 30000).catch(async error => {
    const cards = await p.root.page().locator('[data-animation3d-card]').evaluateAll(nodes => nodes.map(n => { const v = n.querySelector('[data-animation-viewport]'), r = n.getBoundingClientRect();
      return `${n.closest('[data-block-id]')?.dataset.blockId} phase=${n.dataset.animationPhase} live=${!!v?.hasAttribute('data-viewer-live')} click=${!!n.querySelector('[data-animation-click-surface]')} failure=${n.querySelector('[data-animation-failure]')?.dataset.animationFailure ?? '-'} status="${v?.querySelector('[role="status"]')?.textContent.trim() ?? ''}" box=${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}`; })).catch(() => []);
    throw Error(`${error.message}; cards: ${cards.join(' | ')}; WebGL notes: ${glNotes.slice(-5).join(' | ') || 'none'}`);
  });
};
// The scene's pixels: identical when its camera and frame have not changed (the experiment scene is static between inputs).
// The primary readout is interface laid over the scene, not the scene: its rounded, shadowed plate is rasterized a little differently
// once the card is selected (CI fast-e2e 5a3c2e549 step 17, where an idle drag selected the card: its unselected and selected shots
// match pixel for pixel inside the viewport except the plate's corner), so it is masked out.
const pixels = p => p.card.locator('[data-animation-host]').screenshot({ mask: [p.card.locator('[data-animation-primary-readout]')] }); // inside the viewport's border, which darkens while interacting
// Opens a card's More settings and More readouts (lane U, owner 2026-10-31: past the plan's first parameter and first readout,
// settings and readouts start collapsed), so a step reaches every one of them.
const more = p => p.card.locator('details[data-animation-more]:not([open]) > summary').evaluateAll(nodes => nodes.forEach(node => node.click()));
const shot = async (page, name) => { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
// abs: an absolute allowance (the watch card's 3-decimal time, oracle WATCH_ALLOWANCE); without it, exact to float noise.
const eq = (got, want, abs) => (abs === undefined ? close(got, want) : within(got, want, abs));
const sameNodes = (got, want, label, abs) => { for (const [id, t] of Object.entries(want)) for (const k of Object.keys(t)) assert.ok(eq(got?.[id]?.[k], t[k], abs), `${label}: node ${id} ${k} ${JSON.stringify(got?.[id]?.[k])}, oracle ${JSON.stringify(t[k])}`); };
// The readouts three ways: the shown element's raw value, its text at the declared decimals, and the applied frame's value.
const sameReadouts = async (p, kind, want, label, abs) => {
  await more(p); // a collapsed readout's text reads as empty (innerText); a reload collapses them again
  const applied = (await frame(p)).readouts || {};
  for (const [rid, value] of Object.entries(want)) {
    const shown = Number(await p.readout(rid).getAttribute('data-value')), decimals = FIXTURES[kind].readouts.find(r => r.id === rid)?.decimals;
    assert.ok(eq(shown, value, abs), `${label}: readout ${rid} shows ${shown}, oracle ${value}`);
    assert.ok(eq(applied[rid], value, abs), `${label}: frame readout ${rid} ${applied[rid]}, oracle ${value}`);
    // The text is the shown value at the declared decimals (the value itself is held to the oracle above).
    if (decimals !== undefined) assert.ok((await p.readout(rid).innerText()).includes(shown.toFixed(decimals)), `${label}: readout ${rid} text ${await p.readout(rid).innerText()} lacks ${shown.toFixed(decimals)}`);
  }
};
const barePoint = page => page.evaluate(() => { // a point on the bare canvas (explain-program-card-check barePoint)
  const s = document.querySelector('[data-canvas-surface]').getBoundingClientRect();
  for (let y = s.top + 60; y < s.bottom - 60; y += 30) for (let x = s.left + 6; x < s.right - 6; x += 30) {
    const el = document.elementFromPoint(x, y);
    if (el?.closest('[data-canvas-surface]') && !el.closest('[data-block-id],[data-item-id],[data-shape-id],[data-canvas-bottom] button,[role="toolbar"],[data-zoom],[data-canvas-minimap],iframe,button')) return { x, y };
  }
  return null;
});
const composer = page => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
const box = locator => locator.boundingBox();
const centre = async locator => { const b = await box(locator); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

try {
  const { context, page } = await open();
  const W = parts(page, 'a-watch'), X = parts(page, 'a-exp'), G = parts(page, 'a-game');

  // ---- Entry (AN-03; P's registries) ----
  await step('/animation is listed in Slash Commands with its description and example, and opening it requests nothing', async () => {
    const before = stray.length;
    await openSlashHelp(page);
    const sheet = page.getByRole('dialog', { name: 'Slash Commands' });
    await sheet.locator('button[data-slash-help="animation"]').click();
    const pane = sheet.locator('[data-slash-pane="animation"]');
    await pane.waitFor();
    assert.ok((await pane.locator('[data-slash-about]').innerText()).trim().length > 0, 'a description');
    assert.match(await pane.locator('[data-slash-example]').innerText(), /animation/i);
    await shot(page, 'A-slash-help');
    await sheet.getByRole('button', { name: 'Close Slash Commands' }).click();
    assert.equal(stray.length, before, 'no generation request from the help');
  });
  await step('the /animation pill reads animation with its Remove button; a bare /animation sends no generation request and adds no card', async () => {
    await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 20000 });
    const cards = await page.locator('[data-animation3d-card]').count(), before = stray.length;
    await composer(page).click();
    await composer(page).fill('/animation ');
    const pill = page.locator('[data-chat-pane] [data-command-pill="animation"]');
    await pill.waitFor();
    assert.equal((await pill.innerText()).trim(), 'animation');
    assert.equal(await pill.getByRole('button', { name: /^Remove / }).count(), 1, 'the pill has its Remove button (CommandPill)');
    await composer(page).press('Enter');
    await page.waitForTimeout(1500);
    assert.equal(stray.length, before, `a bare command sent ${stray.slice(before).join(', ')}`);
    assert.equal(await page.locator('[data-animation3d-card]').count(), cards, 'no new card from a bare command');
    await composer(page).fill('');
    await page.evaluate(() => document.activeElement?.blur());
  });

  // AN-17 copy line (owner plan v3.1), replaced by the AN-21 loss-surface claim, which owner decision 38 removed: the request says what /animation works best for and nothing about loss surfaces.
  await step('typing /animation shows what it works best for and carries no sentence about loss surfaces or optimizers, in the picker row and in the Slash Commands description', async () => {
    const LINE = 'Works best for mechanisms, loops and small games.', FINAL = 'Describe an idea to see as a live 3D scene you can watch, adjust or play; review its plan, then generate it. ' + LINE;
    const OLD = [/Also draws gradient descent on a loss surface/i, /not supported yet/i], before = stray.length; // neither old sentence
    await composer(page).click();
    await composer(page).fill('/anim');
    const row = page.locator('[data-slash-picker] [data-slash-command="animation"]');
    await row.waitFor();
    const rowText = await row.textContent();
    assert.ok(rowText.includes(LINE), 'the picker row carries the line');
    for (const old of OLD) assert.doesNotMatch(rowText, old, 'the picker row carries neither old sentence');
    await composer(page).fill('');
    await page.evaluate(() => document.activeElement?.blur());
    await openSlashHelp(page);
    const sheet = page.getByRole('dialog', { name: 'Slash Commands' });
    await sheet.locator('button[data-slash-help="animation"]').click();
    const about = sheet.locator('[data-slash-pane="animation"] [data-slash-about]');
    await about.waitFor();
    assert.ok(await about.isVisible(), 'the description is visible');
    const shown = await about.innerText();
    assert.ok(shown.includes(FINAL), 'the window shows the whole line');
    for (const old of OLD) assert.doesNotMatch(shown, old, 'the window carries neither old sentence');
    await shot(page, 'A-slash-copy');
    await sheet.getByRole('button', { name: 'Close Slash Commands' }).click();
    assert.equal(stray.length, before, 'no generation request from the copy');
  });

  // ---- The three fixture cards (AN-02/03) ----
  await step('the watch, experiment and game examples draw live 3D scenes, each labelled an example with its description; Play only on the loop', async () => {
    for (const [p, kind] of [[W, 'watch'], [X, 'experiment'], [G, 'game']]) {
      await live(p);
      assert.equal(await p.card.getAttribute('data-animation-experience'), kind);
      assert.equal((await p.card.locator('[data-animation-badge]').innerText()).trim(), BADGE[kind], `${kind}: its experience badge`);
      assert.equal(await p.card.getAttribute('data-animation-phase'), 'ready', `${kind}: phase; runtime notes: ${runtimeNotes()}`);
      assert.equal(await p.viewport.locator('canvas').count(), 1, `${kind}: one WebGL canvas`);
      assert.ok(await p.card.locator('[data-animation-fixture-note]').isVisible(), `${kind}: labelled a built-in example, not a generated result`);
      assert.ok((await p.card.locator('[data-animation-description]').textContent()).trim().length > 0, `${kind}: an accessible scene description`);
      assert.equal(await p.play.count(), FIXTURES[kind].playable ? 1 : 0, `${kind}: Play only where there is a timeline`);
    }
    await shot(page, 'B-three-cards');
    assert.equal(await X.card.locator('details[data-animation-more]:not([open])').count(), 2, 'experiment: More settings and More readouts start collapsed');
    assert.ok(await X.card.locator('[data-animation-primary-readout]').isVisible(), 'experiment: its first readout over the scene');
    await more(X);
  });

  // ---- Watch: play, pause, restart, loop (AN-02/04) ----
  await step('watch: Play advances time; paused, the scene and its readout are the oracle\'s at the shown time', async () => {
    const t0 = await time(W);
    await W.play.click();
    await page.waitForTimeout(900);
    assert.ok(await playing(W), 'playing');
    assert.equal((await W.card.locator('[data-animation-playback-status]').innerText()).trim(), 'Playing', 'the playback status');
    assert.notEqual(await time(W), t0, 'time advanced');
    await W.play.click();
    await page.waitForTimeout(300);
    assert.equal((await W.card.locator('[data-animation-playback-status]').innerText()).trim(), 'Paused', 'the playback status');
    const t = await time(W);
    sameNodes((await frame(W)).nodes, expectedNodes('watch', {}, t), `paused at ${t}s`, WATCH.nodes);
    await sameReadouts(W, 'watch', expectedReadouts('watch', {}, t), `paused at ${t}s`, WATCH.readouts);
  });
  await step('watch: Pause keeps the visible moment (time and frame unchanged while paused)', async () => {
    const [t, f] = [await time(W), await W.viewport.getAttribute('data-animation-frame')];
    await page.waitForTimeout(800);
    assert.equal(await time(W), t);
    assert.equal(await W.viewport.getAttribute('data-animation-frame'), f);
  });
  await step('watch: it loops past its duration at the chosen speed and keeps playing, the speed kept', async () => {
    const duration = Number(await W.card.getAttribute('data-animation-duration'));
    assert.equal(duration, FIXTURES.watch.duration, 'the declared loop length');
    await W.speed.selectOption('2');
    await W.play.click();
    let last = await time(W), wrapped = false;
    for (const end = Date.now() + (duration / 2 + 4) * 1000; Date.now() < end && !wrapped;) { await page.waitForTimeout(150); const now = await time(W); wrapped = now < last; last = now; }
    assert.ok(wrapped, 'the time wrapped to the start of the loop');
    assert.ok(await playing(W), 'still playing after the wrap');
    assert.equal(await W.speed.inputValue(), '2', 'speed kept across the loop');
    assert.ok(last >= 0 && last < duration, `time stays within the loop: ${last}`);
  });
  await step('watch: Restart returns to time zero and the oracle\'s starting frame, the speed kept', async () => {
    // Restart seeks a seekable loop to 0 keeping its play state (session.js restart; it did before lane U too). Pressed while playing,
    // the loop starts again and plays on; the start itself is read from a paused loop, since a pause after a playing Restart reads
    // the time played meanwhile (CI fast-e2e 5a3c2e549: 0.386 s at 2x).
    if (await playing(W)) { await W.restart.click(); assert.ok(await playing(W), 'Restart keeps a playing loop playing'); await W.play.click(); }
    await W.restart.click();
    await page.waitForTimeout(300);
    assert.equal(await playing(W), false, 'Restart keeps a paused loop paused');
    const t = await time(W);
    assert.ok(t < 0.3, `near zero after Restart: ${t}`);
    sameNodes((await frame(W)).nodes, expectedNodes('watch', {}, t), 'after Restart', WATCH.nodes);
    assert.equal(await W.speed.inputValue(), '2');
    await shot(page, 'C-watch');
  });

  // ---- Experiment: min / max / default against the oracle (AN-04/07) ----
  const exp = FIXTURES.experiment;
  // 2600 ms: the change is accepted, then the card fits the new inputs once the controls settle (session.js REFIT_MS, then a sample of
  // at most framing.js FRAMING.budgetMs), so a later pixel comparison never catches the camera moving.
  const setParam = async (id, value) => { await more(X); await X.param(id).fill(String(value)); await X.param(id).press('Enter'); await page.waitForTimeout(2600); };
  // One parameter at a time at its minimum, maximum and default, the others at their defaults: each moves the geometry (the beam's
  // tilt, a weight's place) and the readouts, and every value is the oracle's.
  for (const [label, pick] of [['minimum', p => p.min], ['maximum', p => p.max], ['default', p => p.default]]) {
    await step(`experiment: each parameter at its ${label} moves the geometry and the readouts to the oracle's values`, async () => {
      for (const p of exp.parameters) {
        await setParam(p.id, pick(p));
        const inputs = { [p.id]: pick(p) };
        await sameReadouts(X, 'experiment', expectedReadouts('experiment', inputs), `${p.id}=${pick(p)}`);
        sameNodes((await frame(X)).nodes, expectedNodes('experiment', inputs), `${p.id}=${pick(p)}`);
        await setParam(p.id, p.default);
      }
    });
  }
  await step('experiment: the picture changes with an input, and Reset experiment restores the defaults with no model request', async () => {
    const p = exp.parameters[0], before = stray.length, start = await pixels(X);
    await setParam(p.id, p.max);
    assert.ok(!(await pixels(X)).equals(start), 'the drawn scene changed with the input');
    await X.reset.click();
    await page.waitForTimeout(600);
    assert.equal(Number(await X.param(p.id).inputValue()), p.default);
    await sameReadouts(X, 'experiment', expectedReadouts('experiment', {}), 'after Reset');
    assert.equal(stray.length, before);
    await shot(page, 'D-experiment');
  });

  // ---- Mini-game (AN-04/06/07): reach the target square; the moves readout counts every attempt ----
  const game = FIXTURES.game, status = () => G.card.locator('[data-animation-game]').getAttribute('data-animation-game');
  const sameGame = async (actions, label) => {
    const want = expectedGame(actions);
    assert.equal(await status(), want.status, `${label}: goal status`);
    await sameReadouts(G, 'game', want.readouts, label);
    sameNodes((await frame(G)).nodes, want.nodes, label);
  };
  const act = async (...actions) => { for (const a of actions) await G.action(a).click(); await page.waitForTimeout(500); };
  await step('game: the goal and every declared move are shown; a wrong move (into the edge) is blocked, counted, and the game goes on', async () => {
    assert.ok((await G.card.locator('[data-animation-goal]').innerText()).trim().length > 0, 'the objective is shown');
    for (const a of game.actions) assert.equal(await G.action(a).count(), 1, `action ${a}`);
    await sameGame([], 'start');
    await act(game.wrongAction);
    await sameGame([game.wrongAction], 'after the wrong move');
  });
  await step('game: Hint shows the hint and makes no move', async () => {
    await G.card.locator('[data-animation-hint]').click();
    assert.ok((await G.card.locator('[data-animation-hint-text]').innerText()).trim().length > 0, 'a hint');
    await sameGame([game.wrongAction], 'after Hint');
  });
  const played = [game.wrongAction, ...game.winningRoute];
  await step('game: the right route wins, as the oracle; a move after winning changes nothing', async () => {
    await act(...game.winningRoute);
    await sameGame(played, 'after the winning route');
    await act('west');
    await sameGame([...played, 'west'], 'a move after the win');
    await shot(page, 'E-game-won');
  });
  // Lane U (handback-u.md, decisions): a built-in example keeps its state in the page only and never writes the board, so a reload
  // brings the example back at its declared start. Restoring a saved generated card's state is storage.js's envelope, not reachable
  // with an example (handback-v.md: not covered here).
  await step('game: after reload the example card is still there and starts again from its declared start', async () => {
    await page.waitForTimeout(2500); // the canvas saves after a short pause
    await page.reload();
    await G.card.waitFor({ timeout: 60000 });
    await fit(page);
    await live(G);
    await sameGame([], 'after reload');
    await act(...played); // back to the won state, for Reset
    await sameGame(played, 'played again after reload');
  });
  await step('game: Reset game restores the starting conditions: the robot home, no moves, playing', async () => {
    await G.reset.click();
    await page.waitForTimeout(500);
    await sameGame([], 'after Reset');
  });
  // Owner 2026-11-01: the game declares keys (up north, down south, left west, right east); while its card interacts WASD and the
  // arrows play the same moves as the buttons, one per press, and the canvas stays put; Escape hands the keys back.
  await step('game: inside Interact the arrow keys and WASD play the moves as the buttons do, one per press, the canvas still; Escape ends it', async () => {
    // As every gesture step: start from a live scene (two cards hold the live slots at a time; fast-e2e 41510588122 found the game
    // card waiting for its slot here and Interact never started).
    await live(G);
    await startInteract(G);
    assert.equal((await G.card.locator('[data-animation-keys-hint]').innerText()).trim(), 'Move: WASD / arrow keys · Esc to exit');
    const from = await box(G.viewport);
    await page.keyboard.down('ArrowRight'); await page.keyboard.down('ArrowRight'); await page.keyboard.up('ArrowRight'); // the second is a repeat
    for (const key of ['d', 'ArrowRight', 'ArrowDown', 's']) await page.keyboard.press(key);
    await page.waitForTimeout(500);
    await sameGame(game.winningRoute, 'after the winning route by keys');
    assert.ok(Math.abs((await box(G.viewport)).y - from.y) < 2 && Math.abs((await box(G.viewport)).x - from.x) < 2, 'the keys neither scrolled the page nor moved the canvas');
    await page.keyboard.press('Escape');
    await until(async () => !(await active(G)), 'Escape did not end the interaction');
    await G.reset.click();
    await page.waitForTimeout(500);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await sameGame([], 'a key after Escape moves nothing');
  });

  // ---- Focus and gestures (AN-03; plan section 4 "Stable control profiles", interaction.js) ----
  // Each gesture step starts from the same place: nothing interacting, the canvas fitted (a failed step must not move the next).
  const settle = async () => { if (await active(X)) { await page.keyboard.press('Escape'); await until(async () => !(await active(X)), 'Escape did not end the interaction'); } await live(X); await fit(page); await live(X); };
  const enter = async () => { await startInteract(X); assert.equal(await X.interact.getAttribute('aria-pressed'), 'true'); };
  await step('before Interact the wheel and a drag over the scene go to the canvas and leave the scene; a middle-button drag on the bare canvas pans it', async () => {
    await settle();
    const [start, at] = [await pixels(X), await box(X.viewport)];
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(500);
    assert.ok(Math.abs((await box(X.viewport)).y - at.y) > 20, 'the wheel panned the canvas');
    assert.ok((await pixels(X)).equals(start), 'the wheel left the scene camera');
    // A left drag on the idle scene is the canvas's (it may move or select the card): it neither turns the scene nor enters it.
    const c = await centre(X.viewport);
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 60, c.y + 20, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(400);
    assert.equal(await active(X), false, 'a drag on the idle scene entered it');
    assert.ok((await pixels(X)).equals(start), 'a drag on the idle scene turned it');
    // The canvas pans with the middle button (AdaptiveCanvas: a left press on empty canvas starts a marquee instead).
    const bare = await barePoint(page), from = await box(X.viewport);
    assert.ok(bare, 'a bare canvas point');
    await page.mouse.move(bare.x, bare.y); await page.mouse.down({ button: 'middle' }); await page.mouse.move(bare.x + 120, bare.y + 60, { steps: 8 }); await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(400);
    assert.ok(Math.abs((await box(X.viewport)).x - from.x) > 40, 'a middle-button drag on the bare canvas pans it');
  });
  await step('Interact: a drag turns the scene, not the canvas; Escape ends it and the card stays', async () => {
    await settle();
    await enter();
    const [start, at] = [await pixels(X), await centre(X.viewport)], from = await box(X.viewport);
    await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x + 80, at.y + 20, { steps: 10 }); await page.mouse.up();
    await page.waitForTimeout(400);
    assert.ok(!(await pixels(X)).equals(start), 'the drag turned the scene');
    assert.ok(Math.abs((await box(X.viewport)).x - from.x) < 2, 'the canvas did not move under an inner drag');
    await page.keyboard.press('Escape');
    await until(async () => !(await active(X)), 'Escape did not end the interaction');
    assert.equal(await X.interact.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('[data-block-id="a-exp"]').count(), 1, 'the card is still on the canvas after Escape');
  });
  await step('window blur drops a held drag: moving on after it does not turn the scene', async () => {
    await settle();
    await enter();
    const at = await centre(X.viewport);
    await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x + 30, at.y, { steps: 4 });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(300);
    const held = await pixels(X);
    await page.mouse.move(at.x + 120, at.y + 40, { steps: 8 });
    await page.waitForTimeout(300);
    const after = await pixels(X);
    await page.mouse.up();
    assert.ok(after.equals(held), 'the scene kept turning after the window lost focus');
  });
  await step('a press in Chat ends the interaction, and every typed key reaches the composer, none the scene', async () => {
    await settle();
    await enter();
    await composer(page).click();
    await until(async () => !(await active(X)), 'a press outside did not end the interaction');
    const start = await pixels(X); // after the exit: its legend is gone
    const words = 'wasd and arrows typed here';
    await page.keyboard.type(words);
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight');
    assert.equal(await composer(page).inputValue(), words, 'every key reached the composer');
    assert.ok((await pixels(X)).equals(start), 'typing moved the scene');
    await composer(page).fill('');
    await page.evaluate(() => document.activeElement?.blur());
  });

  // ---- The same labelled scene near and far (owner 2026-10-31: in-scene labels judged by a person from these shots) ----
  // The beam experiment (its labelled weights) at its default view, then closer and further with the scene's own camera (the wheel
  // inside Interact), then with the canvas's own zoom (Ctrl+wheel over the card, which zooms at the pointer). Only robust facts are
  // asserted (the wheel changed the picture, the view stays live); each step ends back at the fitted canvas and the default camera.
  const cardShot = name => X.card.screenshot({ path: `${SHOTS}/${name}.png` });
  const wheelIn = async (dy, times) => { await enter(); const c = await centre(X.viewport); await page.mouse.move(c.x, c.y); for (let i = 0; i < times; i++) { await page.mouse.wheel(0, dy); await page.waitForTimeout(120); } await page.keyboard.press('Escape'); await until(async () => !(await active(X)), 'Escape did not end the interaction'); await page.waitForTimeout(300); };
  await step('camera zoom: the labelled beam scene at its default view, close up and far out with the wheel inside Interact; the view stays live', async () => {
    await settle();
    await X.card.locator('[data-animation-reset-view]').click();
    await page.waitForTimeout(300);
    const start = await pixels(X);
    await cardShot('Z-camera-default');
    // Optional labels off and on again, where the scene has any (the Labels toggle shows only then): the person compares the shots.
    const labels = X.card.locator('[data-animation-labels]');
    if (await labels.count()) {
      await labels.click();
      assert.equal(await labels.getAttribute('aria-pressed'), 'false', 'Labels off');
      await page.waitForTimeout(300);
      await cardShot('Z-labels-off');
      await labels.click();
      assert.equal(await labels.getAttribute('aria-pressed'), 'true', 'Labels on again');
      await page.waitForTimeout(300);
    }
    await wheelIn(-240, 4);
    assert.ok(!(await pixels(X)).equals(start), 'the wheel brought the camera closer');
    await cardShot('Z-camera-close');
    await wheelIn(240, 10);
    assert.ok(!(await pixels(X)).equals(start), 'the wheel took the camera further out');
    await cardShot('Z-camera-far');
    await live(X);
    await X.card.locator('[data-animation-reset-view]').click();
    await page.waitForTimeout(300);
  });
  await step('canvas zoom: the same card with the canvas zoomed out and zoomed in (Ctrl+wheel at the card); the view stays live', async () => {
    await settle();
    const canvasZoom = async dy => { const c = await centre(X.viewport); await page.mouse.move(c.x, c.y); await page.keyboard.down('Control'); await page.mouse.wheel(0, dy); await page.keyboard.up('Control'); await page.waitForTimeout(600); };
    const fitted = (await box(X.card)).width;
    await canvasZoom(350); // about x0.5 (AdaptiveCanvas: exp(-deltaY * 0.002) per event)
    assert.ok((await box(X.card)).width < fitted * 0.8, 'the canvas zoomed out');
    await live(X);
    await cardShot('Z-canvas-zoomed-out');
    await canvasZoom(-585); // about x1.6 of the fitted zoom
    assert.ok((await box(X.card)).width > fitted * 1.2, 'the canvas zoomed in');
    await live(X);
    await cardShot('Z-canvas-zoomed-in');
    await fit(page);
    await live(X);
  });
  await context.close();

  // ---- Narrow and wide, light and dark (AN-03) ----
  for (const theme of ['light', 'dark']) await step(`${theme}: narrow and wide experiment cards keep every control inside the card`, async () => {
    const { context: c, page: p } = await open({ theme, canvas: sizes, first: 'a-narrow' });
    assert.equal(await p.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark', 'the theme class');
    const [N, Wd] = [parts(p, 'a-narrow'), parts(p, 'a-wide')];
    await live(N); await live(Wd);
    await more(N); await more(Wd); // every control, the collapsed ones opened
    assert.ok((await box(N.card)).width < (await box(Wd.card)).width, 'the narrow card is narrower');
    for (const q of [N, Wd]) {
      const outer = await box(q.card);
      const controls = await q.card.locator('button, input, select').evaluateAll(nodes => nodes.filter(n => n.offsetParent).map(n => { const r = n.getBoundingClientRect(); return { label: n.getAttribute('aria-label') || n.textContent.trim() || n.tagName, x: r.x, w: r.width }; }));
      assert.ok(controls.length >= FIXTURES.experiment.parameters.length * 2, `controls: ${controls.length}`);
      for (const r of controls) assert.ok(r.w > 0 && r.x >= outer.x - 1 && r.x + r.w <= outer.x + outer.width + 1, `${r.label} is clipped by the card (${JSON.stringify(r)} in ${JSON.stringify(outer)})`);
    }
    await shot(p, `F-${theme}-narrow-wide`);
    await c.close();
  });

  // ---- Entry for examples (dev build only: VITE_COACHING_DEV, as fast-e2e's dist-dev is built) ----
  await step("the dev Insert palette's More > 3D animation example places an example card; its picker switches it to the watch loop, kept on reload", async () => {
    const { context: c, page: p } = await open({ canvas: entry, first: null });
    assert.equal(await p.locator('[data-animation3d-card]').count(), 0, 'an empty canvas');
    await p.getByRole('button', { name: 'Insert lesson block' }).click();
    await p.getByRole('menu', { name: 'Lesson blocks' }).getByRole('group', { name: 'More' }).getByRole('menuitem', { name: '3D animation example', exact: true }).click();
    const placed = p.locator('[data-animation3d-card]');
    await placed.waitFor({ timeout: 30000 });
    assert.equal(await placed.count(), 1, 'one card placed');
    const id = await placed.evaluate(node => node.closest('[data-block-id]').dataset.blockId), q = parts(p, id);
    await until(async () => (await q.card.getAttribute('data-animation-experience')) === 'experiment', 'the inserted example is not the beam balance');
    assert.ok(await q.card.locator('[data-animation-fixture-note]').isVisible(), 'labelled a built-in example');
    await q.card.locator('select[data-animation3d-example]').selectOption(FIXTURES.watch.name);
    await until(async () => (await q.card.getAttribute('data-animation-experience')) === 'watch', 'the picker did not switch to the watch example');
    await live(q);
    assert.equal((await q.card.locator('[data-animation-badge]').innerText()).trim(), 'Watch');
    assert.equal(await q.play.count(), 1, 'the watch example has Play');
    await shot(p, 'H-inserted-watch');
    await p.waitForTimeout(2500); // the canvas saves after a short pause
    await p.reload();
    await q.card.waitFor({ timeout: 60000 });
    assert.equal(await q.card.getAttribute('data-animation-experience'), 'watch', 'the chosen example survives a reload');
    assert.equal(await q.card.locator('select[data-animation3d-example]').inputValue(), FIXTURES.watch.name);
    await c.close();
  });

  // ---- The real request path (AN-03/05/06): /animation in Chat, its plan, Generate, the result card, reload ----
  // The /animation job API is a fake job server in this browser (as explain-proposal-card-check): the job prepares a plan, posts it on
  // the line's thread (mocked into that thread's restore, its saves answered here), waits for Generate, then is ready with an artifact
  // the results route serves. That artifact is the beam-balance contract fixture under a generated id: wiring evidence, not generation.
  const REQUEST = 'a beam balance where I can change each mass and its distance';
  const REASON = 'Changing mass and distance directly shows that balance depends on their product.';
  const ARTIFACT = { ...structuredClone(experimentFixture.artifact), artifactId: `art_${run}`, provenance: { origin: 'generated' } };
  // Test-only (owner review 2026-10-30, a cancelled object drag): a bead draggable along x, the second job's artifact.
  const DRAG_REQUEST = 'a bead I can slide along a rail';
  const DRAG_SOURCE = `export function initialState() { return { x: 0 }; }
export function reduce({ state, event }) {
  if ((event.type === 'drag_move' || event.type === 'drag_end') && event.node === 'bead') return { x: event.value };
  return state;
}
export function evaluate({ state }) {
  const x = (state || initialState()).x;
  return { nodes: { bead: { position: [x, 0, 0] } }, readouts: { x } };
}
`;
  const DRAG_ARTIFACT = { schema: ARTIFACT.schema, artifactId: `art_drag_${run}`, revision: 1, planHash: 'b'.repeat(64), capabilityVersion: ARTIFACT.capabilityVersion, sourceRefs: [],
    provenance: { origin: 'generated' }, title: 'Bead on a rail', description: 'A red bead you can slide along a grey rail.', experience: 'experiment', behavior: 'rules', controlProfile: 'manipulate',
    scene: { materials: [{ id: 'red', color: '#d64545' }, { id: 'grey', color: '#8a94a6' }], geometries: [{ id: 'ball', kind: 'sphere', radius: 0.5 }, { id: 'bar', kind: 'box', size: [5, 0.08, 0.08] }],
      nodes: [{ id: 'rail', geometry: 'bar', material: 'grey' }, { id: 'bead', geometry: 'ball', material: 'red', selectable: true, drag: { axis: 'x', min: -2, max: 2 } }] },
    parameters: [], actions: [], readouts: [{ id: 'x', label: 'Position', unit: 'm', decimals: 2 }],
    program: { ...ARTIFACT.program, source: DRAG_SOURCE, sourceHash: await hashProgramSource(DRAG_SOURCE) }, seed: 1, camera: { position: [0, 0, 6], target: [0, 0, 0] }, assumptions: [] };
  // Test-only (owner canvas 2026-11-02, a stepped Launch game that never moved in the card): a stepped game, the third job's artifact.
  const STEP_REQUEST = 'a robot I launch onto a target';
  const STEP_ARTIFACT = { ...(await steppedGameArtifact()), artifactId: `art_step_${run}` };
  // Test-only (aj_086fd46 owner review): a stepped scene with a startsMotion false action beside Launch, the fourth job's artifact.
  const STUDY_REQUEST = 'a process I can step through one step at a time';
  const STUDY_ARTIFACT = { ...(await steppedStudyArtifact()), artifactId: `art_study_${run}` };
  let study = null;
  const SERVED = new Map([[ARTIFACT.artifactId, ARTIFACT], [DRAG_ARTIFACT.artifactId, DRAG_ARTIFACT], [STEP_ARTIFACT.artifactId, STEP_ARTIFACT], [STUDY_ARTIFACT.artifactId, STUDY_ARTIFACT]]);
  const sha16 = text => createHash('sha256').update(text).digest('hex').slice(0, 16);
  const flow = { jobs: new Map(), creates: [], approves: [], retries: [], puts: [], reads: [], writes: [], proposals: new Map(), briefs: [], fail: null, chooses: [], say: null };
  const viewOf = job => ({ id: job.id, version: 1, boardId: job.boardId, cardId: job.cardId, stage: job.stage, attempt: 1, terminal: ['ready', 'failed', 'cancelled'].includes(job.stage),
    repairs: 0, stopReason: null, choiceOpen: !!job.choiceOpen, threadId: job.threadId ?? null, chatPending: false, failure: job.failure ?? null, recovery: job.recovery ?? [], usage: { credits: 0, unknown: false }, createdAt: 0, updatedAt: 0,
    ...(job.successor ? { successor: job.successor } : {}), result: job.stage === 'ready' ? { jobId: job.id, resultId: job.artifact.artifactId, cardId: job.cardId, canvas: { boardId: job.boardId }, requestRef: sha16(`${job.requestId}|${job.prompt}`), revision: 1, planHash: job.artifact.planHash } : null });
  const planOf = job => ({ proposal_id: sha16(job.id), version: 1, command: 'animation', title: job.artifact.title,
    description: 'A beam on a pivot with one weight on each side; change masses and distances and watch it tilt.', settings: { experience: 'watch' }, source_refs: [], references: [],
    assumptions: ['Rigid, massless beam.', 'The pivot has no friction.'], limitations: ['The tilt is illustrative.'], requirements: [`Recommended: watch. ${REASON}`, 'Behavior: analytical', 'Controls: manipulate'],
    input: { org: 'w', app: gen.name, job: job.id, plan_hash: job.artifact.planHash, request: job.prompt,
      scene: { parameters: [{ type: 'number', label: 'Left mass', unit: 'kg', min: 1, max: 10, default: 2 }, { type: 'select', label: 'Pivot', options: [{ value: 'c', label: 'Centre' }, { value: 'l', label: 'Left' }], default: 'c' }], interactions: [], notices: [] } }, original_request: `/animation ${job.prompt}`,
    expires_at: Math.floor(Date.now() / 1000) + 3600, sig: `v3.${'a'.repeat(64)}`, usage: { max_credits: 120, reserve_credits: null } });
  const genRouter = async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method(), path = url.pathname;
    if (path.startsWith('/api/learn/animation/') && method !== 'GET') flow.writes.push(`${method} ${path}`);
    const result = path.match(/^\/api\/learn\/animation\/jobs\/results\/([^/]+)$/);
    if (result) {
      flow.reads.push(result[1]);
      const served = SERVED.get(decodeURIComponent(result[1]));
      return served ? route.fulfill({ json: { artifact: served, execution: { allowed: true } } }) : route.fulfill({ status: 404, json: { error: 'Not available' } });
    }
    if (path === '/api/learn/animation/jobs' && method === 'POST') {
      const body = request.postDataJSON();
      let job = [...flow.jobs.values()].find(entry => entry.requestId === body.requestId);
      if (!job) {
        flow.creates.push(body);
        job = { id: `aj_${run}${flow.jobs.size + 1}`, requestId: body.requestId, boardId: body.boardId, cardId: body.cardId, prompt: body.prompt, stage: 'preparing', artifact: flow.next || ARTIFACT, threadId: body.threadId };
        flow.next = null;
        flow.jobs.set(job.id, job);
        const messageId = String(800001 + flow.briefs.length);
        // flow.say: the server's own Chat message for this job in place of a plan (a choice of changes, or a failure's explanation).
        if (!flow.say) flow.proposals.set(messageId, planOf(job));
        flow.briefs.push({ messageId, threadId: body.threadId, jobId: job.id, ...(flow.say ? { say: flow.say } : {}) });
        job.choiceOpen = !!flow.say?.open;
        if (flow.say?.choice) flow.say.choice.jobId = job.id;
        flow.say = null;
        const answer = viewOf(job);
        job.stage = 'awaiting_approval'; // the card's first read sees the plan waiting, so its thread is shown again
        // A failure the server explained (flow.fail): the card's next read finds the job failed with the server's words and actions.
        if (flow.fail) { Object.assign(job, { stage: 'failed', ...flow.fail }); flow.fail = null; }
        return route.fulfill({ status: 202, json: { job: answer } });
      }
      return route.fulfill({ status: 202, json: { job: viewOf(job) } });
    }
    const one = path.match(/^\/api\/learn\/animation\/jobs\/([^/]+)(?:\/(\w+))?$/);
    if (one) {
      const job = flow.jobs.get(decodeURIComponent(one[1]));
      if (!job || (method === 'GET' && url.searchParams.get('board') !== job.boardId)) return route.fulfill({ status: 404, json: { error: 'Not available' } });
      // Revise plan: the server answers the new job for the same card and request; its next read finds the revised plan waiting.
      if (one[2] === 'retry') {
        flow.retries.push({ jobId: job.id, body: request.postDataJSON() });
        const asked = flow.briefs.find(b => b.jobId === job.id && b.say?.choice);
        if (asked) asked.say.choice.chosen = request.postDataJSON().alternative;
        const next = { ...job, id: `${job.id}r`, stage: 'awaiting_approval', failure: null, recovery: [] };
        job.successor = next.id;
        flow.jobs.set(next.id, next);
        return route.fulfill({ status: 202, json: { job: { ...viewOf(next), stage: 'queued' } } });
      }
      // Accepting a change: no model call; the plan with its Generate is posted on the thread, and the choice message records the answer.
      if (one[2] === 'choose') {
        const sent = request.postDataJSON();
        flow.chooses.push({ jobId: job.id, body: sent });
        const asked = flow.briefs.find(b => b.jobId === job.id && b.say);
        asked.say.choice.chosen = sent.choice;
        job.choiceOpen = false;
        const messageId = String(800001 + flow.briefs.length), base = planOf(job);
        flow.proposals.set(messageId, { ...base, input: { ...base.input, scene: { ...base.input.scene, notices: asked.say.notices } } });
        flow.briefs.push({ messageId, threadId: job.threadId, jobId: job.id });
        return route.fulfill({ json: { job: viewOf(job) } });
      }
      if (one[2] === 'approve') {
        flow.approves.push({ jobId: job.id, body: request.postDataJSON() });
        const answer = viewOf({ ...job, stage: 'authoring' });
        job.stage = 'ready'; // the card's next read finds it built
        return route.fulfill({ status: 202, json: { job: answer } });
      }
      return route.fulfill({ json: { job: viewOf(job) } });
    }
    const thread = path.match(/^\/api\/ask\/threads\/([^/]+)$/);
    if (thread && method === 'GET') {
      const id = decodeURIComponent(thread[1]), mine = flow.briefs.filter(b => b.threadId === id);
      if (!mine.length) return route.fallback();
      const real = await route.fetch().catch(() => null);
      const base = real?.ok ? await real.json() : { id, title: 'Animation request', mode: 'auto', contextRefs: [], draft: null, messages: [] };
      const message = b => ({ role: 'assistant', content: b.say?.content ?? 'Here is the plan for your animation. Generate makes it.', messageId: b.messageId, kind: 'answer', status: 'done',
        meta: { version: 1, mode: 'ask', kind: 'answer', contextRefs: [], actions: [], followUps: [], syllabus: null, ...(b.say ? { ...(b.say.choice ? { animationChoice: b.say.choice } : {}) } : { proposal: flow.proposals.get(b.messageId) }), alternatives: [b.messageId] } });
      return route.fulfill({ json: { ...base, messages: [...(base.messages || []), ...mine.map(message)] } });
    }
    const saved = path.match(/^\/api\/learn\/chat\/messages\/(\d+)\/proposal$/);
    if (saved && flow.proposals.has(saved[1])) {
      const id = saved[1], current = flow.proposals.get(id);
      if (method === 'GET') return route.fulfill({ json: { proposal: current, message_id: id, used: false, references: [] } });
      const sent = request.postDataJSON();
      flow.puts.push({ id, body: sent });
      if (sent.expected_version !== current.version) return route.fulfill({ status: 409, json: { error: 'This proposal changed meanwhile.', code: 'proposal_stale', current, current_message_id: id } });
      const { expected_version: _version, ...change } = sent, next = { ...current, ...change, version: current.version + 1 };
      flow.proposals.set(id, next);
      return route.fulfill({ json: { proposal: next, references: [] } });
    }
    if (path === '/api/learn/chat/route' && method === 'POST') return route.fulfill({ status: 404, json: { error: 'Not found' } });
    return route.fallback();
  };
  const genSession = await open({ canvas: gen, first: null, extra: genRouter });
  const { page: g } = genSession, gDock = g.locator('[data-chat-pane]');
  const plan = () => gDock.locator('[data-generation-proposal="animation"]').last();
  let job = null;
  await step('/animation with a request in Chat: one job, its short plan summary in the review area (title, recommended experience, what can change and where it starts, the caveat, collapsed limitations; no request echo or internal plan lines) and the canvas card waiting; nothing approved', async () => {
    await g.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 20000 });
    await composer(g).click(); await composer(g).fill(`/animation ${REQUEST}`); await g.waitForTimeout(150); await composer(g).press('Enter');
    await until(async () => flow.creates.length === 1, 'one job for the /animation line');
    job = [...flow.jobs.values()][0];
    assert.equal(job.prompt, REQUEST, 'the request words, without the command');
    await plan().waitFor({ timeout: 20000 });
    assert.equal((await plan().locator('h3').innerText()).trim(), 'Beam balance');
    assert.equal(await plan().locator('[data-proposal-select="experience"]').getAttribute('data-value'), 'watch', 'the recommended experience');
    assert.equal(await plan().locator('[data-proposal-select="experience"] [role="radio"][aria-checked="true"]').getAttribute('data-proposal-option'), 'watch', 'shown selected');
    assert.deepEqual(await plan().locator('[data-plan-changes] li').allInnerTexts(), ['Left mass: 1–10 kg', 'Pivot: Centre or Left'], 'what can change, from the plan');
    assert.equal((await plan().locator('[data-plan-starts]').innerText()).trim(), 'Starts with Left mass: 2 kg · Pivot: Centre.');
    assert.equal((await plan().locator('[data-plan-caveat]').innerText()).trim(), 'Rigid, massless beam.');
    assert.equal(await plan().locator('[data-plan-disclosure="limitations"]').getAttribute('open'), null, 'limitations start collapsed');
    assert.equal(await plan().locator('[data-proposal-section="requirements"], [data-proposal-request-block]').count(), 0, 'no internal plan lines, no request echo');
    await g.locator(`[data-block-id="${job.cardId}"] [data-animation-pending]`).waitFor({ state: 'attached', timeout: 20000 });
    assert.equal(flow.approves.length, 0, 'nothing approved');
    await plan().screenshot({ path: `${SHOTS}/I-plan.png` });
    // The same plan with its details opened (owner 2026-10-31: before and after), then closed again.
    for (const summary of await plan().locator('[data-plan-disclosure] > summary').all()) await summary.click();
    assert.equal(await plan().locator('[data-plan-disclosure][open]').count(), 2, 'Model assumptions and Limitations open');
    assert.ok((await plan().locator('[data-plan-disclosure="assumptions"]').innerText()).includes('The pivot has no friction.'));
    await plan().screenshot({ path: `${SHOTS}/I-plan-details.png` });
    for (const summary of await plan().locator('[data-plan-disclosure] > summary').all()) await summary.click();
  });
  await step('changing the experience saves version 2; Generate pressed twice sends one approve with it and makes one card, drawn from the served artifact', async () => {
    await plan().locator('[data-proposal-select="experience"] [data-proposal-option="experiment"]').click();
    await until(async () => (await plan().getAttribute('data-proposal-version')) === '2', 'version 2 after the experience change');
    assert.deepEqual(flow.puts.map(p => p.body), [{ expected_version: 1, settings: { experience: 'experiment' } }]);
    assert.equal(flow.approves.length, 0, 'a settings change approves nothing');
    await plan().locator('[data-proposal-generate]:not([disabled])').waitFor({ timeout: 10000 });
    await plan().locator('[data-proposal-generate]').dblclick();
    await until(async () => flow.approves.length >= 1, 'an approve request');
    await g.waitForTimeout(800);
    assert.equal(flow.approves.length, 1, 'two presses, one approve');
    const { body } = flow.approves[0];
    assert.deepEqual([body.boardId, body.proposal.version, body.proposal.settings.experience], [job.boardId, 2, 'experiment']);
    await plan().locator('[data-proposal-job-status]').waitFor({ timeout: 10000 });
    const q = parts(g, job.cardId);
    await until(async () => (await q.card.getAttribute('data-animation-experience')) === 'experiment', 'the result card', 30000);
    await fit(g);
    await live(q);
    await more(q);
    assert.equal(await g.locator('[data-animation3d-card]').count(), 1, 'one card');
    assert.equal(await q.card.locator('[data-animation-fixture-note]').count(), 0, 'a result, not labelled an example');
    assert.equal(flow.creates.length, 1, 'still one job');
    await sameReadouts(q, 'experiment', expectedReadouts('experiment', {}), 'the result at its defaults');
    await shot(g, 'J-result');
  });
  await step("the result card works (a mass changes the readouts to the oracle's) and reload restores that state with no job or model request", async () => {
    const q = parts(g, job.cardId);
    await q.param('leftMass').fill('7'); await q.param('leftMass').press('Enter'); await g.waitForTimeout(400);
    await sameReadouts(q, 'experiment', expectedReadouts('experiment', { leftMass: 7 }), 'leftMass=7');
    await g.waitForTimeout(3500); // the card's saver (bounded debounce) and the canvas save
    const [writes, strays, creates, approves] = [flow.writes.length, stray.length, flow.creates.length, flow.approves.length];
    await g.reload();
    await q.card.waitFor({ timeout: 60000 });
    await fit(g);
    await live(q);
    await more(q);
    assert.equal(await q.card.locator('[data-animation-pending]').count(), 0, 'no job waiting after reload');
    assert.equal(Number(await q.param('leftMass').inputValue()), 7, 'the saved input');
    await sameReadouts(q, 'experiment', expectedReadouts('experiment', { leftMass: 7 }), 'after reload');
    await g.waitForTimeout(1500);
    assert.deepEqual(flow.writes.slice(writes), [], 'no job request after reload');
    assert.deepEqual(stray.slice(strays), [], 'no model request after reload');
    assert.deepEqual([flow.creates.length, flow.approves.length], [creates, approves]);
    console.log(`   request path: ${flow.creates.length} create, ${flow.approves.length} approve, ${flow.puts.length} plan save, ${flow.reads.length} result reads`);
  });
  // ---- An object drag cancelled mid-gesture (owner review 2026-10-30: a cancel must not move the object) ----
  // A second request on the same canvas through the same path; its job serves DRAG_ARTIFACT, a test-only scene (not a contract
  // fixture): a red bead on a grey rail, draggable along x in [-2, 2], at the centre of a straight-on camera, so a press at the
  // viewport's centre lands on it. Its program commits the dragged position (drag_move / drag_end) and draws the bead there.
  let D = null;
  const bead = async () => (await frame(D)).nodes?.bead?.position?.[0];
  const selection = async () => (await frame(D)).selection ?? null;
  const enterD = async () => { if (!(await active(D))) await startInteract(D); };
  // Back to x = 0 (the bead under the viewport's centre) and out of Interact, then in again.
  const homeD = async () => {
    if (await active(D)) { await g.keyboard.press('Escape'); await until(async () => !(await active(D)), 'Escape did not end the interaction'); }
    if ((await bead()) !== 0) { await D.reset.click(); await until(async () => (await bead()) === 0, 'Reset did not bring the bead home'); }
    await enterD();
  };
  // Press on the bead and drag it right a little; -> the position the scene showed last, before any cancel.
  const pressAndDrag = async () => {
    const c = await centre(D.viewport);
    await g.mouse.move(c.x, c.y); await g.mouse.down(); await g.mouse.move(c.x + 12, c.y, { steps: 6 });
    await until(async () => (await bead()) > 0, 'the drag did not move the bead');
    await g.waitForTimeout(300);
    return { c, x: await bead() };
  };
  // After a cancel: the bead stays where it was last shown (not at the origin or at a position from (0, 0)), the selection is
  // unchanged, and moving on with the button still down, then letting go, moves nothing.
  const heldStill = async ({ c, x }, before, label) => {
    await g.waitForTimeout(400);
    assert.equal(await bead(), x, `${label}: the bead stays where it was shown`);
    assert.equal(await selection(), before, `${label}: the selection is unchanged`);
    await g.mouse.move(c.x + 40, c.y + 10, { steps: 6 });
    await g.waitForTimeout(400);
    assert.equal(await bead(), x, `${label}: moving on after the cancel moved the bead`);
    await g.mouse.up();
    await g.waitForTimeout(400);
    assert.equal(await bead(), x, `${label}: letting go after the cancel moved the bead`);
  };
  await step('an object drag cancelled by Escape keeps the object where it was shown, keeps the selection, and ignores the rest of the gesture', async () => {
    flow.next = DRAG_ARTIFACT;
    await composer(g).click(); await composer(g).fill(`/animation ${DRAG_REQUEST}`); await g.waitForTimeout(150); await composer(g).press('Enter');
    await until(async () => flow.creates.length === 2, 'a second job for the second /animation line');
    const second = [...flow.jobs.values()][1];
    // The bead's own plan, by its title: until its message lands, the last plan in the thread is the beam balance's, which the
    // reload above restored with Generate enabled (local run before/run-3: that plan's Generate was pressed, job 1 approved twice,
    // and the bead job never; CI fast-e2e 41559196907 step 30 left the same picture).
    const beadPlan = gDock.locator('[data-generation-proposal="animation"]').filter({ has: g.locator('h3', { hasText: DRAG_ARTIFACT.title }) });
    await beadPlan.locator('[data-proposal-generate]:not([disabled])').waitFor({ timeout: 20000 });
    await beadPlan.locator('[data-proposal-generate]').click();
    await until(async () => flow.approves.some(a => a.jobId === second.id), 'Generate on the bead plan approved its job');
    D = parts(g, second.cardId);
    await until(async () => (await D.card.getAttribute('data-animation-experience')) === 'experiment', 'the bead card', 30000).catch(async error => {
      const plans = await gDock.locator('[data-generation-proposal="animation"]').evaluateAll(nodes => nodes.map(n => { const b = n.querySelector('[data-proposal-generate]');
        return `${n.querySelector('h3')?.textContent.trim()} generate=${b ? (b.disabled ? 'disabled' : 'enabled') : 'none'} status=${!!n.querySelector('[data-proposal-job-status]')}`; })).catch(() => []);
      throw Error(`${error.message}; approves: ${flow.approves.map(a => a.jobId).join(', ')} (second job ${second.id}); plans: ${plans.join(' | ')}; card phase ${await D.card.getAttribute('data-animation-phase').catch(() => '?')}`);
    });
    await fit(g);
    await live(D);
    await homeD();
    const before = await selection(), held = await pressAndDrag();
    assert.ok(held.x > 0 && held.x < 2, `the bead moved within its rail: ${held.x}`);
    await g.keyboard.press('Escape');
    await until(async () => !(await active(D)), 'Escape did not end the interaction');
    await heldStill(held, before, 'Escape');
  });
  await step('an object drag cancelled by window blur keeps the object where it was shown, keeps the selection, and ignores the rest of the gesture', async () => {
    await homeD();
    const before = await selection(), held = await pressAndDrag();
    await g.evaluate(() => window.dispatchEvent(new Event('blur')));
    await heldStill(held, before, 'blur');
  });
  await step('after the cancels a fresh press, drag and release still moves the object, and it stays there with its readout', async () => {
    await homeD();
    const { x } = await pressAndDrag();
    await g.mouse.up();
    await g.waitForTimeout(500);
    assert.ok(x > 0, `moved: ${x}`);
    assert.equal(await bead(), x, 'the released position stays');
    assert.ok(close(Number(await D.readout('x').getAttribute('data-value')), x), 'the readout is the bead\'s position');
    await g.keyboard.press('Escape');
    await shot(g, 'K-drag');
  });
  // A stepped game moves only by the host's steps: Launch must start them (before the fix the robot stayed "In flight" at x = 0).
  await step('a stepped game shows Play and Pause; Launch starts its steps and the robot lands on the target; Pause holds the clock', async () => {
    flow.next = STEP_ARTIFACT;
    await composer(g).click(); await composer(g).fill(`/animation ${STEP_REQUEST}`); await g.waitForTimeout(150); await composer(g).press('Enter');
    await until(async () => flow.creates.length === 3, 'a third job for the third /animation line');
    const third = [...flow.jobs.values()][2];
    const stepPlan = gDock.locator('[data-generation-proposal="animation"]').filter({ has: g.locator('h3', { hasText: STEP_ARTIFACT.title }) });
    await stepPlan.locator('[data-proposal-generate]:not([disabled])').waitFor({ timeout: 20000 });
    await stepPlan.locator('[data-proposal-generate]').click();
    await until(async () => flow.approves.some(a => a.jobId === third.id), 'Generate on the stepped plan approved its job');
    const S = parts(g, third.cardId);
    await until(async () => (await S.card.getAttribute('data-animation-experience')) === 'game', 'the stepped game card', 30000);
    await fit(g);
    await live(S);
    const goal = () => S.card.locator('[data-animation-game]').getAttribute('data-animation-game');
    assert.equal(await S.play.count(), 1, 'Play is offered');
    assert.equal(await S.restart.count(), 0, 'no Restart: steps cannot rewind');
    assert.equal(await playing(S), false, 'nothing moves before it is asked');
    assert.equal(Number(await S.readout('distance').getAttribute('data-value')), 0);
    await S.action('launch').click();
    await until(async () => (await goal()) === 'won', `the robot never landed: distance ${await S.readout('distance').getAttribute('data-value').catch(() => '?')}, playing ${await playing(S).catch(() => '?')}`);
    assert.equal(Number(await S.readout('distance').getAttribute('data-value')), 3, 'on the target');
    assert.ok(close((await frame(S)).nodes.robot.position[0], 3), 'the drawn robot is on the target');
    assert.equal(await playing(S), true, 'Launch started the clock');
    await S.play.click();
    assert.equal(await playing(S), false, 'Pause');
    await shot(g, 'K-stepped-landed');
  });

  // aj_086fd46 owner review (Take one step clicked three times recorded step 11): a stepped scene's action that declares startsMotion false
  // advances exactly once per press and leaves a paused scene paused; an action that declares nothing (Launch) still starts the steps.
  await step('a stepped scene: Take one step (startsMotion false) advances exactly once per press and stays paused; the count is the accepted clicks, unchanged seconds later', async () => {
    flow.next = STUDY_ARTIFACT;
    await composer(g).click(); await composer(g).fill(`/animation ${STUDY_REQUEST}`); await g.waitForTimeout(150); await composer(g).press('Enter');
    await until(async () => flow.creates.length === 4, 'a fourth job for the fourth /animation line');
    const fourth = [...flow.jobs.values()][3];
    const studyPlan = gDock.locator('[data-generation-proposal="animation"]').filter({ has: g.locator('h3', { hasText: STUDY_ARTIFACT.title }) });
    await studyPlan.locator('[data-proposal-generate]:not([disabled])').waitFor({ timeout: 20000 });
    await studyPlan.locator('[data-proposal-generate]').click();
    await until(async () => flow.approves.some(a => a.jobId === fourth.id), 'Generate on the study plan approved its job');
    study = parts(g, fourth.cardId);
    await until(async () => (await study.card.getAttribute('data-animation-experience')) === 'game', 'the stepped study card', 30000);
    await fit(g);
    await live(study);
    const taken = async () => Number(await study.readout('taken').getAttribute('data-value')), ticks = async () => Number(await study.readout('ticks').getAttribute('data-value'));
    // The card's Play button and its Playing / Paused badge read the same state; both must say paused (the owner saw the badge in review).
    const badge = () => study.card.locator('[data-animation-playback-status]').getAttribute('data-animation-playback-status');
    assert.deepEqual([await taken(), await ticks(), await playing(study), await badge()], [0, 0, false, 'paused'], 'paused at step 0');
    await study.action('nudge').click();
    await until(async () => (await taken()) === 1, 'the first press took a step');
    await g.waitForTimeout(3000); // a runaway clock would add host ticks, and with them steps, in these seconds
    assert.deepEqual([await taken(), await ticks(), await playing(study), await badge()], [1, 0, false, 'paused'], 'one click: step 1, no host tick, the Play button and the badge still say paused three seconds later');
    await study.action('nudge').click(); await study.action('nudge').click();
    await until(async () => (await taken()) === 3, 'three presses took three steps');
    await g.waitForTimeout(3000);
    assert.deepEqual([await taken(), await ticks(), await playing(study), await badge()], [3, 0, false, 'paused'], 'three clicks: step 3 (the number of accepted clicks), paused (button and badge), unchanged three seconds later');
    await shot(g, 'K-study-three-steps');
  });

  await step('a stepped scene: Launch (no startsMotion) still starts the step clock and a Take one step press while it plays leaves it playing', async () => {
    const ticks = async () => Number(await study.readout('ticks').getAttribute('data-value')), distance = async () => Number(await study.readout('distance').getAttribute('data-value'));
    await study.action('launch').click();
    await until(async () => (await ticks()) > 3 && (await distance()) > 0, `Launch never moved the robot: ticks ${await ticks().catch(() => '?')}`);
    assert.deepEqual([await playing(study), await study.card.locator('[data-animation-playback-status]').getAttribute('data-animation-playback-status')], [true, 'playing'], 'Launch started the clock: the button and the badge say playing');
    await study.action('nudge').click();
    await g.waitForTimeout(300);
    assert.equal(await playing(study), true, 'a one-step press does not stop what the learner started');
    await study.play.click();
    assert.deepEqual([await playing(study), await study.card.locator('[data-animation-playback-status]').getAttribute('data-animation-playback-status')], [false, 'paused'], 'Pause: the button and the badge say paused');
  });

  await genSession.context.close();

  // ---- /animation on a brand-new canvas never saved (owner report 2026-10-30, fixed in 3b53780be) ----
  // A canvas made with no board PUT has no board id until its first save: the first /animation line must save the board once, then
  // start its job on that board, never refuse with "could not be started". Same fake job server; every board PUT is answered by
  // the real stack and recorded with the board id it returns, in order with the job create.
  const fresh = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Animation fresh ${run}` }) }); // no board PUT
  const order = [];
  const freshRouter = async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'PUT' && path.startsWith('/api/learn/boards/')) {
      const response = await route.fetch(), json = await response.json().catch(() => null);
      order.push({ kind: 'put', board: json?.board_id ?? null });
      return route.fulfill({ response, json });
    }
    if (request.method() === 'POST' && path === '/api/learn/animation/jobs') order.push({ kind: 'create', board: request.postDataJSON()?.boardId ?? null });
    return genRouter(route);
  };
  await step('on a brand-new canvas the first /animation starts one job on that canvas board and places its card', async () => {
    const { context: c, page: p } = await open({ canvas: fresh, first: null, extra: freshRouter });
    const creates = flow.creates.length;
    await p.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 20000 });
    await composer(p).click(); await composer(p).fill(`/animation ${REQUEST}`); await p.waitForTimeout(150); await composer(p).press('Enter');
    await until(async () => flow.creates.length === creates + 1, 'one job for the first /animation line on a new canvas', 20000);
    const job = [...flow.jobs.values()].at(-1);
    await p.locator(`[data-block-id="${job.cardId}"] [data-animation3d-card]`).waitFor({ state: 'attached', timeout: 20000 });
    assert.equal(await p.getByText('could not be started', { exact: false }).count(), 0, 'no "could not be started" notice');
    // The board id may come from the canvas's load (a new canvas gets one there, fast-e2e 41152017714) or from a save made first
    // (LearnPage startAnimation): what matters is one job on this canvas's real board, read back from the server.
    const at = order.findIndex(entry => entry.kind === 'create');
    assert.ok(at >= 0, `the create was seen: ${JSON.stringify(order)}`);
    const serverBoard = (await api(`/api/learn/boards/${fresh.name}/main`))?.board_id;
    assert.ok(serverBoard, 'the new canvas has a board on the server');
    assert.equal(order[at].board, serverBoard, `the job is created on this canvas's board: ${JSON.stringify(order)}`);
    assert.equal(job.boardId, serverBoard);
    assert.equal(order.filter(entry => entry.kind === 'create').length, 1, 'one job create');
    await shot(p, 'L-fresh-canvas');
    await c.close();
  });
  // Owner 2026-11-01 (FX-AN-026): a failed job offers only what the server offers, in the server's words, and its action works.
  await step('a failed job shows the server explanation and only its offered action; Revise plan pressed twice asks once and the card waits on the new job', async () => {
    const words = 'The scene was too large to check. You have not been charged. It was corrected automatically once, but it still did not pass. Revise plan prepares a simpler plan from your request for you to review, using up to 56 AI credits; nothing is built until you press Generate.';
    const { context: c, page: p } = await open({ canvas: fresh, first: null, extra: genRouter });
    const creates = flow.creates.length;
    flow.fail = { failure: { stage: 'validating', category: 'spec', message: words, retryable: false }, recovery: ['revise_plan', 'edit_request'] };
    await p.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 20000 });
    await composer(p).click(); await composer(p).fill(`/animation ${REQUEST}`); await p.waitForTimeout(150); await composer(p).press('Enter');
    await until(async () => flow.creates.length === creates + 1, 'one job for the /animation line', 20000);
    const failed = [...flow.jobs.values()].at(-1), root = p.locator(`[data-block-id="${failed.cardId}"]`);
    await root.locator('[data-animation-pending="failed"]').waitFor({ timeout: 20000 });
    assert.equal((await root.locator('[data-animation-stage]').innerText()).trim(), words);
    const button = root.locator('[data-animation-job-retry]');
    await button.waitFor({ timeout: 10000 });
    assert.deepEqual([(await button.innerText()).trim(), await button.getAttribute('data-animation-job-retry')], ['Revise plan', 'revise_plan']);
    await shot(p, 'M-failed-card');
    await button.dblclick();
    await until(async () => flow.retries.length >= 1, 'a retry request');
    await p.waitForTimeout(800);
    assert.deepEqual(flow.retries, [{ jobId: failed.id, body: { boardId: failed.boardId, expectedAttempt: 1, action: 'revise_plan' } }], 'two presses, one request naming the action');
    await root.locator('[data-animation-pending="awaiting_approval"]').waitFor({ timeout: 20000 });
    assert.equal(await root.locator('[data-animation-job-retry]').count(), 0, 'no retry while the new job waits');
    await shot(p, 'M-revised-waiting');
    await c.close();
  });
  // FX-AN-031 (owner 2026-11-02): before Generate. A fake job server here, so these prove the card, Chat and press wiring; the server's own words and rules are in animation-feasibility.test.js.
  const NOTICE = 'Changed: the trail draws 50 markers, one every 3 steps, instead of 150; every step still runs.';
  const send = async p => {
    await p.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 20000 });
    await composer(p).click(); await composer(p).fill(`/animation ${REQUEST}`); await p.waitForTimeout(150); await composer(p).press('Enter');
  };
  await step('a plan that looks too large: Chat says why and what each change does, nothing to Generate; Use this plan pressed twice is one choice, and only then its plan has a Generate, with the change in view', async () => {
    const { context: c, page: p } = await open({ canvas: fresh, first: null, extra: genRouter });
    const creates = flow.creates.length, words = '"Beam balance" needs a change before it can be made. By our estimate this plan is too large to build and check: it draws a trail of 150 markers. An estimate can be wrong.';
    flow.say = { open: true, content: words, notices: [NOTICE], choice: { jobId: null, attempt: 1, kind: 'size', key: 'size-key-1', chosen: null, alternatives: [{ id: 'fewer_markers', title: 'Draw a shorter trail', changes: [NOTICE] }] } };
    await send(p);
    await until(async () => flow.creates.length === creates + 1, 'one job', 20000);
    const waiting = [...flow.jobs.values()].at(-1), dock = p.locator('[data-chat-pane]');
    const offered = dock.locator('[data-animation-choice="size"]');
    await offered.waitFor({ timeout: 20000 });
    assert.ok((await dock.innerText()).includes('By our estimate'), 'the reason is in Chat');
    assert.equal((await offered.locator('li').first().innerText()).trim(), NOTICE, 'exactly what changes');
    assert.match(await offered.locator('[data-animation-alternative-cost]').innerText(), /^Uses no AI credits\. Nothing is built until you press Generate\.$/);
    assert.equal(await dock.locator(`[data-generation-proposal="animation"][data-proposal-id="${sha16(waiting.id)}"]`).count(), 0, 'nothing to Generate before a change is accepted');
    await p.locator(`[data-block-id="${waiting.cardId}"] [data-animation-stage]`).waitFor({ timeout: 20000 });
    await until(async () => (await p.locator(`[data-block-id="${waiting.cardId}"] [data-animation-stage]`).innerText()).trim() === 'Choose a change to the plan in Chat', 'the card sends the learner to Chat');
    await shot(p, 'N-oversized-choice');
    await offered.locator('[data-animation-choose="fewer_markers"]').dblclick();
    await until(async () => flow.chooses.length >= 1, 'a choose request');
    await p.waitForTimeout(800);
    assert.deepEqual(flow.chooses.at(-1), { jobId: waiting.id, body: { boardId: waiting.boardId, choice: 'fewer_markers', key: 'size-key-1' } }, 'two presses, one request naming the plan it was offered for');
    assert.equal(flow.chooses.length, 1);
    const accepted = dock.locator(`[data-generation-proposal="animation"][data-proposal-id="${sha16(waiting.id)}"]`);
    await accepted.waitFor({ timeout: 20000 });
    assert.deepEqual(await accepted.locator('[data-plan-notices] li').allInnerTexts(), [NOTICE], 'the change stays in view on the plan');
    await accepted.locator('[data-proposal-generate]:not([disabled])').waitFor({ timeout: 10000 });
    assert.ok(await dock.locator('[data-animation-chosen]').isVisible(), 'the choice says Chosen');
    await shot(p, 'N-oversized-accepted');
    await c.close();
  });
  await step('an unsupported request: its reason in Chat, alternatives with their cost, no retry on the card; pressing one asks for that alternative once and the card waits on the new job', async () => {
    const { context: c, page: p } = await open({ canvas: fresh, first: null, extra: genRouter });
    const creates = flow.creates.length, reason = 'A walkable world with real fluid physics needs a game engine these scenes do not have. Choose an alternative in Chat, or edit the request to start a new animation.';
    flow.fail = { failure: { stage: 'preparing', category: 'capability', message: reason, retryable: false }, recovery: ['plan_alternative', 'edit_request'] };
    flow.say = { content: `This animation cannot be made as asked. ${reason} Your request is kept.`, choice: { jobId: null, attempt: 1, kind: 'gap', chosen: null, alternatives: [{ id: 'watch', title: 'A scene to watch', changes: ['A looping illustration of the idea.'], credits: 56 }, { id: 'experiment', title: 'A small experiment', changes: ['A simplified model.'], credits: 56 }] } };
    await send(p);
    await until(async () => flow.creates.length === creates + 1, 'one job', 20000);
    const failed = [...flow.jobs.values()].at(-1), root = p.locator(`[data-block-id="${failed.cardId}"]`), dock = p.locator('[data-chat-pane]');
    await root.locator('[data-animation-pending="failed"]').waitFor({ timeout: 20000 });
    assert.equal((await root.locator('[data-animation-stage]').innerText()).trim(), reason);
    assert.equal(await root.locator('[data-animation-job-retry]').count(), 0, 'the alternatives are in Chat, not a second button here');
    const offered = dock.locator('[data-animation-choice="gap"]');
    await offered.waitFor({ timeout: 20000 });
    assert.equal(await offered.locator('[data-animation-alternative]').count(), 2);
    assert.equal((await offered.locator('[data-animation-alternative-cost]').first().innerText()).trim(), 'Uses up to 56 AI credits to write the plan. Nothing is built until you press Generate.');
    await shot(p, 'N-unsupported');
    const retries = flow.retries.length;
    await offered.locator('[data-animation-choose="watch"]').dblclick();
    await until(async () => flow.retries.length > retries, 'a retry request');
    await p.waitForTimeout(800);
    assert.deepEqual(flow.retries.slice(retries), [{ jobId: failed.id, body: { boardId: failed.boardId, expectedAttempt: 1, action: 'plan_alternative', alternative: 'watch' } }], 'two presses, one request naming the alternative');
    await root.locator('[data-animation-pending="awaiting_approval"]').waitFor({ timeout: 20000 });
    await c.close();
  });
  await step("a failure's explanation arrives in Chat with no action, and a reload shows it once, asking for nothing", async () => {
    const { context: c, page: p } = await open({ canvas: fresh, first: null, extra: genRouter });
    const creates = flow.creates.length, words = 'The scene builder reached its output limit before it finished. That does not prove your request is impossible; a smaller plan may fit. You have not been charged. Revise plan prepares a simpler plan from your request for you to review, using up to 56 AI credits; nothing is built until you press Generate.';
    flow.fail = { failure: { stage: 'authoring', category: 'model_output', code: 'output_limit', message: words, retryable: true }, recovery: ['revise_plan', 'edit_request'] };
    flow.say = { content: `"Beam balance" was not finished. ${words} Your request and plan are kept.` };
    await send(p);
    await until(async () => flow.creates.length === creates + 1, 'one job', 20000);
    const dock = p.locator('[data-chat-pane]'), said = dock.locator('[data-answer-body]').filter({ hasText: 'reached its output limit' });
    await said.first().waitFor({ timeout: 20000 });
    assert.equal(await said.count(), 1, 'one message');
    await shot(p, 'N-explained');
    const writes = flow.writes.length;
    await p.reload();
    await p.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 20000 });
    await said.first().waitFor({ timeout: 20000 });
    await p.waitForTimeout(800);
    assert.equal(await said.count(), 1, 'still one after a reload');
    assert.deepEqual(flow.writes.slice(writes), [], 'a reload writes nothing to the job');
    await c.close();
  });


  // ---- WebGL unavailable (AN-02/03) ----
  await step('without WebGL each card keeps its description and says interactive 3D is unavailable; no blank success, no page error', async () => {
    const before = errors.length;
    const { context: c, page: p } = await open({ webgl: false });
    for (const id of ['a-watch', 'a-exp', 'a-game']) {
      const q = parts(p, id);
      await q.card.locator('[data-animation-webgl-unavailable]').waitFor({ timeout: 30000 });
      assert.equal(await q.card.getAttribute('data-animation-phase'), 'unavailable');
      assert.ok(await q.card.locator('[data-animation-description]').isVisible(), 'the description is shown');
      assert.equal(await q.viewport.evaluate(node => node.hasAttribute('data-viewer-live')), false, 'no live scene claimed');
    }
    await shot(p, 'G-no-webgl');
    assert.deepEqual(errors.slice(before), [], 'no uncaught error without WebGL');
    await c.close();
  });

  await step('no generation or model request, no other origin, no page error and no console error', async () => {
    assert.deepEqual(stray, []);
    assert.deepEqual(offOrigin, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
  });
} finally {
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${TOTAL} checks passed`);
process.exit(passed === TOTAL && results.length === TOTAL ? 0 : 1);
