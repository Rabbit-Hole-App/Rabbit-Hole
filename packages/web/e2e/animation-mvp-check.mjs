// /animation MVP qualification in the real app (AN-07, plan sections 4, 5 and 12), against the LOCAL stack only: local D1, a fresh
// browser profile, no model call. Canvases are seeded with the hand-authored contract fixtures (src/animation3d/fixtures.js: test
// data, not generation evidence) as animation3d cards naming a built-in example (block.fixtureId); the card loads them itself.
// Every expected number comes from e2e/animation-oracle.mjs, hand-written formulas that never call the runtime, so a
// plausible-looking wrong scene fails.
// Covers: /animation in Slash Commands and its composer pill, and a bare /animation makes no generation request; the watch card
// plays, pauses on the visible moment, restarts and loops without resetting its speed; each experiment parameter at its minimum,
// maximum and default moves both the scene's geometry and its readouts to the oracle's values; the mini-game's wrong and winning
// moves, hint, moves counter, a move after winning, reload restoring its state and Reset; narrow and wide cards in light and dark
// keep every control inside the card; before Interact the wheel pans the canvas and leaves the scene; Interact turns the scene,
// not the canvas; Escape ends it; window blur drops a held drag; a press in Chat ends it and every typed key reaches the composer;
// a browser without WebGL keeps the description and says so; no page or console error, no model request.
// Hooks: the card's data-animation-* attributes (Animation3DCard.jsx, animation3d/Controls.jsx); handback-v.md lists the three
// this check needs beyond them (data-animation-time/-duration, data-animation-frame, a readout's data-value).
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/animation-mvp-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { openSlashHelp } from './canvas-menu-helpers.mjs';
import { FIXTURES, expectedReadouts, expectedNodes, expectedGame, close } from './animation-oracle.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('animation-mvp-check runs against the local stack only');
const SHOTS = process.argv[2] || 'animation-mvp-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 24; // bump with the steps below; the printed line is what CI reads
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `anim-${run}@example.com`, secret, handle: `anim_${run}` }) })).json();
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  return response.json().catch(() => null);
};

// A seeded built-in example card (lane U card.js fixtureIdOf: block.fixtureId names a fixtures.js entry). w sets its width.
const card3d = (id, kind, w) => ({ id, type: 'animation3d', dx: 0, dy: 0, title: FIXTURES[kind].title, fixtureId: FIXTURES[kind].name, ...(w ? { w } : {}) });
const board = blocks => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks, exchanges: [] });
// Three cards per canvas: the shared viewer policy keeps at most three live WebGL viewers (plan section 5).
const catalog = await api('/api/apps');
const main = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Animation MVP ${run}` }) });
const sizes = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Animation sizes ${run}` }) });
const keyOf = name => `small.adaptive-canvas:${catalog.org}:${catalog.email}:${name}:ink`;
const SEEDS = [[keyOf(main.name), board([card3d('a-watch', 'watch'), card3d('a-exp', 'experiment'), card3d('a-game', 'game')])],
  [keyOf(sizes.name), board([card3d('a-narrow', 'experiment', 340), card3d('a-wide', 'experiment', 960)])]];

// Generation and model routes: none may be called by watching, playing or the controls. A non-GET is aborted and counted.
const MODEL = /^\/api\/(ask$|learn\/(ask|selection|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|artifact|explain|animation|chat\/material-proposals|cad\/jobs|motion))/;
const stray = [], offOrigin = [], errors = [], consoleErrors = [];
const NOTEBOOK_ORIGIN = 'https://small-learn-canvas-notebook-dev.tryrabbithole.workers.dev'; // the app page's own notebook frame (explain-program-card-check)
const results = [];
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); }
};
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); };

const browser = await chromium.launch();
async function fit(page) {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Shift+Digit1'); // zoom to fit, so every card is on screen
  await page.waitForTimeout(900);
}
const open = async ({ theme = 'light', canvas = main, first = 'a-watch', webgl = true } = {}) => {
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
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const tag = `${theme}${webgl ? '' : ' no-webgl'}`;
  page.on('pageerror', error => errors.push(`${tag}: ${error.message}`));
  // Aborted model routes log "Failed to load resource" (counted in stray instead). Without WebGL, three.js may report the refused
  // context as a console error: that refusal is the case under test there, so that context's console is not collected.
  page.on('console', message => { if (webgl && message.type() === 'error' && !/Failed to load resource/.test(message.text())) consoleErrors.push(`${tag}: ${message.text().slice(0, 300)}`); });
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator(`[data-block-id="${first}"] [data-animation3d-card]`).waitFor({ timeout: 60000 });
  await fit(page);
  return { context, page };
};

