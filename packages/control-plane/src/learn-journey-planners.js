// packages/control-plane/src/learn-journey-planners.js
// The journey planners (architecture §6.3-§6.5, §7.2 rule 5, §11): planDiagnostic, planPath, adaptPath, planSection and
// resolveWithModel, each (env, input, { callModel }) with callModel(env, body, model, org) as learn-tutor-routes.js
// passes it to anthropic(). One call offers one tool on tool_choice auto: claude-opus-5-5 refuses a forced tool, as
// plannerRequest (agents/learn-tutor.js) documents. A reply without that tool call, or one the validators in
// agents/learn-journey.js reject, throws PlannerInvalid; the route then keeps the journey and every answer and shows a
// retryable error (§6.6), never cards.
//
// Inputs are sent to the model whole, as data. states (planPath, adaptPath, planSection) maps a claim id to
// { state, settled_passes, settled_negatives }: the derived state plus settled counts, never a score. evidence (adaptPath)
// is { claims: [ids], refs: [seq] }.
import { anthropic } from './ask.js';
import { modelFailure } from './learn-research.js';
import { sha256 } from './token.js';
import { JOURNEY_SYSTEMS, JOURNEY_TOOLS, diagnosticOutput, pathOutput, resolverOutput, sectionOutput } from './agents/learn-journey.js';
import { fixtureModel } from './learn-journey-fixtures.js';

// The five journey roles in the LEARN_TASKS entry shape (learn-models.js), plus effort (output_config.effort; null is the
// model default). They live here while the Tutor-core files are paused (R6); Task 7 moves them into LEARN_TASKS.
export const JOURNEY_TASKS = Object.freeze({
  // Resolver rule 5: a tray message the deterministic rules missed -> one of the five kinds.
  journey_resolver: Object.freeze({ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 300 }),
  // The registry and the probe ladder (+ one background question).
  journey_diagnostic: Object.freeze({ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 3000 }),
  // The first path draft, and the escalation target of journey_adapt.
  journey_path: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', effort: null, picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 4000 }),
  // The current section's SectionPlan.
  journey_section: Object.freeze({ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 3000 }),
  // Path revisions and adaptations.
  journey_adapt: Object.freeze({ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 4000 }),
});

export class PlannerInvalid extends Error {
  constructor(role, errors) {
    super(`The ${role} planner returned an invalid plan: ${errors.slice(0, 3).join('; ')}`);
    this.name = 'PlannerInvalid';
    this.role = role;
    this.errors = errors;
  }
}

// loggedModel's sanitized line (learn-models.js, models-11) for the journey roles, which its LEARN_TASKS lookup cannot
// see yet: task, requested and served model, never the message, the input, tool input or a key. The task is the one
// tool's name (JOURNEY_TOOLS names each tool after its role).
// ponytail: a copy of loggedModel's line while R6 pauses learn-models.js; Task 7 swaps it for loggedModel(role, anthropic).
export function journeyLogged(callModel) {
  return async (env, body, model, org) => {
    const response = await callModel(env, body, model, org);
    try {
      const task = body.tools?.[0]?.name, result = response.ok ? await response.clone().json() : null;
      console.log(JSON.stringify({
        event: 'learn_model', task, provider: env.SUBSCRIPTION_ONLY === 'true' ? 'subscription' : 'anthropic',
        requested: model ?? 'auto', source: model == null ? 'auto' : model === JOURNEY_TASKS[task]?.model ? 'task' : 'request', fallback: 'none',
        served: result?.model ?? null, fellBack: !!result?.usage?.iterations?.some(step => step.type === 'fallback_message'),
        prompt: (await sha256(String(body.system ?? ''))).slice(0, 12), status: response.status, stopReason: result?.stop_reason ?? null,
      }));
    } catch { /* a log line is never worth a failed plan */ }
    return response;
  };
}
const LOGGED = journeyLogged(anthropic);

// Fixtures only on a local test worker that asks for them (§11, like OAUTH_MOCK): never a paid call in tests or e2e.
export const journeyCallModel = env => (env.SMALL_ENV === 'test' && env.JOURNEY_MODEL_STUB === 'fixtures' ? fixtureModel : LOGGED);

