// Shared stack for the /animation job tests (AN-05): the real ledger and chat tables in SQLite and the durable storage map from
// explain-fixture.js, the real AnimationJobs object (object() is the object after a restart), a recording fetch in place of the
// provider, and a stub pipeline (STUB_PIPELINE) whose paid stages make the real admitted calls through ctx.call.
// No model is ever reached: the provider is the fake transport installed by provider().
import { AnimationJobs } from '../src/animation-job.js';
import { LEARN_TASKS } from '../src/learn-models.js';
import { SIGNABLE } from '../src/generation-proposal.js';
import { canonicalJson } from '../src/explain-render.js';
import { sha256Hex } from '../src/learn-grade-jev.js';
import { BOARD, OWNER, d1, durable, rows, spent } from './explain-fixture.js';

export { BOARD, OWNER, rows, spent };
// The four task rows of C:/s/spec/animation/patches/g-learn-models.patch. Until P applies it to learn-models.js the job runs on this
// table (the product code has no default: a missing row is refused, animation-policy.test.js); once applied, the real table is used.
// ponytail: drop PENDING_TASKS once the patch is on the integration branch.
const row = maxTokens => Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (exactly one tool call)', maxTokens });
const PENDING_TASKS = { animation_brief: row(4000), animation_author: row(10000), animation_review: row(3000), animation_repair: row(6000) };
export const TASKS = LEARN_TASKS.animation_brief ? LEARN_TASKS : Object.freeze({ ...LEARN_TASKS, ...PENDING_TASKS });
// Signing and consuming an /animation proposal needs the shared proposal patch (g-proposal.patch: SIGNABLE, usage, refs, schema).
export const INTEGRATED = SIGNABLE.includes('animation');
export const NEEDS_PROPOSAL = INTEGRATED ? false : 'needs C:/s/spec/animation/patches/g-proposal.patch (P integration)';

const hash16 = async value => (await sha256Hex(canonicalJson(value))).slice(0, 16);
export const PLAN = Object.freeze({ schema: 'animation-plan/1', title: 'Lever balance', description: 'A beam balances two masses on a pivot. Moving a mass changes which side tips. The readout shows both torques.',
  experience: 'experiment', reason: 'Changing the masses shows the torque rule directly.', behavior: 'analytical', controlProfile: 'inspect', sourceRefs: [],
  parameters: [{ id: 'mass', label: 'Left mass', type: 'number', unit: 'kg', min: 1, max: 5, step: 1, default: 2 }], interactions: ['Change the left mass.'], assumptions: ['The beam is massless.'], limitations: [], requiredCapabilities: ['parameters', 'readouts'] });

// The provider: replies to each request with one call of the offered tool. role is the system text the stub stages send.
export function provider(t, { reply = () => ({}), status = () => 200 } = {}) {
  const calls = [], original = globalThis.fetch;
  let gate = null;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body), role = body.system[0]?.text || body.system;
    calls.push({ host: new URL(url).host, model: body.model, role, toolChoice: body.tool_choice, maxTokens: body.max_tokens, images: body.messages[0].content.filter(b => b.type === 'image').length });
    if (gate) { const wait = gate; gate = null; await wait.promise; }
    const code = status(role, calls.filter(c => c.role === role).length);
    if (code !== 200) return Response.json({ type: 'error', error: { type: code === 529 ? 'overloaded_error' : 'api_error', message: 'x' } }, { status: code });
    const input = { n: calls.length, ...reply(role, calls.filter(c => c.role === role).length) };
    return Response.json({ model: body.model, content: [{ type: 'tool_use', id: `t${calls.length}`, name: body.tools[0].name, input }], stop_reason: 'tool_use', usage: { input_tokens: 1000, output_tokens: 500 } });
  };
  return { calls, roles: () => calls.map(c => c.role), hold() { let release; const promise = new Promise(r => { release = r; }); gate = { promise }; return () => release(); } };
}

