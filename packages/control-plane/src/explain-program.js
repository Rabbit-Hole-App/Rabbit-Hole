// /explain program artifacts (explain sandbox plan 5.2, Task 5): the server side of a generated JavaScript program.
// The author returns source plus a manifest (ProgramBundle); this module checks both against the frozen contract
// (packages/web/src/explain-program/contract.js, Agent B), seals them into the one ProgramArtifact the job stores with hashes
// the HOST computes (never a hash the model wrote), and answers the facts a reviewer reads. It runs no guest code: execution
// belongs to the pinned interpreter in the browser and in the review browser. The checks here are a fast, deterministic early
// refusal that gives the author a one-line fix; they are not the security boundary.
import { resolveTimeline } from '../../web/src/interact-composition.js';
import {
  CAPABILITIES, CONTRACT_LIMITS, ProgramBundle, STATEFUL_SCHEMA_VERSION, StatefulBundle, draftSchemaVersion, requiresHeatGrid, resolveInputs, sealProgram, unsupportedCapabilities, verifyHashes,
} from '../../web/src/explain-program/contract.js';
import { PROPS_CAPABILITY, PROPS_PROGRAM_STAMPS, STATEFUL_PROPS_PROGRAM_STAMPS, RENDERER_VERSION, CYCLIC_CAPABILITY, CYCLIC_PROGRAM_STAMPS, HEAT_GRID_PROGRAM_STAMPS, RASTER_CAPABILITY, RASTER_PROGRAM_STAMPS, STATEFUL_CYCLIC_PROGRAM_STAMPS, STATEFUL_HEAT_GRID_PROGRAM_STAMPS, STATEFUL_RASTER_PROGRAM_STAMPS, MEDIUM_CAPABILITY, MEDIUM_PROGRAM_STAMPS, STATEFUL_MEDIUM_PROGRAM_STAMPS, STATEFUL_VISUAL_PROGRAM_STAMPS, VISUAL_PROGRAM_STAMPS } from '../../web/src/explain-program/stamps.js';

export const programEnabled = env => env.EXPLAIN_PROGRAM_ENABLED === 'true';
// The one switch for stateful programs (schema 2: buttons, selections and state, Task 8.3): it offers the capability to the brief, the
// author and repair, and admits a stateful draft. The card, the host, the review render and repair support it whatever it says; set
// in no configuration yet, so generation stays schema 1 until it is turned on. Off: drafts parse exactly as before.
export const statefulEnabled = env => programEnabled(env) && env.EXPLAIN_PROGRAM_STATEFUL === 'true';
// Server-owned execution eligibility, separate from generation: an accepted artifact may be played unless the kill switch is set
// (EXPLAIN_PROGRAM_EXECUTION_KILL=true). The card runs a program only when the server's answer says allowed; a client flag never does.
export const programExecution = env => ({ allowed: env.EXPLAIN_PROGRAM_EXECUTION_KILL !== 'true' });
export { CAPABILITIES as PROGRAM_CAPABILITIES, CONTRACT_LIMITS as PROGRAM_LIMITS };

// The stamps this server seals into every artifact are the host's own pins (stamps.js: imports nothing, so neither QuickJS nor zod
// comes with it); the host answers version_unavailable if any differs, and stamps.test.mjs fails on drift.
export { VISUAL_PROGRAM_STAMPS as PROGRAM_STAMPS };

const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);

