import { z } from 'zod';
import { ROLES } from '../scene-vocab.js';

// The frozen artifact and frame contract of the generic /explain sandbox (plan section 5.2, Task 2).
// Subject-independent on purpose: nothing here names a topic. Every object is strict, every value bounded; the host
// (A), the author schemas (C) and the card (B) all build on these shapes. Pure: no React, no DOM, no runtime import.

export const PROGRAM_KIND = 'explain_program';
export const SCHEMA_VERSION = 1;
// Schema 2 is the stateful contract (initialState/reduce/evaluate, declared actions/targets, one viewport). Only artifacts that need state
// use it; schema 1 artifacts parse, hash and run exactly as before. host.js runs a version only if stamps.js lists its whole tuple.
export const STATEFUL_SCHEMA_VERSION = 2;
// Versions the card side owns. runtimeVersion (the pinned interpreter build) is stamped by whoever seals the artifact.
export const PROGRAM_VERSIONS = Object.freeze({
  schemaVersion: SCHEMA_VERSION, sdkVersion: 'sdk-1', rendererVersion: 'renderer-1', runtimePolicyVersion: 'policy-1', permissionProfileVersion: 'perm-1',
});

// ponytail: objects is 60 because the existing scene gate allows 60 on screen without a pager (animation-scene.js); the plan's 240 total
// (objectsTotal) needs parts, which arrive with Task 8.
// Starting limits from plan section 5.3. limits.js (runtime owner) is the runtime policy file; these are the contract-level
// bounds a Frame or artifact must satisfy before anything renders, so they live with the schemas that enforce them.
export const CONTRACT_LIMITS = Object.freeze({
  sourceBytes: 16 * 1024, manifestBytes: 4 * 1024, maxOutputBytes: 256 * 1024, depth: 32,
  objects: 60, objectsTotal: 240, pointsPerObject: 2000, pointsTotal: 10000, inputs: 4, optionCombinations: 64, options: 8, readouts: 8, quantities: 32, assumptions: 8,
  duration: 120, coordinate: 100000, size: 2000, text: 200, runs: 16,
  stateBytes: 32 * 1024, actions: 8, targets: 8, // schema 2 only; LIMITS.stateBytes is this value
});

export const ERROR_CODES = Object.freeze(['invalid_program', 'unsupported_capability', 'runtime_limit', 'runtime_error', 'invalid_output', 'version_unavailable']);
// Capabilities a manifest may require. An unknown one is unsupported_capability, never silently ignored.
export const CAPABILITIES = Object.freeze(['time_playback', 'number_inputs', 'select_inputs', 'polyline', 'math_text']);
// Frame object kinds: the closed set the trusted renderer draws. Equations are text objects with math runs (hardened path).
export const OBJECT_KINDS = Object.freeze(['box', 'circle', 'text', 'line', 'arrow', 'polyline']);

const finite = limit => z.number().min(-limit).max(limit); // z.number() already refuses NaN and Infinity
const coordinate = finite(CONTRACT_LIMITS.coordinate);
const id = z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/, 'an id is 1 to 64 letters, digits or _ . : -');
const name = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/, 'a name starts with a letter and has at most 32 letters, digits or _');
const hash = z.string().regex(/^[0-9a-f]{64}$/, 'a SHA-256 hex digest');
const version = z.string().regex(/^[A-Za-z0-9._@+-]{1,64}$/);

// Text is data. It is always drawn through escaped text nodes (React children and SVG text), never parsed as HTML, so a lesson may
// quote a URL or a tag ("A URL starts with https://", "The <div> tag groups content") as literal words. What stays forbidden is
// FIELDS that make the host load or run something: every object below is strict, so an href, src, url, image, handler or
// function-valued key is refused as an unknown key, and zod types refuse a function where a string or number belongs.
const plain = max => z.string().min(1).max(max);
const maybePlain = max => z.string().max(max);

const run = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: plain(CONTRACT_LIMITS.text) }).strict(),
  z.object({ kind: z.literal('math'), tex: z.string().min(1).max(CONTRACT_LIMITS.text) }).strict(),
]);

const utf8 = text => new TextEncoder().encode(text).length;

// ---- manifest ---------------------------------------------------------------------------------------------------------

