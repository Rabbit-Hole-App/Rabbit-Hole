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
// the real request path with a fake job server in the page: /animation in Chat, its plan (title, experience, reason), an experience
// change saving version 2, Generate pressed twice making one approve and one card from the served artifact, a working control, and a
// reload restoring it with no job or model request; a browser without WebGL keeps the description and says so; no page or console
// error, no model request.
// Hooks: the card's data-animation-* / data-animation3d-* attributes (Animation3DCard.jsx, animation3d/Controls.jsx; lane U hand-back).
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/animation-mvp-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { openSlashHelp } from './canvas-menu-helpers.mjs';
import { experimentFixture } from '../src/animation3d/fixtures.js';
import { hashProgramSource } from '../src/animation3d/contract.js';
import { FIXTURES, expectedReadouts, expectedNodes, expectedGame, close, within, WATCH_ALLOWANCE as WATCH } from './animation-oracle.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('animation-mvp-check runs against the local stack only');
const SHOTS = process.argv[2] || 'animation-mvp-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 31; // bump with the steps below; the printed line is what CI reads
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
const glNotes = []; // console lines about WebGL contexts (Chromium warns, not errors, when it drops one)
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
  page.on('console', message => { if (/webgl|context lost|too many active/i.test(message.text())) glNotes.push(`${message.type()}: ${message.text().slice(0, 200)}`); });
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
// Live: the scene drew. A card beyond the visible-viewer budget waits for a click on its scene ("Click to show the 3D view").
const live = async p => {
  const isLive = () => p.viewport.evaluate(node => node.hasAttribute('data-viewer-live'));
  if (!(await isLive()) && await p.card.locator('[data-animation-click-surface]').count()) { await p.root.scrollIntoViewIfNeeded(); await p.card.locator('[data-animation-click-surface]').click(); }
  // On failure, every card's state on the page: which hold a live scene, which wait for a click, which failed (a viewer budget or a
  // lost context reads differently from a renderer that never drew).
  await until(isLive, 'the scene never drew its first frame', 30000).catch(async error => {
    const cards = await p.root.page().locator('[data-animation3d-card]').evaluateAll(nodes => nodes.map(n => { const v = n.querySelector('[data-animation-viewport]'), r = n.getBoundingClientRect();
      return `${n.closest('[data-block-id]')?.dataset.blockId} phase=${n.dataset.animationPhase} live=${!!v?.hasAttribute('data-viewer-live')} click=${!!n.querySelector('[data-animation-click-surface]')} failure=${n.querySelector('[data-animation-failure]')?.dataset.animationFailure ?? '-'} status="${v?.querySelector('[role="status"]')?.textContent.trim() ?? ''}" box=${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}`; })).catch(() => []);
    throw Error(`${error.message}; cards: ${cards.join(' | ')}; WebGL notes: ${glNotes.slice(-5).join(' | ') || 'none'}`);
  });
};
// The scene's pixels: identical when its camera and frame have not changed (the experiment scene is static between inputs).
const pixels = p => p.card.locator('[data-animation-host]').screenshot(); // inside the viewport's border, which darkens while interacting
const shot = async (page, name) => { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
// abs: an absolute allowance (the watch card's 3-decimal time, oracle WATCH_ALLOWANCE); without it, exact to float noise.
const eq = (got, want, abs) => (abs === undefined ? close(got, want) : within(got, want, abs));
const sameNodes = (got, want, label, abs) => { for (const [id, t] of Object.entries(want)) for (const k of Object.keys(t)) assert.ok(eq(got?.[id]?.[k], t[k], abs), `${label}: node ${id} ${k} ${JSON.stringify(got?.[id]?.[k])}, oracle ${JSON.stringify(t[k])}`); };
// The readouts three ways: the shown element's raw value, its text at the declared decimals, and the applied frame's value.
const sameReadouts = async (p, kind, want, label, abs) => {
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

  // ---- The three fixture cards (AN-02/03) ----
  await step('the watch, experiment and game examples draw live 3D scenes, each labelled an example with its description; Play only on the loop', async () => {
    for (const [p, kind] of [[W, 'watch'], [X, 'experiment'], [G, 'game']]) {
      await live(p);
      assert.equal(await p.card.getAttribute('data-animation-experience'), kind);
      assert.equal((await p.card.locator('[data-animation-badge]').innerText()).trim(), BADGE[kind], `${kind}: its experience badge`);
      assert.equal(await p.card.getAttribute('data-animation-phase'), 'ready');
      assert.equal(await p.viewport.locator('canvas').count(), 1, `${kind}: one WebGL canvas`);
      assert.ok(await p.card.locator('[data-animation-fixture-note]').isVisible(), `${kind}: labelled a built-in example, not a generated result`);
      assert.ok((await p.card.locator('[data-animation-description]').textContent()).trim().length > 0, `${kind}: an accessible scene description`);
      assert.equal(await p.play.count(), FIXTURES[kind].playable ? 1 : 0, `${kind}: Play only where there is a timeline`);
    }
    await shot(page, 'B-three-cards');
  });

  // ---- Watch: play, pause, restart, loop (AN-02/04) ----
  await step('watch: Play advances time; paused, the scene and its readout are the oracle\'s at the shown time', async () => {
    const t0 = await time(W);
    await W.play.click();
    await page.waitForTimeout(900);
    assert.ok(await playing(W), 'playing');
    assert.notEqual(await time(W), t0, 'time advanced');
    await W.play.click();
    await page.waitForTimeout(300);
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
    await W.restart.click();
    if (await playing(W)) await W.play.click();
    await page.waitForTimeout(300);
    const t = await time(W);
    assert.ok(t < 0.3, `near zero after Restart: ${t}`);
    sameNodes((await frame(W)).nodes, expectedNodes('watch', {}, t), 'after Restart', WATCH.nodes);
    assert.equal(await W.speed.inputValue(), '2');
    await shot(page, 'C-watch');
  });

  // ---- Experiment: min / max / default against the oracle (AN-04/07) ----
  const exp = FIXTURES.experiment;
  const setParam = async (id, value) => { await X.param(id).fill(String(value)); await X.param(id).press('Enter'); await page.waitForTimeout(400); };
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
  await step('experiment: the picture changes with an input, and Reset scene restores the defaults with no model request', async () => {
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
  await step('game: Reset scene restores the starting conditions: the robot home, no moves, playing', async () => {
    await G.reset.click();
    await page.waitForTimeout(500);
    await sameGame([], 'after Reset');
  });

  // ---- Focus and gestures (AN-03; plan section 4 "Stable control profiles", interaction.js) ----
  // Each gesture step starts from the same place: nothing interacting, the canvas fitted (a failed step must not move the next).
  const settle = async () => { if (await active(X)) { await page.keyboard.press('Escape'); await until(async () => !(await active(X)), 'Escape did not end the interaction'); } await live(X); await fit(page); await live(X); };
  const enter = async () => { await X.interact.click(); await until(() => active(X), 'Interact did not start'); assert.equal(await X.interact.getAttribute('aria-pressed'), 'true'); };
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
  await context.close();

  // ---- Narrow and wide, light and dark (AN-03) ----
  for (const theme of ['light', 'dark']) await step(`${theme}: narrow and wide experiment cards keep every control inside the card`, async () => {
    const { context: c, page: p } = await open({ theme, canvas: sizes, first: 'a-narrow' });
    assert.equal(await p.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark', 'the theme class');
    const [N, Wd] = [parts(p, 'a-narrow'), parts(p, 'a-wide')];
    await live(N); await live(Wd);
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
  const SERVED = new Map([[ARTIFACT.artifactId, ARTIFACT], [DRAG_ARTIFACT.artifactId, DRAG_ARTIFACT]]);
  const sha16 = text => createHash('sha256').update(text).digest('hex').slice(0, 16);
  const flow = { jobs: new Map(), creates: [], approves: [], puts: [], reads: [], writes: [], proposals: new Map(), briefs: [] };
  const viewOf = job => ({ id: job.id, version: 1, boardId: job.boardId, cardId: job.cardId, stage: job.stage, attempt: 1, terminal: ['ready', 'failed', 'cancelled'].includes(job.stage),
    repairs: 0, stopReason: null, failure: null, recovery: [], usage: { credits: 0, unknown: false }, createdAt: 0, updatedAt: 0,
    result: job.stage === 'ready' ? { jobId: job.id, resultId: job.artifact.artifactId, cardId: job.cardId, canvas: { boardId: job.boardId }, requestRef: sha16(`${job.requestId}|${job.prompt}`), revision: 1, planHash: job.artifact.planHash } : null });
  const planOf = job => ({ proposal_id: sha16(job.id), version: 1, command: 'animation', title: job.artifact.title,
    description: 'A beam on a pivot with one weight on each side; change masses and distances and watch it tilt.', settings: { experience: 'watch' }, source_refs: [], references: [],
    assumptions: ['Rigid, massless beam.'], limitations: ['The tilt is illustrative.'], requirements: [`Recommended: watch. ${REASON}`, 'Behavior: analytical', 'Controls: manipulate'],
    input: { org: 'w', app: gen.name, job: job.id, plan_hash: job.artifact.planHash, request: job.prompt }, original_request: `/animation ${job.prompt}`,
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
        job = { id: `aj_${run}${flow.jobs.size + 1}`, requestId: body.requestId, boardId: body.boardId, cardId: body.cardId, prompt: body.prompt, stage: 'preparing', artifact: flow.next || ARTIFACT };
        flow.next = null;
        flow.jobs.set(job.id, job);
        const messageId = String(800001 + flow.briefs.length);
        flow.proposals.set(messageId, planOf(job));
        flow.briefs.push({ messageId, threadId: body.threadId, jobId: job.id });
        const answer = viewOf(job);
        job.stage = 'awaiting_approval'; // the card's first read sees the plan waiting, so its thread is shown again
        return route.fulfill({ status: 202, json: { job: answer } });
      }
      return route.fulfill({ status: 202, json: { job: viewOf(job) } });
    }
    const one = path.match(/^\/api\/learn\/animation\/jobs\/([^/]+)(?:\/(\w+))?$/);
    if (one) {
      const job = flow.jobs.get(decodeURIComponent(one[1]));
      if (!job || (method === 'GET' && url.searchParams.get('board') !== job.boardId)) return route.fulfill({ status: 404, json: { error: 'Not available' } });
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
      const message = b => ({ role: 'assistant', content: 'Here is the plan for your animation. Generate makes it.', messageId: b.messageId, kind: 'answer', status: 'done',
        meta: { version: 1, mode: 'ask', kind: 'answer', contextRefs: [], actions: [], followUps: [], syllabus: null, proposal: flow.proposals.get(b.messageId), alternatives: [b.messageId] } });
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
    if (path === '/api/learn/tutor/plan') return route.fulfill({ json: { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'Canned Tutor reply.' }] } });
    return route.fallback();
  };
  const genSession = await open({ canvas: gen, first: null, extra: genRouter });
  const { page: g } = genSession, gDock = g.locator('[data-chat-pane]');
  const plan = () => gDock.locator('[data-generation-proposal="animation"]').last();
  let job = null;
  await step('/animation with a request in Chat: one job, its plan in the review area (title, recommended experience and its reason) and the canvas card waiting; nothing approved', async () => {
    await g.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 20000 });
    await composer(g).click(); await composer(g).fill(`/animation ${REQUEST}`); await g.waitForTimeout(150); await composer(g).press('Enter');
    await until(async () => flow.creates.length === 1, 'one job for the /animation line');
    job = [...flow.jobs.values()][0];
    assert.equal(job.prompt, REQUEST, 'the request words, without the command');
    await plan().waitFor({ timeout: 20000 });
    assert.equal((await plan().locator('h3').innerText()).trim(), 'Beam balance');
    assert.equal(await plan().locator('[data-proposal-select="experience"]').inputValue(), 'watch', 'the recommended experience');
    assert.ok((await plan().locator('[data-proposal-section="requirements"]').innerText()).includes(REASON), "the recommendation's reason");
    await g.locator(`[data-block-id="${job.cardId}"] [data-animation-pending]`).waitFor({ state: 'attached', timeout: 20000 });
    assert.equal(flow.approves.length, 0, 'nothing approved');
    await plan().screenshot({ path: `${SHOTS}/I-plan.png` });
  });
  await step('changing the experience saves version 2; Generate pressed twice sends one approve with it and makes one card, drawn from the served artifact', async () => {
    await plan().locator('[data-proposal-select="experience"]').selectOption('experiment');
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
    await plan().locator('[data-proposal-made]').waitFor({ timeout: 10000 });
    const q = parts(g, job.cardId);
    await until(async () => (await q.card.getAttribute('data-animation-experience')) === 'experiment', 'the result card', 30000);
    await fit(g);
    await live(q);
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
  const enterD = async () => { if (!(await active(D))) { await D.interact.click(); await until(() => active(D), 'Interact did not start'); } };
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
    await plan().locator('[data-proposal-generate]:not([disabled])').waitFor({ timeout: 20000 });
    await plan().locator('[data-proposal-generate]').click();
    D = parts(g, second.cardId);
    await until(async () => (await D.card.getAttribute('data-animation-experience')) === 'experiment', 'the bead card', 30000);
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

  await genSession.context.close();

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
