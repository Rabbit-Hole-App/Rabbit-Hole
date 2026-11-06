// Harness for the R4 integration tests (roadmap-loop, roadmap-planning, roadmap-glue): the real State store/money/lifecycle, Tools' planners,
// generator and checks and the glue, with only the outside doubled (planner/checker transport, provider behind the real spendTransport,
// classifier, Markdown bytes, session).
import { roadmapRoute } from '../src/roadmap/roadmap-routes.js';
import { roadmapDeps, registerRoadmapHandlers } from '../src/roadmap/roadmap-wire.js';
import { spendTransport } from '../src/learn-spend.js';
import { usageTotals, periodOf } from '../src/learn-usage.js';
import { readFileSync } from 'node:fs';
import { world, MODEL } from './roadmap-fixture.js';

export const PERIOD = periodOf(Math.floor(Date.now() / 1000));
export const BOARD = 'lb_board00000000000001';
export const ORIGIN = 'https://rabbit.test';
export const INSTRUCTION = 'I already know what a derivative is. Teach me how gradient descent uses it.';
export const MD = `# Gradient descent

## Slope
The gradient of the loss points uphill, so stepping against it lowers the loss.

## Update
One update subtracts the learning rate times the gradient from the weight.

## Learning rate
A rate that is too large overshoots the minimum and a rate that is too small is slow.
`;
export const AT = { update: MD.indexOf('## Update'), rate: MD.indexOf('## Learning rate') };
export const sha = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
export const ID_A = 'fs_aaaaaaaaaaaaaaaaaaaaaaaa', ID_B = 'fs_bbbbbbbbbbbbbbbbbbbbbbbb';

// --- doubles ------------------------------------------------------------------------------------------------------------------------
export const toolUse = (name, input) => ({ content: [{ type: 'tool_use', id: `tu_${Math.random().toString(36).slice(2, 10)}`, name, input }] });
export const planInput = steps => ({ outcome: 'Run one gradient descent update and pick a learning rate.', assumptions: ['You know what a derivative is, so it is not retaught.'],
  instructionAck: { honored: ['skip derivatives'], skips: [{ topic: 'what a derivative is', reason: 'learner_knows' }] },
  steps: steps.map(([title, start, end, format = 'explanation']) => ({ title, goal: `Explain ${title.toLowerCase()}.`, format, passage: { start, end }, claimsToCover: ['the main claim'], independent: true })),
  stoppingPoint: 'You can trace one update by hand.', coverage: { uncovered: [] }, question: null });
export const FULL = planInput([['The gradient', 0, AT.update], ['One update', AT.update, AT.rate], ['Choosing a rate', AT.rate, MD.length]]);
export const SHORT = planInput([['The gradient and the update', 0, AT.rate], ['Choosing a rate', AT.rate, MD.length]]);

// The planner/checker transport. Planning answers from `plans` in order; the grounding check supports the first claim with a real quote.
export function models({ plans = [FULL] } = {}) {
  const calls = [];
  let planned = 0;
  const callModel = async (role, body) => {
    calls.push(role);
    if (role === 'roadmap_draft' || role === 'roadmap_revise') return toolUse('submit_roadmap', plans[Math.min(planned++, plans.length - 1)]); // plans are consumed in order
    if (role === 'roadmap_grounding_check') {
      const passage = String(body.messages[0].content).split('<source>\n')[1].split('\n</source>')[0];
      return toolUse('submit_verdicts', { verdicts: [{ claim: 'the explanation matches the passage', verdict: 'supports', quote: passage.slice(0, 30) }] });
    }
    throw new Error(`unexpected role ${role}`);
  };
  return { calls, callModel };
}
export const calm = { scores: { sexual_explicit: 0, sexual_minors: 0, nonconsensual_intimate: 0, violence: 0, hate_extremism: 0, self_harm_personal: 0, private_data: 0 }, uncertainty: 0, coverage: { complete: true, chars: 1, chunks: 1 } };
export const classify = async () => calm;

// The artifact provider behind the real spendTransport. `script` is a list of async () => Response, consumed in order.
export const answer = (name, input, usage = { input_tokens: 400, output_tokens: 120 }) => async () => Response.json({ model: MODEL, stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 'tu_p', name, input }] });
export const GOOD = answer('make_explanation', { title: 'The gradient', body: 'The gradient points uphill, so stepping against it lowers the loss.' });
export const TABLE = answer('make_table', { title: 'Rates', caption: '', columns: ['rate', 'effect'], rows: [['small', 'slow'], ['large', 'overshoots']] });
export const BAD = answer('make_explanation', { title: 'No body' }); // fails the schema: the one repair
export const FAIL = async () => new Response('{"error":"overloaded"}', { status: 500, headers: { 'content-type': 'application/json' } });
export const provider = script => { const used = []; return { used, base: (e, body, model, org) => spendTransport(e, body, MODEL, org, async () => { used.push(1); return script.shift()(); }, { userId: 'u-alice', category: 'roadmap' }) }; };

export async function loop(t, { plans, script = [GOOD], allowanceMicros, flag = 'true', md = MD, settings, classifier = classify, envExtra } = {}) {
  const w = world(t, allowanceMicros ? { allowanceMicros } : {});
  if (envExtra) w.sqlite.exec(readFileSync(new URL('../learn-migrations/0042-roadmap-source-index.sql', import.meta.url), 'utf8')); // R7a tables (a Lead patch adds them to the consolidated schema)
  const objects = {};
  for (const [id, text] of [[ID_A, md], [ID_B, md]]) {
    objects[`r2/${id}`] = text;
    w.sqlite.prepare("INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, bytes, sha256, r2_key, status, created_at) VALUES (?, 'team', 'u-alice@example.test', 'learn', ?, 'markdown', ?, 'text/markdown', ?, ?, ?, 'stored', 1)")
      .run(id, BOARD, id === ID_A ? 'First notes.md' : 'Gradient descent notes.md', md.length, '', `r2/${id}`);
  }
  const rev = await sha(md);
  w.sqlite.prepare('UPDATE file_sources SET sha256 = ?').run(rev);
  const env = { ...w.env, ROADMAP_ENABLED: flag, ...envExtra, LEARN_MEDIA: { get: async key => (key in objects ? { text: async () => objects[key] } : null) } };
  const m = models({ plans }), p = provider(script);
  registerRoadmapHandlers({ callModel: m.callModel, checkCallModel: m.callModel, classify: classifier, base: p.base });
  const deps = { identity: async () => ({ org: 'team', email: 'u-alice@example.test', userId: 'u-alice' }), ...roadmapDeps(env, null, { settings }) };
  const call = (method, path, payload) => roadmapRoute(path.split('?')[0], new Request(`${ORIGIN}${path}`, { method, headers: { 'content-type': 'application/json' }, body: payload ? JSON.stringify(payload) : undefined }), env, deps);
  const json = async (method, path, payload) => { const r = await call(method, path, payload); return { status: r.status, body: await r.json() }; };
  const status = async () => (await json('GET', `/api/learn/roadmap?boardId=${BOARD}`)).body;
  const totals = () => usageTotals(w.LEARN_DB, 'u-alice', PERIOD);
  return { w, env, rev, m, p, call, json, status, totals, deps };
}
export const KEY = n => `key-${n}-00000000`;

