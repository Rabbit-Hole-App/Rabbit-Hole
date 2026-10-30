// Rabbit Hole acceptance (docs/features/dive-v1.md), flows A-K, against the LOCAL stack only.
// Owner spec 2026-10-29 (slash commands cleanup): /dive is no longer a command. Typed in Chat or Ctrl+K it says it is no longer
// available and opens nothing (flow R); every hole here is opened from a card through the card menu's Start Rabbit Hole (or a
// double-click). The old flow E (no card: /dive <topic> made a topic anchor card and dived from it, and a bare /dive asked) is
// dropped with the command; topic-only holes have no entry point now (an owner question, not a check). Each first object is an
// empty notebook (/notebook), since /whiteboard left the commands too.
//   npx wrangler dev -c packages/web/wrangler.dev.jsonc -c packages/control-plane/wrangler.jsonc --local --persist-to .small/dive-local --port 8788
// It writes to local D1 and this browser profile; never point it at a deployed worker.
// Usage: node e2e/dive-check.mjs [outDir]
// On a lane stack (e2e/journey-local-stack.md): BASE=http://127.0.0.1:8868 SMALL_CP=http://127.0.0.1:8869 TEST_BYPASS_SECRET=<that stack's>.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw Error('dive-check runs against the local stack only');
const OUT = process.argv[2] || 'dive-shots';
mkdirSync(OUT, { recursive: true });
// Sessions are minted on the control plane's own origin (the app origin's P0-B barrier refuses /test/session):
// the standalone local control plane, SMALL_CP (default http://127.0.0.1:8790).
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8790';
const secret = process.env.TEST_BYPASS_SECRET || readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
const cookie = `small_session=${session}`;
const get = async path => (await fetch(`${BASE}${path}`, { headers: { cookie } })).json();
const post = async (path, body) => (await fetch(`${BASE}${path}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

// A fresh root canvas per run, seeded with the NanoGPT deep-dive board.
const root = await post('/api/canvases', { title: 'Attention' });
const BOARD = 'nanogpt-deep-dive';
const ROOT_URL = `/apps/${root.name}?board=${BOARD}`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
// A hole's opening question and a typed turn are Tutor turns (#46): this UI check answers the Tutor plan in the browser, as
// shared-rabbit-hole-check does; the planner's real wiring is covered on the journey stack (journey-check, tutor-slice-check,
// next-steps-wiring-check). Next Steps hook requests go to the real route (answered at the provider boundary by the fixture).
const plans = [];
await context.route('**/api/learn/tutor/plan', route => { plans.push(route.request().url()); return route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', actions: [{ type: 'respond_text', text: 'What would you like to explore first?' }] } }); });
// Card thumbnails (card-thumbnails.md) are not under test here, so their uploads are answered in the browser: on the Windows
// lane stack a thumbnail upload took the local worker down mid-run three times (2026-10-09). card-thumbnails-check covers them.
await context.route('**/main/thumbnail', route => (route.request().method() === 'PUT' ? route.fulfill({ status: 204 }) : route.continue()));
const page = await context.newPage();
const errors = [];
// A page error fails the run after every flow has passed (gate 40392709758: "Cannot read properties of undefined (reading 'schema')", 8/8 flows ok, no stack kept), so keep where it came from: the stack, the last shot taken and the URL.
let lastShot = 'before the first shot';
page.on('pageerror', error => errors.push(`${error.message} | after shot ${lastShot} | ${page.url()} | ${String(error.stack).split(String.fromCharCode(10)).slice(1, 7).map(line => line.trim()).join(' <- ')}`));
const shot = async name => { lastShot = name; await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const open = async url => { await page.goto(`${BASE}${url}`); await page.waitForSelector('[data-tool-gutter]', { timeout: 30000 }); await page.waitForTimeout(1500); };
const url = () => new URL(page.url());
const blocks = () => page.$$eval('[data-block-id]:not([data-chat-block])', nodes => nodes.map(node => node.dataset.blockId));
// A card is selected by pressing its drag strip (the frame handle sits under the card's own strip).
const select = async id => { const strip = page.locator(`[data-block-id="${id}"] [data-drag-zone]`).last(); await strip.scrollIntoViewIfNeeded(); await strip.click({ position: { x: 12, y: 8 } }); await page.waitForTimeout(300); };
const composer = () => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
const slash = async text => { await composer().click(); await composer().fill(text); await page.waitForTimeout(150); await composer().press('Enter'); await page.waitForTimeout(800); };
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
// Down from a card: its menu's Start Rabbit Hole (enters the card's own hole when it has one). Ctrl/Cmd+K on a selected card is
// the inline AI editor's (owner 2026-10-13).
const diveFrom = async id => { await startHole(page, id); await page.waitForTimeout(800); };
const deselect = async () => { await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Escape'); await page.waitForTimeout(200); }; // never a click: it could land on a card
const nav = () => page.locator('[data-dive-navigator]');
const waitPersisted = async () => { await page.waitForFunction(() => /^\/apps\/canvas-[a-f0-9]{8}$/.test(location.pathname) && !location.search.includes('hole='), null, { timeout: 15000 }); await page.waitForTimeout(600); };
// The Rabbit Holes Map's accepted place (owner, ce856371 "a little bit on top and on left"): pinned to the top
// right of its gutter (pt-1, pr-4: 4 px down, 16 px in). The map is 76 px wide in an 84 px gutter, so the left
// inset lets it reach at most 8 px past the gutter onto the surface's edge - never further into the canvas.
// It stays clear of the toolbar, and the toolbar keeps its usable height.
// UI-17 (owner, 2026-10-21): the map sits at the top of the tools gutter at every width, never in a 92 px column of its own.
// Owner decision 2026-10-22: the surface fills the workspace and the tools column floats over it, so the map is on the
// surface by design; it must stay inside the tools column and below the floating page header instead.
const gutterProblems = g => {
  const problems = [];
  const apart = (a, b) => a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y;
  if (!g.nav || !g.gutter || !g.slot) return ['navigator, its gutter or its slot missing'];
  if (g.column) problems.push('the map has a column of its own ([data-dive-gutter])');
  if (g.nav.x < g.gutter.x - 1 || g.nav.right > g.gutter.right + 1) problems.push(`navigator ${g.nav.x}-${g.nav.right} outside the tools gutter (${g.gutter.x}-${g.gutter.right})`);
  if (Math.abs(g.nav.y - g.slot) > 1) problems.push(`navigator top ${g.nav.y} not at the top of the gutter's slot (${g.slot})`);
  if (g.header != null && g.nav.y < g.header - 0.5) problems.push(`navigator top ${g.nav.y} above the header's bottom (${g.header})`);
  if (!apart(g.nav, g.toolbar)) problems.push('navigator overlaps the toolbar');
  if (g.toolbar.bottom - g.toolbar.y <= 120) problems.push('toolbar lost its usable height');
  return problems;
};
const geometry = () => page.evaluate(() => { const box = s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }; return { nav: box('[data-dive-navigator]'), gutter: (() => { const r = document.querySelector('[data-dive-navigator]')?.closest('[data-dive-gutter],[data-tool-gutter]')?.getBoundingClientRect(); return r && { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; })(), slot: (() => { const el = document.querySelector('[data-dive-navigator]')?.closest('[data-gutter-top]'); return el ? el.getBoundingClientRect().top + parseFloat(getComputedStyle(el).paddingTop) : null; })(), column: !!document.querySelector('[data-dive-gutter]'), header: (() => { const rects = [...(document.querySelector('[data-canvas-header]')?.children || [])].map(el => el.getBoundingClientRect()).filter(r => r.width && r.height); return rects.length ? Math.max(...rects.map(r => r.bottom)) : null; })(), surface: box('[data-canvas-surface]'), toolbar: box('[role="toolbar"][aria-label="Canvas tools"]') }; });
const inGutter = async label => {
  const problems = gutterProblems(await geometry());
  assert.deepEqual(problems, [], `${label}: Rabbit Holes Map placement`);
};
// The check is real: the map shifted 40 px out of its gutter, or 20 px down, must fail it.
const gutterCheckBites = async () => {
  for (const shift of ['translateX(-40px)', 'translateY(20px)']) {
    await page.evaluate(t => { document.querySelector('[data-dive-navigator]').style.transform = t; }, shift);
    assert.ok(gutterProblems(await geometry()).length > 0, `the placement check catches a map moved by ${shift}`);
  }
  await page.evaluate(() => { document.querySelector('[data-dive-navigator]').style.transform = ''; });
};
const up = async () => { await nav().getByRole('button', { name: 'Up to the parent hole' }).click(); await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1500); };
// The map's grip (owner, 2026-10-08): the map moves inside its gutter slot, which stays put (inGutter keeps measuring the slot).
const mapAt = async () => { const box = await page.locator('[data-dive-map]').boundingBox(); return { x: box.x, y: box.y, right: box.x + box.width, bottom: box.y + box.height }; };
const frameAt = () => page.evaluate(() => { const r = document.querySelector('[data-dive-navigator]').closest('[data-dive-gutter],[data-tool-gutter]').parentElement.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; });
const near = (a, b, label) => assert.ok(Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1, `${label}: map at ${a.x},${a.y}, want ${b.x},${b.y}`);
const dragMap = async (dx, dy) => {
  const grip = await page.locator('[data-dive-grip]').boundingBox(), x = grip.x + grip.width / 2, y = grip.y + grip.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 12 }); await page.mouse.up();
  await page.waitForTimeout(200);
  return mapAt();
};