const parts = (page, id) => {
  const root = page.locator(`[data-block-id="${id}"]`), card = root.locator('[data-animation3d-card]'), viewport = card.locator('[data-animation-viewport]');
  return { root, card, viewport,
    play: card.locator('[data-animation-play]'), restart: card.locator('[data-animation-restart]'), speed: card.locator('[data-animation-speed]'),
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
  await until(isLive, 'the scene never drew its first frame', 30000);
};
// The scene's pixels: identical when its camera and frame have not changed (the experiment scene is static between inputs).
const pixels = p => p.viewport.screenshot();
const shot = async (page, name) => { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const sameNodes = (got, want, label) => { for (const [id, t] of Object.entries(want)) for (const k of Object.keys(t)) assert.ok(close(got?.[id]?.[k], t[k]), `${label}: node ${id} ${k} ${JSON.stringify(got?.[id]?.[k])}, oracle ${JSON.stringify(t[k])}`); };
// The readouts three ways: the shown element's raw value, its text at the declared decimals, and the applied frame's value.
const sameReadouts = async (p, kind, want, label) => {
  const applied = (await frame(p)).readouts || {};
  for (const [rid, value] of Object.entries(want)) {
    const shown = Number(await p.readout(rid).getAttribute('data-value')), decimals = FIXTURES[kind].readouts.find(r => r.id === rid)?.decimals;
    assert.ok(close(shown, value), `${label}: readout ${rid} shows ${shown}, oracle ${value}`);
    assert.ok(close(applied[rid], value), `${label}: frame readout ${rid} ${applied[rid]}, oracle ${value}`);
    if (decimals !== undefined) assert.ok((await p.readout(rid).innerText()).includes(value.toFixed(decimals)), `${label}: readout ${rid} text ${await p.readout(rid).innerText()} lacks ${value.toFixed(decimals)}`);
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
    sameNodes((await frame(W)).nodes, expectedNodes('watch', {}, t), `paused at ${t}s`);
    await sameReadouts(W, 'watch', expectedReadouts('watch', {}, t), `paused at ${t}s`);
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
    sameNodes((await frame(W)).nodes, expectedNodes('watch', {}, t), 'after Restart');
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
  await step("game: reload restores the outcome, the moves and the robot's square", async () => {
    await page.waitForTimeout(2500); // the canvas saves after a short pause
    await page.reload();
    await G.card.waitFor({ timeout: 60000 });
    await fit(page);
    await live(G);
    await sameGame(played, 'after reload');
  });
  await step('game: Reset scene restores the starting conditions: the robot home, no moves, playing', async () => {
    await G.reset.click();
    await page.waitForTimeout(500);
    await sameGame([], 'after Reset');
  });

  // ---- Focus and gestures (AN-03; plan section 4 "Stable control profiles", interaction.js) ----
  await step('before Interact the wheel over the scene pans the canvas and leaves the scene; a drag on the bare canvas pans it', async () => {
    await live(X);
    assert.equal(await active(X), false);
    const [start, at] = [await pixels(X), await box(X.viewport)];
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(500);
    assert.ok(Math.abs((await box(X.viewport)).y - at.y) > 20, 'the wheel panned the canvas');
    assert.ok((await pixels(X)).equals(start), 'the wheel left the scene camera');
    const bare = await barePoint(page), from = await box(X.viewport);
    assert.ok(bare, 'a bare canvas point');
    await page.mouse.move(bare.x, bare.y); await page.mouse.down(); await page.mouse.move(bare.x + 120, bare.y + 60, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(400);
    assert.ok(Math.abs((await box(X.viewport)).x - from.x) > 40, 'a drag on the bare canvas pans it');
    await fit(page);
  });
  await step('Interact: a drag turns the scene, not the canvas; Escape ends it and leaves the card where it was', async () => {
    await X.interact.click();
    await until(() => active(X), 'Interact did not start');
    assert.equal(await X.interact.getAttribute('aria-pressed'), 'true');
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
    await X.interact.click();
    await until(() => active(X), 'Interact did not start');
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
    if (!(await active(X))) { await X.interact.click(); await until(() => active(X), 'Interact did not start'); }
    const start = await pixels(X);
    await composer(page).click();
    await until(async () => !(await active(X)), 'a press outside did not end the interaction');
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
