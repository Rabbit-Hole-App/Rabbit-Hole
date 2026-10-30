// /animation MVP qualification in the real app (AN-07, plan sections 4, 5 and 12), against the LOCAL stack only: local D1, a fresh
// browser profile, no model call. A canvas is seeded with the hand-authored contract fixtures (src/animation3d/fixtures.js: test
// data, not generation evidence) as animation3d cards; the dev build admits fixture cards (VITE_COACHING_DEV), as /explain's
// program cards are admitted. Every expected number comes from e2e/animation-oracle.mjs, hand-written formulas that never call the
// runtime, so a plausible-looking wrong scene fails.
// Covers: /animation in Slash Commands and its composer pill, and a bare /animation makes no generation request; the watch card
// plays, pauses on the visible moment, restarts and loops without resetting its inputs; the experiment's parameter at its minimum,
// default and maximum moves both the scene's geometry and its readouts to the oracle's values; the mini-game's wrong and correct
// actions, hint, attempts and reset, and reload restoring its state; narrow and wide cards in light and dark keep every control
// reachable; the outer canvas still pans when the scene does not own interaction; typing in Chat is unaffected; Escape and window
// blur release the scene; a browser without WebGL shows the description and an honest unavailable state; no page or console error.
// Hooks: the data-animation3d-* attributes below are the card's contract with this check (handback-v.md lists them for lane U).
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
const TOTAL = 23; // bump with the steps below; the printed line is what CI reads
// Plan section 4 "Stable control profiles": an idle scene does not steal the wheel, so the canvas pans. If the owner's 2026-10-22
// hover-zoom rule for 3D content (content-gestures.js) is applied to animation3d instead, set 'scene': either way never both.
const IDLE_WHEEL_OWNER = 'canvas';
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `anim-${run}@example.com`, secret, handle: `anim_${run}` }) })).json();
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  return response.json().catch(() => null);
};