async function callRole(env, role, input, callModel) {
  const task = JOURNEY_TASKS[role];
  const response = await callModel(env, {
    max_tokens: task.maxTokens,
    ...(task.effort ? { output_config: { effort: task.effort } } : {}),
    system: JOURNEY_SYSTEMS[role],
    tools: [JOURNEY_TOOLS[role]],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: `input = ${JSON.stringify(input)}` }],
  }, task.model, null);
  if (!response.ok) throw await modelFailure(response, 'The journey planner is unavailable');
  const call = (await response.json()).content?.find(block => block.type === 'tool_use' && block.name === role);
  if (call?.input == null || typeof call.input !== 'object' || Array.isArray(call.input)) throw new PlannerInvalid(role, ['the reply has no tool call']);
  return call.input;
}
const valid = (role, checked) => { if (!checked.ok) throw new PlannerInvalid(role, checked.errors); return checked.value; };
const invalidAs = fallback => error => { if (error instanceof PlannerInvalid) return fallback; throw error; };

// input { topic, intake, grounding } -> { registry, probes, background? }; each mcq/prediction probe carries its key.
export async function planDiagnostic(env, input, { callModel = journeyCallModel(env) } = {}) {
  return valid('journey_diagnostic', diagnosticOutput(await callRole(env, 'journey_diagnostic', input, callModel)));
}

// input { topic, intake, states, constraints, pending_edits, registry } -> { path (version 1, change.source draft), concepts_added }.
export async function planPath(env, input, { callModel = journeyCallModel(env) } = {}) {
  return valid('journey_path', pathOutput(await callRole(env, 'journey_path', input, callModel), { registry: input.registry, source: 'draft' }));
}

// input { prev, edit | evidence, registry, states } -> { path, concepts_added, ambiguous, escalated }. journey_adapt
// first; journey_path (escalated: validator | ambiguous | contradictory) when the validators reject the adapt reply (no
// tool call included), when it says ambiguous: true, or when the evidence the change rests on is contradictory: an
// uncertain claim with both settled passes and settled negatives (§6.4). Contradiction is known before any call, so it
// goes straight to journey_path instead of paying for an adapt reply it would throw away. Evidence rests on its claims; a
// learner edit rests on the whole state map the planner reads.
export async function adaptPath(env, input, { callModel = journeyCallModel(env) } = {}) {
  const check = out => pathOutput(out, { prev: input.prev, registry: input.registry, source: input.evidence ? 'evidence' : 'learner_edit' });
  const contradictory = (input.evidence?.claims ?? Object.keys(input.states || {})).some(id => {
    const s = input.states?.[id];
    return s?.state === 'uncertain' && s.settled_passes > 0 && s.settled_negatives > 0;
  });
  let escalated = 'contradictory';
  if (!contradictory) {
    const out = await callRole(env, 'journey_adapt', input, callModel).catch(invalidAs(null));
    const checked = out && check(out);
    if (checked?.ok && out.ambiguous !== true) return { ...checked.value, ambiguous: false, escalated: null };
    escalated = checked?.ok ? 'ambiguous' : 'validator';
  }
  const out = await callRole(env, 'journey_path', input, callModel);
  return { ...valid('journey_path', check(out)), ambiguous: out.ambiguous === true, escalated };
}

// input { path, section, registry, states } -> the §9.3 SectionPlan for section.id.
export async function planSection(env, input, { callModel = journeyCallModel(env) } = {}) {
  return valid('journey_section', sectionOutput(await callRole(env, 'journey_section', input, callModel), input));
}

// Resolver rule 5 (§7.2): input { text, tray } -> { kind, option_id? }. Only the tray's mode, prompt, options and
// free_text reach the model. A reply with no tool call is clarification_needed, like any unknown kind.
export async function resolveWithModel(env, { text, tray }, { callModel = journeyCallModel(env) } = {}) {
  const t = { mode: tray?.mode ?? null, prompt: tray?.prompt ?? null, options: (tray?.options || []).map(({ id, label }) => ({ id, label })), free_text: !!tray?.free_text };
  return resolverOutput(await callRole(env, 'journey_resolver', { text, tray: t }, callModel).catch(invalidAs(null)), t);
}
