// /interact model adapters (INT-07A, docs/features/interact.md section 5 "Model roles, profiles and bounded calls").
// Adapter interface: adapter.call({ config, system, schema, input, images, signal, name, description }) -> one normalized result
//   { output, requested: { provider, model }, served: { provider, model | null }, usage, timing: { ms }, stopReason, stopRaw }.
// An adapter is built around an injected transport, so nothing here can reach a provider on its own: the Anthropic adapter wraps the
// job's ADMITTED callModel(env, body, model, org); the OpenAI-compatible adapter wraps an injected fetch. There is no default
// transport for either. Only the server-resolved role config (interact-models.js) chooses a model, URL or credential name.
// A leaf for interact-models.js: it imports no profile code. New flow only; the legacy /explain request builders are untouched.
import { ExplainPolicyError } from './explain-policy.js';
import { loggedModel } from './learn-models.js';
import { providerUnavailable, requestSpendBound } from './learn-spend.js';
import { anthropicQuantities } from './pricing-registry.js';
import { normalizeToolInput } from './tool-input.js';

// code names the recorded reason. sent: false when nothing left the Worker (a preflight refusal), true once a request was made.
export class InteractModelError extends ExplainPolicyError {
  constructor(code, message, extra = {}) { super(code, message, extra); this.name = 'InteractModelError'; }
}
const refuse = (code, message, extra) => new InteractModelError(code, message, { sent: false, ...extra });

const clockNow = () => Date.now();
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
// Key-sorted JSON, so two results that differ only in key order are the same result.
export const canonical = v => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : isObject(v) ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v));

// ---- JSON Schema subset ----
// shortcut: a validator for the keywords the /interact schemas use. Any other structural keyword (allOf, not, if, patternProperties...)
// is refused instead of ignored (a local #/ $ref is resolved), so a schema this checker cannot enforce never passes silently. Upgrade when a plan schema needs one.
const ANNOTATIONS = new Set(['description', 'title', 'default', 'examples', 'format', '$schema', '$id', '$comment']);
const KEYWORDS = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'anyOf', 'oneOf', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern',
  '$ref', '$defs', 'propertyNames', 'exclusiveMinimum']); // the last four: what the ScenePlan/DesignReview schemas (zod toJSONSchema + the recursive ScalarExpr def) emit
const typeOk = (type, v) => (type === 'null' ? v === null : type === 'array' ? Array.isArray(v) : type === 'object' ? isObject(v) : type === 'integer' ? Number.isInteger(v) : type === 'number' ? typeof v === 'number' && Number.isFinite(v) : typeof v === type);

// -> list of problems (schema paths and constraints only, never the content). Empty when the value matches.
export function schemaProblems(schema, value, path = '$', root = schema) {
  if (schema === true || schema == null) return [];
  if (!isObject(schema)) throw refuse('unsupported_schema', `Schema at ${path} is not an object.`);
  for (const key of Object.keys(schema)) if (!KEYWORDS.has(key) && !ANNOTATIONS.has(key)) throw refuse('unsupported_schema', `Schema keyword ${key} at ${path} is not supported.`);
  if (schema.$ref !== undefined) { // a local reference only (#/$defs/Name); one that does not resolve is refused, never ignored
    const target = typeof schema.$ref === 'string' && schema.$ref.startsWith('#/') ? schema.$ref.slice(2).split('/').reduce((node, key) => (isObject(node) ? node[key] : undefined), root) : undefined;
    if (!isObject(target)) throw refuse('unsupported_schema', `Schema reference ${String(schema.$ref).slice(0, 60)} at ${path} does not resolve.`);
    return schemaProblems(target, value, path, root);
  }
  const out = [], types = [].concat(schema.type ?? []);
  if (types.length && !types.some(t => typeOk(t, value))) return [`${path}: expected ${types.join(' or ')}`];
  if (schema.enum && !schema.enum.some(e => canonical(e) === canonical(value))) out.push(`${path}: not one of the allowed values`);
  if ('const' in schema && canonical(schema.const) !== canonical(value)) out.push(`${path}: not the required constant`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) out.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) out.push(`${path}: longer than ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) out.push(`${path}: does not match its pattern`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) out.push(`${path}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) out.push(`${path}: above ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) out.push(`${path}: not above ${schema.exclusiveMinimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) out.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) out.push(`${path}: more than ${schema.maxItems} items`);
    if (schema.items) value.forEach((item, i) => out.push(...schemaProblems(schema.items, item, `${path}[${i}]`, root)));
  } else if (isObject(value)) {
    if (schema.propertyNames) for (const key of Object.keys(value)) out.push(...schemaProblems(schema.propertyNames, key, `${path}.${key} (name)`, root));
    for (const key of schema.required || []) if (!(key in value)) out.push(`${path}.${key}: required`);
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key]) out.push(...schemaProblems(schema.properties[key], item, `${path}.${key}`, root));
      else if (schema.additionalProperties === false) out.push(`${path}.${key}: not an allowed field`);
      else if (isObject(schema.additionalProperties)) out.push(...schemaProblems(schema.additionalProperties, item, `${path}.${key}`, root));
    }
  }
  if (schema.anyOf && !schema.anyOf.some(s => !schemaProblems(s, value, path, root).length)) out.push(`${path}: matches none of the alternatives`);
  if (schema.oneOf) {
    const matches = schema.oneOf.filter(s => !schemaProblems(s, value, path, root).length).length;
    if (matches !== 1) out.push(`${path}: matches ${matches} of the exclusive alternatives, not exactly one`);
  }
  return out;
}

