// Shared scripted stack for the /interact design and approval tests (INT-02-C01, INT-03-C01): the real ExplainJobs object, ledger and chat tables
// (explain-fixture.js), the real Anthropic adapter and admission, and a scripted provider in place of the model. The provider answers each design
// role by its tool name from a script; any other tool is a BUILDER or legacy call and is only counted, so a test can prove it stays at zero before approval.
// No network: globalThis.fetch is replaced for the test.
import { explainStack, rows } from './explain-fixture.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { fixtureDescriptionFit } from '../src/interact-design.js';

export { OWNER, BOARD, postedProposal, rows } from './explain-fixture.js';

export const fixtures = await interactFixtures();
export const PLAN = fixtures.plans;
export const EVIDENCE = [{ id: 'kinematics_note', kind: 'attachment', location: 'kinematics note', excerpt: 'Constant acceleration: v = u - g t.', access: { kind: 'owner' }, limitations: [] }];
export const clone = value => structuredClone(value);

const text = (value = 'Checked against the plan text and the supplied note.') => value;
export const finding = (id, severity = 'blocker', over = {}) => ({ id, severity, category: 'fact', path: 'scene.description', claimId: null, message: `Finding ${id}: the scene description is wrong.`, requiredChange: 'Correct the description.', verification: 'Recompute the value.', ...over });
export const review = (planHash, over = {}) => ({ planHash,
  learning: { goal: text('Explain why acceleration is not zero at the top.'), likelyUnderstanding: text(), visualEvidence: text(), transfer: { prompt: text('A jumper at the top of a jump.'), expectedReasoning: text() }, teachBack: { prompt: text('Explain it to a friend.'), expectedReasoning: text() }, improvement: text(), score: 5 },
  sceneQuality: { accuracy: text(), clarity: text(), modeControls: text(), buildability: text(), score: 5 },
  findings: [], openChecks: [], verdict: 'pass', ...over });
export const revision = (plan, changes = [], unresolvedFindingIds = []) => ({ plan, changes, unresolvedFindingIds });
export const change = (findingId, ...paths) => ({ findingId, paths, explanation: `Changed ${paths.join(', ')} to answer ${findingId}.` });

const reply = (name, input, n) => Response.json({ model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: `t${n}`, name, input }], stop_reason: 'tool_use', usage: { input_tokens: 1000, output_tokens: 500 } });
const TOOLS = { return_scene_plan: 'author', return_design_review: 'review', return_design_revision: 'revise' };

// script: { author(n, input), review(n, input), revise(n, input) } - each returns that role's tool input (a plan, a DesignReview, a DesignRevision), or a Response.
// Defaults: the author returns the Standard fixture, the reviewer passes it, the reviser returns it unchanged. hold(role) parks the next call of a role.
export function scriptedProvider(t, script = {}) {
  const original = globalThis.fetch, log = [], builder = [], gates = {};
  t.after(() => { globalThis.fetch = original; });
  const defaults = {
    author: () => clone(PLAN.standard),
    review: (n, input) => review(input.planHash),
    revise: (n, input) => revision(input.plan),
  };
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body), tool = body.tools?.[0]?.name, role = TOOLS[tool];
    if (!role) { builder.push({ tool, system: typeof body.system === 'string' ? body.system : body.system?.[0]?.text }); return reply(tool || 'x', {}, builder.length); }
    const input = JSON.parse(body.messages[0].content[0].text), n = log.filter(c => c.role === role).length + 1;
    log.push({ role, n, input, model: body.model, toolChoice: body.tool_choice?.type });
    if (gates[role]) { const wait = gates[role]; delete gates[role]; await wait.promise; }
    const out = (script[role] || defaults[role])(n, input);
    return out instanceof Response ? out : reply(tool, out, log.length);
  };
  return { log, builder, roles: () => log.map(c => c.role), count: role => log.filter(c => c.role === role).length,
    hold(role) { let release; const promise = new Promise(r => { release = r; }); gates[role] = { promise }; return () => release(); } };
}

// A new-flow stack: the switch on, the program renderer and stateful programs enabled (the Standard fixture's catalogue), the fixture description fit
// and a counting builder seam. env changes after creation (a switch turned off, the renderer disabled) take effect on the next step.
export function designStack(t, { script, evidence = EVIDENCE, fit = fixtureDescriptionFit, ...options } = {}) {
  const built = [];
  const deps = { descriptionFit: fit, buildScene: async job => { built.push(job.id); return { spec: { marker: 'built' } }; } };
  const stack = explainStack(t, { deps, ...options });
  Object.assign(stack.env, { INTERACT_SCENE_PLAN_ENABLED: 'true', EXPLAIN_PROGRAM_ENABLED: 'true', EXPLAIN_PROGRAM_STATEFUL: 'true' });
  const model = scriptedProvider(t, script);
  const create = (extra = {}) => stack.create({ evidence, ...extra });
  // Advance one alarm at a time until the design stops (awaiting approval) or the job ends, collecting every stage seen.
  const design = async (id, max = 30) => {
    const seen = [];
    for (let i = 0; i < max; i++) {
      await stack.actor.alarm();
      const job = stack.state.data.get(`job:${id}`);
      if (seen.at(-1) !== job.stage) seen.push(job.stage);
      if (['awaiting_approval', 'failed', 'cancelled', 'ready'].includes(job.stage) && !job.inFlight) return { job, seen };
    }
    return { job: stack.state.data.get(`job:${id}`), seen };
  };
  const stored = (id, name, rev = 1) => stack.state.data.get(`design:${id}:${rev}:${name}`);
  const keys = id => [...stack.state.data.keys()].filter(k => k.startsWith(`design:${id}:`));
  return { ...stack, model, built, create, design, stored, keys, deps, rows };
}