// ---- root, and a selected card before diving ----
await open(ROOT_URL);
await shot('01-root-navigator');
await inGutter('root');
await gutterCheckBites();
await inGutter('root, restored');
// ---- the Rabbit Holes Map's grip: drag anywhere over the canvas, clamped inside it, remembered, double-click resets ----
const home = await mapAt();
near(await dragMap(520, 260), { x: home.x + 520, y: home.y + 260 }, 'the grip drags the map over the canvas');
assert.equal(await page.locator('[data-dive-map][data-moved]').count(), 1, 'a moved map is marked (its white card)');
await inGutter('map dragged, its slot unchanged');
await shot('holes-map-01-dragged');
const grip0 = await page.locator('[data-dive-grip]').boundingBox(); // then to the window's lower-left corner, past the canvas
const clamped = await dragMap(2 - (grip0.x + grip0.width / 2), 998 - (grip0.y + grip0.height / 2)), frame = await frameAt();
assert.ok(clamped.x >= frame.x - 0.5 && clamped.bottom <= frame.bottom + 0.5 && clamped.y >= frame.y && clamped.right <= frame.right, `clamped fully inside the canvas frame: ${JSON.stringify({ clamped, frame })}`);
// The floating bottom strip floats over the canvas (z-30): the map stops 8 px above its minimap and zoom row, never under them,
// and its grip still takes a click (r29 gate: a map dragged under the minimap had an unreachable grip).
const chrome = await page.evaluate(() => Object.fromEntries(['[data-canvas-minimap]', '[data-zoom]', '[data-zoom-stack]'].map(s => { const r = document.querySelector(s)?.getBoundingClientRect(); return [s, r && r.width ? { x: r.x, y: r.y, right: r.right, bottom: r.bottom } : null]; })));
assert.ok(chrome['[data-zoom]'], 'the zoom row is there to clear');
const apart = (a, b) => !b || a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y;
for (const s of ['[data-canvas-minimap]', '[data-zoom]']) assert.ok(apart(clamped, chrome[s]), `the dragged map stays clear of ${s}: ${JSON.stringify({ clamped, box: chrome[s] })}`);
near(clamped, { x: frame.x, y: chrome['[data-zoom-stack]'].y - 8 - (clamped.bottom - clamped.y) }, 'pinned to the left edge, 8 px above the minimap and zoom row');
await page.locator('[data-dive-grip]').click({ trial: true, timeout: 5000 }); // actionable: nothing intercepts the grip
await shot('holes-map-02-clamped');
assert.equal(await page.locator('[data-dive-grip]').evaluate(node => node.tagName === 'BUTTON' && node.tabIndex === 0 && node.getAttribute('aria-label')), 'Move Rabbit Holes Map', 'a focusable, named grip');
await page.locator('[data-dive-grip]').focus();
// Six steps right clear the 84 px tools gutter: since UI-17 the map's slot sits above the toolbar, so the toolbar ends lower
// and covers a map stepped only up from the corner (fast-e2e 39721083356: the toolbar took the grip's double-click).
for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowUp']) await page.keyboard.press(key);
const stepped = await mapAt();
near(stepped, { x: clamped.x + 96, y: clamped.y - 32 }, 'arrow keys step the map 16 px');
await open(ROOT_URL);
near(await mapAt(), stepped, 'a reload keeps the spot');
await page.locator('[data-dive-grip]').click({ trial: true, timeout: 5000 }); // actionable: nothing intercepts the grip
await shot('holes-map-03-after-reload');
// Owner decision 2026-10-22: the page header floats over the canvas, and the map is never dragged under its controls. Dragged
// to the window's top edge under the centred header group, it stops 8 px below the group, clear of Home and the group.
{
  const controls = () => page.evaluate(() => [...(document.querySelector('[data-canvas-header]')?.children || [])].map(el => el.getBoundingClientRect()).filter(r => r.width && r.height).map(r => ({ x: r.x, y: r.y, right: r.right, bottom: r.bottom })));
  const group = (await page.locator('[data-header-group]').boundingBox()), grip = await page.locator('[data-dive-grip]').boundingBox();
  assert.ok(group, 'the canvas header group is there to clear');
  const under = await dragMap(group.x + group.width / 2 - (grip.x + grip.width / 2), 2 - (grip.y + grip.height / 2));
  for (const box of await controls()) assert.ok(apart(under, box), `the dragged map stays clear of the header control ${JSON.stringify(box)}: ${JSON.stringify(under)}`);
  const ceiling = Math.max(...(await controls()).filter(box => box.x < under.right && box.right > under.x).map(box => box.bottom));
  assert.ok(Number.isFinite(ceiling), `the map was dragged under the header group's span: ${JSON.stringify({ under, group })}`);
  assert.ok(Math.abs(under.y - (ceiling + 8)) <= 1, `pinned 8 px under the header's controls: map top ${under.y}, controls bottom ${ceiling}`);
  await page.locator('[data-dive-grip]').click({ trial: true, timeout: 5000 }); // its grip is reachable, not under the header
  await shot('holes-map-03b-under-header');
}
await page.locator('[data-dive-grip]').dblclick();
near(await mapAt(), home, 'double-click puts it back in the gutter');
assert.equal(await page.evaluate(() => localStorage.getItem('small.dive.mapSpot')), null, 'and forgets the spot');
assert.equal(await page.locator('[data-dive-map][data-moved]').count(), 0);
await open(ROOT_URL);
near(await mapAt(), home, 'still in the gutter after a reload');
await inGutter('map reset');
console.log('holes map grip ok');
const [card1, card2] = (await blocks()).slice(0, 2);
// The composer: Auto (not a model picker) opens the palette; a chosen command is a removable pill.
const dock = page.locator('[data-chat-pane]');
assert.doesNotMatch(await dock.innerText(), /\b(Opus|Sonnet|Haiku)\b/, 'no model names in the Learn composer');
await composer().fill('softmax');
await dock.getByRole('button', { name: 'Commands' }).click();
await dock.locator('[data-slash-command="graph"]').waitFor();
assert.equal(await dock.locator('[data-slash-command="dive"]').count(), 0, 'no /dive in the palette (owner spec 2026-10-29)');
await shot('01b-auto-palette');
// Auto opens the palette on its search field (owner, 2026-10-08): focused, filtering by name and description without the
// field moving, its keys never reaching the composer; up/down move the highlight; Esc clears a typed search first.
const search = dock.locator('[data-slash-search]');
assert.ok(await search.evaluate(node => node === document.activeElement), 'Auto focuses the palette search');
const fieldTop = (await search.boundingBox()).y;
await search.pressSequentially('/gra');
assert.deepEqual(await dock.locator('[data-slash-command]').evaluateAll(rows => rows.map(row => row.dataset.slashCommand)), ['graph', 'diagram'], 'the search filters, a leading / ignored');
assert.equal(await composer().inputValue(), '/', 'typing in the search never reaches the composer');
await search.press('ArrowDown');
assert.equal(await dock.locator('[data-slash-command="diagram"]').getAttribute('aria-selected'), 'true', 'down moves the highlight');
await search.fill('zzz');
await dock.getByText('No commands match').waitFor();
assert.equal((await search.boundingBox()).y, fieldTop, 'the field does not move while the list filters');
await shot('01b2-auto-search-empty');
await search.press('Escape');
assert.equal(await search.inputValue(), '', 'Esc clears a typed search first and keeps the palette');
await dock.locator('[data-slash-command="graph"]').click();
await dock.locator('[data-command-pill]').waitFor();
assert.equal(await composer().inputValue(), 'softmax', 'choosing a command keeps the typed text as its argument');
await shot('01c-command-pill');
await dock.getByRole('button', { name: 'Remove Graph' }).click();
assert.equal(await dock.locator('[data-command-pill]').count(), 0);
assert.equal(await composer().inputValue(), 'softmax', 'the pill\'s × keeps the text');
// Enter in the search takes the highlighted match (a description match here) and hands focus back to the composer.
await dock.getByRole('button', { name: 'Commands' }).click();
await search.pressSequentially('example'); // a description match: /code's title is Code example
await search.press('Enter');
await dock.locator('[data-command-pill]').waitFor();
assert.equal(await composer().inputValue(), 'softmax', 'Enter in the search chooses the command and keeps the text');
assert.ok(await composer().evaluate(node => node === document.activeElement), 'choosing from the search focuses the composer');
assert.equal(await dock.locator('[data-command-pill]').getAttribute('data-command-pill'), 'code', 'the description match is /code');
await dock.getByRole('button', { name: 'Remove Code example' }).click();
await dock.getByRole('button', { name: 'Commands' }).click();
await search.press('Escape');
await search.waitFor({ state: 'detached' });
assert.equal(await composer().inputValue(), 'softmax', 'Esc on an empty search closes the palette and gives the text back');
await dock.getByRole('button', { name: 'Commands' }).waitFor();
await composer().fill('/graph ');
await dock.locator('[data-command-pill]').waitFor();
assert.equal(await composer().inputValue(), '', 'a typed command becomes the pill');
await composer().press('Backspace');
assert.equal(await dock.locator('[data-command-pill]').count(), 0, 'Backspace on an empty argument removes the pill');
// The root navigator shows structure only: no ↑ above the root, no ↓ with nothing below.
assert.equal(await nav().getByRole('button', { name: 'Up to the parent hole' }).count(), 0, 'no ↑ at the root');
assert.equal(await nav().locator('[data-dive-down]').count(), 0, 'no ↓ without children');
assert.doesNotMatch(await nav().innerText(), /none yet/);
const activeLabel = () => nav().locator('[aria-current="location"] [data-dive-level]').evaluate(node => { const style = getComputedStyle(node); return [style.backgroundColor, style.color]; });
// Owner, Rabbit Hole and reference navigation design 2026-10-29: RH blue replaces green; the filled current level is the primary fill.
assert.deepEqual(await activeLabel(), ['rgb(27, 111, 194)', 'rgb(255, 255, 255)'], 'the current level is a primary-fill label with white text');
await select(card1);
await shot('02-selected-card');