// The schema keywords that hold sub-schemas, walked by key meaning so a property that happens to be NAMED oneOf is never rewritten.
const MAPS = ['properties', '$defs', 'definitions'], LISTS = ['anyOf', 'allOf', 'oneOf'], SINGLES = ['items', 'additionalProperties', 'not'];
export const usesOneOf = schema => !!schema && typeof schema === 'object' && (Array.isArray(schema) ? schema.some(usesOneOf)
  : 'oneOf' in schema || MAPS.some(k => isObject(schema[k]) && Object.values(schema[k]).some(usesOneOf)) || LISTS.some(k => Array.isArray(schema[k]) && schema[k].some(usesOneOf)) || SINGLES.some(k => usesOneOf(schema[k])));

// Provably exclusive: every alternative is an object that REQUIRES one shared property pinned to its own const (or one-value enum).
// Anything weaker could let one value match two branches, so anyOf would mean something different from oneOf.
function exclusiveKey(branches) {
  if (!Array.isArray(branches) || branches.length < 2) return null;
  const pinned = branch => Object.entries(isObject(branch?.properties) ? branch.properties : {})
    .filter(([key, s]) => branch.type === 'object' && (branch.required || []).includes(key) && (s && (s.const !== undefined || (Array.isArray(s.enum) && s.enum.length === 1)))).map(([key, s]) => [key, canonical(s.const !== undefined ? s.const : s.enum[0])]);
  const lists = branches.map(pinned), shared = lists[0].map(([k]) => k).filter(k => lists.every(l => l.some(([key]) => key === k)));
  return shared.find(k => new Set(lists.map(l => l.find(([key]) => key === k)[1])).size === branches.length) ?? null;
}
// What is SENT to a provider that refuses oneOf in a strict schema. The returned data is still validated against the ORIGINAL schema.
export function exclusiveOneOfToAnyOf(schema, path = '$') {
  if (!isObject(schema)) return schema;
  const out = { ...schema };
  for (const k of MAPS) if (isObject(schema[k])) out[k] = Object.fromEntries(Object.entries(schema[k]).map(([name, s]) => [name, exclusiveOneOfToAnyOf(s, `${path}.${name}`)]));
  for (const k of LISTS) if (Array.isArray(schema[k])) out[k] = schema[k].map((s, i) => exclusiveOneOfToAnyOf(s, `${path}.${k}[${i}]`));
  for (const k of SINGLES) if (isObject(schema[k])) out[k] = exclusiveOneOfToAnyOf(schema[k], `${path}.${k}`);
  if (!out.oneOf) return out;
  if (!exclusiveKey(out.oneOf)) throw refuse('schema_not_exclusive', `The oneOf at ${path} is not provably exclusive (needs one required const property that differs in every alternative); it is refused, not weakened to anyOf.`);
  const { oneOf, ...rest } = out;
  return { ...rest, anyOf: oneOf };
}

