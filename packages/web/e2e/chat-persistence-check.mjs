// Chat persistence across Rabbit Hole navigation (owner brief 2026-10-14, agent-coordination/tasks/2026-10-14-chat-persistence-OWNER.md):
// the eight focused checks, plus a failed restore with Retry and a Stop, against the LOCAL stack only. The Tutor's plan and
// /api/learn/ask get canned answers in the browser; every other model-capable request is aborted, so no model is ever
// called. The persistence routes are REAL (POST /api/learn/chat/threads/<id>/messages, GET/PUT /api/learn/chat/active,
// GET /api/ask/threads): what each canvas shows after a move, a reload or a late reply is read back from the server too.
// Fails on 26892668: an Auto (Tutor) exchange was never saved, so check 1 finds an empty parent.
// Usage: BASE=http://127.0.0.1:8851 SMALL_CP=http://127.0.0.1:8853 VARS=<cp .dev.vars> node e2e/chat-persistence-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8851';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8853';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('chat-persistence-check runs against the local stack only');
const SHOTS = process.argv[2] || 'chat-persistence-shots';
mkdirSync(SHOTS, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `cpc-${Date.now().toString(36)}@example.com`, secret }) })).json();
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } });
  const body = await response.json();
  if (!response.ok) throw Error(`${path}: HTTP ${response.status} ${body?.error || ''}`);
  return body;
};