// ---- A: an empty dive is a pending hole with a temporary portal; leaving the tree discards it ----
// Ctrl/Cmd+K on a selected card opens the inline AI editor (owner 2026-10-13, docs/features/inline-ai-editor.md §2):
// no hole, no Search. Start Rabbit Hole (and a double-click) are the ways down.
await page.keyboard.press('Control+k');
await page.locator('[data-inline-ai]').waitFor();
assert.equal(url().searchParams.get('hole'), null, 'Ctrl+K on a selected card opens the inline editor, not a hole');
assert.equal(await page.getByPlaceholder('Describe what you are looking for').count(), 0, 'Ctrl+K on a selected card is not Search');
await page.keyboard.press('Escape');
await page.locator('[data-inline-ai]').waitFor({ state: 'detached' });
await diveFrom(card1);
await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1200);
assert.equal(await page.locator('[role="dialog"][aria-label*="earch"]').count(), 0, 'Start Rabbit Hole on a card dives, not Search');
const pendingName = url().searchParams.get('hole');
await shot('03-pending-empty-hole');
assert.equal((await get(`/api/canvases/dives?app=${root.name}&board=${BOARD}`)).children.length, 0, 'a pending hole is not persisted');
// Chat works in the empty hole and does not keep it.
const asked = await fetch(`${BASE}/api/learn/ask`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ scope: { app: pendingName, pending: { parent: { app: root.name, board: BOARD }, title: 'Pending' } }, message: 'why?' }) });
const askedText = await asked.text();
assert.doesNotMatch(askedText, /Canvas not found|App required/, `a pending hole's ask reaches the tutor: ${asked.status} ${askedText.slice(0, 120)}`);
assert.equal((await get(`/api/canvases/dives?app=${root.name}&board=${BOARD}`)).children.length, 0, 'chat alone never persists the hole');
await up();
// Back on the parent (owner, 4b764cb0): an empty hole is discarded as soon as the learner leaves it, so it
// never shows on the map or as a portal - no pending record, no local keys, no hole portal, no level below.
const discarded = async (name, label) => {
  assert.equal(await page.evaluate(n => !!JSON.parse(sessionStorage.getItem('small.dive.pending') || '{}')[n], name), false, `${label}: no pending record`);
  assert.equal(await page.evaluate(n => Object.keys(localStorage).filter(key => key.includes(n)).length, name), 0, `${label}: no local keys`);
  assert.equal(await page.locator(`[data-block-id="${card1}"] [data-hole-stack], [data-block-id="${card1}"] [data-hole-row]`).count(), 0, `${label}: no hole stack or footer row on the card`);
  assert.equal(await page.locator('[data-dive-portal]').count(), 0, `${label}: no portal`);
  assert.equal(await nav().locator('[data-dive-down]').count(), 0, `${label}: nothing below the root on the map`);
};
await discarded(pendingName, 'leaving an empty hole');
await shot('04-empty-hole-discarded');
// Double-click on the card goes down a fresh hole; leaving it empty discards it too.
await page.locator(`[data-block-id="${card1}"]`).first().dblclick({ position: { x: 40, y: 40 } });
await page.waitForFunction(() => location.search.includes('hole=')); await page.waitForTimeout(1000);
const again = url().searchParams.get('hole');
await up();
await discarded(again, 'a double-clicked hole left empty');
await open(ROOT_URL);
assert.equal(await page.locator('[data-dive-portal]').count(), 0, 'no outline for an abandoned hole after a reload');
await shot('04b-after-leaving-tree');

console.log('flow A ok');

