import { RuntimeError, parseArtifact, resolveInputs, sealProgram, verifyHashes } from './contract.js';

// The program card's pure logic (no React): what a block holds, how a saved reference becomes a runnable artifact, and how
// inputs and time turn into EvaluateRequests. ProgramScene.jsx is the thin view over this.
//
// What a program card block holds. It never holds source: a saved or pasted block carries only a reference, and the artifact
// is fetched from the server's authorized result route each time.
//   block.program = { bundleHash }   an accepted program; resolved through block.explain (jobId, resultId, revision, cardId)
//   block.program = { fixtureId }    CI and dev only, admitted by a build flag (fixturesAdmitted); hand-authored test data
// Learner state reuses the scene card's fields: block.inputs, block.inputRevision, block.time.

export const isProgramBlock = block => block?.type === 'animation' && !!block.program && typeof block.program === 'object';

// The build flag that admits seeded fixture cards. Production builds do not set it, so a fixture reference in a saved
// block is refused there. import.meta.env is passed in by the caller.
export const fixturesAdmitted = env => env?.VITE_EXPLAIN_PROGRAM_FIXTURES === 'true';

const refuse = (code, diagnostic) => ({ ok: false, error: new RuntimeError(code, diagnostic) });

// Result: { ok: true, artifact } or { ok: false, error: RuntimeError }.
// client: explainClient(api, boardId) (get(jobId) is the existing authorized job route). stamps: sealProgram's version stamps for
// fixtures. Never evaluates anything; it only decides which artifact may be run.
export async function resolveProgram(block, { client, fixtures = false, stamps = null } = {}) {
  const ref = block?.program;
  if (!ref) return refuse('invalid_program', 'not a program card');
  if (ref.fixtureId !== undefined) {
    if (!fixtures || !stamps) return refuse('invalid_program', 'fixture cards are not admitted in this build');
    const { FIXTURES } = await import('./fixtures.js');
    const fixture = FIXTURES.find(item => item.id === ref.fixtureId);
    if (!fixture) return refuse('invalid_program', 'unknown fixture');
    const sealed = await sealProgram({ manifest: fixture.manifest, source: fixture.source }, stamps);
    return sealed.ok ? { ok: true, artifact: sealed.value } : { ok: false, error: sealed.error };
  }
  const identity = block.explain;
  if (!client || !identity?.jobId || !identity.resultId || !identity.revision || !ref.bundleHash) return refuse('version_unavailable', 'no accepted result for this card');
  let job;
  try { job = await client.get(identity.jobId); } catch (problem) { return refuse('version_unavailable', `result route failed: ${problem?.status ?? 'network'}`); }
  const result = job?.result;
  // The job must be this card's own accepted, ready result on this canvas, at the revision the card saved.
  if (job?.stage !== 'ready' || !result || result.resultId !== identity.resultId || result.revision !== identity.revision
    || result.cardId !== block.id || result.canvas?.boardId !== identity.canvas?.boardId) return refuse('version_unavailable', 'result does not match this card');
  // Server execution policy: the server decides whether this audience may run it (eligibility and kill switch).
  if (result.execution?.allowed !== true) return refuse('unsupported_capability', 'execution is not allowed by the server');
  const parsed = parseArtifact(result.program);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (parsed.value.bundleHash !== ref.bundleHash || !(await verifyHashes(parsed.value))) return refuse('version_unavailable', 'bundle hash mismatch');
  return { ok: true, artifact: parsed.value };
}

// ---- learner state ----------------------------------------------------------------------------------------------------

export const programInputs = (manifest, block) => resolveInputs(manifest, block.inputs);
export const programDuration = manifest => manifest.duration ?? 0;
export const clampTime = (manifest, time) => Math.min(programDuration(manifest), Math.max(0, Number.isFinite(time) ? time : 0));
export const programTime = (manifest, block) => clampTime(manifest, block.time ?? 0);

// A changed input: same block when nothing changes (so no write and no revision bump), else new inputs and a new revision.
export function setProgramInput(block, manifest, name, value) {
  const current = programInputs(manifest, block);
  if (!Object.hasOwn(current, name)) return block;
  const next = resolveInputs(manifest, { ...current, [name]: value });
  return next[name] === current[name] ? block : { ...block, inputs: next, inputRevision: (block.inputRevision || 0) + 1 };
}
export const programChanged = (manifest, block) => JSON.stringify(programInputs(manifest, block)) !== JSON.stringify(resolveInputs(manifest, {}));
// Reset: defaults for every input and time zero. It does not touch the program or its revision.
export const resetProgram = block => ({ ...block, inputs: {}, inputRevision: (block.inputRevision || 0) + 1, time: 0 });

// The request the host evaluates. requestId is the card's own counter so a late answer can be recognised and dropped.
export const evaluateRequestFor = (manifest, block, time, requestId) => ({
  requestId: String(requestId), inputs: programInputs(manifest, block), time: clampTime(manifest, time), seed: Number.isInteger(block.seed) ? block.seed : 0, state: null,
});

// What a learner sees for a failure: only the fixed message of the normalised code (contract.js).
export const programErrorMessage = error => new RuntimeError(error?.code).message;

// A reply is current only for the request the card last sent.
export const isCurrentReply = (reply, latestRequestId) => reply?.requestId === String(latestRequestId);

// The composer and tutor context for a program card: what the learner can see and has set, never source.
export function describeProgram(block, manifest = null) {
  const lines = [`Interactive explanation on the canvas: ${block.title}`];
  if (manifest) {
    lines.push(manifest.summary, `What it shows: ${manifest.description}`);
    if (manifest.assumptions.length) lines.push(`Assumptions: ${manifest.assumptions.join(' ')}`);
    const inputs = programInputs(manifest, block);
    for (const input of manifest.inputs) lines.push(`${input.label}: ${inputs[input.id]}${input.unit ? ` ${input.unit}` : ''}`);
    if (manifest.duration) lines.push(`Paused at ${programTime(manifest, block).toFixed(1)}s of ${manifest.duration}s`);
  }
  return { kind: 'Explanation', title: block.title, text: lines.join('\n') };
}