// Three levels: P (root), H (a Rabbit Hole of P), G (a hole of H), each with one card seeded in this browser.
const hex = () => crypto.randomUUID().replace(/-/g, '').slice(0, 8);
const P = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Chat persistence ${Date.now().toString(36)}` }) })).name;
const H = `canvas-${hex()}`, G = `canvas-${hex()}`;
await api('/api/canvases/dives', { method: 'POST', body: JSON.stringify({ name: H, title: 'Hole: the moon', parent: { app: P, board: 'main' }, origin_block_id: 'p-1', dive: {} }) });
await api('/api/canvases/dives', { method: 'POST', body: JSON.stringify({ name: G, title: 'Hole: gravity', parent: { app: H, board: 'main' }, origin_block_id: 'h-1', dive: {} }) });
const catalog = await api('/api/apps');
const board = (id, title, body) => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id, type: 'explanation', dx: 0, dy: 0, title, body }] });
const SEEDS = Object.fromEntries([[P, board('p-1', 'Tides', 'The moon pulls the near ocean more than the Earth.')], [H, board('h-1', 'The moon', 'The moon is held in orbit by gravity.')], [G, board('g-1', 'Gravity', 'Every mass pulls on every other mass.')]]
  .map(([name, state]) => [`small.adaptive-canvas:${catalog.org}:${catalog.email}:${name}:ink`, state]));
const SEED_CARD = { [P]: 'p-1', [H]: 'h-1', [G]: 'g-1' };
const TAG = { [P]: '[P]', [H]: '[H]', [G]: '[G]' };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(seeds => { for (const [key, value] of Object.entries(seeds)) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, SEEDS);

// Canned answers. replies: the Tutor's next words (respond_text); hold: a plan answer waits on it (a pending reply).
const plans = [], asks = [], aborted = [], replies = [];
let hold = null;
const holdPlans = () => { let release; hold = new Promise(done => { release = done; }); return () => { hold = null; release(); }; };
const MODEL = /^\/api\/learn\/(tutor\/(handoff|next-steps)|artifact|home-ask|inline\/(generate|route)|image|scene|grade|assess|journey|tts|voice|transcribe|selection|video)/;
await context.route(url => url.pathname.startsWith('/api/learn/'), async route => {
  const request = route.request(), path = new URL(request.url()).pathname;
  if (path === '/api/learn/tutor/plan') {
    plans.push(request.postDataJSON());
    const text = replies.shift() ?? 'Canned Tutor reply.';
    if (hold) await hold;
    return route.fulfill({ json: { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text }] } }).catch(() => {}); // a Stop aborted it
  }
  if (path === '/api/learn/tutor/evaluate') return route.fulfill({ json: { status: 'settled', evaluator: 'jev', events: [] } });
  if (path === '/api/learn/ask') {
    const body = request.postDataJSON();
    asks.push(body);
    const events = [['chunk', { text: `${body.mode === 'tutor' ? 'Canned Tutor-mode' : 'Canned Ask'} answer.` }], ['done', { threadId: body.thread_id }]];
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('') });
  }
  if (request.method() !== 'GET' && MODEL.test(path)) { aborted.push(path); return route.abort(); }
  return route.continue();
});
// Faults on the REAL persistence routes, armed per check: a lost answer (the save lands, its response does not) and a
// failed restore read. A route.fetch error is never printed (it can carry the session cookie).
let loseNextSave = false, failActiveReads = 0;
await context.route(url => /^\/api\/learn\/chat\/threads\/[^/]+\/messages$/.test(url.pathname), async route => {
  if (!loseNextSave) return route.fallback();
  loseNextSave = false;
  try { await route.fetch(); } catch { /* not printed */ }
  return route.fulfill({ status: 503, json: { error: 'The answer was lost on the way back' } });
});
await context.route(url => url.pathname === '/api/learn/chat/active', route => {
  if (route.request().method() === 'GET' && failActiveReads > 0) { failActiveReads--; return route.fulfill({ status: 503, json: { error: 'Restore is down' } }); }
  return route.fallback();
});

const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async name => { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const pane = page.locator('[data-chat-pane]');
const field = () => pane.locator('[data-chat-composer] textarea').first();
const title = () => pane.locator('[data-chat-title]').innerText();
const text = () => pane.innerText();
const until = async (label, fn, timeout = 20000) => {
  for (const end = Date.now() + timeout; ;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw Error(`timed out: ${label}`);
    await page.waitForTimeout(250);
  }
};
// SPA navigation, as the app's own navigate() does; then the canvas and its restored Chat.
const ready = async (canvas, state = 'ready') => {
  await page.locator(`[data-block-id="${SEED_CARD[canvas]}"]`).waitFor({ timeout: 60000 });
  await page.locator(`[data-chat-pane][data-chat-restore="${state}"]`).waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
};
const go = async (canvas, state) => {
  await page.evaluate(path => { history.pushState({ depth: (history.state?.depth || 0) + 1 }, '', path); dispatchEvent(new PopStateEvent('popstate')); }, `/apps/${canvas}`);
  await until(`on ${canvas}`, () => page.evaluate(path => location.pathname === path, `/apps/${canvas}`));
  await ready(canvas, state);
};
const send = async (words, reply) => {
  if (reply) replies.push(reply);
  await field().fill(words);
  await field().press('Enter');
};
const answered = reply => pane.locator('[data-answer]', { hasText: reply }).waitFor({ timeout: 20000 });
// Server truth, through the same routes the app reads.
const threadsOf = async canvas => (await api(`/api/ask/threads?scope=learn&ref=${canvas}&limit=50`)).threads || [];
const messagesOf = async id => (await api(`/api/ask/threads/${id}`)).messages || [];
const savedOn = async canvas => (await Promise.all((await threadsOf(canvas)).map(async t => (await messagesOf(t.id)).map(m => ({ ...m, thread: t.id }))))).flat();
const activeOf = async canvas => (await api(`/api/learn/chat/active?app=${canvas}`)).threadId;
const has = async (canvas, role, content) => (await savedOn(canvas)).some(m => m.role === role && m.content === content);
// No canvas holds another's words, and no turn is saved twice (Stopped. replies aside).
const clean = async () => {
  for (const canvas of [P, H, G]) {
    const saved = await savedOn(canvas), seen = new Set();
    for (const m of saved) {
      if (m.content === 'Stopped.' || m.content.startsWith('Canned')) continue;
      assert.ok(m.content.startsWith(TAG[canvas]), `${canvas} holds only its own words: ${m.content}`);
      const key = `${m.thread}|${m.role}|${m.content}`;
      assert.ok(!seen.has(key), `saved once: ${m.content}`);
      seen.add(key);
    }
  }
};

await page.goto(`${BASE}/apps/${P}`);
await ready(P);

let parentThread;
await check('1. a completed Auto exchange, a hole, and back: the parent shows the same transcript', async () => {
  const before = plans.length;
  await send('[P] Why do tides happen?', '[P] The moon pulls the near ocean.');
  await answered('[P] The moon pulls the near ocean.');
  assert.equal(plans.length, before + 1, 'Auto went through the Tutor');
  assert.equal(asks.length, 0, 'and not /api/learn/ask');
  await until('the exchange is saved', async () => (await has(P, 'user', '[P] Why do tides happen?')) && (await has(P, 'assistant', '[P] The moon pulls the near ocean.')));
  [{ id: parentThread }] = await threadsOf(P);
  assert.equal(await activeOf(P), parentThread, 'the parent\'s active thread');
  await go(H);
  assert.doesNotMatch(await text(), /\[P\]/, 'the hole shows nothing of the parent');
  assert.equal(await title(), 'New chat');
  await go(P);
  assert.match(await text(), /\[P\] Why do tides happen\?[\s\S]*\[P\] The moon pulls the near ocean\./);
  assert.equal(plans.length, before + 1, 'nothing regenerated on return');
});
await shot('01-parent-restored');

await check('2. an exchange inside the hole, out, and back in: the hole\'s transcript is restored', async () => {
  await go(H);
  await send('[H] What holds the moon?', '[H] Gravity holds it in orbit.');
  await answered('[H] Gravity holds it in orbit.');
  await until('the hole exchange is saved', () => has(H, 'assistant', '[H] Gravity holds it in orbit.'));
  await go(P);
  assert.doesNotMatch(await text(), /\[H\]/);
  await go(H);
  assert.match(await text(), /\[H\] What holds the moon\?[\s\S]*\[H\] Gravity holds it in orbit\./);
  assert.doesNotMatch(await text(), /\[P\]/);
});

await check('3. parent, child, grandchild and back: three separate conversations', async () => {
  await go(G);
  assert.equal(await title(), 'New chat');
  await send('[G] What is gravity?', '[G] Mass pulling on mass.');
  await answered('[G] Mass pulling on mass.');
  await until('the grandchild exchange is saved', () => has(G, 'assistant', '[G] Mass pulling on mass.'));
  await go(H);
  assert.match(await text(), /\[H\] Gravity holds it in orbit\./);
  assert.doesNotMatch(await text(), /\[G\]|\[P\]/);
  await go(P);
  assert.match(await text(), /\[P\] The moon pulls the near ocean\./);
  assert.doesNotMatch(await text(), /\[G\]|\[H\]/);
  await clean();
});

await check('4. a reload after a completed exchange restores it', async () => {
  await page.reload();
  await ready(P);
  assert.match(await text(), /\[P\] Why do tides happen\?[\s\S]*\[P\] The moon pulls the near ocean\./);
  assert.notEqual(await title(), 'New chat');
});
await shot('04-after-reload');

await check('5. a reply still pending when the learner moves: never shown or saved in the hole; saved in the parent, shown on return, not regenerated', async () => {
  const release = holdPlans(), before = plans.length;
  await send('[P] And spring tides?', '[P] Sun and moon in line: the late answer.');
  await until('the plan is asked', () => plans.length === before + 1);
  await pane.getByText('[P] And spring tides?').waitFor();
  await go(H);
  release();
  await until('the late answer is saved in the parent\'s thread', async () => (await messagesOf(parentThread)).some(m => m.content === '[P] Sun and moon in line: the late answer.'));
  await page.waitForTimeout(800);
  assert.doesNotMatch(await text(), /spring tides|late answer/, 'the hole never shows it');
  assert.ok(!(await savedOn(H)).some(m => /spring tides|late answer/.test(m.content)), 'nor saves it');
  await go(P);
  assert.match(await text(), /\[P\] And spring tides\?[\s\S]*\[P\] Sun and moon in line: the late answer\./);
  assert.equal(plans.length, before + 1, 'returning regenerates nothing');
  await clean();
});
await shot('05-late-reply-in-parent');

let olderThread, newerThread;
await check('6. an older thread opened from History, a move away and back: that thread is restored', async () => {
  await pane.getByRole('button', { name: 'New chat', exact: true }).click();
  assert.equal(await title(), 'New chat');
  await send('[P] A newer conversation', '[P] The newer answer.');
  await answered('[P] The newer answer.');
  await until('two parent threads', async () => (await threadsOf(P)).length === 2 && (await has(P, 'assistant', '[P] The newer answer.')));
  olderThread = parentThread;
  newerThread = (await threadsOf(P)).find(t => t.id !== olderThread).id;
  await pane.getByRole('button', { name: 'History', exact: true }).click();
  await page.locator(`[data-chat-history-row="${olderThread}"]`).click();
  await pane.getByText('[P] Sun and moon in line: the late answer.').waitFor();
  await until('the older thread is active', async () => (await activeOf(P)) === olderThread);
  await go(H);
  await go(P);
  assert.match(await text(), /\[P\] Why do tides happen\?/);
  assert.doesNotMatch(await text(), /A newer conversation/, 'not the thread updated last');
});
await shot('06-older-thread-restored');

await check('7. Ask and Tutor modes still post with the open thread and their mode; New chat starts empty in Auto', async () => {
  const mode = async name => { await pane.getByRole('button', { name: 'Mode', exact: true }).click(); await page.getByRole('menuitemradio', { name: new RegExp(`^${name}`) }).click(); };
  const before = plans.length;
  await mode('Ask');
  await send('[P] Ask mode question');
  await answered('Canned Ask answer.');
  await mode('Tutor');
  await send('[P] Tutor mode question');
  await answered('Canned Tutor-mode answer.');
  assert.deepEqual(asks.map(a => [a.mode, a.thread_id]), [['ask', olderThread], ['tutor', olderThread]], 'each in the open thread, so the server saves it there');
  assert.equal(plans.length, before, 'no Tutor plan for an explicit Ask or Tutor turn');
  await pane.getByRole('button', { name: 'New chat', exact: true }).click();
  assert.equal(await title(), 'New chat');
  // New chat lands in two commits: the title from the thread state at once, the transcript one commit later (ask.jsx's
  // restore effect on restore.key). Read in between, the old turns were still there for a frame (board-empty-report,
  // chat-persistence classification: gone every time once the title had changed and two frames passed). Wait, bounded,
  // for them to go; a transcript that stayed would still fail here.
  await pane.getByText(/\[P\]/).first().waitFor({ state: 'detached', timeout: 5000 });
  assert.doesNotMatch(await text(), /\[P\]/);
  assert.match(await pane.getByRole('button', { name: 'Mode', exact: true }).innerText(), /Auto/);
  assert.ok((await threadsOf(P)).some(t => t.id === newerThread) && (await threadsOf(P)).some(t => t.id === olderThread), 'New chat deletes nothing');
});

await check('8. a lost save answer and a retry: one copy of each message, nothing on another canvas', async () => {
  await go(H);
  loseNextSave = true;
  await send('[H] Retry: why does the moon not fall?', '[H] It does fall, and keeps missing.');
  await answered('[H] It does fall, and keeps missing.');
  await until('the retried exchange is saved', () => has(H, 'assistant', '[H] It does fall, and keeps missing.'));
  assert.equal(loseNextSave, false, 'the fault fired');
  const saved = (await savedOn(H)).filter(m => m.content === '[H] Retry: why does the moon not fall?');
  assert.equal(saved.length, 1, 'the question the server got twice is saved once');
  await clean();
});

await check('9. a Stop is saved as interrupted; back on the hole it reads Stopped, and nothing is asked again', async () => {
  const release = holdPlans(), before = plans.length;
  await send('[H] Stop this one', '[H] Never shown.');
  await until('the plan is asked', () => plans.length === before + 1);
  await pane.getByRole('button', { name: 'Stop', exact: true }).click();
  release();
  await pane.getByText('Stopped.').last().waitFor();
  await until('the Stop is saved', async () => (await savedOn(H)).some(m => m.role === 'assistant' && ['interrupted', 'stopped'].includes(m.status)));
  await go(P);
  await go(H);
  assert.match(await text(), /\[H\] Stop this one[\s\S]*Stopped\./);
  assert.doesNotMatch(await text(), /Never shown/);
  assert.equal(plans.length, before + 1);
});

await check('10. a failed restore is an error with Retry, never an empty New chat; Retry restores', async () => {
  failActiveReads = 1;
  await go(G, 'error');
  assert.equal(await title(), 'Chat not loaded');
  await pane.locator('[data-chat-restore-error]').waitFor();
  await shot('10-restore-error');
  await pane.locator('[data-chat-restore-error]').getByRole('button', { name: 'Retry' }).click();
  await ready(G);
  assert.match(await text(), /\[G\] Mass pulling on mass\./);
  await clean();
});

console.log(`aborted model-capable requests (not under test): ${aborted.length ? [...new Set(aborted)].join(', ') : 'none'}`);
assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
console.log(`PASS ${results.length} checks`);
await browser.close();
