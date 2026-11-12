// Section 8.0 (BE.00-BE.14) integrated route-level fixture: the real roadmap, Chat message/thread and board-save routes, dispatched as the
// dev worker does (canvasRoute -> canvasesFetch, chatMessageRoute -> chatMessageFetch, roadmapRoute(roadmapDeps), learnBoardsRoute), over the
// consolidated schema on node:sqlite. Doubles ONLY at the outside: the session (CONTROL_PLANE /api/me), R2 bytes (LEARN_MEDIA), the planner and
// checker transport (callModel), the classifier, and the author provider behind the real spendTransport. Every planner and author request is
// captured serialized; any global fetch is denied and counted. No model, no network, no browser.
import { roadmapRoute } from '../src/roadmap/roadmap-routes.js';
import { roadmapDeps, registerRoadmapHandlers } from '../src/roadmap/roadmap-wire.js';
import { registerRoadmapHandler, roadmapHandler, runDueRoadmapEvents } from '../src/roadmap/roadmap-events.js';
import { AUTO_KINDS } from '../src/roadmap/roadmap-auto.js';
import { canvasesFetch, canvasRoute } from '../src/canvases.js';
import { chatMessageFetch, chatMessageRoute } from '../src/chat-message-routes.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { spendTransport } from '../src/learn-spend.js';
import { usageTotals, periodOf } from '../src/learn-usage.js';
import { routes } from '../../web/src/roadmap-client.js';
import { world } from './roadmap-fixture.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { withVisual } from './explanation-layout-fixture.js'; // EXP-13: every new card has a visual

export const ORIGIN = 'https://rabbit.test';
export const PERIOD = periodOf(Math.floor(Date.now() / 1000));
export const sha = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
const clone = v => JSON.parse(JSON.stringify(v));

// --- synthetic source: > 8,000 and <= 40,000 characters, a distinctive fact far outside step 1's highlight ----------------------------
export const MARKER = 'QUOKKA-7 orchard survey: the pruned tree kept exactly 37 leaves';
const FILLER = 'A decision tree asks one question about one feature at each node and sends each example down one branch. '.repeat(90);
export const MD = `# Decision trees

## Gini impurity
Gini impurity is one minus the sum of the squared class shares in a node. A pure node has impurity zero.

## Entropy
Entropy is minus the sum of each class share times the log of that share. It also reaches zero for a pure node.

## Comparison
| criterion | range for two classes | cost |
| --- | --- | --- |
| Gini | 0 to 0.5 | no logarithm |
| Entropy | 0 to 1 | one logarithm per class |

## Background
${FILLER}

## Field note
${MARKER}.
`;
export const AT = { entropy: MD.indexOf('## Entropy'), comparison: MD.indexOf('## Comparison'), background: MD.indexOf('## Background'), half: MD.indexOf('A decision tree', MD.indexOf('## Background') + 4500), note: MD.indexOf('## Field note') };
export const INSTRUCTION = 'I already know what a split is. Teach me how impurity chooses one.';
export const FILE_NAME = 'Decision Trees.md';
const step = (title, start, end, format, claim) => ({ title, goal: `Explain ${title.toLowerCase()}.`, format, passage: { start, end }, claimsToCover: [claim], independent: true });
export const planOf = (steps, over = {}) => ({ outcome: 'Choose a split by comparing Gini impurity and entropy.', assumptions: ['You know what a split is, so it is not retaught.'],
  instructionAck: { honored: ['skip what a split is'], skips: [{ topic: 'what a split is', reason: 'learner_knows' }] }, steps, stoppingPoint: 'You can pick a split criterion for a node.', coverage: { uncovered: [] }, question: null, ...over });
export const STEPS = [
  step('Gini impurity', 0, AT.entropy, 'explanation', 'CLAIM-GINI squared shares'),
  step('Comparing the criteria', AT.entropy, AT.background, 'table', 'CLAIM-TABLE ranges differ'),
  step('Background on trees', AT.background, AT.half, 'explanation', 'CLAIM-BACKGROUND one question per node'),
  step('More tree background', AT.half, AT.note, 'explanation', 'CLAIM-MORE branches route examples'),
  step('The field note', AT.note, MD.length, 'explanation', 'CLAIM-NOTE leaves kept'),
];
export const PLAN = planOf(STEPS);

