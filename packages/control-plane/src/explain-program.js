// /explain program artifacts (explain sandbox plan 5.2, Task 5): the server side of a generated JavaScript program.
// The author returns source plus a manifest (ProgramBundle); this module checks both against the frozen contract
// (packages/web/src/explain-program/contract.js, Agent B), seals them into the one ProgramArtifact the job stores with hashes
// the HOST computes (never a hash the model wrote), and answers the facts a reviewer reads. It runs no guest code: execution
// belongs to the pinned interpreter in the browser and in the review browser. The checks here are a fast, deterministic early
// refusal that gives the author a one-line fix; they are not the security boundary.
import { CAPABILITIES, CONTRACT_LIMITS, PROGRAM_VERSIONS, ProgramBundle, resolveInputs, sealProgram, unsupportedCapabilities, verifyHashes } from '../../web/src/explain-program/contract.js';
import { ENGINE_FINGERPRINT, ENGINE_VERSION } from '../../web/src/explain-program/limits.js';
import { sdkFingerprint } from '../../web/src/explain-program/sdk.js';

export const programEnabled = env => env.EXPLAIN_PROGRAM_ENABLED === 'true';
// Server-owned execution eligibility, separate from generation: an accepted artifact may be played unless the kill switch is set
// (EXPLAIN_PROGRAM_EXECUTION_KILL=true). The card runs a program only when the server's answer says allowed; a client flag never does.
export const programExecution = env => ({ allowed: env.EXPLAIN_PROGRAM_EXECUTION_KILL !== 'true' });
export { CAPABILITIES as PROGRAM_CAPABILITIES, CONTRACT_LIMITS as PROGRAM_LIMITS };

// The stamps this server seals into every artifact: exactly what Agent A's host accepts (host.js programStamps). The engine is named
// by its version and the SHA-256 of its WASM; QuickJS itself is never imported here. shortcut: switch to the shared stamps.js
// (ENGINE_VERSION, ENGINE_FINGERPRINT, SDK fingerprint) when it lands; a test pins equality with host.js programStamps().
export const programStamps = async () => ({ runtimeVersion: ENGINE_VERSION, fingerprints: { engine: ENGINE_FINGERPRINT, sdk: await sdkFingerprint(), renderer: PROGRAM_VERSIONS.rendererVersion } });

const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);

// Source is untrusted text, not a place to look for dangerous words: a lesson may legitimately mention "fetch", "import" or a URL in
// a label, and the isolated interpreter (not a pattern list) denies every capability. The early checks need no parser: some text, no
// control characters, no import statement (none can load), and the module format the runtime reads: an ES module that EXPORTS
// evaluate. A function that only exists globally cannot be read by the runtime, so it is refused here with the same stable code
// the runtime would answer (invalid_program) and a one-line fix, which repair can act on.
const EXPORTS_EVALUATE = /\bexport\s+(?:async\s+)?(?:function\s*\*?|const|let|var)\s+evaluate\b|\bexport\s*\{[^}]*\bevaluate\b[^}]*\}/;
export const EXPORT_FORMAT = 'export function evaluate({ inputs, time, seed, state }) { ... } returning { frame, quantities }';
export function sourceProblems(source) {
  if (typeof source !== 'string' || !source.trim()) return ['invalid_program: source must be JavaScript text'];
  const out = [];
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source)) out.push('invalid_program: source contains a control character');
  if (/^\s*import\b/m.test(source)) out.push('invalid_program: no import is available (the SDK is the global sdk); remove the import statement');
  if (!EXPORTS_EVALUATE.test(source)) out.push(`invalid_program: the module must export evaluate: ${EXPORT_FORMAT}`);
  return out;
}

// The author's draft -> { bundle } or { problems } (repairable, one sentence each) or { gap } for a capability the runtime lacks.
// An unknown key (a model-supplied hash, version, permission or limit) is a problem, never copied: ProgramBundle is strict.
export function checkProgramDraft(draft) {
  if (!plain(draft)) return { problems: ['the program must be {source, manifest}'] };
  const missing = unsupportedCapabilities(draft.manifest);
  if (missing.length) return { gap: { needs: ['other'], reason: `The explanation needs a capability that is not available yet (${missing.slice(0, 3).join(', ')}).` } };
  const problems = sourceProblems(draft.source);
  const parsed = ProgramBundle.safeParse(draft);
  if (!parsed.success) problems.push(...parsed.error.issues.slice(0, 8).map(issue => `${issue.path.join('.') || 'program'}: ${issue.message}`));
  return problems.length ? { problems: problems.map(p => p.slice(0, 400)) } : { bundle: parsed.data };
}

// The one stored artifact: the bundle plus the host's version stamps and computed hashes (contract.js sealProgram).
export async function buildProgramArtifact(bundle, stamps = null) {
  stamps ??= await programStamps();
  // The SDK fingerprint is the real hash of the SDK text the guest receives (sdk.js), so a changed SDK is a different bundle.
  const sealed = await sealProgram(bundle, stamps);
  if (!sealed.ok) throw Object.assign(new Error(sealed.issue || 'the program could not be sealed'), { code: 'invalid_program' });
  return sealed.value;
}
// A stored artifact is trusted only if its hashes still match its content (a result read back, an edit base).
export async function artifactIntact(artifact) {
  try { return plain(artifact) && await verifyHashes(artifact); } catch { return false; }
}

// Text in the manifest the learner reads, as the reviewer's "facts" (the source itself goes in its own block).
export const programFacts = manifest => [...new Set([manifest.summary, manifest.description, ...(manifest.assumptions || []), ...(manifest.inputs || []).flatMap(i => [i.label, ...(i.options || []).map(o => o.label)]), ...(manifest.readouts || []).map(r => r.label)].filter(Boolean).map(t => String(t).trim()))];

// The default state and the moments a first capture shows. shortcut: Task 6 replaces this by the stated sampling manifest
// (defaults, boundaries, selected combinations, intermediate poses); it is never claimed exhaustive.
export const defaultInputs = manifest => resolveInputs(manifest, {});
export const programMoments = manifest => (manifest.duration ? [0, Number((manifest.duration / 2).toFixed(3)), manifest.duration] : [0]);

// The bundle the author sees back on an edit or a repair: source and manifest only (never hashes it could copy).
export const draftOf = artifact => ({ source: artifact.source, manifest: artifact.manifest });

// What the learner's card keeps on the canvas, without the source: the source is read back through the authorized result route,
// so canvas JSON cannot carry executable text into the player.
export const programReference = (artifact, resultId) => ({ kind: artifact.kind, resultId, bundleHash: artifact.bundleHash });
