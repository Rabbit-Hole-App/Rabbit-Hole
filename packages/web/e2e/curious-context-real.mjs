// Curious where this goes? - owner task 2, the REAL provider demonstration on a LOCAL stack (never a shared or deployed
// worker): only the hook planner (suggest_next_steps) reaches the provider, the app's spend checks are on, and every hook set
// is reserved in the shared ledger before it is asked for and settled from the local usage_operations delta after. The run
// stops before any reservation that would take this lane past its cap. Records per call: payload size, latency, status, the
// planner's hooks and what was spent. Prints no secrets.
// usage: node e2e/curious-context-real.mjs --base http://127.0.0.1:8891 --cp http://127.0.0.1:8892 --vars <cp .dev.vars>
//        --persist <wrangler persist dir> --ledger <ledger.mjs> --out <dir> [--cap 1.00] [--only=a,b]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const arg = name => { const at = process.argv.indexOf(`--${name}`); return at > 0 ? process.argv[at + 1] : null; };
const BASE = arg('base'), CP = arg('cp'), OUT = arg('out'), LEDGER = arg('ledger'), PERSIST = arg('persist'), CAP = Number(arg('cap') || 1);
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url || '')) throw Error('the real demo runs against a local stack only');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const RUN = `curious-${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}`;
const SHA = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(arg('vars'), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const log = [];
const record = entry => { log.push(entry); console.log(JSON.stringify(entry)); writeFileSync(`${OUT}/curious-real.json`, JSON.stringify({ run: RUN, sha: SHA, log }, null, 2)); };

// ---- spend: the shared ledger, this lane's cap, and the app's own usage_operations ----
const ledger = (...args) => execFileSync('node', [LEDGER, ...args], { encoding: 'utf8' }).trim();
const laneSpend = () => {
  const lines = readFileSync(LEDGER.replace(/ledger\.mjs$/, 'ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(e => String(e.id).startsWith('curious-'));
  const settled = new Map(lines.filter(e => e.op === 'settle').map(e => [e.id, e.actual_usd]));
  const open = lines.filter(e => e.op === 'reserve' && !settled.has(e.id) && !lines.some(r => r.op === 'release' && r.id === e.id));
  return [...settled.values()].reduce((a, b) => a + b, 0) + open.reduce((a, e) => a + e.max_usd, 0);
};
const learnFile = readdirSync(`${PERSIST}/v3/d1/miniflare-D1DatabaseObject`).filter(name => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
  .map(name => `${PERSIST}/v3/d1/miniflare-D1DatabaseObject/${name}`)
  .find(file => { const db = new DatabaseSync(file, { readOnly: true }); try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'usage_operations'").get(); } finally { db.close(); } });
// The planner's own cost, per set (next_steps_telemetry cost_usd): the settlement when usage_operations records nothing (a
// local control plane with SMALL_ENV=test does not enforce spend, learn-spend-ledger.js spendEnforced).
const spentNow = () => {
  const db = new DatabaseSync(learnFile, { readOnly: true });
  try {
    const ops = db.prepare("SELECT COALESCE(SUM(cost_usd),0) AS usd, COUNT(*) AS n, COALESCE(SUM(CASE WHEN status='admitted' THEN 1 ELSE 0 END),0) AS open FROM usage_operations").get();
    const sets = db.prepare('SELECT telemetry_json FROM next_steps_telemetry').all().map(row => JSON.parse(row.telemetry_json).cost_usd || 0);
    return { ...ops, telemetry: sets.reduce((a, b) => a + b, 0), sets: sets.length };
  } finally { db.close(); }
};
// One hook set: Sonnet, plus one Opus escalation when the first reading is ambiguous or invalid (learn-models.js), at the
// app's own bound for each (ledger bound), rounded up.
const PER_SET = 0.16;
async function paid(id, fn) {
  if (laneSpend() + PER_SET > CAP + 1e-9) throw Error(`stop: ${id} would take this lane past $${CAP}`);
  const before = spentNow();
  const reserved = ledger('reserve', `${RUN}-${id}`, 'anthropic', 'tutor_next_steps', String(PER_SET), 'curious real demo');
  let result, error = null;
  try { result = await fn(); } catch (failure) { error = failure.message.split('\n')[0]; }
  let after = spentNow();
  for (let i = 0; i < 20 && after.open > 0; i += 1) { await new Promise(r => setTimeout(r, 1500)); after = spentNow(); }
  const fromOps = after.n > before.n, usd = Math.round(((fromOps ? after.usd - before.usd : after.telemetry - before.telemetry)) * 1e6) / 1e6;
  const source = fromOps ? `usage_operations delta (${after.n - before.n} ops)` : `next_steps_telemetry cost_usd delta (${after.sets - before.sets} sets; usage_operations off)`;
  const settled = after.open > 0 ? ledger('settle', `${RUN}-${id}`, String(PER_SET), 'reserved-max:open-admission') : ledger('settle', `${RUN}-${id}`, String(usd), source);
  record({ id, reserved, settled, usd: after.open > 0 ? PER_SET : usd, ops: after.n - before.n, error, ...(result || {}) });
  return result;
}

// ---- the stack ----
const tripwire = async () => (await (await fetch(`${BASE}/__provider-tripwire`)).json());
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `curious-real-${Date.now().toString(36)}@example.com`, secret }) })).json();
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } }); return r.json().catch(() => null); };
const canvasWith = async (title, { shapes = [], items = [], links = [] } = {}) => {
  const made = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title }) });
  await api(`/api/learn/boards/${made.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes, items, links, groups: [], areas: [], blocks: [], exchanges: [] }, version: 0 }) });
  return made.name;
};
const style = { color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1 };
const node = (id, x, y, text) => ({ id, kind: 'ellipse', x1: x, y1: y, x2: x + 64, y2: y + 64, ...style, text });
const link = (id, from, to, label) => ({ id, from, fromSide: 'bottom', to, toSide: 'top', route: 'straight', head: true, label, color: '#37352f', width: 2, dash: 'solid' });
const TREE = { shapes: [node('n8', 320, 120, '8'), node('n3', 180, 280, '3'), node('n10', 460, 280, '10'), node('n1', 80, 400, '1')],
  items: [{ id: 't1', kind: 'text', x: 640, y: 140, w: 320, text: 'Binary search tree: smaller keys go left, larger keys go right', color: '#37352f', opacity: 1, level: 'body' }],
  links: [link('l1', 'n8', 'n3', 'left'), link('l2', 'n8', 'n10', 'right')] };
const WATER = { shapes: [{ id: 'w1', kind: 'rect', x1: 120, y1: 140, x2: 260, y2: 200, ...style, text: 'Ocean' }, { id: 'w2', kind: 'ellipse', x1: 420, y1: 120, x2: 560, y2: 200, ...style, text: 'Clouds' }, { id: 'w3', kind: 'rect', x1: 420, y1: 360, x2: 560, y2: 420, ...style, text: 'Rain' }],
  items: [{ id: 'w4', kind: 'text', x: 120, y: 420, w: 260, text: 'The water cycle: the sun lifts water, the air carries it back', color: '#37352f', opacity: 1, level: 'body' }],
  links: [link('e1', 'w1', 'w2', 'evaporation'), link('e2', 'w2', 'w3', 'condensation'), link('e3', 'w3', 'w1', 'runoff')] };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
// Every other model route the page could reach is refused here: only the hook planner is paid for.
const refused = [];
await context.route(/\/api\/(learn\/(ask|home-ask|artifact|tts|voice\/|assess|transcribe|image|video|scene|grade|tutor\/(evaluate|plan|handoff))|chat)/, route => { refused.push(new URL(route.request().url()).pathname); return route.abort(); });
const calls = [];
await context.route('**/api/learn/tutor/next-steps', async route => {
  const call = { at: Date.now(), size: route.request().postData().length, body: route.request().postDataJSON() };
  calls.push(call);
  const response = await route.fetch({ timeout: 90000 });
  call.status = response.status(); call.ms = Date.now() - call.at; call.reply = await response.json().catch(() => null);
  return route.fulfill({ response, json: call.reply });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const quiet = ms => page.waitForTimeout(ms);
const until = async (test, ms = 120000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await test()) return; await quiet(200); } throw Error('timed out'); };
const hooks = () => page.locator('[data-next-steps="ready"] [data-next-step]').allInnerTexts();
const centre = async locator => { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
const typeInto = async (locator, text) => {
  await locator.dblclick();
  await page.locator('[data-rich-editor]').first().waitFor({ timeout: 5000 });
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text, { delay: 30 });
  await page.keyboard.press('Escape');
};
// One action, then the one hook request it causes and the set on screen.
const nextSet = async (action, shot) => {
  const before = calls.length, started = Date.now();
  await action();
  await until(() => calls.length > before && calls.at(-1).status);
  const call = calls.at(-1);
  if (call.status === 200) await page.locator('[data-next-steps="ready"]').waitFor({ timeout: 30000 });
  await quiet(800);
  await page.screenshot({ path: `${OUT}/${shot}.png` });
  const { input } = call.body;
  return { requests: calls.length - before, status: call.status, payload_chars: call.size, latency_ms: call.ms, since_action_ms: Date.now() - started,
    refresh: call.body.refresh ?? null, goal: input.goal, title: input.canvas?.title ?? null, objects: (input.canvas?.objects || []).map(o => o.text).filter(Boolean),
    relations: (input.canvas?.relations || []).map(r => `${r.from}>${r.to}:${r.label}:${r.source}`), model: call.reply?.telemetry?.model_id ?? null,
    escalated: call.reply?.telemetry?.escalated ?? null, error: call.reply?.error ?? null, hooks: call.status === 200 ? await hooks() : [] };
};
const want = name => !ONLY.length || ONLY.includes(name);

record({ run: RUN, sha: SHA, cap_usd: CAP, lane_spent_before: laneSpend(), tripwire_before: { real: (await tripwire()).real.length, hits: (await tripwire()).hits.length } });
const tree = await canvasWith('Linked List', TREE);
if (want('linked-list')) await paid('linked-list', () => nextSet(() => page.goto(`${BASE}/apps/${tree}`), 'real-01-linked-list-tree'));
if (want('text-edit')) await paid('text-edit', () => nextSet(() => typeInto(page.locator('[data-item-id="t1"]'), 'AVL tree: rotations keep both sides balanced'), 'real-02-text-edit'));
if (want('connector')) await paid('connector', () => nextSet(async () => {
  await page.locator('[data-shape-id="n3"]').hover();
  const from = await centre(page.locator('[data-port="bottom"][data-owner="n3"]'));
  await page.locator('[data-shape-id="n1"]').hover();
  const to = await centre(page.locator('[data-port="top"][data-owner="n1"]'));
  await page.locator('[data-shape-id="n3"]').hover();
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x - 20, to.y - 20, { steps: 10 }); await page.mouse.move(to.x, to.y, { steps: 4 }); await page.mouse.up();
}, 'real-03-connector'));
if (want('refresh')) await paid('refresh', () => nextSet(async () => { await quiet(1500); const button = page.locator('[data-next-steps-refresh]'); await button.click(); await button.click({ force: true }).catch(() => {}); }, 'real-04-refresh'));
if (want('water-cycle')) { const water = await canvasWith('Weekend plans', WATER); await paid('water-cycle', () => nextSet(() => page.goto(`${BASE}/apps/${water}`), 'real-05-water-cycle')); }
if (want('blank-titled')) { const tides = await canvasWith('Tide pools'); await paid('blank-titled', () => nextSet(() => page.goto(`${BASE}/apps/${tides}`), 'real-06-blank-titled')); }

const wire = await tripwire();
record({ done: true, requests: calls.length, real_provider_calls: wire.real.length, provider_hits_blocked: wire.hits.length, refused, errors, lane_spent_after: laneSpend(), ledger_remaining: ledger('remaining') });
await browser.close();