const optionSchema = z.object({ value: z.string().regex(/^[A-Za-z0-9_.-]{1,32}$/), label: plain(60) }).strict();
const numberInput = z.object({
  type: z.literal('number'), id: name, label: plain(60), unit: maybePlain(16).optional(),
  default: finite(1e9), min: finite(1e9), max: finite(1e9), step: z.number().positive().max(1e9).optional(),
}).strict().refine(input => input.min < input.max, { message: 'min must be below max', path: ['max'] })
  .refine(input => input.default >= input.min && input.default <= input.max, { message: 'default must lie in the domain', path: ['default'] });
const selectInput = z.object({
  type: z.literal('select'), id: name, label: plain(60), unit: maybePlain(16).optional(),
  default: z.string(), options: z.array(optionSchema).min(2).max(CONTRACT_LIMITS.options),
}).strict().refine(input => input.options.some(option => option.value === input.default), { message: 'default must be one of the options', path: ['default'] })
  .refine(input => new Set(input.options.map(option => option.value)).size === input.options.length, { message: 'option values must be unique', path: ['options'] });
const inputSchema = z.union([numberInput, selectInput]);
const readoutSchema = z.object({ id: name, label: plain(60), unit: maybePlain(16).optional(), decimals: z.number().int().min(0).max(6).default(2) }).strict();

const manifestShape = {
  title: plain(120), summary: plain(400), assumptions: z.array(plain(300)).max(CONTRACT_LIMITS.assumptions),
  description: plain(600), // the accessible description of what the picture shows
  inputs: z.array(inputSchema).max(CONTRACT_LIMITS.inputs),
  duration: z.number().positive().max(CONTRACT_LIMITS.duration).optional(), // seconds; absent means a static, time-free card
  readouts: z.array(readoutSchema).max(CONTRACT_LIMITS.readouts),
  capabilities: z.array(z.string().min(1).max(32)).max(16),
};
const manifestChecks = (manifest, context) => {
  const ids = [...manifest.inputs.map(input => input.id), ...manifest.readouts.map(readout => readout.id)];
  if (new Set(ids).size !== ids.length) {
    // Name the clash and say how to fix it: a control and a readout often want the same word ("room"), and they share one namespace.
    const taken = new Set(), twice = [...new Set(ids.filter(id => taken.size === taken.add(id).size))].slice(0, 4);
    const where = id => [manifest.inputs.some(input => input.id === id) && 'an input', manifest.readouts.some(readout => readout.id === id) && 'a readout'].filter(Boolean).join(' and ');
    context.addIssue({ code: 'custom', message: `input and readout ids must be unique (they share one namespace): ${twice.map(id => `"${id}" is used more than once, as ${where(id)}`).join('; ')}; rename one of each pair`, path: ['inputs'] });
  }
  const combinations = manifest.inputs.filter(input => input.type === 'select').reduce((total, input) => total * input.options.length, 1);
  if (combinations > CONTRACT_LIMITS.optionCombinations) context.addIssue({ code: 'custom', message: `select options combine to ${combinations} states (at most ${CONTRACT_LIMITS.optionCombinations})`, path: ['inputs'] });
  if (utf8(JSON.stringify(manifest)) > CONTRACT_LIMITS.manifestBytes) context.addIssue({ code: 'custom', message: `the manifest is over ${CONTRACT_LIMITS.manifestBytes} bytes`, path: [] });
};
export const ProgramManifest = z.object(manifestShape).strict().superRefine(manifestChecks);