const tree = (app, board = 'main') => get(`/api/canvases/dives?app=${app}&board=${board}`);
const addObject = async () => { await slash('/notebook'); await waitPersisted(); }; // the hole's first object
const firstCard = async () => (await blocks())[0];
const selectedRing = id => page.locator(`[data-block-id="${id}"]`).first().evaluate(node => node.className.includes('ring-2'));
// The approved look of an element that owns a Rabbit Hole (owner, Rabbit Hole and reference navigation design 2026-10-29): no
// outline and no floating chip; a footer row spanning it - "Rabbit Hole", its title, Enter in the primary fill with white
// text, at least 76x36 - and two decorative layers peeking out 6 and 12 px below it, 5 and 10 px in, under nothing clickable.
const holeLook = async (selector, name, title, label) => {
  const owner = selector.startsWith('[') ? selector : `[data-block-id="${selector}"]`;
  const look = await page.locator(owner).first().evaluate((node, hole) => {
    const box = node.getBoundingClientRect(), style = getComputedStyle(node), enter = node.querySelector(`[data-dive-portal="${hole}"]`);
    const row = enter?.closest('[data-hole-row]'), r = row?.getBoundingClientRect(), e = enter?.getBoundingClientRect(), es = enter && getComputedStyle(enter);
    const layers = [...node.querySelectorAll(':scope > [data-hole-stack]')].map(layer => { const l = layer.getBoundingClientRect(); return { n: layer.dataset.holeStack, left: Math.round(l.left - box.left), right: Math.round(box.right - l.right), below: Math.round(l.bottom - box.bottom), pointer: getComputedStyle(layer).pointerEvents, hidden: layer.getAttribute('aria-hidden') }; });
    return { outline: style.outlineStyle, outlineWidth: style.outlineWidth, chips: node.querySelectorAll('[data-dive-portal]').length, text: row?.innerText.split(String.fromCharCode(10)).map(line => line.trim()).filter(Boolean),
      row: r && { left: Math.round(r.left - box.left), right: Math.round(box.right - r.right), bottom: Math.round(box.bottom - r.bottom) }, enter: e && { w: e.width, h: e.height, bg: es.backgroundColor, color: es.color, radius: es.borderRadius, inRow: e.top >= r.top && e.bottom <= r.bottom && e.right <= r.right }, layers };
  }, name);
  assert.ok(look.outline === 'none' || look.outlineWidth === '0px', `${label}: no outline (${look.outline} ${look.outlineWidth})`);
  assert.equal(look.chips, 1, `${label}: one Enter, in the footer`);
  assert.deepEqual(look.text, ['Rabbit Hole', title, 'Enter'], `${label}: the row reads Rabbit Hole, the title, Enter`);
  assert.ok(look.row && look.row.left <= 1 && look.row.right <= 1 && look.row.bottom <= 1, `${label}: the footer spans the bottom: ${JSON.stringify(look.row)}`);
  assert.ok(look.enter && look.enter.w >= 76 && look.enter.h >= 36 && look.enter.inRow, `${label}: Enter at least 76x36 inside its row: ${JSON.stringify(look.enter)}`);
  assert.deepEqual([look.enter.bg, look.enter.color, look.enter.radius], ['rgb(27, 111, 194)', 'rgb(255, 255, 255)', '6px'], `${label}: Enter is the primary fill`);
  assert.deepEqual(look.layers.map(layer => [layer.n, layer.left, layer.right, layer.below, layer.pointer, layer.hidden]), [['2', 10, 10, 12, 'none', 'true'], ['1', 5, 5, 6, 'none', 'true']], `${label}: two stacked layers, 6/12 px down and 5/10 px in, decorative: ${JSON.stringify(look.layers)}`);
};

// ---- B + D: Start Rabbit Hole from a card; the first object keeps it; the parent card gets the stacked layers and the Rabbit Hole footer ----
await diveFrom(card1);
await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1000);
await addObject();
const softmax = url().pathname.split('/').pop();
await shot('05-persistent-child');
// The stored origin contract: the block, the runtime scene and the authored card stay distinct.
const softmaxOrigin = (await tree(softmax)).dive.origin;
assert.equal(softmaxOrigin.origin_block_id, card1);
assert.match(softmaxOrigin.origin_scene_id, /^nanogpt-c[0-9]{2}-/);
assert.ok(softmaxOrigin.origin_card_id && softmaxOrigin.origin_card_id !== card1 && softmaxOrigin.origin_card_id !== softmaxOrigin.origin_scene_id, JSON.stringify(softmaxOrigin));
assert.ok(softmaxOrigin.origin_concept_ids.length > 0, 'concepts resolved, not defaulted to []');
let rootTree = await tree(root.name, BOARD);
assert.deepEqual(rootTree.children.map(child => [child.name, child.origin_block_id]), [[softmax, card1]]);
const softmaxTitle = rootTree.children[0].title;
assert.ok(softmaxTitle, 'the hole is titled from its card');
// The map dragged inside the hole: its levels still work from the new spot, and the spot is the same on every canvas.
const holeSpot = await dragMap(420, 240); // right, over the canvas: the map's home is the tools gutter's top left (UI-17)
await shot('holes-map-04-dragged-in-hole');
await nav().locator('[data-dive-level]').first().click(); // the root, from the moved map
await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1500);
assert.equal(url().pathname + url().search, ROOT_URL);
assert.equal(await page.locator(`[data-dive-portal="${softmax}"]`).count(), 1, 'the originating card is a portal');
await holeLook(card1, softmax, softmaxTitle, 'the originating card');
assert.equal(await selectedRing(card1), true, 'climbing back selects the originating card');
near(await mapAt(), holeSpot, 'the parent shows the map where the learner put it');
await shot('holes-map-05-parent-same-spot');
await nav().locator('[data-dive-down]').click(); // down again, from the moved map
await page.waitForFunction(name => location.pathname.endsWith(name), softmax); await page.waitForTimeout(1200);
await up();
await page.locator('[data-dive-grip]').dblclick();
near(await mapAt(), home, 'reset before the card flows');
await shot('06-parent-hole-outline');

// ---- C: the portal enters the child; Start Rabbit Hole on a card with a child enters it, never a duplicate ----
await page.locator(`[data-dive-portal="${softmax}"]`).click();
await page.waitForFunction(name => location.pathname.endsWith(name), softmax); await page.waitForTimeout(1200);
await up();
await page.locator(`[data-block-id="${card1}"]`).first().dblclick({ position: { x: 40, y: 40 } });
await page.waitForFunction(name => location.pathname.endsWith(name), softmax); await page.waitForTimeout(1200);
await up();
await page.locator(`[data-block-id="${card1}"] [data-drag-zone]`).last().click({ button: 'right', position: { x: 30, y: 10 } });
assert.equal((await page.locator('[data-canvas-menu] [data-menu-start-rabbit-hole]').innerText()).trim(), 'Enter Rabbit Hole', 'a card with a kept hole offers Enter Rabbit Hole');
await page.locator('[data-canvas-menu] [data-menu-start-rabbit-hole]').click();
await page.waitForFunction(name => location.pathname.endsWith(name), softmax); await page.waitForTimeout(1200);
assert.equal((await tree(root.name, BOARD)).children.length, 1, 'no duplicate child');
await up();
console.log('flows B C D ok');

