import { RuntimeError, STATEFUL_SCHEMA_VERSION, draftSchemaVersion, parseArtifact, resolveInputs, sealProgram, stateProblem, verifyHashes } from './contract.js';

// The program card's pure logic (no React): what a block holds, how a saved reference becomes a runnable artifact, and how
// inputs and time turn into EvaluateRequests. ProgramScene.jsx is the thin view over this.
//
// What a program card block holds. It never holds source: a saved or pasted block carries only a reference, and the artifact
// is fetched from the server's authorized result route each time.
//   block.program = { bundleHash }   an accepted program; resolved through block.explain (resultId, revision, cardId)
//   block.program = { fixtureId }    CI and dev only, admitted by a build flag (fixturesAdmitted); hand-authored test data
// Learner state reuses the scene card's fields: block.inputs, block.inputRevision, block.time.

export const isProgramBlock = block => block?.type === 'animation' && !!block.program && typeof block.program === 'object';

// The build flags that admit seeded fixture cards: VITE_EXPLAIN_PROGRAM_FIXTURES, or the dev and review build's own
// VITE_COACHING_DEV (flags.js reviewTools), which every CI and dev build sets so no workflow has to change. A production build
// sets neither, so a fixture reference in a saved block is refused there. import.meta.env is passed in by the caller.
export const fixturesAdmitted = env => env?.VITE_EXPLAIN_PROGRAM_FIXTURES === 'true' || env?.VITE_COACHING_DEV === 'true';

const refuse = (code, diagnostic) => ({ ok: false, error: new RuntimeError(code, diagnostic) });

// Result: { ok: true, artifact } or { ok: false, error: RuntimeError }.
// client: explainClient(api, boardId) for the owner, sharedProgramClient(token) on a share link. Its result(resultId, cardId) is the durable
// saved result (never the job record, which is pruned): { artifact, identity, execution }. stamps: sealProgram's version stamps for
// fixtures. Never evaluates anything; it only decides which artifact may be run.
export async function resolveProgram(block, { client, fixtures = false, stamps = null } = {}) {
  const ref = block?.program;
  if (!ref) return refuse('invalid_program', 'not a program card');
  if (ref.fixtureId !== undefined) {
    if (!fixtures || !stamps) return refuse('invalid_program', 'fixture cards are not admitted in this build');
    const { FIXTURES, STATEFUL_FIXTURES, ERROR_FIXTURES } = await import('./fixtures.js');
    const fixture = [...FIXTURES, ...STATEFUL_FIXTURES, ...ERROR_FIXTURES].find(item => item.id === ref.fixtureId);
    if (!fixture) return refuse('invalid_program', 'unknown fixture');
    const bundle = { manifest: fixture.manifest, source: fixture.source };
    const sealed = await sealProgram(bundle, { ...stamps, schemaVersion: draftSchemaVersion(bundle) });
    return sealed.ok ? { ok: true, artifact: sealed.value } : { ok: false, error: sealed.error };
  }
  const identity = block.explain;
  if (!client || !identity?.resultId || !identity.revision || !ref.bundleHash) return refuse('version_unavailable', 'no accepted result for this card');
  let answer;
  try { answer = await client.result(identity.resultId, block.id); } catch (problem) { return refuse('version_unavailable', `result route failed: ${problem?.status ?? 'network'}`); }
  const result = answer?.identity;
  // It must be this card's own accepted result at the revision the card saved, on this canvas (a share link's answer names no canvas:
  // its server read is bound to the link's own board).
  if (!result || result.resultId !== identity.resultId || result.revision !== identity.revision || result.cardId !== block.id
    || ('canvas' in result && result.canvas?.boardId !== identity.canvas?.boardId)) return refuse('version_unavailable', 'result does not match this card');
  // Server execution policy: the server decides whether this audience may run it (eligibility and kill switch).
  if (answer.execution?.allowed !== true) return refuse('unsupported_capability', 'execution is not allowed by the server');
  const parsed = parseArtifact(answer.artifact);
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
// Reset: defaults for every input and time zero, and no saved program state (the card initializes again with its seed). It does
// not touch the program or its revision.
export const resetProgram = block => { const { programState: _state, ...rest } = block; return { ...rest, inputs: {}, inputRevision: (block.inputRevision || 0) + 1, time: 0 }; };

// A schema 2 card's learner state, beside inputs and time: block.programState = { bundleHash, state, revision, seed, inputs }
// (interaction.js commits it; inputs is the snapshot the state was computed and checked with, normalized to the manifest's inputs).
// Used only for the artifact it was made by and only when it is still within the state rule; anything else is incompatible and null,
// so the card initializes again instead of handing an unrelated state to this source.
export const programSeed = block => (Number.isInteger(block?.seed) ? block.seed : 0);
export function programStateFor(block, artifact) {
  const saved = block?.programState;
  if (artifact?.schemaVersion !== STATEFUL_SCHEMA_VERSION || !saved || typeof saved !== 'object' || saved.bundleHash !== artifact.bundleHash) return null;
  const { bundleHash, state, revision, seed } = saved;
  const fits = Number.isInteger(revision) && revision >= 0 && Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff && stateProblem(state) === null;
  return fits ? { bundleHash, state, revision, seed, inputs: resolveInputs(artifact.manifest, saved.inputs) } : null;
}

// A share link's visitor plays with the card in memory only (ProgramScene): their changes are kept beside the saved card, never
// saved, and shown only while the card is still the same saved card. Nothing kept (a reload): the saved card itself.
const savedKey = block => `${block.id}|${block.program?.bundleHash}|${block.explain?.resultId}`;
export const keptProgram = (saved, next) => ({ key: savedKey(saved), block: next });
export const shownProgram = (saved, kept) => (kept?.key === savedKey(saved) ? kept.block : saved);

// The request the host evaluates. requestId is the card's own counter so a late answer can be recognised and dropped. state: the
// committed schema 2 state (null for schema 1).
export const evaluateRequestFor = (manifest, block, time, requestId, state = null) => ({
  requestId: String(requestId), inputs: programInputs(manifest, block), time: clampTime(manifest, time), seed: programSeed(block), state,
});

// What a learner sees for a failure: only the fixed message of the normalised code (contract.js).
export const programErrorMessage = error => new RuntimeError(error?.code).message;

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