// Schema 2 adds: one fixed viewport every evaluated frame must have (resizing scales it; inputs and actions never change the card's
// aspect), the button actions a reducer may receive, and the frame object ids a learner may select. Nothing else crosses as an event.
const frameSide = z.number().positive().max(4096); // the Frame's own dimension bound
const actionSchema = z.object({ id: name, label: plain(60) }).strict();
const targetSchema = z.object({ id, label: plain(60) }).strict(); // id: the frame object a learner selects
export const StatefulManifest = z.object({
  ...manifestShape,
  viewport: z.object({ width: frameSide, height: frameSide }).strict(),
  actions: z.array(actionSchema).max(CONTRACT_LIMITS.actions),
  targets: z.array(targetSchema).max(CONTRACT_LIMITS.targets),
}).strict().superRefine((manifest, context) => {
  manifestChecks(manifest, context);
  for (const key of ['actions', 'targets']) {
    const ids = manifest[key].map(item => item.id);
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: `${key} ids must be unique`, path: [key] });
  }
});
const manifestFor = schemaVersion => (schemaVersion === STATEFUL_SCHEMA_VERSION ? StatefulManifest : ProgramManifest);
// The schema an author's draft asks for: one that declares a viewport, actions or targets is stateful (schema 2); anything else is schema 1.
// The author never writes a version: this is read from what the manifest declares.
export const STATEFUL_MANIFEST_KEYS = Object.freeze(['viewport', 'actions', 'targets']);
export const draftSchemaVersion = draft => (draft?.manifest && typeof draft.manifest === 'object' && STATEFUL_MANIFEST_KEYS.some(key => Object.hasOwn(draft.manifest, key)) ? STATEFUL_SCHEMA_VERSION : SCHEMA_VERSION);
// What the author is told about the stateful contract, from the same constants the schemas enforce.
export const STATEFUL_CONTRACT = Object.freeze({
  exports: 'export function initialState({ inputs, seed }) -> state; export function reduce({ state, event, inputs, time, seed }) -> state; export function evaluate({ inputs, time, seed, state }) -> { frame, quantities }',
  manifest: `viewport {width, height} (required, at most 4096 each; every frame has exactly this size), actions [{id, label}] (at most ${CONTRACT_LIMITS.actions} buttons; id is a name), targets [{id, label}] (at most ${CONTRACT_LIMITS.targets}; id is the id of a frame object the learner can select; every frame draws every target under that id)`,
  events: [`{type:"action", action: <an actions id>}`, `{type:"select", target: <a targets id>}`, `{type:"input", input: <an inputs id>, value: <the new value>}`],
  state: `a plain JSON object: finite numbers, strings, booleans, null, arrays and objects; at most ${CONTRACT_LIMITS.stateBytes} bytes as JSON and ${CONTRACT_LIMITS.depth} levels deep`,
  rules: 'reduce returns the next state from the state and one event, without changing its arguments; evaluate draws the state. All three are pure and deterministic: the same seed and the same ordered events give the same state. Math.random restarts from seed on every call, so keep any random sequence counter in the state.',
});

// ---- artifact ---------------------------------------------------------------------------------------------------------

const sourceSchema = z.string().min(1).refine(text => utf8(text) <= CONTRACT_LIMITS.sourceBytes, `the source is over ${CONTRACT_LIMITS.sourceBytes} bytes`);
// What the author model supplies. Never versions, never hashes: the host stamps and computes those.
export const ProgramBundle = z.object({ manifest: ProgramManifest, source: sourceSchema }).strict();
export const StatefulBundle = z.object({ manifest: StatefulManifest, source: sourceSchema }).strict();
const artifactSchema = schemaVersion => z.object({
  kind: z.literal(PROGRAM_KIND), schemaVersion: z.literal(schemaVersion),
  runtimeVersion: version, sdkVersion: version, rendererVersion: version, runtimePolicyVersion: version, permissionProfileVersion: version,
  fingerprints: z.object({ engine: version, sdk: version, renderer: version }).strict(),
  dependencies: z.array(version).max(8).default([]),
  manifest: manifestFor(schemaVersion), source: sourceSchema, sourceHash: hash, manifestHash: hash, bundleHash: hash,
}).strict();
export const ProgramArtifact = artifactSchema(SCHEMA_VERSION);
export const StatefulArtifact = artifactSchema(STATEFUL_SCHEMA_VERSION);

// ---- evaluate request / frame / response ------------------------------------------------------------------------------

const inputValue = z.union([finite(1e9), z.string().max(32)]);
const requestFields = {
  requestId: z.string().min(1).max(64),
  inputs: z.record(name, inputValue).refine(record => Object.keys(record).length <= CONTRACT_LIMITS.inputs, 'too many inputs'),
  time: z.number().min(0).max(CONTRACT_LIMITS.duration),
  seed: z.number().int().min(0).max(0xffffffff),
};
export const EvaluateRequest = z.object({ ...requestFields, state: z.null() }).strict(); // schema 1: no guest state, ever

// ---- schema 2: state and events -----------------------------------------------------------------------------------------

// The one state rule, for requests, guest results and (Task 8.2) storage alike: a plain JSON object, finite numbers only, no value
// nested deeper than CONTRACT_LIMITS.depth levels (the root is level 1, as for guest output), at most CONTRACT_LIMITS.stateBytes of
// canonical UTF-8 JSON. Returns the first problem, or null. The size is measured first, at a bounded cost.
const plainContainer = node => Array.isArray(node) || [Object.prototype, null].includes(Object.getPrototypeOf(node));
const stateTooDeep = (node, level) => level > CONTRACT_LIMITS.depth
  || (node !== null && typeof node === 'object' && (!plainContainer(node) || Object.values(node).some(child => stateTooDeep(child, level + 1))));