// One seeded fixture card. `animation3d: { fixtureId }` is the dev-only fixture reference (lane U/A: the admitted shape); w sets width.
const card3d = (id, fixture, w) => ({ id, type: 'animation3d', dx: 0, dy: 0, title: FIXTURES[fixture].title, animation3d: { fixtureId: FIXTURES[fixture].id }, ...(w ? { w } : {}) });
const BLOCKS = [card3d('a-watch', 'watch'), card3d('a-exp', 'experiment'), card3d('a-game', 'game'), card3d('a-narrow', 'experiment', 340), card3d('a-wide', 'experiment', 960)];
const seed = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks: BLOCKS, exchanges: [] };
const catalog = await api('/api/apps');
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Animation MVP ${run}` }) });
const keyOf = name => `small.adaptive-canvas:${catalog.org}:${catalog.email}:${name}:ink`;

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
const open = async ({ theme = 'light', viewport = { width: 1600, height: 1000 }, webgl = true } = {}) => {
  const context = await browser.newContext({ viewport, colorScheme: theme });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(([storageKey, value, mode]) => {
    try { localStorage.setItem('small.theme', mode); if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* the defaults then */ }
  }, [keyOf(canvas.name), seed, theme]);
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
  // Aborted model routes log "Failed to load resource"; those are counted in stray, not here. Without WebGL three.js reports the
  // failed context as a console error: that context's own failure is the case under test, so it is kept apart.
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) (webgl ? consoleErrors : []).push(`${tag}: ${message.text().slice(0, 300)}`); });
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-block-id="a-watch"] [data-animation3d-card]').waitFor({ timeout: 60000 });
  await fit(page);
  return { context, page };
};
async function fit(page) {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Shift+Digit1'); // zoom to fit, so every card is on screen
  await page.waitForTimeout(900);
}

const parts = (page, id) => {
  const root = page.locator(`[data-block-id="${id}"]`), card = root.locator('[data-animation3d-card]'), viewport = card.locator('[data-animation3d-viewport]');
  return { root, card, viewport,
    play: card.locator('[data-animation3d-play]'), restart: card.locator('[data-animation3d-restart]'), time: card.locator('[data-animation3d-time]'),
    speed: card.locator('[data-animation3d-speed]'), reset: card.locator('[data-animation3d-reset]'), interact: card.locator('[data-animation3d-interact]'),
    param: pid => card.locator(`input[type="number"][data-animation3d-param="${pid}"]`), readout: rid => card.locator(`[data-animation3d-readout="${rid}"]`),
    action: aid => card.locator(`[data-animation3d-action="${aid}"]`) };
};
const num = async locator => Number(await locator.getAttribute('data-value'));
const live = viewport => until(() => viewport.evaluate(node => node.hasAttribute('data-live')), 'the scene never drew its first frame', 30000);
const frame = async viewport => JSON.parse(await viewport.getAttribute('data-frame')); // the last applied frame: { nodes, readouts, goal? }
const camera = viewport => viewport.getAttribute('data-camera');
const interacting = card => card.evaluate(node => node.hasAttribute('data-interacting'));
const shot = async (page, name) => { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
// The scene's node transforms against the oracle's, for every node the oracle names.
const sameNodes = (got, want, label) => { for (const [id, t] of Object.entries(want)) for (const k of Object.keys(t)) assert.ok(close(got?.[id]?.[k], t[k]), `${label}: node ${id} ${k} ${JSON.stringify(got?.[id]?.[k])}, oracle ${JSON.stringify(t[k])}`); };
// The readouts three ways: the shown element's raw value, its text at the declared decimals, and the applied frame's value.
const sameReadouts = async (p, kind, want, label) => {
  const applied = (await frame(p.viewport)).readouts || {};
  for (const [rid, value] of Object.entries(want)) {
    const shown = await num(p.readout(rid)), decimals = FIXTURES[kind].readouts.find(r => r.id === rid)?.decimals;
    assert.ok(close(shown, value), `${label}: readout ${rid} shows ${shown}, oracle ${value}`);
    assert.ok(close(applied[rid], value), `${label}: frame readout ${rid} ${applied[rid]}, oracle ${value}`);
    if (decimals !== undefined) assert.ok((await p.readout(rid).innerText()).includes(value.toFixed(decimals)), `${label}: readout ${rid} text ${await p.readout(rid).innerText()} lacks ${value.toFixed(decimals)}`);
  }
};
// A point on the bare canvas, to pan from (explain-program-card-check barePoint).
const barePoint = page => page.evaluate(() => {
  const s = document.querySelector('[data-canvas-surface]').getBoundingClientRect();
  for (let y = s.top + 60; y < s.bottom - 60; y += 30) for (let x = s.left + 6; x < s.right - 6; x += 30) {
    const el = document.elementFromPoint(x, y);
    if (el?.closest('[data-canvas-surface]') && !el.closest('[data-block-id],[data-item-id],[data-shape-id],[data-canvas-bottom] button,[role="toolbar"],[data-zoom],[data-canvas-minimap],iframe,button')) return { x, y };
  }
  return null;
});
const composer = page => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();

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
  await step('the /animation pill reads animation and has a Remove button; a bare /animation sends no generation request and makes no card', async () => {
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

  // ---- The three fixture cards render (AN-02/03) ----
  await step('the watch, experiment and game fixtures render as live 3D scenes, each visibly labelled a fixture, with a description', async () => {
    for (const [p, experience] of [[W, 'watch'], [X, 'experiment'], [G, 'game']]) {
      await live(p.viewport);
      assert.equal(await p.card.getAttribute('data-experience'), experience);
      assert.equal(await p.card.getAttribute('data-state'), 'ready');
      assert.equal(await p.viewport.locator('canvas').count(), 1, 'one WebGL canvas');
      assert.ok(await p.card.locator('[data-animation3d-fixture-label]').isVisible(), 'labelled a fixture, not a generated result');
      assert.ok((await p.card.locator('[data-animation3d-description]').textContent()).trim().length > 0, 'an accessible scene description');
    }
    for (const [p, kind] of [[W, 'watch'], [X, 'experiment'], [G, 'game']]) assert.equal(await p.play.count(), FIXTURES[kind].playable ? 1 : 0, `${kind}: Play only where there is a timeline`);
    await shot(page, 'B-three-cards');
  });

  // ---- Watch: play, pause, restart, loop (AN-02/04) ----
  await step('watch: Play advances time and the scene; the scene matches the oracle at the displayed time', async () => {
    const t0 = await num(W.time);
    await W.play.click();
    await page.waitForTimeout(800);
    assert.ok(await num(W.time) !== t0, 'time advanced');
    await W.play.click(); // pause, to read one settled frame
    await page.waitForTimeout(300);
    const t = await num(W.time);
    sameNodes((await frame(W.viewport)).nodes, expectedNodes('watch', {}, t), `paused at ${t}s`);
    await sameReadouts(W, 'watch', expectedReadouts('watch', {}, t), `paused at ${t}s`);
  });
  await step('watch: Pause keeps the visible moment (time and frame unchanged while paused)', async () => {
    const [t, f] = [await num(W.time), await W.viewport.getAttribute('data-frame')];
    await page.waitForTimeout(700);
    assert.equal(await num(W.time), t);
    assert.equal(await W.viewport.getAttribute('data-frame'), f);
  });
  await step('watch: it loops past its duration without resetting its speed or inputs, and keeps playing', async () => {
    const duration = Number(await W.time.getAttribute('data-duration'));
    assert.ok(duration > 0 && duration <= 30, `a bounded loop duration: ${duration}`);
    if (await W.speed.count()) await W.speed.selectOption('2');
    const inputs = await W.card.locator('input[data-animation3d-param]').evaluateAll(nodes => nodes.map(n => n.value));
    await W.play.click();
    let last = await num(W.time), wrapped = false;
    for (const end = Date.now() + (duration / 2 + 3) * 1000; Date.now() < end && !wrapped;) { await page.waitForTimeout(150); const now = await num(W.time); wrapped = now < last; last = now; }
    assert.ok(wrapped, 'the time wrapped to the start of the loop');
    assert.equal(await W.card.getAttribute('data-playing'), 'true', 'still playing after the wrap');
    if (await W.speed.count()) assert.equal(await W.speed.inputValue(), '2', 'speed kept');
    assert.deepEqual(await W.card.locator('input[data-animation3d-param]').evaluateAll(nodes => nodes.map(n => n.value)), inputs, 'inputs kept');
  });
  await step('watch: Restart returns to time zero and the oracle\'s starting frame, keeping its inputs', async () => {
    await W.restart.click();
    if (await W.card.getAttribute('data-playing') === 'true') await W.play.click();
    await page.waitForTimeout(300);
    const t = await num(W.time);
    assert.ok(t < 0.2, `near zero after Restart: ${t}`);
    sameNodes((await frame(W.viewport)).nodes, expectedNodes('watch', {}, t), 'after Restart');
    await shot(page, 'C-watch');
  });

  // ---- Experiment: min / default / max against the oracle (AN-04/07) ----
  const exp = FIXTURES.experiment;
  const setParam = async (id, value) => { await X.param(id).fill(String(value)); await X.param(id).press('Tab'); await page.waitForTimeout(400); };
  // One parameter at a time at its minimum, maximum and default, the others at their defaults: each moves the geometry (the beam's
  // tilt, a weight's place) and the readouts, and every value is the oracle's.
  for (const [label, pick] of [['minimum', p => p.min], ['maximum', p => p.max], ['default', p => p.default]]) {
    await step(`experiment: each parameter at its ${label} moves the geometry and the readouts to the oracle's values`, async () => {
      for (const p of exp.parameters) {
        await setParam(p.id, pick(p));
        const inputs = { [p.id]: pick(p) };
        await sameReadouts(X, 'experiment', expectedReadouts('experiment', inputs), `${p.id}=${pick(p)}`);
        sameNodes((await frame(X.viewport)).nodes, expectedNodes('experiment', inputs), `${p.id}=${pick(p)}`);
        await setParam(p.id, p.default);
      }
    });
  }
  await step('experiment: a parameter change makes no model request, and Reset restores the defaults', async () => {
    const p = exp.parameters[0], before = stray.length;
    await X.param(p.id).fill(String(p.max)); await X.param(p.id).press('Tab');
    await page.waitForTimeout(400);
    await X.reset.click();
    await page.waitForTimeout(600);
    assert.equal(Number(await X.param(p.id).inputValue()), p.default);
    await sameReadouts(X, 'experiment', expectedReadouts('experiment', {}), 'after Reset');
    assert.equal(stray.length, before);
    await shot(page, 'D-experiment');
  });

  // ---- Mini-game (AN-04/06/07): the robot must reach the target square; the moves readout is its attempts counter ----
  const game = FIXTURES.game, goal = G.card.locator('[data-animation3d-goal]');
  const sameGame = async (actions, label) => {
    const want = expectedGame(actions);
    assert.equal(await goal.getAttribute('data-status'), want.status, `${label}: goal status`);
    await sameReadouts(G, 'game', want.readouts, label);
    sameNodes((await frame(G.viewport)).nodes, want.nodes, label);
  };
  const act = async (...actions) => { for (const a of actions) await G.action(a).click(); await page.waitForTimeout(500); };
  await step('game: the goal and every declared action are shown; a wrong action (into the edge) is blocked, counted, and the game goes on', async () => {
    assert.ok((await goal.innerText()).trim().length > 0, 'the objective is shown');
    for (const a of game.actions) assert.equal(await G.action(a).count(), 1, `action ${a}`);
    await sameGame([], 'start');
    await act(game.wrongAction);
    await sameGame([game.wrongAction], 'after the wrong action');
  });
  await step('game: Hint shows the hint and makes no move', async () => {
    await G.card.locator('[data-animation3d-hint]').click();
    assert.ok((await G.card.locator('[data-animation3d-hint-text]').innerText()).trim().length > 0, 'a hint');
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
    await page.locator('[data-block-id="a-game"] [data-animation3d-card]').waitFor({ timeout: 60000 });
    await fit(page);
    await live(G.viewport);
    await sameGame(played, 'after reload');
  });
  await step('game: Reset restores the starting conditions: the robot home, no moves, playing', async () => {
    await G.reset.click();
    await page.waitForTimeout(500);
    await sameGame([], 'after Reset');
  });

  // ---- Focus and gestures (AN-03; plan section 4 "Stable control profiles") ----
  const box = locator => locator.boundingBox();
  await step(`an idle scene: the wheel over it moves the ${IDLE_WHEEL_OWNER}, never both; a drag on the bare canvas pans it`, async () => {
    await live(X.viewport);
    assert.equal(await interacting(X.card), false);
    const [cam, at] = [await camera(X.viewport), await box(X.viewport)];
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(500);
    const moved = Math.abs((await box(X.viewport)).y - at.y) > 20, zoomed = (await camera(X.viewport)) !== cam;
    assert.ok(!(moved && zoomed), 'the wheel moved both the canvas and the scene');
    assert.ok(IDLE_WHEEL_OWNER === 'canvas' ? moved && !zoomed : zoomed && !moved, `canvas moved ${moved}, scene camera moved ${zoomed}`);
    const bare = await barePoint(page), from = await box(X.viewport);
    assert.ok(bare, 'a bare canvas point');
    await page.mouse.move(bare.x, bare.y); await page.mouse.down(); await page.mouse.move(bare.x + 120, bare.y + 60, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(400);
    const to = await box(X.viewport);
    assert.ok(Math.abs(to.x - from.x) > 40, `a drag on the bare canvas pans it (${from.x} -> ${to.x})`);
    assert.equal(await camera(X.viewport), cam, 'the scene camera did not move');
  });
  await step('Interact captures the scene: a drag orbits its camera, not the canvas; Escape releases it', async () => {
    await X.interact.click();
    await until(() => interacting(X.card), 'Interact did not start');
    assert.equal(await X.interact.getAttribute('aria-pressed'), 'true');
    const [cam, at] = [await camera(X.viewport), await box(X.viewport)];
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2); await page.mouse.down();
    await page.mouse.move(at.x + at.width / 2 + 80, at.y + at.height / 2 + 20, { steps: 10 }); await page.mouse.up();
    await page.waitForTimeout(400);
    assert.notEqual(await camera(X.viewport), cam, 'the drag orbited the camera');
    assert.ok(Math.abs((await box(X.viewport)).x - at.x) < 2, 'the canvas did not pan under an inner drag');
    await page.keyboard.press('Escape');
    await until(async () => !(await interacting(X.card)), 'Escape did not release the scene');
    assert.equal(await X.interact.getAttribute('aria-pressed'), 'false');
  });
  await step('typing in Chat is unaffected, and focus leaving the scene (window blur) releases it', async () => {
    await X.interact.click();
    await until(() => interacting(X.card), 'Interact did not start');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await until(async () => !(await interacting(X.card)), 'window blur did not release the scene');
    await X.interact.click();
    await until(() => interacting(X.card), 'Interact did not start again');
    const cam = await camera(X.viewport);
    await composer(page).click();
    await until(async () => !(await interacting(X.card)), 'focusing the composer did not release the scene');
    const words = 'wasd arrows and Escape-free text';
    await page.keyboard.type(words);
    assert.equal(await composer(page).inputValue(), words, 'every key reached the composer');
    assert.equal(await camera(X.viewport), cam, 'typing moved the scene camera');
    await composer(page).fill('');
    await page.evaluate(() => document.activeElement?.blur());
  });
  await context.close();

  // ---- Narrow and wide, light and dark (AN-03) ----
  for (const theme of ['light', 'dark']) await step(`${theme}: narrow and wide experiment cards keep every control inside the card and reachable`, async () => {
    const { context: c, page: p } = await open({ theme });
    assert.equal(await p.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark', 'the theme class');
    const [N, Wd] = [parts(p, 'a-narrow'), parts(p, 'a-wide')];
    await live(N.viewport); await live(Wd.viewport);
    assert.ok((await box(N.card)).width < (await box(Wd.card)).width, 'the narrow card is narrower');
    for (const q of [N, Wd]) {
      await q.root.scrollIntoViewIfNeeded();
      const outer = await box(q.card);
      const controls = await q.card.locator('button, input, select').evaluateAll(nodes => nodes.filter(n => n.offsetParent).map(n => { const r = n.getBoundingClientRect(); return { label: n.getAttribute('aria-label') || n.textContent.trim() || n.dataset.animation3dParam || n.tagName, x: r.x, y: r.y, w: r.width, h: r.height }; }));
      assert.ok(controls.length > 0, 'controls');
      for (const r of controls) assert.ok(r.w > 0 && r.x >= outer.x - 1 && r.x + r.w <= outer.x + outer.width + 1, `${r.label} is clipped by the card (${JSON.stringify(r)} in ${JSON.stringify(outer)})`);
    }
    await shot(p, `F-${theme}-narrow-wide`);
    await c.close();
  });

  // ---- WebGL unavailable (AN-02/03) ----
  await step('without WebGL each card keeps its description and says interaction is unavailable; no blank success, no page error', async () => {
    const before = errors.length;
    const { context: c, page: p } = await open({ webgl: false });
    for (const id of ['a-watch', 'a-exp', 'a-game']) {
      const q = parts(p, id);
      const gone = q.card.locator('[data-animation3d-unavailable]');
      await gone.waitFor({ timeout: 30000 });
      assert.equal(await gone.getAttribute('data-reason'), 'webgl');
      assert.equal(await q.card.getAttribute('data-state'), 'unavailable');
      assert.ok((await q.card.locator('[data-animation3d-description]').textContent()).trim().length > 0, 'the description stays');
      assert.equal(await q.viewport.evaluate(node => node.hasAttribute('data-live')), false, 'no live scene claimed');
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