// Source is untrusted text, not a place to look for dangerous words: a lesson may legitimately mention "fetch", "import" or a URL in
// a label, and the isolated interpreter (not a pattern list) denies every capability. The early checks need no parser: some text, no
// control characters, no import statement (none can load), and the module format the runtime reads: an ES module that EXPORTS
// evaluate. A function that only exists globally cannot be read by the runtime, so it is refused here with the same stable code
// the runtime would answer (invalid_program) and a one-line fix, which repair can act on.
const exportsName = name => new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function\\s*\\*?|const|let|var)\\s+${name}\\b|\\bexport\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`);
export const EXPORT_FORMAT = 'export function evaluate({ inputs, time, seed, state }) { ... } returning { frame, quantities }';
// A stateful program (schema 2) exports all three; the runtime refuses an operation whose export is missing (invalid_program) anyway.
export const STATEFUL_EXPORTS = Object.freeze({ initialState: 'export function initialState({ inputs, seed }) { ... } returning the first state', reduce: 'export function reduce({ state, event, inputs, time, seed }) { ... } returning the next state', evaluate: EXPORT_FORMAT });
export function sourceProblems(source, schemaVersion = 1) {
  if (typeof source !== 'string' || !source.trim()) return ['invalid_program: source must be JavaScript text'];
  const out = [];
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source)) out.push('invalid_program: source contains a control character');
  if (/^\s*import\b/m.test(source)) out.push('invalid_program: no import is available (the SDK is the global sdk); remove the import statement');
  const exports = schemaVersion === STATEFUL_SCHEMA_VERSION ? STATEFUL_EXPORTS : { evaluate: EXPORT_FORMAT };
  for (const [name, format] of Object.entries(exports)) if (!exportsName(name).test(source)) out.push(`invalid_program: the module must export ${name}: ${format}`);
  return out;
}

// The author's draft -> { bundle, schemaVersion } or { problems } (repairable, one sentence each) or { gap } for a capability the runtime
// lacks. An unknown key (a model-supplied hash, version, permission or limit) is a problem, never copied: both bundles are strict. With
// stateful off, a draft is read as schema 1 exactly as before (a viewport, actions or targets are unknown keys).
export function checkProgramDraft(draft, { stateful = false } = {}) {
  if (!plain(draft)) return { problems: ['the program must be {source, manifest}'] };
  const missing = unsupportedCapabilities(draft.manifest);
  if (missing.length) return { gap: { needs: ['other'], reason: `The explanation needs a capability that is not available yet (${missing.slice(0, 3).join(', ')}).` } };
  const schemaVersion = stateful ? draftSchemaVersion(draft) : 1;
  const problems = sourceProblems(draft.source, schemaVersion);
  const parsed = (schemaVersion === STATEFUL_SCHEMA_VERSION ? StatefulBundle : ProgramBundle).safeParse(draft);
  if (!parsed.success) problems.push(...parsed.error.issues.slice(0, 8).map(issue => `${issue.path.join('.') || 'program'}: ${issue.message}`));
  return problems.length ? { problems: problems.map(p => p.slice(0, 400)) } : { bundle: parsed.data, schemaVersion };
}

// The one stored artifact: the bundle plus the host's version stamps and computed hashes (contract.js sealProgram). A stateful bundle
// (it declares a viewport, actions or targets) is sealed as schema 2.
// The stamps the server seals a program with, from the capabilities it declares and its schema: the one rule buildProgramArtifact applies,
// and what /interact's per-panel runtime binding (interact-design.js) resolves a planned tuple against.
export function programStampsFor(capabilities, stateful) {
  const has = capability => Array.isArray(capabilities) && capabilities.includes(capability);
  return requiresHeatGrid({ capabilities }) ? (stateful ? STATEFUL_HEAT_GRID_PROGRAM_STAMPS : HEAT_GRID_PROGRAM_STAMPS)
    : has(RASTER_CAPABILITY) ? (stateful ? STATEFUL_RASTER_PROGRAM_STAMPS : RASTER_PROGRAM_STAMPS)
    : has(CYCLIC_CAPABILITY) ? (stateful ? STATEFUL_CYCLIC_PROGRAM_STAMPS : CYCLIC_PROGRAM_STAMPS) : has(MEDIUM_CAPABILITY) ? (stateful ? STATEFUL_MEDIUM_PROGRAM_STAMPS : MEDIUM_PROGRAM_STAMPS)
    : has(PROPS_CAPABILITY) ? (stateful ? STATEFUL_PROPS_PROGRAM_STAMPS : PROPS_PROGRAM_STAMPS)
    : (stateful ? STATEFUL_VISUAL_PROGRAM_STAMPS : VISUAL_PROGRAM_STAMPS);
}
// The whole version tuple of a sealed artifact (stamps.js SUPPORTED_PROGRAM_TUPLES entries are built the same way).
export const programTupleFor = (capabilities, stateful) => ({ schemaVersion: 1, sdkVersion: 'sdk-1', rendererVersion: RENDERER_VERSION, ...programStampsFor(capabilities, stateful) });
export async function buildProgramArtifact(bundle, stamps) {
  if (stamps === undefined) stamps = programStampsFor(bundle?.manifest?.capabilities, draftSchemaVersion(bundle) === STATEFUL_SCHEMA_VERSION);
  const sealed = await sealProgram(bundle, stamps);
  if (!sealed.ok) throw Object.assign(new Error(sealed.issue || 'the program could not be sealed'), { code: 'invalid_program' });
  return sealed.value;
}
// A stored artifact is trusted only if its hashes still match its content (a result read back, an edit base).
export async function artifactIntact(artifact) {
  try { return plain(artifact) && await verifyHashes(artifact); } catch { return false; }
}

// Text in the manifest the learner reads, as the reviewer's "facts" (the source itself goes in its own block).
export const programFacts = manifest => [...new Set([manifest.summary, manifest.description, manifest.cardDescription, manifest.timeline?.label, ...(manifest.timeline?.markers || []).map(marker => marker.label), ...(manifest.assumptions || []), ...(manifest.inputs || []).flatMap(i => [i.label, ...(i.options || []).map(o => o.label)]), ...(manifest.readouts || []).map(r => r.label), ...(manifest.actions || []).map(a => a.label), ...(manifest.targets || []).map(t => t.label)].filter(Boolean).map(t => String(t).trim()))];

// The default state and the declared playback moments; programCaptureManifest (explain-render.js) samples them and the boundary
// input states within the capture budget, and states what it sampled and omitted. Never claimed exhaustive.
export const defaultInputs = manifest => resolveInputs(manifest, {});
// A card whose timeline names markers (interact.md INT-01 mode.timeline) is captured at them: the moments the design says the learner must be able to see.
// composition + inputs (interact-composition.js; new /interact cards): the endpoint and markers are those of THAT input state, so each tested
// state is planned against its own end (INT-05-C03). Without a composition this is exactly the legacy planner.
export const programMoments = (manifest, composition = null, inputs = {}) => {
  const timeline = composition ? resolveTimeline(composition, inputs) : null, end = timeline ? timeline.end : manifest.duration;
  if (!end) return [0];
  const marked = [...new Set((timeline ? timeline.markers : manifest.timeline?.markers || []).map(marker => marker.time))].filter(time => time > 0 && time < end).sort((a, b) => a - b).slice(0, 3);
  return marked.length ? [0, ...marked, end] : [0, Number((end / 2).toFixed(3)), end];
};

// The bundle the author sees back on an edit or a repair: source and manifest only (never hashes it could copy).
export const draftOf = artifact => ({ source: artifact.source, manifest: artifact.manifest });

// What the learner's card keeps on the canvas, without the source: the source is read back through the authorized result route,
// so canvas JSON cannot carry executable text into the player.
export const programReference = (artifact, resultId) => ({ kind: artifact.kind, resultId, bundleHash: artifact.bundleHash });