// --- doubles -----------------------------------------------------------------------------------------------------------------------------
export const toolUse = (name, input) => ({ content: [{ type: 'tool_use', id: `tu_${Math.random().toString(36).slice(2, 10)}`, name, input }] });
export const calm = { scores: { sexual_explicit: 0, sexual_minors: 0, nonconsensual_intimate: 0, violence: 0, hate_extremism: 0, self_harm_personal: 0, private_data: 0 }, uncertainty: 0, coverage: { complete: true, chars: 1, chunks: 1 } };
export const unsafe = { ...calm, scores: { ...calm.scores, violence: 0.99 } };
// An author reply: the served model is the requested one; input usage tracks the real serialized request.
export const reply = (name, input, { served } = {}) => (model, body) => Response.json({ model: served || model, stop_reason: 'tool_use', usage: { input_tokens: Math.ceil(JSON.stringify(body).length / 4), output_tokens: 300 }, content: [{ type: 'tool_use', id: 'tu_author', name, input }] });
export const explanation = (title = 'A model-chosen title', body = withVisual('Gini impurity measures how mixed a node is; a split lowers it.'), more) => reply('make_explanation', { title, body, ...(more ? { more } : {}) });
export const table = () => reply('make_table', { title: 'Gini or entropy', caption: '', columns: ['criterion', 'range'], rows: [['Gini', '0 to 0.5'], ['Entropy', '0 to 1']] });
export const httpError = status => () => new Response(JSON.stringify({ error: { type: 'error', message: `status ${status}` } }), { status, headers: { 'content-type': 'application/json' } });
export const timeout = () => () => { throw Object.assign(new TypeError('fetch failed: timeout'), {}); };

