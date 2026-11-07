// The shared 40 Chat routing cases (checklist 4.5 "Focused Chat routing tests": Set A = 20 learner-intent cases, Set B = 20 cases that start at
// Send in Ask, Auto and Tutor). Each case starts at the real entry point (the client's routeChat/routeOutcome, the server's chatRouteFetch/
// decideChat, the real apiAsk where the decision lands on a reply, the real roadmap controller or edit-path seam for an explicit Editing pill)
// and stops at the validated decision, with execution spies asserting zero downstream effects (no plan, search, adapter dispatch, card, job,
// render or credit hold: any live D1/R2 binding throws, any non-model fetch is recorded, the JEV double is counted).
//
// WHAT THIS PROVES: wiring and guards only. The JEV classifier and the answer model are DOUBLES whose answer is scripted from each case's own
// label, so a scripted correct decision cannot show model quality. "Live model quality: UNVERIFIED" until an authorized provider run
// (scripts/routing-live-eval.mjs, owner-approved spend only). What it DOES show for the current path (JEV preflight over CHAT_ROUTES): which
// labelled outcomes it cannot express at all. Those are MISSES, listed in docs/features/explain-on-canvas/routing-run-results.md for tuning
// (CHAT.02); they do not fail this test. A wiring or guard defect does.
//   WRITE_ROUTING_REPORT=1 node --test packages/control-plane/test/chat-routing-fixtures.test.js    rewrites the report; a plain run compares.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import * as chatModes from '../src/chat-modes.js';
import { chatRouteFetch, decideChat } from '../src/chat-capability-route.js';
import { JevError } from '../src/learn-grade-jev.js';
import { canvasApp, canvasAskSeam } from '../src/canvases.js';
import { routeChat, routeOutcome, editPath, editRefusal, editTarget } from '../../web/src/generation-proposal-chat.js';
import { askMode } from '../../web/src/chat-route.js';
import { explicitCommand, CHAT_CAPABILITIES } from '../../web/src/inline-ai-route.js';
import { SLASH } from '../../web/src/agent/slash.js';
import { createRoadmapController } from '../../web/src/roadmap-controller.js';
import { roadmapEditTarget } from '../../web/src/roadmap-transcript.js';
import * as S from './chat-routing-support.js';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const REPORT = new URL('../../../docs/features/explain-on-canvas/routing-run-results.md', import.meta.url);
const CONTRACTS = new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url);
const owner = { email: 'owner@example.test', org: 'workspace-a' };
const untouchable = new Proxy({}, { get: (_, key) => { throw new Error(`touched ${String(key)}`); } });
const settle = () => new Promise(resolve => setTimeout(resolve, 10));
const cases = S.loadCases();

// ---------- the real apiAsk over disposable SQLite (the harness chat-modes.test.js uses) ----------
const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const apiAskSource = source.match(/export async function apiAsk\([^]*?\n\}/)[0].replace(/^export /, '');
const modules = await Promise.all(['../src/ask.js', '../src/learn-wiki.js', '../src/learn-youtube.js', '../src/learn-outline-tool.js', '../src/learn-context.js', '../src/learn-ask-context.js', '../src/learn-models.js', '../src/learn-paper.js', '../src/learn-media.js', '../src/arxiv.js', '../src/canvas-conversation.js', '../src/learn-context-docs.js', '../src/learn-storage.js', '../src/token.js', '../src/agents/learn-chat.js', '../src/canvas-context.js', '../src/generation-proposal.js', '../src/chat-capability-route.js'].map(path => import(path)));
const baseDeps = Object.fromEntries(modules.flatMap(m => Object.entries(m)).filter(([name]) => name !== 'default'));
const fakeMeta = {
  ANSWER_META_SYSTEM: 'ANSWER_META_RULES',
  answerMetaSystem: ({ repository = false } = {}) => (repository ? 'ANSWER_META_RULES REPOSITORY_FOLLOWUPS' : 'ANSWER_META_RULES'),
  splitAnswerMeta: text => { const m = String(text).match(/\s*<answer_meta>([^]*?)<\/answer_meta>\s*$/); return m ? { content: text.slice(0, m.index), raw: m[1] } : { content: text, raw: null }; },
  validateAnswerMeta: (raw, { messageId }) => ({ actions: [], followUps: raw ? [{ id: 'f1', text: `next after ${messageId}`, kind: 'next' }] : [] }),
};
const apiAsk = new Function(...Object.keys({ ...baseDeps, ...chatModes, ...fakeMeta, json: 0 }), `${apiAskSource}; return apiAsk;`)(...Object.values({ ...baseDeps, ...chatModes, ...fakeMeta, json: (body, status = 200) => Response.json(body, { status }) }));
const sse = text => text.trim().split('\n\n').map(block => ({ event: block.match(/^event: (.*)$/m)[1], data: JSON.parse(block.match(/^data: (.*)$/m)[1]) }));