// ---- R (owner spec 2026-10-29; replaces flow E): /dive is no longer a command. Typed in Chat or in Ctrl+K, with or without a
// topic and a selected card, it says so and opens nothing: no hole, no anchor card, no request. ----
const removedDive = '/dive is no longer available. Type / to see the commands, or ask in your own words.';
await deselect();
for (const line of ['/dive explain numerical stability', '/dive']) {
  const before = (await blocks()).length, dives = (await tree(root.name, BOARD)).children.length;
  await slash(line);
  await page.locator('[data-chat-pane] [data-slash-result]').getByText(removedDive, { exact: true }).waitFor({ timeout: 8000 });
  assert.equal(url().searchParams.get('hole'), null, `${line}: no hole`);
  assert.equal((await blocks()).length, before, `${line}: no anchor card`);
  assert.equal((await tree(root.name, BOARD)).children.length, dives, `${line}: nothing kept`);
}
await shot('07-typed-dive-unavailable');
await select(card1);
await page.keyboard.press('Control+k');
await page.locator('[data-inline-ai]').waitFor();
await page.locator('[data-inline-prompt]').fill('/dive softmax');
await page.keyboard.press('Enter');
await page.locator('[data-inline-unsupported="dive"]').waitFor({ timeout: 5000 });
assert.equal(await page.locator('[data-inline-unsupported="dive"]').innerText(), removedDive, 'Ctrl+K says the same');
assert.equal(url().searchParams.get('hole'), null, 'Ctrl+K /dive opens no hole');
await page.keyboard.press('Escape');
await page.locator('[data-inline-ai]').waitFor({ state: 'detached' });
await deselect();
console.log('flow R ok');

// ---- H: two cards, two holes: the child picker ----
// The second hole, from the second card (flow E's anchor hole was the second one before /dive left the commands).
await diveFrom(card2);
await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1000);
await addObject();
const second = url().pathname.split('/').pop();
await up();
await nav().locator('[data-dive-down]').click();
await page.locator('[data-dive-picker]').waitFor();
// The picker opens toward the side with room: wholly inside the window with the map at its home on the gutter's left edge.
const pickerBox = await page.locator('[data-dive-picker]').evaluate(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight }; });
assert.ok(pickerBox.left >= 0 && pickerBox.right <= pickerBox.w && pickerBox.bottom <= pickerBox.h, `the child picker is inside the window: ${JSON.stringify(pickerBox)}`);
// Nothing lies over its rows (the down button's tooltip, the toolbar): each row's marker and title start are the picker's own.
const covered = await page.locator('[data-dive-picker] [role="menuitem"]').evaluateAll(rows => rows.map(row => { const r = row.getBoundingClientRect(); return [row.textContent.trim(), !!document.elementFromPoint(r.left + 12, r.top + r.height / 2)?.closest('[data-dive-picker]'), !!document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('[data-dive-picker]')]; }).filter(([, a, b]) => !a || !b));
assert.deepEqual(covered, [], 'the child picker rows are uncovered');
await shot('08-child-picker');
await page.locator('[data-dive-picker]').getByRole('menuitem', { name: softmaxTitle }).click();
await page.waitForFunction(name => location.pathname.endsWith(name), softmax);
console.log('flow H ok');

// ---- F: double-click a level name to rename; Enter saves ----
// The rename opens as soon as the hole's notebook card is drawn, so usually while it is still starting, and keeps its focus and text
// through that start-up: Jupyter focuses its first cell as it starts, which blurred the field and dropped the rename (gate 40925212785,
// fast-e2e 40926982735). The notebook site's bridge (notebook-canvas/canvas-bridge.js) makes script focus a no-op until the learner
// presses or types in it; an inert frame did not stop it (fast-e2e 40940868103). This step passes only once the canvas notebook site
// this build points at carries that bridge. A notebook site that never answers (data-notebook-stalled) leaves nothing to start.
await page.locator('[data-notebook-frame]').waitFor();
// What happens to the field, in order (fast-e2e 40940868103: the field was gone with the frame inert): focus moves, the window's blur,
// the notebook's bridge messages, and the node whose removal took the field (the field itself, or an ancestor that remounted).
await page.evaluate(() => {
  const t0 = performance.now(), log = window.__renameLog = [], at = () => Math.round(performance.now() - t0);
  const name = node => (node?.nodeType === 1 ? `${node.tagName.toLowerCase()}${node.getAttribute('aria-label') ? `[${node.getAttribute('aria-label')}]` : ''}${Object.keys(node.dataset).slice(0, 3).map(key => `[data-${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}]`).join('')}` : String(node));
  const field = 'input[aria-label="Rename this Rabbit Hole"]';
  document.addEventListener('focusin', event => log.push(`${at()} focusin ${name(event.target)}`), true);
  document.addEventListener('focusout', event => log.push(`${at()} focusout ${name(event.target)} to ${name(event.relatedTarget)}`), true);
  const inert = () => document.querySelector('[data-notebook-frame]')?.inert;
  window.addEventListener('blur', () => log.push(`${at()} window blur, active ${name(document.activeElement)}, frame inert ${inert()}`));
  window.addEventListener('message', event => { if (typeof event.data?.type === 'string') log.push(`${at()} message ${event.data.type}`); });
  new MutationObserver(records => { for (const record of records) for (const node of record.removedNodes) if (node.nodeType === 1 && (node.matches(field) || node.querySelector(field))) log.push(`${at()} field removed with ${name(node)} from ${name(record.target)}, active ${name(document.activeElement)}, frame inert ${inert()}`); })
    .observe(document.body, { childList: true, subtree: true });
});
await nav().locator(`[aria-current="location"] [data-dive-level="${softmax}"]`).dblclick();
const rename = nav().getByRole('textbox', { name: 'Rename this Rabbit Hole' });
await rename.fill('Softmax, from scores');
const starting = await page.getByText('Starting Python', { exact: true }).count() > 0;
await page.locator('[data-notebook-header] button[aria-pressed]:not([disabled]), [data-notebook-stalled]').first().waitFor({ timeout: 60000 });
await page.waitForTimeout(1000);
console.log(`rename opened while the notebook was starting: ${starting ? 'yes' : 'no, it had started'}`);
await shot('09-rename');
const renameLog = await page.evaluate(() => window.__renameLog.join(' | '));
assert.deepEqual(await page.evaluate(() => { const field = document.querySelector('[data-dive-navigator] input[aria-label="Rename this Rabbit Hole"]'); return field && { focused: field === document.activeElement, value: field.value }; }),
  { focused: true, value: 'Softmax, from scores' }, `the rename keeps its focus and text while the notebook starts; ${renameLog}`);
await rename.press('Enter'); await page.waitForTimeout(800);
assert.equal((await tree(root.name, BOARD)).children.find(child => child.name === softmax).title, 'Softmax, from scores');
console.log('flow F ok');

// ---- G: depth - four levels and more, no cap ----
const levels = [softmax];
for (let depth = 0; depth < 4; depth++) {
  await diveFrom(await firstCard()); // down from this level's notebook
  await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(800);
  await addObject();
  levels.push(url().pathname.split('/').pop());
  if (levels.length === 3) await shot('10-navigator-4-levels');
}
assert.equal((await tree(levels.at(-1))).path.length, 6);
await shot('10b-navigator-6-levels-folded');
await inGutter('six levels');
await page.setViewportSize({ width: 1280, height: 720 }); await page.waitForTimeout(800);
await inGutter('six levels at 1280x720');
await shot('10c-six-levels-1280x720');
await page.setViewportSize({ width: 1600, height: 1000 }); await page.waitForTimeout(500);
console.log('flow G ok');