export function stateProblem(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return 'state must be a JSON object';
  try { canonicalBytes(value, CONTRACT_LIMITS.stateBytes); } catch (error) {
    return error instanceof RangeError ? `state is over ${CONTRACT_LIMITS.stateBytes} bytes or nested too deeply` : 'state must be plain JSON with finite numbers';
  }
  return stateTooDeep(value, 1) ? `state is nested deeper than ${CONTRACT_LIMITS.depth} levels or is not plain JSON` : null;
}
const stateSchema = z.unknown().superRefine((value, context) => { const problem = stateProblem(value); if (problem) context.addIssue({ code: 'custom', message: problem }); });

// The strict event union. Drag (start/move/end) is reserved for Task 8.4 and refused as unsupported_capability until then.
export const ProgramEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('action'), action: name }).strict(),
  z.object({ type: z.literal('select'), target: id }).strict(),
  z.object({ type: z.literal('input'), input: name, value: inputValue }).strict(),
]);
export const StatefulEvaluateRequest = z.object({ ...requestFields, state: stateSchema }).strict();
export const InitializeRequest = z.object({ requestId: requestFields.requestId, inputs: requestFields.inputs, seed: requestFields.seed }).strict();
export const ReduceRequest = z.object({ ...requestFields, state: stateSchema, event: z.unknown() }).strict(); // event: parseEvent, against the manifest

const style = { role: z.enum(ROLES).default('neutral'), opacity: z.number().min(0).max(1).default(1) };
const labelled = { text: plain(CONTRACT_LIMITS.text).optional(), runs: z.array(run).min(1).max(CONTRACT_LIMITS.runs).optional() };
const point = z.tuple([coordinate, coordinate]);
const size = z.number().positive().max(CONTRACT_LIMITS.size);
const frameObject = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('box'), id, x: coordinate, y: coordinate, w: size, h: size, ...labelled, ...style, rotation: finite(360).default(0) }).strict(),
  z.object({ kind: z.literal('circle'), id, x: coordinate, y: coordinate, w: size, ...labelled, ...style, rotation: finite(360).default(0) }).strict(), // w is the diameter
  z.object({ kind: z.literal('text'), id, x: coordinate, y: coordinate, ...labelled, align: z.enum(['start', 'middle']).default('start'), ...style }).strict(),
  z.object({ kind: z.enum(['line', 'arrow']), id, from: z.object({ x: coordinate, y: coordinate }).strict(), to: z.object({ x: coordinate, y: coordinate }).strict(), ...labelled, ...style }).strict(),
  z.object({
    kind: z.literal('polyline'), id, points: z.array(point).min(2).max(CONTRACT_LIMITS.pointsPerObject),
    // Everything outside this rectangle is not drawn: a plotted series cannot cover the rest of the picture.
    clip: z.object({ x: coordinate, y: coordinate, w: size, h: size }).strict().optional(), ...style,
  }).strict(),
]);

export const Frame = z.object({
  width: z.number().positive().max(4096).default(960), height: z.number().positive().max(4096).default(540),
  objects: z.array(frameObject).max(CONTRACT_LIMITS.objects),
  readouts: z.array(z.object({ id: name, value: finite(1e12) }).strict()).max(CONTRACT_LIMITS.readouts).default([]),
}).strict().superRefine((frame, context) => {
  const seen = new Set();
  let points = 0;
  frame.objects.forEach((object, index) => {
    if (seen.has(object.id)) context.addIssue({ code: 'custom', message: `duplicate object id "${object.id}"`, path: ['objects', index, 'id'] });
    seen.add(object.id);
    if (object.kind === 'polyline') points += object.points.length;
    if (object.kind === 'text' && !object.text && !object.runs) context.addIssue({ code: 'custom', message: 'a text object needs text or runs', path: ['objects', index] });
    if ('text' in object && object.text && object.runs) context.addIssue({ code: 'custom', message: 'give text or runs, not both', path: ['objects', index] });
  });
  if (points > CONTRACT_LIMITS.pointsTotal) context.addIssue({ code: 'custom', message: `${points} polyline points in total (at most ${CONTRACT_LIMITS.pointsTotal})`, path: ['objects'] });
});

