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
import { LEARN_TASKS, costUsd, loggedModel, promptVersion } from './learn-models.js';
import { JOURNEY_SYSTEMS, JOURNEY_TOOLS, diagnosticOutput, pathOutput, resolverOutput, sectionOutput } from './agents/learn-journey.js';
import { NEXT_STEPS_PLANNER_VERSION, NEXT_STEPS_SYSTEM, NEXT_STEPS_TOOL, nextStepsOutput } from './agents/learn-next-steps.js';
import { fixtureModel } from './learn-journey-fixtures.js';
import { normalizeToolInput } from './tool-input.js';

// The five journey roles are LEARN_TASKS entries (learn-models.js): journey_resolver, journey_diagnostic, journey_path,
// journey_section and journey_adapt, each with effort (output_config.effort; null is the model default).

export class PlannerInvalid extends Error {
  constructor(role, errors) {
    super(`The ${role} planner returned an invalid plan: ${errors.slice(0, 3).join('; ')}`);
    this.name = 'PlannerInvalid';
    this.role = role;
    this.errors = errors;
  }
}

// loggedModel's sanitized line (learn-models.js, models-11) for the role of each call: task, requested and served model,
// never the message, the input, tool input or a key. One callModel serves every role: callRole passes the role as a fifth
// argument, and without one it is the one tool's name (JOURNEY_TOOLS names each tool after its role).
export const journeyLogged = callModel => (env, body, model, org, role = body.tools?.[0]?.name) => loggedModel(role, callModel)(env, body, model, org);
const LOGGED = journeyLogged(anthropic);

// Fixtures only on a local test worker that asks for them (§11, like OAUTH_MOCK): never a paid call in tests or e2e.
export const journeyCallModel = env => (env.SMALL_ENV === 'test' && env.JOURNEY_MODEL_STUB === 'fixtures' ? fixtureModel : LOGGED);

// The role's system text is a static prefix (agents/learn-journey.js), so it goes as one cacheable block, as the Tutor
// planner's does (learn-tutor-routes.js): render order is tools -> system -> messages, so the cache holds the tool schema
// and the prompt, never the input. Never under SUBSCRIPTION_ONLY, whose bridge's handling of a cached block is unverified.
// A role whose tool is not named after it (the hook planner) passes its tool, system and HTTP failure label; onReply sees
// every parsed reply body ({ model, usage }), one without the tool call included, for telemetry.
async function callRole(env, role, input, callModel, { tool = JOURNEY_TOOLS[role], system = JOURNEY_SYSTEMS[role], failure = 'The journey planner is unavailable', onReply = null } = {}) {
  const task = LEARN_TASKS[role], text = system;
  const response = await callModel(env, {
    max_tokens: task.maxTokens,
    ...(task.effort ? { output_config: { effort: task.effort } } : {}),
    system: env.SUBSCRIPTION_ONLY === 'true' ? text : [{ type: 'text', text, cache_control: { type: 'ephemeral' } }],
    tools: [tool],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: `input = ${JSON.stringify(input)}` }],
  }, task.model, null, role);
  if (!response.ok) throw await modelFailure(response, failure);
  // A body that is not JSON, or has no content list, is a reply with no tool call.
  const result = await response.json().catch(() => null);
  onReply?.(result);
  const content = result?.content;
  const call = Array.isArray(content) ? content.find(block => block?.type === 'tool_use' && block.name === tool.name) : null;
  if (call?.input == null || typeof call.input !== 'object' || Array.isArray(call.input)) throw new PlannerInvalid(role, ['the reply has no tool call']);
  // An array or object the model sent as a JSON string is parsed once, by the tool's schema (tool-input.js); the
  // validators then judge the result unchanged.
  return normalizeToolInput(tool.input_schema, call.input);
}
const valid = (role, checked) => { if (!checked.ok) throw new PlannerInvalid(role, checked.errors); return checked.value; };
const invalidAs = fallback => error => { if (error instanceof PlannerInvalid) return fallback; throw error; };

// input { topic, intake, grounding } -> { registry, probes, background? }; each mcq/prediction probe carries its key.
export async function planDiagnostic(env, input, { callModel = journeyCallModel(env) } = {}) {
  return valid('journey_diagnostic', diagnosticOutput(await callRole(env, 'journey_diagnostic', input, callModel)));
}

// input { topic, intake, states, constraints, pending_edits, registry, diagnostic_evidence_refs?, max_sections? } -> { path
// (version 1, change.source draft, the input's diagnostic_evidence_refs), concepts_added }. A draft longer than
// max_sections (a quick overview: 3) is PlannerInvalid.
export async function planPath(env, input, { callModel = journeyCallModel(env) } = {}) {
  const out = await callRole(env, 'journey_path', input, callModel);
  return valid('journey_path', pathOutput(out, { registry: input.registry, source: 'draft', diagnostic_evidence_refs: input.diagnostic_evidence_refs ?? [], max_sections: input.max_sections ?? null }));
}