// ---- I: delete a leaf after a confirmation; a hole with holes inside needs the subtree warning ----
// Owner, 2026-10-27: every Rabbit Hole delete asks "Delete this Rabbit Hole?" with Yes, delete and Cancel (Dive.jsx confirmDialog).
const leafTitle = (await tree(levels.at(-2))).children[0]?.title;
await nav().locator('[aria-current="location"]').hover();
await nav().getByRole('button', { name: `Delete ${leafTitle}` }).click();
await page.getByRole('dialog', { name: 'Delete this Rabbit Hole?' }).waitFor();
await shot('11-delete-leaf-confirm');
await page.getByRole('dialog').getByRole('button', { name: 'Yes, delete', exact: true }).click();
await page.waitForFunction(name => location.pathname.endsWith(name), levels.at(-2)); await page.waitForTimeout(1200);
assert.equal((await tree(levels.at(-2))).children.length, 0);
await nav().locator('[data-dive-level]').first().click(); // the root
await page.waitForFunction(() => location.search.includes('board=')); await page.waitForTimeout(1500);
await nav().locator('[data-dive-down]').click();
await page.locator('[data-dive-picker] .group', { hasText: 'Softmax, from scores' }).hover();
await page.locator('[data-dive-picker]').getByRole('button', { name: 'Delete Softmax, from scores' }).click();
await page.getByRole('dialog').waitFor();
await shot('12-delete-subtree-confirm');
assert.match(await page.getByRole('dialog').innerText(), /3 Rabbit Holes inside it are deleted too/);
await page.getByRole('dialog').getByRole('button', { name: 'Yes, delete', exact: true }).click();
await page.waitForTimeout(1200);
rootTree = await tree(root.name, BOARD);
assert.deepEqual(rootTree.children.map(child => child.name), [second], 'only the second card\'s hole stays');
assert.equal(await page.locator(`[data-dive-portal="${softmax}"]`).count(), 0, 'the footer row goes with the hole');
assert.equal(await page.locator(`[data-block-id="${card1}"] [data-hole-stack]`).count(), 0, 'the stacked layers go with the hole');
console.log('flow I ok');

// ---- the agent-suggested dive (structure only) ----
// #46 (docs/features/professor-next-steps.md, LearnPage wiring): on a plain canvas the suggestion no longer floats over the
// canvas; it draws inside the Tutor's extras under its reply in the dock sheet. A Tutor turn opens that sheet first.
const card3 = (await blocks())[2];
await composer().click(); await composer().fill('What should I look at next?'); await composer().press('Enter');
await page.locator('[data-tutor-extras], [data-chat-pane]').first().waitFor();
await page.waitForTimeout(800);
await page.evaluate(id => window.dispatchEvent(new CustomEvent('small:dive-suggest', { detail: { blockId: id, topic: 'cross-entropy' } })), card3);
await page.locator('[data-tutor-extras] [data-dive-suggestion]').waitFor();
assert.equal(await page.locator('[data-dive-suggestion]').count(), 1, 'one suggestion, in the Tutor sheet, none floating');
await shot('13-agent-suggestion');
await page.getByRole('button', { name: 'Keep it on this canvas' }).click();
assert.equal(await page.locator('[data-dive-suggestion]').count(), 0);

// ---- Owner brief 2026-10-13: Ctrl+K is Quick Edit and stays on the canvas, with no card selected too - it never opens Search, which is
// Ctrl/Cmd+Shift+F now (shortcut-owner.js) ----
await deselect();
await page.keyboard.press('Control+k');
await page.waitForTimeout(600);
assert.equal(url().searchParams.get('hole'), null);
assert.equal(await page.getByPlaceholder('Describe what you are looking for').count(), 0, 'Ctrl+K with no card is not Search');
// With nothing selected it opens the inline editor to add (inline creation brief 2026-10-13 §1). Its prompt keeps a text field's
// own keys (shortcut-owner.js), so it is closed before Search's chord.
assert.equal(await page.locator('[data-inline-prompt]').getAttribute('placeholder'), 'What would you like to add or understand?', 'Ctrl+K with no card opens the editor to add');
await page.keyboard.press('Escape');
await page.locator('[data-inline-ai]').waitFor({ state: 'detached' });
await page.keyboard.press('Control+Shift+F');
await page.getByPlaceholder('Describe what you are looking for').waitFor({ timeout: 5000 });
await shot('14-ctrl-shift-f-search');
await page.keyboard.press('Escape');

// ---- J: one rule for the empty hint and for keeping the hole (owner r29). A shape, text, or a chat card added to the
// canvas by the Chat pane's Add as card each hides the hint at once and keeps the hole; leaving and coming back finds it. ----
const hint = () => page.locator('[data-dive-empty]').count();
const tool = name => page.locator('[data-tool-gutter]').getByRole('button', { name, exact: true }).click();
const surface = () => page.locator('[aria-label="Lesson canvas"]').boundingBox();
const firstObjects = {
  shape: async () => {
    await tool('Rectangle');
    const box = await surface();
    await page.mouse.move(box.x + 520, box.y + 260); await page.mouse.down(); await page.mouse.move(box.x + 700, box.y + 380, { steps: 6 }); await page.mouse.up();
  },
  text: async () => {
    await tool('Text');
    const box = await surface();
    await page.mouse.click(box.x + 520, box.y + 260); await page.waitForTimeout(300);
    await page.keyboard.type('a first note'); await page.keyboard.press('Escape');
  },
  // The bug the owner saw: the card was on the canvas, the hint stayed over it, and leaving discarded both.
  'chat card': async () => {
    await composer().click(); await composer().fill('Why does this matter?'); await composer().press('Enter');
    const add = page.locator('[data-chat-pane] [data-add-to-canvas]').last();
    await add.waitFor(); await add.click();
    await page.locator('[data-chat-block]').first().waitFor();
  },
};
const jCards = (await blocks()).filter(id => id !== card2).slice(0, 3); // a card per kind, none with a hole yet (card2 keeps one)
for (const [index, [kind, add]] of Object.entries(firstObjects).entries()) {
  await open(ROOT_URL);
  await deselect();
  await diveFrom(jCards[index]);
  await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1000);
  assert.equal(await hint(), 1, `${kind}: a new hole shows the hint`);
  if (kind === 'shape') await shot('15-new-hole-hint');
  await add();
  await page.waitForFunction(() => !document.querySelector('[data-dive-empty]'), null, { timeout: 5000 });
  await waitPersisted();
  const name = url().pathname.split('/').pop();
  await shot(`15-${kind.replace(' ', '-')}-hides-hint`);
  await up();
  assert.ok((await tree(root.name, BOARD)).children.some(child => child.name === name), `${kind}: leaving keeps the hole`);
  await page.locator(`[data-dive-portal="${name}"]`).scrollIntoViewIfNeeded();
  await page.locator(`[data-dive-portal="${name}"]`).click();
  await page.waitForFunction(n => location.pathname.endsWith(n), name); await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1200);
  assert.equal(await hint(), 0, `${kind}: back in the kept hole, no hint`);
  const kept = { shape: '[data-shape-id]', text: '[data-item-id]', 'chat card': '[data-chat-block]' }[kind];
  assert.ok(await page.locator(kept).count() > 0, `${kind}: its object is still there`);
}
console.log('flow J ok');