export const Quantities = z.record(name, finite(1e12)).refine(record => Object.keys(record).length <= CONTRACT_LIMITS.quantities, 'too many quantities');
// What the guest returns for one evaluate call. The host adds requestId and metrics around it.
export const GuestResult = z.object({ frame: Frame, quantities: Quantities.default({}) }).strict();
export const EvaluateResponse = z.object({
  requestId: z.string().min(1).max(64), frame: Frame, quantities: Quantities,
  metrics: z.object({ ms: z.number().min(0), outputBytes: z.number().int().min(0).optional() }).strict(),
}).strict();

// ---- errors -----------------------------------------------------------------------------------------------------------

// The words a learner sees (plan section 8). The message never carries source, context or a stack.
export const ERROR_MESSAGES = Object.freeze({
  runtime_limit: 'This explanation stopped because it exceeded its runtime limit.',
  unsupported_capability: 'This explanation needs a capability that is not available yet.',
  invalid_program: 'This explanation could not run. Your saved version is kept.',
  runtime_error: 'This explanation could not run. Your saved version is kept.',
  invalid_output: 'This explanation could not run. Your saved version is kept.',
  version_unavailable: 'This explanation could not run. Your saved version is kept.',
});
export const RuntimeErrorSchema = z.object({ code: z.enum(ERROR_CODES), message: z.string().min(1).max(200) }).strict();
const normalizeCode = code => (typeof code === 'string' && ERROR_CODES.includes(code) ? code : 'runtime_error');
// The learner-facing part is only the stable code and its fixed message. Anything diagnostic (a source excerpt, a stack, a
// context string) goes in the second argument, is kept apart on a non-enumerable field, and never reaches the message or toJSON.
export class RuntimeError extends Error {
  constructor(code, diagnostic) {
    const normalized = normalizeCode(code); // unknown, undefined and non-string codes become runtime_error first
    super(ERROR_MESSAGES[normalized]);
    this.name = 'RuntimeError';
    this.code = normalized;
    Object.defineProperty(this, 'diagnostic', { value: typeof diagnostic === 'string' ? diagnostic.slice(0, 500) : undefined, enumerable: false });
  }
  toJSON() { return { code: this.code, message: this.message }; }
}

// ---- parse helpers (never throw) ---------------------------------------------------------------------------------------