// ---- Result normalization (C05) ----
// candidates: [{ source, text? | value? }] - every structured result the response carried (tool calls and/or message content).
// truncated / refused: the provider's own stop signals. -> the ONE validated output object, or a thrown InteractModelError whose code is
// the recorded reason. Nothing is repaired: no fence stripping, no trailing-text trimming, no comma fixing, no default filling.
export function normalizeStructured({ candidates, schema, truncated = false, refused = false, sanitize = null }) {
  const bad = (code, message) => new InteractModelError(code, message, { sent: true });
  if (refused) throw bad('refused', 'The model declined to answer.');
  if (truncated) throw bad('truncated', 'The model reply was cut off at its output limit.');
  const parsed = [];
  for (const c of candidates) {
    let value = c.value;
    if (c.text !== undefined) {
      const text = String(c.text).trim();
      if (/^```/.test(text)) throw bad('fenced_json', `The ${c.source} was wrapped in a code fence.`);
      try { value = JSON.parse(text); } catch { throw bad('malformed_json', `The ${c.source} was not a single JSON value.`); }
    }
    parsed.push(value);
  }
  const distinct = [...new Map(parsed.map(v => [canonical(v), v])).values()];
  if (!distinct.length) throw bad('no_result', 'The model reply held no structured result.');
  if (distinct.length > 1) throw bad('conflicting_results', `The model reply held ${distinct.length} different structured results.`);
  let output = normalizeToolInput(schema, distinct[0]); // the schema-directed JSON-string unwrapping the tools already get
  // One syntactic slip is accepted (seen from real Opus runs, about one call in three): the whole result nested under a single key the schema does not define, {"plan": {...}}.
  // It is unwrapped only when the inner value then satisfies the schema in full; anything else stays a schema_mismatch. No field is added, removed or changed.
  if (isObject(output) && isObject(schema?.properties) && Object.keys(output).length === 1) {
    const [key, inner] = Object.entries(output)[0];
    if (!Object.hasOwn(schema.properties, key) && isObject(inner)) { const candidate = normalizeToolInput(schema, inner); if (isObject(candidate) && schemaProblems(schema, candidate).length === 0) output = candidate; }
  }
  if (sanitize && isObject(output)) output = sanitize(output); // fast models only (capabilities.sanitize): undeclared keys and double-escaped line breaks are fixed here, never by a repair call
  if (!isObject(output)) throw bad('not_object', 'The structured result was not an object.');
  const problems = schemaProblems(schema, output);
  if (problems.length) throw bad('schema_mismatch', `The structured result does not match its schema: ${problems.slice(0, 5).join('; ')}`, { problems: problems.slice(0, 20) });
  return output;
}

// ---- Shared pieces ----
const MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
// images: [{ media_type, data }] base64 only. Anything else is refused before a request exists.
function checkImages(images) {
  for (const image of images || []) if (!MEDIA_TYPES.includes(image?.media_type) || typeof image?.data !== 'string' || !image.data) throw refuse('image_unsupported', 'An image must be base64 png, jpeg, webp or gif.');
}
const inputText = input => (typeof input === 'string' ? input : JSON.stringify(input));
const stopOf = raw => (['tool_use', 'end_turn', 'stop', 'stop_sequence', 'tool_calls'].includes(raw) ? 'complete' : ['max_tokens', 'length'].includes(raw) ? 'truncated' : ['refusal', 'content_filter'].includes(raw) ? 'refusal' : raw ?? 'unknown');
// A provider's HTTP failure as an explicit error. Nothing here retries or substitutes a model.
async function httpFailure(response, label) {
  const body = await response.clone().json().catch(() => null);
  if ([429, 503].includes(response.status) && ['allowance_limited', 'spend_limited'].includes(body?.code)) return new InteractModelError('spend_refused', body.error || 'AI is not available right now.', { sent: false, status: response.status, reason: body.reason ?? null });
  if (await providerUnavailable(response)) return new InteractModelError('provider_unavailable', 'The AI provider is temporarily unavailable. Nothing ran.', { sent: true, refusedByProvider: true, providerStatus: response.status });
  if (response.status === 404) return new InteractModelError('model_unavailable', `${label} is not available right now. Nothing else was used.`, { sent: true, providerStatus: 404 });
  const detail = body?.error?.message;
  return new InteractModelError('http_error', `${label} failed (HTTP ${response.status}${detail ? `: ${String(detail).slice(0, 160)}` : ''}).`, { sent: true, providerStatus: response.status });
}
// An abort (timeout or cancellation) settles a pending transport promise at once; the provider may still have accepted the request.
const raced = (promise, signal) => (!signal ? promise : new Promise((resolve, reject) => {
  const abort = () => reject(Object.assign(new Error('aborted'), { aborted: true }));
  if (signal.aborted) return abort();
  signal.addEventListener('abort', abort, { once: true });
  promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
}));

// ---- Anthropic (C03) ----
// Wraps the job's admitted callModel(env, body, model, org). The body is the same one-tool-on-auto request the /explain roles send
// (cached system block, no thinking, no fallbacks, no betas); the reply must carry exactly the offered tool. Usage keeps the registry's
// categories (anthropicQuantities), so cache read and write are priced as they are today.
export function createAnthropicAdapter({ env = {}, callModel, clock = clockNow } = {}) {
  return {
    name: 'anthropic',
    async call({ config, system, schema, input, images = [], signal, name = 'return_result', description = 'Return the result.' }) {
      if (typeof callModel !== 'function') throw refuse('no_transport', 'The Anthropic adapter has no admitted model transport.');
      if (schema?.type !== 'object') throw refuse('unsupported_schema', 'A tool schema must describe an object.');
      checkImages(images);
      const tool = { name, description, input_schema: schema };
      const blocks = [{ type: 'text', text: inputText(input) }, ...images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.media_type, data: i.data } }))];
      const body = {
        max_tokens: config.maxOutputTokens,
        system: env.SUBSCRIPTION_ONLY === 'true' ? system : [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools: [tool], tool_choice: { type: 'auto' },
        ...(config.settings?.effort ? { output_config: { effort: config.settings.effort } } : {}),
        messages: [{ role: 'user', content: blocks }],
      };
      const bound = requestSpendBound(body, config.model, 'anthropic');
      if (bound == null) throw refuse('input_too_large', `This ${config.role} request cannot be bounded for admission.`);
      const started = clock();
      const send = loggedModel(config.task, callModel);
      const response = await raced(send({ ...env, CAD_MODEL_ABORT_SIGNAL: signal }, body, config.model, null), signal);
      if (!response.ok) throw await httpFailure(response, `${config.model} for ${config.role}`);
      const result = await response.json().catch(() => null);
      const usage = { quantities: anthropicQuantities(result?.usage), reasoningTokens: null, raw: result?.usage ?? null };
      const served = { provider: 'anthropic', model: typeof result?.model === 'string' ? result.model : null };
      const blocksOut = Array.isArray(result?.content) ? result.content.filter(b => b?.type === 'tool_use') : [];
      const stopRaw = result?.stop_reason ?? null, stopReason = stopOf(stopRaw);
      const meta = { usage, served, stopRaw, sent: true };
      try {
        if (blocksOut.some(b => b.name !== tool.name)) throw new InteractModelError('unexpected_tool', `The ${config.role} reply called a tool that was not offered.`, { sent: true });
        const output = normalizeStructured({ candidates: blocksOut.map(b => ({ source: 'tool call', value: b.input })), schema, truncated: stopReason === 'truncated', refused: stopReason === 'refusal' });
        return { output, requested: { provider: 'anthropic', model: config.model }, served, usage, timing: { ms: clock() - started }, stopReason, stopRaw };
      } catch (error) { throw Object.assign(error, meta); }
    },
  };
}

// ---- OpenAI-compatible structured output (C04) ----
// A candidate service behind an allowlisted https endpoint (config.endpoint, checked when the profile resolves). strict json_schema mode;
// provider-specific tool or image behavior is not assumed - the role's capabilities (checked before the call) decide what may be sent.
// This does NOT inherit explain-celeris-dev.js's written-card instruction or make_explanation schema; only its exclusive oneOf idea.
export function createOpenAICompatibleAdapter({ env = {}, fetch: send, clock = clockNow } = {}) {
  return {
    name: 'openai-compatible',
    async call({ config, system, schema, input, images = [], signal, name = 'return_result', wireSchema, sanitize }) {
      if (typeof send !== 'function') throw refuse('no_transport', 'The OpenAI-compatible adapter has no transport.');
      const key = env[config.credentialRef];
      if (!key) throw refuse('credential_missing', `${config.credentialRef} is not set.`);
      if (usesOneOf(schema) && config.capabilities?.oneOf === 'none') throw refuse('capability_schema', `${config.provider} ${config.model} cannot take oneOf; the schema is not weakened.`);
      checkImages(images);
      // wireSchema: what is SENT (the Gemini step drops array and numeric bounds); the answer is still checked against the full schema.
      const sentSchema = config.capabilities?.oneOf === 'anyOf' ? exclusiveOneOfToAnyOf(wireSchema ?? schema) : wireSchema ?? schema;
      const text = inputText(input);
      const messages = [{ role: 'system', content: system },
        { role: 'user', content: images.length ? [{ type: 'text', text }, ...images.map(i => ({ type: 'image_url', image_url: { url: `data:${i.media_type};base64,${i.data}` } }))] : text }];
      const body = { ...config.settings, model: config.model, stream: false, max_tokens: config.maxOutputTokens, messages,
        response_format: { type: 'json_schema', json_schema: { name, strict: true, schema: sentSchema } } };
      const started = clock();
      const response = await raced(send(`${config.endpoint.replace(/\/+$/, '')}/chat/completions`, { method: 'POST', signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), signal);
      if (!response.ok) throw await httpFailure(response, `${config.model} for ${config.role}`);
      const result = await response.json().catch(() => null);
      const choice = result?.choices?.[0], message = choice?.message ?? {};
      const u = result?.usage, cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
      // OpenAI-shaped counts: prompt_tokens include cached ones and completion_tokens include reasoning. An absent count stays absent (unknown cost), never 0.
      const usage = { quantities: Number.isSafeInteger(u?.prompt_tokens) && Number.isSafeInteger(u?.completion_tokens) ? { input: u.prompt_tokens - cached, output: u.completion_tokens, cache_read: cached } : null,
        reasoningTokens: u?.completion_tokens_details?.reasoning_tokens ?? null, raw: u ?? null };
      const served = { provider: config.provider, model: typeof result?.model === 'string' ? result.model : null };
      const stopRaw = choice?.finish_reason ?? null, stopReason = stopOf(stopRaw);
      try {
        const candidates = [...(message.tool_calls || []).map(c => ({ source: 'tool call', text: c?.function?.arguments ?? '' })),
          ...(typeof message.content === 'string' && message.content.trim() ? [{ source: 'message', text: message.content }] : [])];
        if (message.refusal) throw new InteractModelError('refused', 'The model declined to answer.', { sent: true });
        const output = normalizeStructured({ candidates, schema, truncated: stopReason === 'truncated', refused: stopReason === 'refusal', sanitize });
        return { output, requested: { provider: config.provider, model: config.model }, served, usage, timing: { ms: clock() - started }, stopReason, stopRaw };
      } catch (error) { throw Object.assign(error, { usage, served, stopRaw, sent: true }); }
    },
  };
}

// The adapters a job wires into ctx.adapters: the admitted Anthropic transport and, only when a fetch is supplied, the candidate adapter.
export const interactAdapters = ({ env, callModel, fetch: send, clock }) => ({
  anthropic: createAnthropicAdapter({ env, callModel, clock }),
  ...(send ? { 'openai-compatible': createOpenAICompatibleAdapter({ env, fetch: send, clock }) } : {}),
});