// ---- K: the canvas title's Rabbit Holes menu (owner r35). A canvas with two nested holes has a chevron; its menu lists
// all three, indented; a pick (keyboard or click) goes there; nothing wraps; a canvas without holes has no chevron. ----
const LONG = 'Attention from raw scores to weights, and why the softmax is scaled by the square root of the key size';
const titleRoot = await post('/api/canvases', { title: LONG });
const seedHole = async (parent, title) => {
  const name = `canvas-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const made = await post('/api/canvases/dives', { name, title, parent: { app: parent, board: 'main' }, origin_block_id: `k-${name}`, dive: { concept: title, created_by: 'learner_slash' } });
  assert.equal(made.name, name, `seeded ${title}: ${JSON.stringify(made).slice(0, 120)}`);
  return name;
};
const holeA = await seedHole(titleRoot.name, 'Scaled scores'), holeB = await seedHole(holeA, 'Why the square root');
const chevron = () => page.locator('[data-title-holes]');
const menuRows = () => page.locator('[data-title-holes-menu] [data-hole-option]');
const oneLine = () => page.evaluate(() => {
  const line = node => { const style = getComputedStyle(node); return { height: node.getBoundingClientRect().height, line: parseFloat(style.lineHeight), wraps: style.whiteSpace !== 'nowrap', overflows: node.scrollWidth > node.clientWidth }; };
  const title = document.querySelector('input[aria-label="Canvas title"]');
  return { title: { ...line(title), full: title.title }, rows: [...document.querySelectorAll('[data-title-holes-menu] [data-hole-title]')].map(line) };
});
await page.setViewportSize({ width: 1600, height: 1000 });
await open(`/apps/${titleRoot.name}`);
assert.equal(await chevron().count(), 1, 'a canvas with holes has the chevron');
await shot('title-holes-desktop');
await chevron().click();
await menuRows().first().waitFor();
assert.deepEqual(await menuRows().evaluateAll(rows => rows.map(row => [row.dataset.holeOption, Number(row.dataset.depth), row.getAttribute('aria-checked')])),
  [[titleRoot.name, 0, 'true'], [holeA, 1, 'false'], [holeB, 2, 'false']], 'the root and both holes, depth-first, the open level checked');
const indents = await menuRows().evaluateAll(rows => rows.map(row => parseFloat(getComputedStyle(row).paddingLeft)));
assert.ok(indents[0] < indents[1] && indents[1] < indents[2], `each level indented further: ${indents}`);
assert.equal(await menuRows().first().evaluate(row => getComputedStyle(row).fontWeight), '600', 'the open level is bold');
const lines = await oneLine();
assert.ok(lines.title.height <= 32 && lines.title.overflows, `the long title stays one line, cut short: ${JSON.stringify(lines.title)}`);
assert.equal(lines.title.full, LONG, 'the full title on hover');
for (const row of lines.rows) assert.ok(!row.wraps && row.height === row.line, `a menu row is one line: ${JSON.stringify(row)}`);
assert.ok(lines.rows[0].overflows, 'the long root row is cut short, not wrapped');
assert.equal(await menuRows().first().getAttribute('title'), LONG);
await shot('title-holes-desktop-open');
// Keyboard: the open level has focus; ArrowDown twice, Enter goes down to the deepest hole.
assert.equal(await page.evaluate(() => document.activeElement?.dataset.holeOption), titleRoot.name, 'the open level has focus');
await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
await page.waitForFunction(name => location.pathname.endsWith(name), holeB); await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1200);
await chevron().click();
await menuRows().first().waitFor();
assert.deepEqual(await menuRows().evaluateAll(rows => rows.map(row => row.getAttribute('aria-checked'))), ['false', 'false', 'true'], 'in the deepest hole, it is the one checked');
await shot('title-holes-deepest-open');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
assert.equal(await menuRows().count(), 0, 'Esc closes the menu');
await chevron().click(); await menuRows().first().waitFor();
await chevron().click(); await page.waitForTimeout(300);
assert.equal(await menuRows().count(), 0, 'a press on the chevron closes the open menu and does not reopen it');
// A click on a row goes there: the middle hole.
await chevron().click();
await menuRows().nth(1).click();
await page.waitForFunction(name => location.pathname.endsWith(name), holeA); await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1200);
// Phone width: the same one-line title and menu.
await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600);
await open(`/apps/${titleRoot.name}`);
await chevron().click();
await menuRows().first().waitFor();
const phone = await oneLine();
assert.ok(phone.title.height <= 32, `phone: the title is one line: ${JSON.stringify(phone.title)}`);
for (const row of phone.rows) assert.ok(!row.wraps && row.height === row.line, `phone: a menu row is one line: ${JSON.stringify(row)}`);
assert.ok(await page.locator('[data-title-holes-menu]').evaluate(menu => { const box = menu.parentElement.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; }), 'phone: the menu stays on screen');
await shot('title-holes-phone-open');
await page.keyboard.press('Escape');
await page.setViewportSize({ width: 1600, height: 1000 }); await page.waitForTimeout(400);
// A canvas without holes: no chevron, and its title still renames.
const plain = await post('/api/canvases', { title: 'No holes here' });
await open(`/apps/${plain.name}`);
assert.equal(await chevron().count(), 0, 'a canvas without holes has no chevron');
await page.locator('input[aria-label="Canvas title"]').fill('Renamed, still no holes');
await page.locator('input[aria-label="Canvas title"]').press('Enter');
await page.waitForTimeout(1200);
assert.equal((await tree(plain.name)).path[0].title, 'Renamed, still no holes', 'the title renames as before');
assert.equal(await chevron().count(), 0);
await shot('title-holes-none');
// A shared canvas: the same chevron, read-only, each row its own link (only holes with an open link of their own).
const shareOf = async app => (await post(`/api/learn/boards/${app}/main/share`, { shared: true, view: true, public_view: true, state: { blocks: [{ id: 'k', type: 'explanation', title: 'Shared' }] } })).sharing.view;
const [rootLink, aLink, bLink] = [await shareOf(titleRoot.name), await shareOf(holeA), await shareOf(holeB)];
const viewer = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
await viewer.goto(`${BASE}/b/${rootLink}`); await viewer.locator('[data-title-holes]').waitFor({ timeout: 30000 });
const sharedLine = () => viewer.locator('[data-shared-title]').evaluate(node => ({ nowrap: getComputedStyle(node).whiteSpace === 'nowrap', height: node.getBoundingClientRect().height, width: node.clientWidth, cut: node.scrollWidth > node.clientWidth, full: node.title }));
const wideShared = await sharedLine();
assert.ok(wideShared.nowrap && wideShared.height <= 24 && wideShared.full === LONG, `the shared title is one line, the full title on hover: ${JSON.stringify(wideShared)}`);
await viewer.locator('[data-title-holes]').click();
assert.deepEqual(await viewer.locator('[data-title-holes-menu] [data-hole-option]').evaluateAll(rows => rows.map(row => row.dataset.holeOption)), [`/b/${rootLink}`, `/b/${aLink}`, `/b/${bLink}`]);
await viewer.screenshot({ path: `${OUT}/title-holes-shared-open.png` });
await viewer.keyboard.press('Escape'); await viewer.waitForTimeout(300);
// A phone: the long shared title is cut short, never wrapped, and the chevron stays beside it on screen.
await viewer.setViewportSize({ width: 390, height: 844 }); await viewer.waitForTimeout(500);
const phoneShared = await sharedLine();
assert.ok(phoneShared.nowrap && phoneShared.cut && phoneShared.height <= 24 && phoneShared.width >= 60, `phone: the shared title is one line, cut short but still shown: ${JSON.stringify(phoneShared)}`);
assert.ok(await viewer.locator('[data-title-holes]').evaluate(node => { const box = node.getBoundingClientRect(); return box.width > 0 && box.left >= 0 && box.right <= innerWidth; }), 'phone: the chevron stays on screen');
await viewer.screenshot({ path: `${OUT}/title-holes-shared-phone.png` });
await viewer.setViewportSize({ width: 1600, height: 1000 }); await viewer.waitForTimeout(400);
await viewer.locator('[data-title-holes]').click();
await viewer.locator('[data-title-holes-menu] [data-hole-option]').nth(2).click();
await viewer.waitForURL(`${BASE}/b/${bLink}`);
await viewer.context().close();
console.log('flow K ok');

// ---- L (owner, Rabbit Hole and reference navigation design 2026-10-29): a group and a card inside it each own a different hole.
// Both get the footer and the stacked layers (a plain member none); the group's footer spans it under its members, which keep
// their places, and the column keeps its room, so the card below is never covered; pressing the footer never selects or moves
// the group; each Enter (pointer and keyboard) goes to its own hole; the overview marks the card's hole in RH blue. ----
const groupRoot = await post('/api/canvases', { title: 'Groups and holes' });
{
  const path = `/api/learn/boards/${groupRoot.name}/main`, now = await get(path);
  const card = (id, title, groupId) => ({ id, type: 'explanation', dx: 0, dy: 0, title, body: `${title}: a short body.`, ...(groupId ? { groupId } : {}) });
  const state = { strokes: [], shapes: [], items: [], links: [], areas: [], groups: [{ id: 'grp', label: 'Pair' }],
    blocks: [card('g0', 'Above the group'), card('g1', 'Grouped with a hole', 'grp'), card('g2', 'Grouped plain', 'grp'), card('g3', 'Below the group')] };
  const saved = await (await fetch(`${BASE}${path}`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ state, version: now.exists === false ? 0 : now.version ?? 0 }) })).json();
  assert.ok(saved?.version, `the group board was seeded: ${JSON.stringify(saved).slice(0, 120)}`);
}
const seedOn = async (origin, title) => {
  const name = `canvas-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const made = await post('/api/canvases/dives', { name, title, parent: { app: groupRoot.name, board: 'main' }, origin_block_id: origin, dive: { concept: title, created_by: 'learner_slash' } });
  assert.equal(made.name, name, `seeded ${title}: ${JSON.stringify(made).slice(0, 120)}`);
  return name;
};
const groupHole = await seedOn('grp', 'The pair, together'), cardHole = await seedOn('g1', 'Just the first card');
await seedOn('g0', 'The card above'); // a footer right above the group: its name chip must not cover it
const GROUP_URL = `/apps/${groupRoot.name}`;
await open(GROUP_URL);
await page.locator(`[data-dive-portal="${groupHole}"]`).waitFor({ timeout: 15000 });
await holeLook('[data-group-box="grp"]', groupHole, 'The pair, together', 'the group');
await holeLook('g1', cardHole, 'Just the first card', 'the card in the group');
assert.equal(await page.locator('[data-block-id="g2"] [data-hole-stack], [data-block-id="g2"] [data-hole-row], [data-block-id="g3"] [data-hole-stack]').count(), 0, 'a card without a hole has no stack and no row');
assert.equal(await page.locator('[data-group-chip="grp"]').locator('xpath=..').locator('[data-dive-portal]').count(), 0, 'the group name keeps no Enter; Enter is in the footer only');
const groupGeometry = () => page.evaluate(() => {
  const r = s => document.querySelector(s).getBoundingClientRect();
  const box = r('[data-group-box="grp"]'), foot = r('[data-group-box="grp"] [data-group-footer]'), g1 = r('[data-block-id="g1"]'), g2 = r('[data-block-id="g2"]'), g3 = r('[data-block-id="g3"]');
  return { box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right }, foot: { top: foot.top, bottom: foot.bottom, left: foot.left, right: foot.right }, members: [g1, g2].map(m => ({ x: Math.round(m.left), y: Math.round(m.top), bottom: m.bottom })), below: g3.top };
});
const g = await groupGeometry();
const membersBottom = Math.max(...g.members.map(m => m.bottom));
assert.ok(g.foot.top >= membersBottom + 11 && Math.abs(g.foot.bottom - (g.box.bottom - 1)) <= 1 && Math.abs(g.foot.left - (g.box.left + 1)) <= 1 && Math.abs(g.foot.right - (g.box.right - 1)) <= 1, `the group footer spans the box beneath its members: ${JSON.stringify(g)}`);
assert.ok(g.below >= g.box.bottom + 12, `the card below the group stays clear of its footer and layers: ${JSON.stringify(g)}`);
// The group's name sits on its top edge (owner design 2026-10-29 follow-up): across the outline, ending where the members begin,
// and clear of the card above and its footer.
const chipAt = await page.evaluate(() => {
  const r = s => document.querySelector(s).getBoundingClientRect();
  const chip = r('[data-group-chip="grp"]'), box = r('[data-group-box="grp"]'), above = r('[data-block-id="g0"]'), aboveFoot = r('[data-block-id="g0"] [data-hole-row]');
  return { top: chip.top, bottom: chip.bottom, h: chip.height, boxTop: box.top, membersTop: Math.min(r('[data-block-id="g1"]').top, r('[data-block-id="g2"]').top), aboveBottom: above.bottom, footBottom: aboveFoot.bottom };
});
assert.ok(chipAt.top < chipAt.boxTop && chipAt.bottom > chipAt.boxTop, `the group name crosses the group's top edge: ${JSON.stringify(chipAt)}`);
assert.ok(chipAt.bottom <= chipAt.membersTop + 0.5, `the group name covers no member: ${JSON.stringify(chipAt)}`);
assert.ok(chipAt.top >= chipAt.aboveBottom - 0.5 && chipAt.top >= chipAt.footBottom - 0.5, `the group name covers neither the card above nor its footer: ${JSON.stringify(chipAt)}`);
await shot('16-group-and-card-holes');
// A press and a drag on the group footer select nothing and move nothing.
const footRow = page.locator('[data-group-box="grp"] [data-hole-row]');
const fr = await footRow.boundingBox();
await page.mouse.move(fr.x + 30, fr.y + fr.height / 2); await page.mouse.down(); await page.mouse.move(fr.x + 130, fr.y + fr.height / 2 + 60, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(300);
assert.deepEqual((await groupGeometry()).members.map(m => [m.x, m.y]), g.members.map(m => [m.x, m.y]), 'a drag on the footer moved no member');
assert.equal(await page.locator('[data-block-id][aria-current="true"]').count(), 0, 'a press on the footer selected nothing');
await page.locator('[data-group-box="grp"] [data-hole-row]').dblclick({ position: { x: 30, y: 20 } });
await page.waitForTimeout(800);
assert.equal(url().pathname, GROUP_URL, 'a double-click on the footer opens nothing');
// Each Enter goes to its own hole: the group's by pointer, the card's by keyboard; Up returns.
await page.locator(`[data-dive-portal="${groupHole}"]`).click();
await page.waitForFunction(name => location.pathname.endsWith(name), groupHole); await page.waitForTimeout(1000);
await up();
await page.locator(`[data-dive-portal="${cardHole}"]`).focus();
await page.keyboard.press('Enter');
await page.waitForFunction(name => location.pathname.endsWith(name), cardHole); await page.waitForTimeout(1000);
await up();
assert.equal(url().pathname, GROUP_URL, 'Up returns to the canvas');
// The overview marks the card's hole in RH blue; its viewport stays an outline.
const marks = await page.locator('[data-canvas-minimap] [data-minimap-hole]').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).fill));
assert.ok(marks.length >= 1 && marks.every(fill => fill === 'rgb(27, 111, 194)'), `the overview's hole marks are RH blue: ${marks}`);
// A narrow window: the footer's Enter stays whole inside the group, and the long title wraps rather than pushing it out.
await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600);
assert.ok(await page.locator(`[data-dive-portal="${groupHole}"]`).evaluate(node => { const e = node.getBoundingClientRect(), box = node.closest('[data-group-box]').getBoundingClientRect(); return e.width >= 76 * 0.2 && e.right <= box.right + 0.5; }), 'narrow: Enter stays inside the group');
await page.setViewportSize({ width: 1600, height: 1000 }); await page.waitForTimeout(400);
console.log('flow L ok');
// On a tripwire stack (e2e/provider-tripwire.js) nothing reached a model or paid-AI provider.
for (const origin of [BASE, CP]) {
  const wire = await fetch(`${origin}/__provider-tripwire`).catch(() => null);
  if (wire?.ok) assert.equal((await wire.json()).hits.length, 0, `${origin}: provider tripwire hits`);
}
console.log('all flows ok; root', ROOT_URL);
await browser.close();
if (errors.length) { console.log('page errors:', errors); process.exit(1); }