const firstIssue = error => { const issue = error.issues[0]; return `${issue.path.join('.') || 'root'}: ${issue.message}`; };
// Result of parsing: { ok: true, value } or { ok: false, error: RuntimeError, issue } with the schema's first complaint in
// `issue` for logs and authors, and a code-only RuntimeError for the learner.
function parseWith(schema, raw, code) {
  const parsed = schema.safeParse(raw);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: new RuntimeError(code), issue: firstIssue(parsed.error) };
}
// A manifest requiring a capability this build lacks is unsupported_capability, not a malformed program. Model output is untrusted: only a
// list of strings is read here; a field of another type (or a non-string in the list) is a malformed manifest, which the schema reports with its
// path, the expected type and the observed type, so it can be repaired.
export const unsupportedCapabilities = manifest => (Array.isArray(manifest?.capabilities) ? manifest.capabilities : []).filter(capability => typeof capability === 'string' && !CAPABILITIES.includes(capability));
export function parseManifest(raw, schemaVersion = SCHEMA_VERSION) {
  const result = parseWith(manifestFor(schemaVersion), raw, 'invalid_program');
  if (!result.ok) return result;
  const missing = unsupportedCapabilities(result.value);
  return missing.length ? { ok: false, error: new RuntimeError('unsupported_capability'), issue: `capabilities: ${missing.join(', ')}` } : result;
}
const stateful = schemaVersion => schemaVersion === STATEFUL_SCHEMA_VERSION;
export const parseBundle = (raw, schemaVersion = SCHEMA_VERSION) => {
  const manifest = parseManifest(raw?.manifest, schemaVersion);
  return manifest.ok ? parseWith(stateful(schemaVersion) ? StatefulBundle : ProgramBundle, raw, 'invalid_program') : manifest;
};
// The artifact's own schemaVersion picks its schema: 2 is the stateful one, anything else is read as schema 1, whose literal refuses
// a version it does not know.
export const parseArtifact = raw => {
  const schemaVersion = stateful(raw?.schemaVersion) ? STATEFUL_SCHEMA_VERSION : SCHEMA_VERSION;
  const manifest = parseManifest(raw?.manifest, schemaVersion);
  return manifest.ok ? parseWith(stateful(schemaVersion) ? StatefulArtifact : ProgramArtifact, raw, 'invalid_program') : manifest;
};
export const parseEvaluateRequest = raw => parseWith(EvaluateRequest, raw, 'invalid_program');
export const parseStatefulEvaluateRequest = raw => parseWith(StatefulEvaluateRequest, raw, 'invalid_program');
export const parseInitializeRequest = raw => parseWith(InitializeRequest, raw, 'invalid_program');
export const parseState = raw => parseWith(stateSchema, raw, 'invalid_output'); // a state the guest returned
// An event the manifest declares: a declared action or target, or a declared input with an allowed value. Never throws.
export function parseEvent(raw, manifest) {
  if (typeof raw?.type === 'string' && raw.type.startsWith('drag')) return { ok: false, error: new RuntimeError('unsupported_capability'), issue: 'event: drag is not supported yet' };
  const parsed = parseWith(ProgramEvent, raw, 'invalid_program');
  if (!parsed.ok) return parsed;
  const event = parsed.value, input = event.type === 'input' && manifest.inputs.find(item => item.id === event.input);
  const declared = event.type === 'action' ? manifest.actions.some(action => action.id === event.action)
    : event.type === 'select' ? manifest.targets.some(target => target.id === event.target)
      : !!input && (input.type === 'number' ? typeof event.value === 'number' && event.value >= input.min && event.value <= input.max
        : input.options.some(option => option.value === event.value));
  return declared ? parsed : { ok: false, error: new RuntimeError('invalid_program'), issue: `event: this ${event.type} is not declared by the manifest` };
}
export function parseReduceRequest(raw, manifest) {
  const parsed = parseWith(ReduceRequest, raw, 'invalid_program');
  if (!parsed.ok) return parsed;
  const event = parseEvent(parsed.value.event, manifest);
  return event.ok ? { ok: true, value: { ...parsed.value, event: event.value } } : event;
}
// Output is measured before it is parsed: the canonical serialized byte length of the WHOLE result (frame, quantities, and for
// a response its id and metrics) must not exceed CONTRACT_LIMITS.maxOutputBytes, the one authoritative output limit. A result
// that is over, too deep, or not plain JSON is invalid_output; the issue text states the limit and echoes none of the content.
function parseOutput(schema, raw) {
  try { canonicalBytes(raw, CONTRACT_LIMITS.maxOutputBytes); } catch {
    return { ok: false, error: new RuntimeError('invalid_output'), issue: `the result is over ${CONTRACT_LIMITS.maxOutputBytes} bytes, nested too deeply, or not plain JSON` };
  }
  return parseWith(schema, raw, 'invalid_output');
}
export const parseFrame = raw => parseOutput(Frame, raw);
// With a schema 2 manifest, every frame must also have exactly the declared viewport and draw every declared target under its own id
// (stable ids: a learner can always select what the card offers). The Frame's object and point limits apply to every result as before.
export function parseGuestResult(raw, manifest = null) {
  const result = parseOutput(GuestResult, raw);
  if (!result.ok || !manifest?.viewport) return result;
  const { width, height, objects } = result.value.frame, viewport = manifest.viewport;
  const invalid = issue => ({ ok: false, error: new RuntimeError('invalid_output'), issue });
  if (width !== viewport.width || height !== viewport.height) return invalid(`frame: ${width} x ${height}, but the manifest viewport is ${viewport.width} x ${viewport.height}`);
  const drawn = new Set(objects.map(object => object.id)), missing = (manifest.targets || []).filter(target => !drawn.has(target.id)).map(target => target.id);
  return missing.length ? invalid(`frame: declared targets are not drawn: ${missing.slice(0, 4).join(', ')} (draw every target in every frame under its own id)`) : result;
}
export const parseEvaluateResponse = raw => parseOutput(EvaluateResponse, raw);

// ---- inputs -----------------------------------------------------------------------------------------------------------

