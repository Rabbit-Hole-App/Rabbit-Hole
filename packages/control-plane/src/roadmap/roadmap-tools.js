// DRAFT CONTRACT, unmounted and unreferenced (Tutor ladder R4 contracts lane; docs/features/explain-on-canvas/contracts/planning.md 2, adapter.md 3).
// The capability catalogue and the dispatch allowlist (implementation checklist BASE.02, R4.03 `runRoadmapTool`; v1.3 6.1): a closed,
// typed registry. A capability is offered to the model AND dispatchable only when it is enabled here; a name that is unknown or not yet
// enabled is refused before any handler runs (zero provider calls, no I/O). Later releases append an entry when they qualify; they never
// edit the allowlist of an earlier one. No general SQL, shell, credential or arbitrary-write tool exists, and no tool can authorize
// generation or write assessed observations. Pure: handlers are injected.
import { TOOL_STATUS } from './roadmap-contract.js';
import { ROADMAP_LIMITS } from './roadmap-policy.js';

const freeze = value => Object.freeze(value);
const arg = (type, rest = {}) => freeze({ type, ...rest });

// Tools. enabled:true means shipped and qualified for the release named; enabled:false entries are the planned ladder, listed so a test can
// prove they are refused and absent from the model's catalogue until their own release flips them.
export const CAPABILITIES = freeze([
  freeze({ name: 'read_source', release: 'R4', enabled: true, paid: false, purposes: ['plan', 'revise', 'propose'],
    description: 'Read the declared Markdown scope or an offset range of it, completely, as quoted untrusted data with coverage.',
    args: freeze({ scope: arg('enum', { values: ['declared', 'passage'] }), start: arg('int', { min: 0 }), end: arg('int', { min: 0 }) }), required: freeze(['scope']) }),
  freeze({ name: 'check_claims', release: 'R4', enabled: true, paid: false, purposes: ['check'],
    description: 'Check the card\'s material claims against the cited passage: supports, contradicts or not established.',
    args: freeze({ claims: arg('strings', { max: ROADMAP_LIMITS.summary.claimsPerCard, itemMax: 300 }), resultId: arg('id') }), required: freeze(['claims', 'resultId']) }),
  freeze({ name: 'index_source', release: 'R7a', enabled: false, paid: true }),
  freeze({ name: 'read_pdf_page', release: 'R7b', enabled: false, paid: false }),
  freeze({ name: 'research_gap', release: 'R8a', enabled: false, paid: true }),
  // R8b: opt-in. Offered and dispatchable only when flags.calculate_expression === true (toolFlags(env): ROADMAP_ENABLED and ROADMAP_CALCULATOR both 'true').
  freeze({ name: 'calculate_expression', release: 'R8b', enabled: true, optIn: true, paid: false, purposes: ['propose', 'check'],
    description: 'Evaluate one arithmetic expression over named numeric variables with a restricted deterministic calculator (+ - * / % ^, parentheses, listed functions). Not code execution; assumptions are not checked.',
    args: freeze({ expression: arg('text', { max: 500 }), variables: arg('number_map', { max: 16 }), units: arg('string_map', { max: 16 }), premises: arg('string_map', { max: 16 }), resultUnit: arg('text', { max: 24 }) }), required: freeze(['expression']) }),
  freeze({ name: 'read_learning_evidence', release: 'R9', enabled: false, paid: false }),
  freeze({ name: 'inspect_figure', release: 'R15', enabled: false, paid: true }),
  freeze({ name: 'execute_code', release: 'R16', enabled: false, paid: true }),
]);

// Output formats a roadmap step may name. R4: text and table only. This is the one place the adapter's allowlist is defined
// (adapter.md 3.1): the artifact primitive ids it permits are exactly the enabled entries.
export const FORMATS = freeze([
  freeze({ id: 'explanation', release: 'R4', enabled: true }), freeze({ id: 'table', release: 'R4', enabled: true }),
  ...['code_sample', 'flow_diagram', 'mermaid_diagram', 'interactive_graph', 'data_plot', 'animation', 'image_generate', 'video_generate',
    'maths_animation', 'blender_scene', 'notebook', 'flashcards', 'quiz', 'explain_back'].map(id => freeze({ id, release: id === 'flashcards' || id === 'quiz' || id === 'explain_back' ? 'R9' : 'R12', enabled: false })),
]);
export const ROADMAP_FORMATS = freeze(FORMATS.filter(f => f.enabled).map(f => f.id));
export const isFormatEnabled = id => ROADMAP_FORMATS.includes(id);

// Capability flags (v1.3 4.1): a separate flag disables one capability without touching the others. flags[name] === false turns it off.
export const enabledCapabilities = (flags = {}, caps = CAPABILITIES) => caps.filter(c => c.enabled && (c.optIn ? flags[c.name] === true : flags[c.name] !== false));

// The environment's per-capability switches. An opt-in tool is on only when its own switch AND ROADMAP_ENABLED are exactly 'true'; unset adds nothing.
export const toolFlags = env => ({ ...(env?.ROADMAP_ENABLED === 'true' && env?.ROADMAP_CALCULATOR === 'true' ? { calculate_expression: true } : {}) });