// input { prev, edit | evidence, registry, states } -> { path, concepts_added, ambiguous, escalated }. journey_adapt
// first; journey_path (escalated: validator | ambiguous | contradictory) when the validators reject the adapt reply (no
// tool call included), when it says ambiguous: true, or, for an evidence-driven adaptation only, when the evidence it
// rests on is contradictory: one of evidence.claims is uncertain with both settled passes and settled negatives (§6.4).
// Contradiction is known before any call, so it goes straight to journey_path instead of paying for an adapt reply it
// would throw away. A learner edit escalates only on a rejection or ambiguity (controller ruling, Task 4 review round 1).
// change.evidence_refs is evidence.refs; the model never sets it.
export async function adaptPath(env, input, { callModel = journeyCallModel(env) } = {}) {
  const check = out => pathOutput(out, { prev: input.prev, registry: input.registry, source: input.evidence ? 'evidence' : 'learner_edit', evidence_refs: input.evidence?.refs ?? [] });
  const contradictory = !!input.evidence && (input.evidence.claims ?? []).some(id => {
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

// Professor Next Steps (docs/features/professor-next-steps.md §2.4): Sonnet first, then Opus once on no tool call, a
// validator failure or ambiguous: true; straight to Opus when a scope claim contradicts itself (uncertain with settled
// passes and negatives, the adaptPath rule). Never JEV, never an evaluate route: callModel is the only dependency. An Opus
// failure throws PlannerInvalid. -> { options (with reason_internal: the route strips it), telemetry }; telemetry.errors
// are the first reply's validator rule names, never its text; cost_usd prices each call at its role's model.
// ponytail: no deadline here (Task 14 A-M1): the Opus escalation (maxTokens 4000) starts however long Sonnet took, so the worst
// case is the two calls back to back. The browser bounds its wait (LearnNextSteps.jsx, 60 s); add a start-time check that skips
// the escalation after about 30 s and answers the 502 failed path if server time or cost on hung calls ever matters.
export async function planNextSteps(env, input, { callModel = journeyCallModel(env) } = {}) {
  const started = Date.now(), usage = { input_tokens: null, output_tokens: null, cache_creation_input_tokens: null, cache_read_input_tokens: null };
  let calls = 0, served = null, cost = null;
  const onReply = (role, result) => {
    calls += 1; served = result?.model ?? null;
    for (const k of Object.keys(usage)) if (typeof result?.usage?.[k] === 'number') usage[k] = (usage[k] ?? 0) + result.usage[k]; // never reported: null, not 0
    const c = result?.usage ? costUsd({ model: LEARN_TASKS[role].model, ...result.usage }) : null; // no usage, no known cost
    cost = c == null ? cost : +((cost || 0) + c).toFixed(6);
  };
  const ask = role => callRole(env, role, input, callModel, { tool: NEXT_STEPS_TOOL, system: NEXT_STEPS_SYSTEM, failure: 'The next steps planner is unavailable', onReply: result => onReply(role, result) });
  const done = async (options, role, escalated, errors = []) => ({ options, telemetry: {
    tier: escalated ? 'escalation' : 'routine', escalated, calls, ms: Date.now() - started, planner_version: NEXT_STEPS_PLANNER_VERSION, model_role: role, model_id: served,
    // Task 14 D-M4: a failed hash is unknown (null), never the recompute's error, as on the Tutor path.
    prompt_version: await promptVersion(NEXT_STEPS_SYSTEM, [NEXT_STEPS_TOOL]).catch(() => null), usage, cost_usd: cost, reasons: options.filter(o => o.reason_internal).length, errors } });
  const contradictory = Object.values(input.scope?.claims || {}).some(c => c?.state === 'uncertain' && c.settled_passes > 0 && c.settled_negatives > 0);
  let escalated = 'contradictory', errors = [];
  if (!contradictory) {
    const out = await ask('tutor_next_steps').catch(invalidAs(null));
    const checked = out && nextStepsOutput(out, input);
    if (checked?.ok && out.ambiguous !== true) return done(checked.value, 'tutor_next_steps', null);
    escalated = !out ? 'no_tool' : checked.ok ? 'ambiguous' : 'validator';
    errors = [...new Set((checked?.errors || []).map(e => e.replace(/^option \d+: /, '')))];
  }
  const out = await ask('tutor_next_steps_escalation');
  return done(valid('tutor_next_steps_escalation', nextStepsOutput(out, input)), 'tutor_next_steps_escalation', escalated, errors);
}