// One disposable canvas turn. fetched: every non-model request the code under test made (must stay empty).
function askFixture(setup) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8').replace(/\r/g, ''));
  sqlite.exec(readFileSync(new URL('../learn-migrations/0003-canvas-context-documents.sql', import.meta.url), 'utf8'));
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('workspace-a','canvas-0a1b2c3d','owner@example.test','Attention')");
  const calls = [], replies = [], fetched = [];
  const env = {
    SMALL_ENV: 'test', ANTHROPIC_API_KEY: 'test-only', ...S.availabilityEnv(setup), MOTION_ESTIMATE_USD: '1.00', MOTION_MAX_CHARGE_USD: '3.50', MOTION_JOB_RESERVATION_USD: '8.96',
    DB: { prepare: sql => { throw new Error(`live D1 touched: ${sql}`); } },
    LEARN_MEDIA: { put: async () => {}, get: async () => null, delete: async () => {} },
    LEARN_DB: { batch: async statements => Promise.all(statements.map(s => s.run())), prepare: sql => { const statement = sqlite.prepare(sql); return { bind: (...params) => ({
      first: async () => statement.get(...params) || null,
      all: async () => ({ results: statement.all(...params) }),
      run: async () => ({ meta: statement.run(...params) }),
    }) }; } },
  };
  const seam = () => canvasAskSeam(env, canvasApp(sqlite.prepare("SELECT * FROM canvases WHERE name='canvas-0a1b2c3d'").get(), owner));
  return {
    env, calls, replies, fetched, close: () => sqlite.close(), rows: sql => sqlite.prepare(sql).all(),
    model: async (url, init) => {
      if (new URL(String(url)).hostname !== 'api.anthropic.com') { fetched.push(String(url)); return new Response('', { status: 404 }); }
      calls.push(JSON.parse(init.body));
      const reply = replies.shift() ?? 'Plain answer.';
      return Response.json(typeof reply === 'string' ? { content: [{ type: 'text', text: reply }], stop_reason: 'end_turn' } : reply);
    },
    ask: async body => {
      const res = await apiAsk(new Request('https://dev.test/api/learn/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: { app: 'canvas-0a1b2c3d' }, ...body }) }), env, {}, owner, 'learn', seam());
      return { res, events: res.status === 200 ? sse(await res.text()) : null };
    },
  };
}
const WATER = 'Sunlight warms a body of water, causing evaporation. Moist air rises and cools, forming droplets that gather into clouds. The droplets grow and fall as rain. Water collects again, completing the cycle.';
const proposeCall = (id, over = {}) => ({ content: [{ type: 'tool_use', id, name: 'propose_generation', input: { command: 'motion', title: 'Water cycle: evaporation to rain', description: WATER, settings: { duration_seconds: 10, audio: false }, ...over } }], stop_reason: 'tool_use' });

// ---------- the client + server routing seams ----------
const authorize = async () => ({ email: owner.email, org: owner.org, kind: 'owner' });
const routeEnv = setup => ({ INLINE_DECISION_KEY: 'k'.repeat(40), VERCEL_TYPESAFE_API_KEY: 'test-only', LEARN_DB: untouchable, DB: untouchable, LEARN_VIDEOS: untouchable, ...S.availabilityEnv(setup) });
const requestIdOf = c => `req-${c.id.toLowerCase().replace(/[^a-z0-9]/g, '')}-0001`;
async function route(c, setup, jev) {
  const env = routeEnv(setup), routes = S.routesFor(env), script = jev ?? S.scriptFor(c, setup, routes);
  let jevCalls = 0;
  const fetched = [], original = globalThis.fetch;
  globalThis.fetch = async url => { fetched.push(String(url)); return new Response('', { status: 404 }); }; // the routing seams make no outbound request
  const ask = async () => { jevCalls += 1; if (script.throws) throw new JevError(script.throws, 'doubled'); return S.jevBody(script.choice); };
  const fetcher = async (url, init) => chatRouteFetch(new Request(`https://dev.test${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: init.body }), env, { authorize, ask });
  const payload = { scope: { app: 'canvas-0a1b2c3d' }, message: c.prompt, mode: askMode(c.mode, false), ...(setup.selection ? { canvas_target: setup.selection } : {}) };
  const explicit = c.entry === 'slash-command' ? explicitCommand(c.prompt) : null;
  try {
    const decision = await routeChat(fetcher, payload, { capability: explicit?.name ?? null, requestId: requestIdOf(c) });
    const outcome = routeOutcome(decision, { plain: !explicit });
    return { env, routes, script, decision, outcome, jevCalls, explicit, wire: payload.mode, fetched };
  } finally { globalThis.fetch = original; }
}
const POSTED = new RegExp('/revise$');
async function editRoadmap(c) {
  const calls = [];
  const view = JSON.parse(readFileSync(new URL('status-proposed-plan.json', CONTRACTS), 'utf8')).response.body;
  const api = async (path, opts = {}) => { calls.push({ method: opts.method || 'GET', path, body: opts.body ? JSON.parse(opts.body) : null }); return view; };
  const host = { hasBlock: () => false, insertCard: () => null, persist: async () => ({ ok: true }), boardRevision: () => 1, savedHas: () => false };
  const controller = createRoadmapController({ api, boardId: 'lb_7c1e5a90d2b84f63a1c07e92', host, schedule: () => 1, cancel() {}, random: () => 'keyxaaaaaaaa' });
  controller.start(); await settle();
  const rm = controller.getState().view.roadmap, edit = roadmapEditTarget({ roadmapId: rm.id, planVersion: rm.planVersion });
  assert.equal(edit.command, 'roadmap'); assert.equal(rm.id, edit.proposalId, 'the Editing pill names this open roadmap');
  await controller.revise({ instruction: c.prompt }); await settle();
  const revise = calls.filter(call => call.method === 'POST' && POSTED.test(call.path));
  assert.equal(revise.length, 1, 'one revision request');
  assert.equal(calls.filter(call => /chat\/route/.test(call.path)).length, 0, 'a targeted edit never routes');
  assert.equal(JSON.stringify(revise[0].body).includes(c.prompt), true, 'the typed words are the revision instruction');
  return { route: 'revise-roadmap', commandIds: [] };
}
function editBrief() {
  const soon = Date.now() + 600000;
  const p = { proposal_id: 'gp-e', version: 1, command: 'explain', title: 'Water filters', settings: { presentation: 'steps' }, input: { org: 'w', app: 'canvas-0a1b2c3d', job: 'ej_1', brief_hash: 'bh-1', request: 'Compare two water filters.' }, expires_at: soon };
  let refined = 0;
  const target = editTarget(p, 'm1');
  assert.equal(editPath(p, { refineExplain: () => { refined += 1; } }), 'explain', 'the pending Explain brief is revised through its job');
  assert.equal(editRefusal(target, { command: null, file: null }), null, 'a plain message with the pill is the revision, not a refused command');
  assert.equal(refined, 0, 'the decision stops before the revision is dispatched');
  return { route: 'revise-brief', commandIds: ['explain'] };
}
async function pendingProposal(c, setup) {
  const f = askFixture(setup);
  const original = globalThis.fetch;
  globalThis.fetch = f.model;
  try {
    f.replies.push(proposeCall('tu1'), 'Proposed.\n<answer_meta>{}</answer_meta>');
    const first = (await f.ask({ message: 'explain the water cycle', mode: 'ask', command: 'motion', generation: { motion: { concept: 'Weather' } } })).events.find(e => e.event === 'answer_meta').data.proposal;
    const r = await route(c, setup);
    assert.deepEqual([r.outcome.send, r.outcome.token, r.outcome.answerOnly ?? false], [true, null, false], 'a refinement is sent as the ordinary turn: no new tool');
    const before = f.calls.length;
    f.replies.push(proposeCall('tu2', { settings: { duration_seconds: 15, audio: false } }), 'Updated.\n<answer_meta>{}</answer_meta>');
    const second = (await f.ask({ message: c.prompt, mode: r.wire, generation: { motion: { concept: 'Weather' }, current: first } })).events.find(e => e.event === 'answer_meta').data.proposal;
    assert.equal(f.calls.length - before, 2, 'the revision and the reply: no author, render or orchestrator call');
    assert.deepEqual(f.fetched, [], 'no request beyond the model');
    return { jevCalls: r.jevCalls, observed: second && second.proposal_id === first.proposal_id && second.version === first.version + 1 ? { route: 'revise-proposal', commandIds: [second.command] } : { route: 'none', commandIds: [] } };
  } finally { globalThis.fetch = original; f.close(); }
}
// The decision landed on a reply: the real apiAsk answers it once, in the thread, offering no generation tool.
async function reply(c, setup, r) {
  const f = askFixture(setup);
  const original = globalThis.fetch;
  globalThis.fetch = f.model;
  try {
    const answerOnly = r.outcome.answerOnly === true;
    const { res, events } = await f.ask({ message: c.prompt, mode: r.wire, ...(r.outcome.failure ? { route_failure: r.outcome.failure } : {}), ...(answerOnly ? { answer_only: true } : {}), ...(setup.selection ? { context_refs: [{ sourceId: 'card:shape:a', kind: 'card', name: setup.selection.title, version: 'h1', range: null, text: setup.selection.text }] } : {}) }); // a selected card rides as a context ref
    assert.equal(res.status, 200); assert.equal(events.filter(e => e.event === 'chunk').length, 1, 'exactly one reply');
    assert.deepEqual(f.rows('SELECT role FROM messages ORDER BY id').map(m => m.role), ['user', 'assistant'], 'one saved user message and one reply');
    const tools = (f.calls[0].tools || []).map(tool => tool.name);
    assert.equal(tools.includes('propose_generation'), false, 'no generation tool on an ordinary reply');
    if (answerOnly) assert.equal(tools.length, 0, 'answer-only offers no tool at all');
    assert.deepEqual(f.fetched, [], 'no request beyond the model');
    assert.equal(f.rows("SELECT COUNT(*) AS n FROM chat_message_meta WHERE meta_json LIKE '%\"proposal\"%'")[0].n, 0, 'nothing proposed');
  } finally { globalThis.fetch = original; f.close(); }
}

// ---------- the run ----------
const results = [];
const reasonOf = (c, script, observed) => {
  if (c.expected.route === 'discard-stale') return 'the thread-switch guard is a closure inside AskPanel.send (ask.jsx late()); there is no node seam to drive it, only the source guard below';
  if (script?.note) return `${script.note}; observed ${observed.route}`;
  if (c.expected.route === 'reply-with-recovery') return 'the current path has no recovery branch (CHAT.02): it can only reply';
  return `observed ${observed.route}${observed.commandIds.length ? ` (${observed.commandIds.join(', ')})` : ''}, expected ${c.expected.route}`;
};
async function runCase(c) {
  const setup = S.setupOf(c.id), routes = S.routesFor(routeEnv(setup));
  const record = { id: c.id, file: c.file, mode: c.mode, entry: c.entry, variant: c.variant, expected: c.expected, setup, scripted: '', catalogue: S.catalogueNote(c.expected.commandIds, routes), observed: null, status: '', reason: '' };
  try {
    if (setup.kind === 'stale-thread') { record.scripted = 'none'; record.status = 'miss'; record.reason = reasonOf(c, null, { route: 'none', commandIds: [] }); return record; }
    if (setup.kind === 'edit-roadmap') { record.scripted = 'none (no classifier call)'; record.observed = await editRoadmap(c); }
    else if (setup.kind === 'edit-brief') { record.scripted = 'none (no classifier call)'; record.observed = editBrief(); }
    else if (setup.kind === 'pending-proposal') {
      const r = await pendingProposal(c, setup);
      assert.equal(r.jevCalls, 1); record.scripted = 'answer (JEV), then a revising propose_generation call (answer model)'; record.observed = r.observed;
    } else {
      const r = await route(c, setup);
      record.scripted = r.script.throws ? `JEV ${r.script.throws}` : r.explicit ? 'none (explicit command)' : `JEV ${r.script.choice}`;
      record.observed = S.observedOf(r.decision, r.outcome);
      assert.deepEqual(r.fetched, [], 'no outbound request from routing');
      assert.equal(r.jevCalls, r.explicit ? 0 : 1, r.explicit ? 'an explicit command makes no classifier call' : 'one classifier call');
      if (r.outcome.token) assert.equal(setup.motion, 'ready', 'a signed offer for an unavailable tool');
      if (record.observed.route === 'reply' || record.observed.route === 'answer-only') await reply(c, setup, r);
      else assert.equal(r.outcome.answerOnly ?? false, false);
      if (r.script.note) record.scripted += ` (${r.script.note})`;
      record.script = r.script;
    }
    record.status = S.verdict(c.expected, record.observed) ? 'pass' : 'miss';
    if (record.status === 'miss') record.reason = reasonOf(c, record.script, record.observed);
  } catch (error) { record.status = 'wiring-fail'; record.reason = String(error.message).split('\n').slice(0, 4).join(' ').slice(0, 260); }
  return record;
}

// ---------- the report ----------
const git = (...args) => { try { return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim(); } catch { return ''; } };
const cell = text => String(text).replace(/\|/g, '/').replace(/\s+/g, ' ');
const idsOf = o => (o ? `${o.route}${o.commandIds.length ? ` [${o.commandIds.join(', ')}]` : ''}` : 'not exercised');
function renderReport(rows) {
  const count = (list, status) => list.filter(r => r.status === status).length;
  const lines = [
    '# Chat routing run results (40 shared cases)', '',
    '**Candidate:** CANDIDATE_LINE', '',
    'Source: `packages/control-plane/test/chat-routing-fixtures.test.js` over `packages/control-plane/test/fixtures/chat-routing/` (checklist 4.5, Sets A and B). Each case starts at its real entry point and stops at the validated decision; execution spies assert zero downstream effects. The JEV classifier and the answer model are **doubles scripted from each case\'s own label**, so a pass here proves wiring and guards, never model quality.',
    '', '**Live model quality: UNVERIFIED (no authorized provider run).** `scripts/routing-live-eval.mjs` runs the same cases against the real router and refuses to run without explicit spend approval.',
    '', '## Summary', '', '| Fixture | Cases | Pass | Miss | Wiring-fail |', '| --- | ---: | ---: | ---: | ---: |',
    ...S.FILES.map(([file]) => { const list = rows.filter(r => r.file === file); return `| ${file} | ${list.length} | ${count(list, 'pass')} | ${count(list, 'miss')} | ${count(list, 'wiring-fail')} |`; }),
    `| **All** | ${rows.length} | ${count(rows, 'pass')} | ${count(rows, 'miss')} | ${count(rows, 'wiring-fail')} |`, '',
    `${rows.filter(r => !r.variant).length} cases plus ${rows.filter(r => r.variant).length} variant(s). A **miss** is an outcome the current path (JEV preflight over \`CHAT_ROUTES\`) cannot produce, kept for tuning; a **wiring-fail** is a guard or effect defect and fails the test.`, '',
    '## Cases', '', '| Case | Mode | Entry | Expected | Observed | Scripted | Catalogue | Result |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(r => `| ${r.id} | ${r.mode} | ${r.entry} | ${cell(idsOf(r.expected))} | ${cell(idsOf(r.observed))} | ${cell(r.scripted)} | ${cell(r.catalogue)} | ${r.status} |`), '',
    '## Misses to tune', '', ...(rows.filter(r => r.status === 'miss').map(r => `- **${r.id}** (expected ${idsOf(r.expected)}): ${cell(r.reason)}`) || []), '',
    '## Wiring failures', '', ...(rows.some(r => r.status === 'wiring-fail') ? rows.filter(r => r.status === 'wiring-fail').map(r => `- **${r.id}**: ${cell(r.reason)}`) : ['None.']), '',
  ];
  return lines.join('\n');
}
const body = text => text.replace(/\r\n/g, '\n').split('\n').filter(line => !line.startsWith('**Candidate:**')).join('\n');

// ---------- tests ----------
test('the four fixture files are well formed: 20 intent + 6/7/7 Send cases, unique stable ids, known labels, real command ids', () => {
  const ids = new Set(), known = new Set([...SLASH.flatMap(command => [command.name, command.typed].filter(Boolean)), ...Object.keys(CHAT_CAPABILITIES)]);
  for (const [file, count] of S.FILES) {
    const json = JSON.parse(readFileSync(new URL(file, new URL('./fixtures/chat-routing/', import.meta.url)), 'utf8'));
    assert.equal(json.cases.length, count, `${file} has ${count} cases`);
    if (file.startsWith('send/')) assert.equal(json.mode, file.slice(5, -5), `${file} sets its mode`);
    for (const c of json.cases) {
      for (const item of [c, ...(c.variants || [])]) {
        assert.match(item.id, /^(INT|SEND)-\d{2}(-[A-Z0-9]+(-[A-Z0-9]+)*)?$/, item.id);
        assert.equal(ids.has(item.id), false, `${item.id} is unique`); ids.add(item.id);
        assert.ok(typeof item.setup === 'string' && item.setup, `${item.id} has a setup`);
        assert.ok(S.ROUTE_LABELS.includes(item.expected.route), `${item.id}: route ${item.expected.route} is a known label`);
        assert.ok(Array.isArray(item.expected.commandIds) && typeof item.expected.detail === 'string', `${item.id}: commandIds and detail`);
        for (const id of item.expected.commandIds) assert.ok(known.has(id), `${item.id}: ${id} is a registry command`);
      }
      assert.ok(['message', 'slash-command'].includes(c.entry) && typeof c.prompt === 'string' && c.prompt, `${c.id} has an entry and a prompt`);
      assert.equal(c.entry === 'slash-command', c.prompt.startsWith('/'), `${c.id}: entry matches its prompt`);
    }
  }
  assert.equal(ids.size, 41, '40 cases and 1 variant');
});

test('the harness ties its mirrored client seams to the real code, so they cannot drift quietly', () => {
  const ask = readFileSync(new URL('../../web/src/ask.jsx', import.meta.url), 'utf8');
  assert.ok(ask.includes("const routable = chat && learnChat && !tocView && !privateChat && !attached && !regenerate && !isDemo && !edit && payload.mode !== 'tutor';"), 'an Editing pill, a regeneration and a contents turn never route');
  assert.ok(ask.includes("if (edit?.command === 'roadmap') {") && ask.includes('roadmap.controller.revise({ instruction: raw.trim() })'), 'Edit roadmap revises with the typed words');
  assert.ok(ask.includes('{ capability: routeAs ?? commandName ?? null }'), 'a named command routes with its capability');
  // SEND-20: a send canceled or moved to another thread while the route is out returns before anything is sent.
  const at = ask.indexOf('const outcome = routeOutcome(await routeChat('), after = ask.indexOf('if (late()) return;', at);
  assert.ok(at > 0 && after > at && after - at < 700, 'late() follows the route result');
});

test('the 40 routing cases run from their real entry points: no wiring or guard defect, no downstream effect', async t => {
  const log = console.log;
  console.log = () => {}; // the code under test logs structured lines
  try { for (const c of cases) results.push(await runCase(c)); } finally { console.log = log; }
  const failed = results.filter(r => r.status === 'wiring-fail');
  assert.deepEqual(failed.map(r => `${r.id}: ${r.reason}`), [], 'wiring-fail');
  assert.equal(results.length, 41);
  assert.equal(results.filter(r => r.status === 'pass').length + results.filter(r => r.status === 'miss').length, 41);
  for (const r of results.filter(r => r.status === 'miss')) assert.ok(r.reason, `${r.id} says why it missed`);
  // The scripted decisions that the current catalogue can express all pass: a miss is never a wiring problem hiding.
  for (const r of results.filter(r => r.status === 'pass' && ['review', 'tool-handoff', 'search'].includes(r.expected.route))) assert.ok(r.observed.commandIds.length, r.id);
  t.diagnostic(`${results.filter(r => r.status === 'pass').length} pass, ${results.filter(r => r.status === 'miss').length} miss`);
});

test('guards beside the cases: an unavailable tool is never offered, a denied board stays denied, Contents stays distinct', async t => {
  const log = console.log;
  console.log = () => {};
  t.after(() => { console.log = log; });
  // Motion off or paused: even when the (doubled) classifier insists on Motion, no signed offer comes back.
  for (const id of ['INT-19', 'SEND-12', 'SEND-13']) {
    const c = cases.find(item => item.id === id), setup = S.setupOf(id);
    const r = await route(c, setup, { choice: 'motion' });
    assert.equal(r.decision.token, null, `${id}: no token`);
    assert.deepEqual([r.decision.route, r.outcome.send], ['unsupported', undefined], `${id}: refused with its reason`);
    assert.equal(r.outcome.show.kind, 'unsupported');
  }
  // A denied board: the route answers 403, the client shows that denial and sends nothing; the classifier is never reached.
  let reached = 0;
  const denied = async (url, init) => chatRouteFetch(new Request(`https://dev.test${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: init.body }), routeEnv(S.setupOf('INT-01')), { authorize: async () => Response.json({ error: 'No access to this canvas.' }, { status: 403 }), ask: async () => { reached += 1; return S.jevBody('answer'); } });
  const decision = await routeChat(denied, { scope: { app: 'canvas-0a1b2c3d' }, message: 'why is the sky blue', mode: 'auto' });
  const outcome = routeOutcome(decision, { plain: true });
  assert.deepEqual([reached, outcome.send, outcome.show], [0, undefined, { kind: 'error', message: 'No access to this canvas.' }]);
  // Contents (the outline-only conversation) stays distinct from the ordinary Tutor composer.
  assert.equal(askMode('tutor', false), 'auto'); assert.equal(askMode('tutor', true), 'tutor');
  const tutorEnv = routeEnv(S.setupOf('SEND-14')); let calls = 0;
  const viaMode = await decideChat(tutorEnv, { email: owner.email, app: 'canvas-0a1b2c3d', requestId: 'req-contents-0001', fields: { text: 'reorder these headings', mode: 'tutor' } }, { ask: async () => { calls += 1; return S.jevBody('motion'); } });
  assert.deepEqual([viaMode.route, viaMode.via, calls], ['answer', 'mode', 0]);
});

test('the report is produced and internally consistent', () => {
  assert.equal(results.length, 41, 'the run above produced every result');
  const sha = git('rev-parse', 'HEAD') || 'unknown', dirty = git('status', '--porcelain', '--untracked-files=no') ? ' (dirty)' : '';
  const fresh = renderReport(results);
  if (process.env.WRITE_ROUTING_REPORT === '1') writeFileSync(REPORT, fresh.replace('CANDIDATE_LINE', `${sha}${dirty}`));
  assert.ok(existsSync(REPORT), 'run once with WRITE_ROUTING_REPORT=1 to produce docs/features/explain-on-canvas/routing-run-results.md');
  const written = readFileSync(REPORT, 'utf8');
  assert.equal(body(written), body(fresh.replace('CANDIDATE_LINE', 'x')), 'the report matches this run (rerun with WRITE_ROUTING_REPORT=1 after changing routing)');
  const total = /\| \*\*All\*\* \| (\d+) \| (\d+) \| (\d+) \| (\d+) \|/.exec(written);
  assert.deepEqual(total.slice(1).map(Number), [41, results.filter(r => r.status === 'pass').length, results.filter(r => r.status === 'miss').length, 0]);
  for (const r of results) assert.ok(written.includes(`| ${r.id} |`), `${r.id} is listed`);
  assert.ok(written.includes('Live model quality: UNVERIFIED'));
});