// What the model is shown: only enabled tools with a schema. Disabled tools are omitted, not described.
export function capabilityCatalogue(flags = {}, caps = CAPABILITIES) {
  return enabledCapabilities(flags, caps).filter(c => c.args).map(c => ({ name: c.name, description: c.description,
    input_schema: { type: 'object', additionalProperties: false, required: [...c.required],
      properties: Object.fromEntries(Object.entries(c.args).map(([k, a]) => [k, a.type === 'enum' ? { type: 'string', enum: [...a.values] } : a.type === 'int' ? { type: 'integer', minimum: a.min }
        : a.type === 'strings' ? { type: 'array', maxItems: a.max, items: { type: 'string', maxLength: a.itemMax } }
        : a.type === 'number_map' ? { type: 'object', maxProperties: a.max, additionalProperties: { type: 'number' } }
        : a.type === 'string_map' ? { type: 'object', maxProperties: a.max, additionalProperties: { type: 'string', maxLength: 64 } }
        : a.type === 'text' ? { type: 'string', maxLength: a.max } : { type: 'string' }])) } }));
}

// Dispatch: resolve before running. unknown -> unsupported; known but not enabled -> unavailable (never a silent fallback).
export function resolveToolCall(call, flags = {}, caps = CAPABILITIES) {
  const name = typeof call?.name === 'string' ? call.name : '';
  const cap = caps.find(c => c.name === name);
  if (!cap) return { status: 'unsupported', reason: 'unknown_tool' };
  if (!enabledCapabilities(flags, caps).includes(cap)) return { status: 'unavailable', reason: 'not_enabled', release: cap.release };
  return { status: 'ok', cap };
}

const isMap = (v, spec, ok) => v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).length <= spec.max && Object.entries(v).every(([k, x]) => k.length <= 32 && ok(x));

// -> null when args match the tool's closed schema, else a reason. Unknown keys are refused (a tool's input is data, never authority).
export function argProblem(cap, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return 'args must be an object';
  for (const k of Object.keys(args)) if (!cap.args?.[k]) return `unknown argument ${k}`;
  for (const k of cap.required || []) if (args[k] === undefined) return `missing ${k}`;
  for (const [k, spec] of Object.entries(cap.args || {})) {
    const v = args[k];
    if (v === undefined) continue;
    if (spec.type === 'enum' && !spec.values.includes(v)) return `${k} must be one of ${spec.values.join(', ')}`;
    if (spec.type === 'int' && !(Number.isInteger(v) && v >= spec.min && v <= 1e9)) return `${k} must be a non-negative integer`;
    if (spec.type === 'id' && !(typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v))) return `${k} must be a server id`;
    if (spec.type === 'text' && !(typeof v === 'string' && v.length > 0 && v.length <= spec.max)) return `${k} must be 1-${spec.max} characters`;
    if ((spec.type === 'number_map' || spec.type === 'string_map') && !isMap(v, spec, spec.type === 'number_map' ? x => typeof x === 'number' && Number.isFinite(x) : x => typeof x === 'string' && x.length > 0 && x.length <= 64)) return `${k} must be a map of at most ${spec.max} entries`;
    if (spec.type === 'strings' && !(Array.isArray(v) && v.length >= 1 && v.length <= spec.max && v.every(s => typeof s === 'string' && s.length > 0 && s.length <= spec.itemMax))) return `${k} must be 1-${spec.max} short strings`;
  }
  return null;
}

// runRoadmapTool(call, { handlers, flags, purpose, budget }) -> { status, ... }. budget = { used } counts calls against calls.toolCallsPerPlan.
// A refusal never invokes a handler. A handler result must carry one of TOOL_STATUS; anything else, or a throw, is `unavailable`.
export async function runRoadmapTool(call, { handlers = {}, flags = {}, purpose = 'plan', budget = { used: 0 }, caps = CAPABILITIES, limits = ROADMAP_LIMITS } = {}) {
  const resolved = resolveToolCall(call, flags, caps);
  if (resolved.status !== 'ok') return resolved;
  const { cap } = resolved;
  if (cap.paid) return { status: 'unavailable', reason: 'paid_tool_needs_acceptance' }; // a tool call can never supply a purchase authorization
  if (!cap.purposes?.includes(purpose)) return { status: 'unsupported', reason: 'wrong_purpose' };
  if ((budget.used ?? 0) >= limits.calls.toolCallsPerPlan) return { status: 'unavailable', reason: 'tool_budget_exhausted' };
  const problem = argProblem(cap, call.args);
  if (problem) return { status: 'unsupported', reason: 'bad_arguments', detail: problem };
  const handler = handlers[cap.name];
  if (typeof handler !== 'function') return { status: 'unavailable', reason: 'no_handler' };
  budget.used = (budget.used ?? 0) + 1;
  try {
    const out = await handler(call.args);
    return out && TOOL_STATUS.includes(out.status) ? out : { status: 'unavailable', reason: 'invalid_tool_result' };
  } catch { return { status: 'unavailable', reason: 'handler_failed' }; }
}
