import { z } from 'zod';
import { ROLES } from '../scene-vocab.js';

// The frozen artifact and frame contract of the generic /explain sandbox (plan section 5.2, Task 2).
// Subject-independent on purpose: nothing here names a topic. Every object is strict, every value bounded; the host
// (A), the author schemas (C) and the card (B) all build on these shapes. Pure: no React, no DOM, no runtime import.

export const PROGRAM_KIND = 'explain_program';
export const SCHEMA_VERSION = 1;
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

export const ProgramManifest = z.object({
  title: plain(120), summary: plain(400), assumptions: z.array(plain(300)).max(CONTRACT_LIMITS.assumptions),
  description: plain(600), // the accessible description of what the picture shows
  inputs: z.array(inputSchema).max(CONTRACT_LIMITS.inputs),
  duration: z.number().positive().max(CONTRACT_LIMITS.duration).optional(), // seconds; absent means a static, time-free card
  readouts: z.array(readoutSchema).max(CONTRACT_LIMITS.readouts),
  capabilities: z.array(z.string().min(1).max(32)).max(16),
}).strict().superRefine((manifest, context) => {
  const ids = [...manifest.inputs.map(input => input.id), ...manifest.readouts.map(readout => readout.id)];
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'input and readout ids must be unique', path: ['inputs'] });
  const combinations = manifest.inputs.filter(input => input.type === 'select').reduce((total, input) => total * input.options.length, 1);
  if (combinations > CONTRACT_LIMITS.optionCombinations) context.addIssue({ code: 'custom', message: `select options combine to ${combinations} states (at most ${CONTRACT_LIMITS.optionCombinations})`, path: ['inputs'] });
  if (utf8(JSON.stringify(manifest)) > CONTRACT_LIMITS.manifestBytes) context.addIssue({ code: 'custom', message: `the manifest is over ${CONTRACT_LIMITS.manifestBytes} bytes`, path: [] });
});

// ---- artifact ---------------------------------------------------------------------------------------------------------

const sourceSchema = z.string().min(1).refine(text => utf8(text) <= CONTRACT_LIMITS.sourceBytes, `the source is over ${CONTRACT_LIMITS.sourceBytes} bytes`);
// What the author model supplies. Never versions, never hashes: the host stamps and computes those.
export const ProgramBundle = z.object({ manifest: ProgramManifest, source: sourceSchema }).strict();
export const ProgramArtifact = z.object({
  kind: z.literal(PROGRAM_KIND), schemaVersion: z.literal(SCHEMA_VERSION),
  runtimeVersion: version, sdkVersion: version, rendererVersion: version, runtimePolicyVersion: version, permissionProfileVersion: version,
  fingerprints: z.object({ engine: version, sdk: version, renderer: version }).strict(),
  dependencies: z.array(version).max(8).default([]),
  manifest: ProgramManifest, source: sourceSchema, sourceHash: hash, manifestHash: hash, bundleHash: hash,
}).strict();

// ---- evaluate request / frame / response ------------------------------------------------------------------------------

export const EvaluateRequest = z.object({
  requestId: z.string().min(1).max(64),
  inputs: z.record(name, z.union([finite(1e9), z.string().max(32)])).refine(record => Object.keys(record).length <= CONTRACT_LIMITS.inputs, 'too many inputs'),
  time: z.number().min(0).max(CONTRACT_LIMITS.duration),
  seed: z.number().int().min(0).max(0xffffffff),
  state: z.null(), // MVP: no guest state. Task 8 widens this to bounded JSON.
}).strict();

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
// A manifest requiring a capability this build lacks is unsupported_capability, not a malformed program.
export const unsupportedCapabilities = manifest => (manifest?.capabilities || []).filter(capability => !CAPABILITIES.includes(capability));
export function parseManifest(raw) {
  const result = parseWith(ProgramManifest, raw, 'invalid_program');
  if (!result.ok) return result;
  const missing = unsupportedCapabilities(result.value);
  return missing.length ? { ok: false, error: new RuntimeError('unsupported_capability'), issue: `capabilities: ${missing.join(', ')}` } : result;
}
export const parseBundle = raw => {
  const manifest = parseManifest(raw?.manifest);
  return manifest.ok ? parseWith(ProgramBundle, raw, 'invalid_program') : manifest;
};
export const parseArtifact = raw => {
  const manifest = parseManifest(raw?.manifest);
  return manifest.ok ? parseWith(ProgramArtifact, raw, 'invalid_program') : manifest;
};
export const parseEvaluateRequest = raw => parseWith(EvaluateRequest, raw, 'invalid_program');
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
export const parseGuestResult = raw => parseOutput(GuestResult, raw);
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
// stamps: { runtimeVersion, fingerprints: { engine, sdk, renderer }, dependencies?, ...overrides of PROGRAM_VERSIONS }.
export async function sealProgram(bundle, stamps) {
  const parsed = parseBundle(bundle);
  if (!parsed.ok) return parsed;
  const draft = { kind: PROGRAM_KIND, ...PROGRAM_VERSIONS, dependencies: [], ...stamps, ...parsed.value };
  return parseArtifact({ ...draft, ...(await computeHashes(draft)) });
}
// True only when every stored hash matches the artifact's actual content: the check before anything executes or is reviewed.
export async function verifyHashes(artifact) {
  const computed = await computeHashes(artifact);
  return computed.sourceHash === artifact.sourceHash && computed.manifestHash === artifact.manifestHash && computed.bundleHash === artifact.bundleHash;
}
