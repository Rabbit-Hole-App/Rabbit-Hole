// packages/control-plane/src/learn-next-steps-planner.js
// The hook planner behind Professor Next Steps (docs/features/professor-next-steps.md §2.4), and the one model-call helper it shares
// with the journey planners (learn-journey-planners.js, deleted in the Tutor cleanup P4): callRole offers one tool on tool_choice
// auto (claude-opus-5-5 refuses a forced tool), a reply without that tool call, or one a validator rejects, throws PlannerInvalid.
// callModel(env, body, model, org) is the same shape the routes pass to anthropic().
import { anthropic } from './ask.js';
import { modelFailure } from './learn-research.js';
import { LEARN_TASKS, costUsd, loggedModel, promptVersion } from './learn-models.js';
import { NEXT_STEPS_PLANNER_VERSION, NEXT_STEPS_SYSTEM, NEXT_STEPS_TOOL, nextStepsOutput, words } from './agents/learn-next-steps.js';
import { fixtureModel } from './learn-next-steps-fixtures.js';
import { normalizeToolInput } from './tool-input.js';
import { withAttemptKind } from './learn-usage.js';

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
export async function callRole(env, role, input, callModel, { tool, system, failure, onReply = null }) {
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
export const valid = (role, checked) => { if (!checked.ok) throw new PlannerInvalid(role, checked.errors); return checked.value; };
export const invalidAs = fallback => error => { if (error instanceof PlannerInvalid) return fallback; throw error; };

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
  const ask = role => callRole(role === 'tutor_next_steps_escalation' ? withAttemptKind(env, 'escalation') : env, role, input, callModel, { tool: NEXT_STEPS_TOOL, system: NEXT_STEPS_SYSTEM, failure: 'The next steps planner is unavailable', onReply: result => onReply(role, result) });
  // rejected_words: the word count of each hook in a routine reply the validator refused (numbers only, never a hook; Tutor eval
  // run A saw hook_words without knowing over or under), else null.
  let rejected = null;
  const done = async (options, role, escalated, errors = []) => ({ options, telemetry: {
    tier: escalated ? 'escalation' : 'routine', escalated, calls, ms: Date.now() - started, planner_version: NEXT_STEPS_PLANNER_VERSION, model_role: role, model_id: served,
    // Task 14 D-M4: a failed hash is unknown (null), never the recompute's error, as on the Tutor path.
    prompt_version: await promptVersion(NEXT_STEPS_SYSTEM, [NEXT_STEPS_TOOL]).catch(() => null), usage, cost_usd: cost, reasons: options.filter(o => o.reason_internal).length, errors, rejected_words: rejected } });
  const contradictory = Object.values(input.scope?.claims || {}).some(c => c?.state === 'uncertain' && c.settled_passes > 0 && c.settled_negatives > 0);
  let escalated = 'contradictory', errors = [];
  if (!contradictory) {
    const out = await ask('tutor_next_steps').catch(invalidAs(null));
    const checked = out && nextStepsOutput(out, input);
    if (checked?.ok && out.ambiguous !== true) return done(checked.value, 'tutor_next_steps', null);
    escalated = !out ? 'no_tool' : checked.ok ? 'ambiguous' : 'validator';
    errors = [...new Set((checked?.errors || []).map(e => e.replace(/^option \d+: /, '')))];
    if (escalated === 'validator' && Array.isArray(out.options)) rejected = out.options.map(o => (typeof o?.hook === 'string' ? words(o.hook).length : null));
  }
  let last = null;
  try {
    const out = await ask('tutor_next_steps_escalation');
    last = nextStepsOutput(out, input);
    return done(valid('tutor_next_steps_escalation', last), 'tutor_next_steps_escalation', escalated, errors);
  } catch (error) {
    // A set whose escalation fails too: the telemetry rides on the error for the stored row (learn-next-steps-routes.js), never
    // the 502 body; escalation_errors are the escalation's own rule names ([] with no tool call or a transport failure).
    error.telemetry = { ...(await done([], 'tutor_next_steps_escalation', escalated, errors)).telemetry, failed: true, escalation_errors: [...new Set((last?.errors || []).map(e => e.replace(/^option \d+: /, '')))] };
    throw error;
  }
}