// The manifest's inputs with the learner's saved values applied: unknown names dropped, numbers clamped into the domain,
// a select value that is not an option replaced by the default. Always a complete, valid set for EvaluateRequest.inputs.
export function resolveInputs(manifest, saved = {}) {
  const out = {};
  for (const input of manifest.inputs) {
    const value = saved?.[input.id];
    if (input.type === 'number') out[input.id] = Number.isFinite(value) ? Math.min(input.max, Math.max(input.min, value)) : input.default;
    else out[input.id] = input.options.some(option => option.value === value) ? value : input.default;
  }
  return out;
}

// ---- identity: hashes the host computes, never the model ---------------------------------------------------------------

// Key-sorted JSON, so the same content always hashes the same. Rejects what JSON cannot carry exactly.
export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError('not a finite number'); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  throw new TypeError('not JSON');
}
// The exact UTF-8 byte length of canonicalJson(value), counted without building the string and stopping as soon as the count passes
// budget (a RangeError), so an oversized or cyclic value is refused at a bounded cost. TypeError for anything JSON cannot carry.
const utf8Length = text => new TextEncoder().encode(text).length;
export function canonicalBytes(value, budget = Infinity) {
  let total = 0;
  const add = count => { total += count; if (total > budget) throw new RangeError('over budget'); };
  const walk = (node, depth) => {
    if (depth > CONTRACT_LIMITS.depth) throw new RangeError('too deep');
    if (node === null) return add(4);
    if (typeof node === 'boolean') return add(node ? 4 : 5);
    if (typeof node === 'number') { if (!Number.isFinite(node)) throw new TypeError('not a finite number'); return add(JSON.stringify(node).length); }
    if (typeof node === 'string') { if (node.length > budget) throw new RangeError('over budget'); return add(utf8Length(JSON.stringify(node))); }
    if (Array.isArray(node)) {
      add(2);
      node.forEach((item, index) => { if (index) add(1); walk(item, depth + 1); });
      return undefined;
    }
    if (typeof node === 'object') {
      add(2);
      let first = true;
      for (const key of Object.keys(node)) {
        if (node[key] === undefined) continue;
        if (!first) add(1);
        first = false;
        add(utf8Length(JSON.stringify(key)) + 1);
        walk(node[key], depth + 1);
      }
      return undefined;
    }
    throw new TypeError('not JSON');
  };
  walk(value, 0);
  return total;
}
export async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
// bundleHash binds source, manifest, the engine/SDK/renderer build fingerprints, executable dependencies and both policies.
const bundleIdentity = (artifact, sourceHash, manifestHash) => canonicalJson({
  sourceHash, manifestHash, schemaVersion: artifact.schemaVersion, runtimeVersion: artifact.runtimeVersion, sdkVersion: artifact.sdkVersion,
  rendererVersion: artifact.rendererVersion, runtimePolicyVersion: artifact.runtimePolicyVersion, permissionProfileVersion: artifact.permissionProfileVersion,
  fingerprints: artifact.fingerprints, dependencies: artifact.dependencies || [],
});
export async function computeHashes(artifact) {
  const sourceHash = await sha256Hex(artifact.source);
  const manifestHash = await sha256Hex(canonicalJson(artifact.manifest));
  return { sourceHash, manifestHash, bundleHash: await sha256Hex(bundleIdentity(artifact, sourceHash, manifestHash)) };
}
// Author output (manifest + source) plus the host's version stamps becomes a stored artifact. Any hash the model supplied is
// not read: parseBundle is strict, so it is refused before this runs.
// stamps: { runtimeVersion, fingerprints: { engine, sdk, renderer }, dependencies?, ...overrides of PROGRAM_VERSIONS }. A stamp set
// with schemaVersion 2 (STATEFUL_PROGRAM_STAMPS, stamps.js) seals a stateful bundle.
export async function sealProgram(bundle, stamps) {
  const parsed = parseBundle(bundle, stamps?.schemaVersion ?? SCHEMA_VERSION);
  if (!parsed.ok) return parsed;
  const draft = { kind: PROGRAM_KIND, ...PROGRAM_VERSIONS, dependencies: [], ...stamps, ...parsed.value };
  return parseArtifact({ ...draft, ...(await computeHashes(draft)) });
}
// True only when every stored hash matches the artifact's actual content: the check before anything executes or is reviewed.
export async function verifyHashes(artifact) {
  const computed = await computeHashes(artifact);
  return computed.sourceHash === artifact.sourceHash && computed.manifestHash === artifact.manifestHash && computed.bundleHash === artifact.bundleHash;
}
