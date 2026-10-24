// The one telemetry contract (docs/features/telemetry.md; owner brief C:/s/spec/telemetry/brief.md Task 2). A leaf module with
// no imports, so the browser (packages/web/src), the Workers, the Durable Object jobs and the Fly renderers all validate the
// same envelope. Version 1: change a field's meaning only with a new schema_version.
//
// An event is a common envelope plus one event-specific payload. Every field is allowlisted: an unknown field, a value of the
// wrong shape or an oversized event is refused, never trimmed. There is no free-text field type at all, so a prompt, an email,
// a comment, a source or a URL cannot ride along: identifiers are ids, tokens or hashes, routes are templates.
// Accounting is not an event stream: actions, attempts and charges stay in LEARN_DB (learn-usage.js) and are projected into
// the telemetry database (telemetry-projection.js), never re-recorded here.

export const SCHEMA_VERSION = 1;
export const ENVIRONMENTS = ['production', 'dev', 'test', 'evaluation'];
export const SERVICES = ['web', 'app_worker', 'control_plane', 'job', 'renderer'];
export const OUTCOMES = ['started', 'completed', 'failed', 'cancelled', 'rejected', 'unknown'];
// Why an event failed validation; also the reason a sink counts it rejected.
export const VALIDATION_ERRORS = ['not_an_object', 'unknown_event', 'unknown_field', 'missing_field', 'invalid_field', 'too_large'];
// Why an operation failed, in an event's error_code. One list, so the dashboard groups failures across features.
export const ERROR_CODES = ['transport_thrown', 'http_error', 'invalid_json', 'stream_failed', 'stream_incomplete', 'stream_cancelled',
  'timeout', 'not_configured', 'refused', 'rate_limited', 'validation_failed', 'storage_failed', 'render_failed', 'unknown'];
// Bytes of the event's JSON, of its payload, and of one browser batch.
export const LIMITS = Object.freeze({ eventBytes: 8192, payloadBytes: 4096, batchEvents: 50, batchBytes: 65536 });

// Field shapes. Nothing here accepts spaces, '@', '?' or '#': no sentence, email address or query string fits.
const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const TOKEN = /^[a-z0-9][a-z0-9_.:-]{0,63}$/i;
const HEX = /^[0-9a-f]{6,64}$/;
const ROUTE = /^\/[A-Za-z0-9_/:.@-]{0,159}$/;
const nonNegative = value => Number.isSafeInteger(value) && value >= 0;
const TYPES = {
  id: value => typeof value === 'string' && ID.test(value),
  token: value => typeof value === 'string' && TOKEN.test(value),
  hex: value => typeof value === 'string' && HEX.test(value),
  route: value => typeof value === 'string' && ROUTE.test(value),
  int: nonNegative,
  ms: nonNegative,
  bool: value => typeof value === 'boolean',
  rate: value => typeof value === 'number' && value > 0 && value <= 1,
  // A provider usage object, already reduced by usageSnapshot: allowlisted dotted keys to integers, service_tier a token.
  usage: value => value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([key, v]) =>
    Object.hasOwn(USAGE_FIELDS, key) && (USAGE_FIELDS[key] === 'token' ? TYPES.token(v) : nonNegative(v))),
  versions: value => value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([key, v]) =>
    VERSION_KEYS.includes(key) && TYPES.token(v)),
};
const oneOf = list => value => list.includes(value);

// The envelope. required: true must be present; ingested_at is the sink's, never the producer's.
const ENVELOPE = {
  event_id: { type: 'id', required: true },
  event_name: { type: 'token', required: true },
  schema_version: { check: value => value === SCHEMA_VERSION, required: true },
  occurred_at: { type: 'ms', required: true }, // unix milliseconds on the producer's clock
  ingested_at: { type: 'ms' },
  environment: { check: oneOf(ENVIRONMENTS), required: true },
  service: { check: oneOf(SERVICES), required: true },
  release_sha: { type: 'hex' },
  service_version: { type: 'token' },
  trace_id: { type: 'hex' }, span_id: { type: 'hex' }, parent_span_id: { type: 'hex' },
  action_id: { type: 'id' }, attempt_id: { type: 'id' }, job_id: { type: 'id' }, turn_id: { type: 'id' },
  user_ref: { type: 'id' }, // users.id, the internal account id; never an email (ID has no '@')
  feature: { type: 'token' }, operation: { type: 'token' }, stage: { type: 'token' },
  outcome: { check: oneOf(OUTCOMES) },
  error_code: { check: oneOf(ERROR_CODES) },
  versions: { type: 'versions' }, // settings, model, prompt, rubric, pricing
  sample_rate: { type: 'rate' }, // present only on a sampled event: the probability it was kept
  payload: { required: true },
};
const VERSION_KEYS = ['settings', 'model', 'prompt', 'rubric', 'pricing', 'renderer'];