const tool = { name: 'animation_out', description: 'Output.', input_schema: { type: 'object' } };
// A stand-in for the real stages: prepare/author/review/repair make one admitted call each; validate seals with the host's hash;
// render returns one capture of exactly that artifact. review's verdict comes from the provider's reply ({ accepted }).
export const STUB_PIPELINE = (over = {}) => ({
  prepare: async (job, ctx) => { await ctx.call('brief', { system: 'brief', tool, content: job.prompt }); return { plan: { ...PLAN, ...(job.refinement ? { title: `Lever balance (${job.refinement})` } : {}) } }; },
  approvedPlan: (plan, p) => ({ ...plan, title: p.title, description: p.description, experience: p.settings.experience }),
  author: async (job, ctx) => ({ draft: { scene: 'beam', from: (await ctx.call('author', { system: 'author', tool, content: job.prompt })).input.n } }),
  validate: async job => ({ artifact: { schema: 'animation-scene/1', title: job.plan.title, draft: job.draft, planHash: job.planHash, capabilityVersion: 'animation-capabilities/1', artifactHash: await hash16(job.draft) } }),
  render: async job => ({ captures: [{ id: 'v0-s0', artifactHash: job.artifact.artifactHash, key: 'k' }], renders: [{ ok: true }] }),
  review: async (job, ctx) => {
    const verdict = (await ctx.call('review', { system: 'review', tool, content: 'artifact' })).input;
    return { accepted: verdict.accepted === true, findings: verdict.accepted ? [] : [{ category: 'spec', severity: 'major', message: 'wrong' }], repairable: verdict.repairable !== false, artifactHash: job.artifact.artifactHash };
  },
  repair: async (job, ctx) => ({ draft: { ...job.draft, repaired: (await ctx.call('repair', { system: 'repair', tool, content: 'fix' })).input.n }, progress: true, operation: 'artifact' }),
  intact: async artifact => !!artifact?.artifactHash && artifact.artifactHash === await hash16(artifact.draft),
  ...over,
});

export const postedProposal = (sqlite, id) => rows(sqlite, 'chat_message_meta').map(r => JSON.parse(r.meta_json).proposal).filter(p => p?.input?.job === id).at(-1) ?? null;

export function animationStack(t, { pipeline = STUB_PIPELINE(), used = 0, env: extra = {}, reply, status } = {}) {
  const { sqlite, LEARN_DB } = d1(t);
  if (used) spent(sqlite, used);
  const env = { SMALL_ENV: 'dev', ANTHROPIC_API_KEY: 'test-key', USAGE_PLATFORM_DAY_USD: '10', AI_MONTHLY_ALLOWANCE_USD: '50', LEARN_DB, ANIMATION_ENABLED: 'true', ...extra };
  const state = durable();
  const object = () => new AnimationJobs(state, env, pipeline, { tasks: TASKS });
  const actor = object();
  const model = provider(t, { reply, status });
  const send = async (action, payload = {}, id = null, who = OWNER, on = actor, board = BOARD) => {
    const response = await on.fetch(new Request('https://animation/action', { method: 'POST', body: JSON.stringify({ action, id, payload, board, user: who, origin: 'https://dev.test' }) }));
    return { status: response.status, body: await response.json() };
  };
  const create = (extra = {}) => send('create', { requestId: 'req-00000001', cardId: 'card-0001', prompt: 'Show why a lever balances.', ...extra });
  const job = async id => (await send('get', {}, id)).body;
  const stored = id => state.data.get(`job:${id}`);
  const approve = (id, proposal = postedProposal(sqlite, id), extra = {}) => send('approve', { proposal, ...extra }, id);
  // Each alarm advances each live job by one stage, until it waits, ends or the limit.
  const run = async (id, on = actor, max = 40) => {
    for (let i = 0; i < max; i++) {
      await on.alarm();
      const j = stored(id);
      if (['ready', 'failed', 'cancelled', 'awaiting_approval'].includes(j.stage) && !j.inFlight) return j;
    }
    return stored(id);
  };
  // A request up to its plan, then Generate on the posted proposal, then run to the end.
  const generated = async (extra = {}) => {
    const { body } = await create(extra);
    const waiting = await run(body.job.id);
    const pressed = await approve(body.job.id);
    return { id: body.job.id, waiting, pressed, done: pressed.status === 202 ? await run(body.job.id) : stored(body.job.id) };
  };
  return { sqlite, env, state, actor, object, send, create, job, stored, approve, run, generated, model };
}