export const USERS = {
  alice: { email: 'u-alice@example.test', userId: 'u-alice', canvas: 'canvas-0a1b2c3d', fileId: 'fs_wfalice000000000000000a' },
  bob: { email: 'u-bob@example.test', userId: 'u-bob', canvas: 'canvas-1b2c3d4e', fileId: 'fs_wfbob00000000000000000b' },
};
export const threadId = n => `canvaschat-00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const KEY = (name, n = 0) => `ak_${name}_${n}_0000000`.replace(/[^A-Za-z0-9_-]/g, '_');

// h = the harness. opts: plans (planner tool inputs in order), script (author replies in order), classifier, allowanceMicros, auto (ROADMAP_AUTO_ENABLED),
// md (source text), hold (true: the step_accepted kick does not run inline; call h.run() to drain the outbox).
export async function workflow(t, { plans = [PLAN], script = [], classifier = async () => calm, allowanceMicros, auto = true, md = MD, hold = false } = {}) {
  const w = world(t, allowanceMicros ? { allowanceMicros } : {});
  const h = { w, sqlite: w.sqlite, db: w.LEARN_DB, plannerCalls: [], authorCalls: [], checkerCalls: [], classifierCalls: 0, r2Reads: [], network: [], handlerErrors: [], script, plans: [...plans], md };
  // Deny the network: nothing in this flow may leave the process.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async input => { h.network.push(String(input?.url || input)); throw new Error('network denied in roadmap-workflow tests'); };
  t.after(() => { globalThis.fetch = realFetch; });
  const objects = {};
  h.rev = await sha(md);
  for (const [name, u] of Object.entries(USERS)) {
    w.sqlite.prepare("INSERT INTO canvases(org,name,owner_email,title) VALUES('team',?,?,?)").run(u.canvas, u.email, `${name} trees`);
    objects[`r2/${u.fileId}`] = md;
    w.sqlite.prepare("INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, bytes, sha256, r2_key, status, created_at) VALUES (?, 'team', ?, 'learn', ?, 'markdown', ?, 'text/markdown', ?, ?, ?, 'stored', 1)")
      .run(u.fileId, u.email, u.canvas, FILE_NAME, md.length, h.rev, `r2/${u.fileId}`);
  }
  h.objects = objects;
  const identity = req => { const who = USERS[req.headers.get('x-test-user')]; return who ? Response.json({ org: 'team', email: who.email, orgName: 'Team', user_id: who.userId, apps: [] }) : Response.json({ error: 'Sign in' }, { status: 401 }); };
  h.env = { ...w.env, ROADMAP_ENABLED: 'true', ROADMAP_AUTO_ENABLED: auto ? 'true' : 'false', ROADMAP_EDIT_ENABLED: 'true', ROADMAP_LONG_MARKDOWN_ENABLED: 'true',
    LEARN_MEDIA: { get: async key => { h.r2Reads.push(key); return key in objects ? { text: async () => objects[key] } : null; } },
    CONTROL_PLANE: { fetch: async req => identity(req) }, DB: { prepare() { throw new Error('live D1 touched'); } } };
  // Planner / checker transport double: every serialized request captured.
  const planner = async (role, body) => {
    h.plannerCalls.push({ role, body: clone(body), text: JSON.stringify(body) });
    if (role === 'roadmap_draft' || role === 'roadmap_revise') return toolUse('submit_roadmap', h.plans.length > 1 ? h.plans.shift() : h.plans[0]);
    if (role === 'roadmap_proposal') return toolUse('submit_proposal_edit', h.nextEdit || { title: 'Gini in one picture', description: 'How squared shares make Gini.', format: 'explanation' });
    throw new Error(`unexpected planner role ${role}`);
  };
  const checker = async (role, body) => { h.checkerCalls.push({ role, text: JSON.stringify(body) }); throw new Error(`no checker call is expected on the ordinary path (${role})`); };
  const classify = async (...args) => { h.classifierCalls += 1; return classifier(...args); };
  // The author provider behind the real spendTransport (holds, admission, settlement are real).
  const base = (e, body, model, org) => spendTransport(e, body, model, org, async () => {
    h.authorCalls.push({ model, body: clone(body), text: JSON.stringify(body) });
    const next = h.script.shift();
    if (!next) throw new Error('unexpected author call');
    return next(model, body);
  }, { userId: 'roadmap-author', category: 'roadmap' });
  registerRoadmapHandlers({ callModel: planner, checkCallModel: checker, classify, base });
  for (const kind of ['plan_requested', 'step_accepted', 'settings_changed', ...AUTO_KINDS]) {
    const fn = roadmapHandler(kind);
    registerRoadmapHandler(kind, async (...a) => { try { return await fn(...a); } catch (error) { h.handlerErrors.push(`${kind}: ${error.stack || error}`); throw error; } });
  }
  h.deps = roadmapDeps(h.env, null, { callModel: planner, classify });
  if (hold) h.deps.onAccepted = async () => true; // the RoadmapJobs wake is deferred; h.run() drains it
  h.run = (who = 'alice') => runDueRoadmapEvents(h.env, { scope: { org: 'team', ownerUserId: USERS[who].userId, boardId: h.boards[who] } });
  // The dev worker's dispatch order for these paths (packages/web/dev-worker.js).
  h.send = async (who, method, path, payload, headers = {}) => {
    const req = new Request(`${ORIGIN}${path}`, { method, headers: { 'content-type': 'application/json', ...(who ? { 'x-test-user': who } : {}), ...headers }, body: payload === undefined ? undefined : JSON.stringify(payload) });
    const url = new URL(req.url), p = url.pathname;
    let res = null;
    if (canvasRoute(url)) res = await canvasesFetch(req, h.env);
    else if (chatMessageRoute(p)) res = await chatMessageFetch(req, h.env);
    else if (p.startsWith('/api/learn/roadmap')) res = await roadmapRoute(p, req, h.env, h.deps);
    else if (p.startsWith('/api/learn/boards/')) res = await learnBoardsRoute(p, req, h.env);
    if (!res) throw new Error(`no route for ${method} ${path}`);
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body };
  };
  h.route = (who, r) => h.send(who, r.method, r.path, r.body);
  h.rows = (sql, ...args) => w.sqlite.prepare(sql).all(...args).map(r => ({ ...r }));
  h.totals = (who = 'alice') => usageTotals(w.LEARN_DB, USERS[who].userId, PERIOD);
  // Seed each learner's canvas board through the ordinary board-save route (first save creates the row).
  h.boards = {};
  for (const [name, u] of Object.entries(USERS)) {
    const saved = await h.send(name, 'PUT', `/api/learn/boards/${u.canvas}/main`, { state: { blocks: [{ id: `blk_md_${name}`, type: 'note', x: 0, y: 0, w: 480, h: 900, text: FILE_NAME }] } });
    if (saved.status !== 200) throw new Error(`board seed ${saved.status} ${JSON.stringify(saved.body)}`);
    h.boards[name] = saved.body.board_id;
  }
  return h;
}

// --- flow helpers: every step goes through the production route ------------------------------------------------------------------------
export const status = async (h, who = 'alice') => (await h.send(who, 'GET', `/api/learn/roadmap?boardId=${h.boards[who]}`)).body;
export async function explain(h, { who = 'alice', scope = { kind: 'whole' }, instruction = INSTRUCTION, depth = 'balanced', invitationId, extra = {}, key = 'create' } = {}) {
  return h.send(who, 'POST', '/api/learn/roadmap', { boardId: h.boards[who], source: { key: `file:${USERS[who].fileId}`, rev: h.rev, scope }, instruction, depth, actionKey: KEY(key), ...(invitationId ? { invitationId } : {}), ...extra });
}
export async function acceptPlan(h, view, { who = 'alice', key = 'plan' } = {}) {
  // As the client does: on stale_revision (background events bump the revision) act again on the latest view with the same key.
  let out = await h.route(who, routes.acceptPlan(view, KEY(key)));
  for (let i = 0; i < 4 && out.status === 409 && out.body.code === 'stale_revision' && out.body.current?.roadmap; i++) out = await h.route(who, routes.acceptPlan(out.body.current, KEY(key)));
  return out;
}
// Explain + Accept roadmap -> the view with the first proposal.
export async function started(h, opts = {}) {
  const created = await explain(h, opts);
  if (![200, 202].includes(created.status)) throw new Error(`create ${created.status} ${JSON.stringify(created.body).slice(0, 300)}`);
  const view = await status(h, opts.who);
  const accepted = await acceptPlan(h, view, opts);
  if (accepted.status !== 200) throw new Error(`accept-plan ${accepted.status} ${JSON.stringify(accepted.body).slice(0, 300)}`);
  return accepted.body;
}
export const acceptCard = (h, view, key, who = 'alice') => h.route(who, routes.acceptProposal(view, KEY(key)));
// The client's delivery: deliver route -> insert the block at its slot geometry -> ordinary board PUT -> acknowledgement (stale revisions re-read).
export async function deliver(h, resultId, { who = 'alice', geometry = { x: 520, y: 40, w: 420 }, key = `ack-${resultId}` } = {}) {
  const view = await status(h, who);
  const got = await h.route(who, routes.deliver(view, resultId, KEY(`deliver-${resultId}`)));
  if (got.status !== 200) return { stage: 'deliver', ...got };
  const block = { ...got.body.cards[0].block, ...geometry };
  const board = await h.send(who, 'GET', `/api/learn/boards/${USERS[who].canvas}/main`);
  const saved = await h.send(who, 'PUT', `/api/learn/boards/${USERS[who].canvas}/main`, { state: { ...board.body.state, blocks: [...board.body.state.blocks.filter(b => b.id !== block.id), block] }, version: board.body.version });
  if (saved.status !== 200) return { stage: 'save', ...saved };
  let ack;
  for (let i = 0, revision = (await status(h, who)).roadmap.revision; i < 6; i++) {
    ack = await h.send(who, 'POST', `/api/learn/roadmap/${view.roadmap.id}/results/${resultId}/ack`, { boardId: h.boards[who], revision, actionKey: KEY(key), resultVersion: 1, cardId: block.id, boardRevision: saved.body.version });
    if (!(ack.status === 409 && ack.body.code === 'stale_revision')) break;
    revision = ack.body.currentRevision;
  }
  return { stage: 'ack', ...ack, block, boardVersion: saved.body.version };
}
export const boardBlocks = async (h, who = 'alice') => (await h.send(who, 'GET', `/api/learn/boards/${USERS[who].canvas}/main`)).body.state.blocks;
export const saveMessage = (h, thread, body, who = 'alice') => h.send(who, 'POST', `/api/learn/chat/threads/${thread}/messages`, { app: USERS[who].canvas, ...body });
export const readThread = async (h, thread, who = 'alice') => h.send(who, 'GET', `/api/ask/threads/${thread}`);
// A revised draft: the first two steps, the rest declared uncovered (planning.md 4 coverage).
export const SHORT_PLAN = planOf(STEPS.slice(0, 2), { coverage: { uncovered: [{ start: AT.background, end: MD.length, reason: 'The learner asked to focus on the criteria.' }] } });

// BE.15 receipt data: with RECEIPT_JSON=<file> a test records its counts (ids, author-call counts per role, hold/debit/refund totals, saved board cards) under `key`.
export async function receipt(key, h, extra = {}) {
  const file = process.env.RECEIPT_JSON;
  if (!file) return;
  const total = await h.totals();
  const count = role => h.plannerCalls.filter(c => c.role === role).length;
  const data = { sourceSha256: h.rev, sourceChars: h.md.length, threadIds: h.rows('SELECT id FROM threads').map(r => r.id), boards: h.boards,
    roadmapIds: h.rows('SELECT id FROM learn_roadmaps').map(r => r.id), proposalIds: h.rows('SELECT id, version FROM learn_step_proposals').map(r => `${r.id}@${r.version}`),
    resultIds: h.rows("SELECT id, card_id, delivery, billing FROM learn_step_results WHERE decision = 'accepted'"),
    roleCounts: { plannerDraft: count('roadmap_draft'), plannerRevise: count('roadmap_revise'), proposalEdit: count('roadmap_proposal'), author: h.authorCalls.length, citationChecker: h.checkerCalls.length, classifier: h.classifierCalls },
    authorModels: [...new Set(h.authorCalls.map(c => c.model))], network: h.network.length,
    money: { holds: h.rows('SELECT id, aggregate_micros, per_card_bound_micros, remaining_micros, state FROM learn_step_authorizations'), used: total.used, reserved: total.reserved, refundRows: h.rows('SELECT count(*) AS n FROM usage_adjustments')[0].n, learnerActions: h.rows("SELECT count(*) AS n FROM usage_actions WHERE client_key LIKE 'rmact_%'")[0].n },
    savedBoard: (await boardBlocks(h)).map(b => ({ id: b.id, type: b.type, x: b.x, y: b.y, w: b.w })), ...extra };
  let all = {}; try { all = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first writer */ }
  writeFileSync(file, JSON.stringify({ ...all, [key]: data }, null, 1));
}