// Provider usage, as the provider reported it, flattened to dotted keys (Task 6: the allowlisted original for reconciliation).
// Subcategories are kept apart and never summed here: whether a provider's total includes them is documented in
// docs/features/telemetry.md, and pricing belongs to the Credits registry.
export const USAGE_FIELDS = Object.freeze({
  // Anthropic Messages
  input_tokens: 'int', output_tokens: 'int', cache_creation_input_tokens: 'int', cache_read_input_tokens: 'int',
  'cache_creation.ephemeral_5m_input_tokens': 'int', 'cache_creation.ephemeral_1h_input_tokens': 'int',
  'server_tool_use.web_search_requests': 'int', 'server_tool_use.web_fetch_requests': 'int', service_tier: 'token',
  // OpenAI chat completions and images
  prompt_tokens: 'int', completion_tokens: 'int', total_tokens: 'int',
  'prompt_tokens_details.cached_tokens': 'int', 'prompt_tokens_details.audio_tokens': 'int',
  'completion_tokens_details.reasoning_tokens': 'int', 'completion_tokens_details.audio_tokens': 'int',
  'input_tokens_details.text_tokens': 'int', 'input_tokens_details.image_tokens': 'int', 'input_tokens_details.cached_tokens': 'int',
  'output_tokens_details.text_tokens': 'int', 'output_tokens_details.image_tokens': 'int',
});
// The allowlisted, flattened copy of a usage object; null when nothing in it is allowlisted. A missing field stays missing.
export function usageSnapshot(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const out = {};
  const visit = (value, prefix) => {
    for (const [key, v] of Object.entries(value)) {
      const name = prefix ? `${prefix}.${key}` : key;
      if (v && typeof v === 'object' && !Array.isArray(v) && !prefix) visit(v, name);
      else if (Object.hasOwn(USAGE_FIELDS, name) && (USAGE_FIELDS[name] === 'token' ? TYPES.token(v) : nonNegative(v))) out[name] = v;
    }
  };
  visit(usage, '');
  return Object.keys(out).length ? out : null;
}

// Stable event names and each payload's allowlist. A new event is a new entry here, reviewed by the contract owner.
export const EVENTS = Object.freeze({
  // One Learn model call (learn-models.js loggedModel): its start, and its terminal outcome with timings and usage.
  'model_call.started': { task: { type: 'token', required: true }, provider: { type: 'token', required: true },
    requested_model: { type: 'token' }, source: { type: 'token' }, prompt_hash: { type: 'id' }, stream: { type: 'bool' } },
  'model_call.finished': { task: { type: 'token', required: true }, provider: { type: 'token', required: true },
    requested_model: { type: 'token' }, served_model: { type: 'token' }, source: { type: 'token' }, fell_back: { type: 'bool' },
    prompt_hash: { type: 'id' }, stream: { type: 'bool' }, status_code: { type: 'int' }, stop_reason: { type: 'token' },
    request_id: { type: 'id' }, response_ms: { type: 'ms' }, first_chunk_ms: { type: 'ms' }, duration_ms: { type: 'ms' },
    chunks: { type: 'int' }, usage: { type: 'usage' } },
  // One stage of an action or job, timed on one process's monotonic clock (Task 10).
  'stage.finished': { duration_ms: { type: 'ms', required: true }, attempt: { type: 'int' }, bytes: { type: 'int' }, count: { type: 'int' } },
  // A browser failure (Task 11): its kind, a fingerprint of the error and where, never the message text or the URL.
  'client.error': { kind: { check: oneOf(['uncaught', 'unhandled_rejection', 'boundary', 'save_failed', 'load_failed', 'render_failed', 'network', 'long_task']), required: true },
    fingerprint: { type: 'hex', required: true }, route: { type: 'route', required: true }, browser: { type: 'token' }, device: { type: 'token' },
    status_code: { type: 'int' }, duration_ms: { type: 'ms' } },
  // A producer's delivery health (Task 4): its outbox, and what it delivered, failed or refused.
  'telemetry.delivery': { source: { type: 'token', required: true }, pending: { type: 'int' }, dead: { type: 'int' },
    oldest_age_ms: { type: 'ms' }, delivered: { type: 'int' }, failed: { type: 'int' }, rejected: { type: 'int' }, dropped: { type: 'int' } },
});

const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
const valid = (rule, value) => (rule.check ? rule.check(value) : TYPES[rule.type](value));
function checkFields(object, rules, prefix, errors) {
  for (const key of Object.keys(object)) {
    if (!Object.hasOwn(rules, key)) errors.push({ code: 'unknown_field', field: prefix + key });
    else if (object[key] !== undefined && object[key] !== null && key !== 'payload' && !valid(rules[key], object[key])) errors.push({ code: 'invalid_field', field: prefix + key });
  }
  for (const [key, rule] of Object.entries(rules)) if (rule.required && (object[key] === undefined || object[key] === null)) errors.push({ code: 'missing_field', field: prefix + key });
}

// { ok: true, event } or { ok: false, errors: [{ code, field? }] }. Null and undefined fields are dropped from the result.
export function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return { ok: false, errors: [{ code: 'not_an_object' }] };
  let size;
  try { size = bytes(event); } catch { return { ok: false, errors: [{ code: 'invalid_field' }] }; }
  if (size > LIMITS.eventBytes) return { ok: false, errors: [{ code: 'too_large' }] };
  const errors = [];
  checkFields(event, ENVELOPE, '', errors);
  const rules = Object.hasOwn(EVENTS, event.event_name) ? EVENTS[event.event_name] : null;
  if (typeof event.event_name === 'string' && !rules) errors.push({ code: 'unknown_event', field: 'event_name' });
  const payload = event.payload;
  if (payload !== undefined && payload !== null) {
    if (typeof payload !== 'object' || Array.isArray(payload)) errors.push({ code: 'invalid_field', field: 'payload' });
    else if (bytes(payload) > LIMITS.payloadBytes) errors.push({ code: 'too_large', field: 'payload' });
    else if (rules) checkFields(payload, rules, 'payload.', errors);
  }
  if (errors.length) return { ok: false, errors };
  const clean = object => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== null));
  return { ok: true, event: { ...clean(event), payload: clean(payload) } };
}

// A browser batch: at most LIMITS.batchEvents events and LIMITS.batchBytes, each validated alone. Returns the valid events and
// the refused count, so one bad event never drops its neighbours and a flood is refused whole.
export function validateBatch(events) {
  if (!Array.isArray(events)) return { ok: false, errors: [{ code: 'not_an_object' }] };
  if (events.length > LIMITS.batchEvents) return { ok: false, errors: [{ code: 'too_large' }] };
  try { if (bytes(events) > LIMITS.batchBytes) return { ok: false, errors: [{ code: 'too_large' }] }; } catch { return { ok: false, errors: [{ code: 'invalid_field' }] }; }
  const results = events.map(validateEvent);
  return { ok: true, events: results.filter(r => r.ok).map(r => r.event), rejected: results.filter(r => !r.ok).length };
}

// The environment a Worker records under. TELEMETRY_ENVIRONMENT is set per deployment (docs/features/telemetry.md runbook);
// SMALL_ENV test is always 'test'. Unset is null: such a worker writes nothing, so dev and production data never mix by default.
export function telemetryEnvironment(env) {
  if (env?.SMALL_ENV === 'test') return 'test';
  return ENVIRONMENTS.includes(env?.TELEMETRY_ENVIRONMENT) ? env.TELEMETRY_ENVIRONMENT : null;
}

// A new event with the envelope's producer fields filled in. fields: the rest of the envelope and payload.
export function makeEvent(name, fields = {}, { environment, service, release = null, now = Date.now() } = {}) {
  return { event_id: `ev-${crypto.randomUUID()}`, event_name: name, schema_version: SCHEMA_VERSION, occurred_at: now,
    environment, service, ...(release ? { release_sha: release } : {}), ...fields };
}

// A route template for client events: only the app's own static path words survive; every other segment (a share token, a
// board id, a repository or canvas slug, a handle) becomes a placeholder, and any query or fragment is dropped.
const ROUTE_WORDS = new Set(['apps', 'b', 'e', 'c', 'i', 'embed', 'runs', 'library', 'explore', 'chat', 'members', 'dash', 'owner', 'telemetry', 'api', 'learn']);
export function routeTemplate(pathname) {
  const path = String(pathname || '/').split(/[?#]/)[0];
  const segments = path.split('/').map((part, at, all) => {
    if (!part || ROUTE_WORDS.has(part)) return part;
    if (part.startsWith('@')) return ':handle';
    return ['b', 'e'].includes(all[at - 1]) ? ':token' : ':id';
  });
  const route = segments.join('/') || '/';
  return ROUTE.test(route) ? route : '/:id';
}

// Retention defaults (Task 19; starting product settings, not legal claims), overridable per deployment. Financial records are
// not telemetry and are never pruned by it.
export const RETENTION_DEFAULTS = Object.freeze({ eventsDays: 30, archiveDays: 90, aggregatesDays: 395 });
export function retentionConfig(env) {
  const days = (key, fallback) => { const n = Number(env?.[key]); return Number.isSafeInteger(n) && n > 0 && n <= 3650 ? n : fallback; };
  return { eventsDays: days('TELEMETRY_EVENTS_RETENTION_DAYS', RETENTION_DEFAULTS.eventsDays),
    archiveDays: days('TELEMETRY_ARCHIVE_RETENTION_DAYS', RETENTION_DEFAULTS.archiveDays),
    aggregatesDays: days('TELEMETRY_AGGREGATES_RETENTION_DAYS', RETENTION_DEFAULTS.aggregatesDays) };
}
