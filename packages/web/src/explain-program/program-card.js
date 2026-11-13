import { RuntimeError, STATEFUL_SCHEMA_VERSION, draftSchemaVersion, parseArtifact, resolveInputs, sealProgram, stateProblem, verifyHashes } from './contract.js';
import { resolveTimeline } from '../interact-composition.js';
import { compositionOf } from '../interact-composition-adapter.js';
import { RASTER_CAPABILITY, RASTER_PROGRAM_STAMPS, CYCLIC_CAPABILITY, CYCLIC_PROGRAM_STAMPS, MEDIUM_CAPABILITY, MEDIUM_PROGRAM_STAMPS } from './stamps.js';

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
    const { MEDIUM_FIXTURES } = await import('./medium-fixtures.js');
    const { cyclicNetworkFixture } = await import('./cyclic-fixture.js');
    const { RASTER_FIXTURES } = await import('./raster-fixtures.js');
    const { AI_TEACHING_FIXTURES } = await import('./ai-teaching-fixtures.js');
    const fixture = [...FIXTURES, ...STATEFUL_FIXTURES, ...ERROR_FIXTURES, ...MEDIUM_FIXTURES, cyclicNetworkFixture, ...RASTER_FIXTURES, ...AI_TEACHING_FIXTURES].find(item => item.id === ref.fixtureId);
    if (!fixture) return refuse('invalid_program', 'unknown fixture');
    const bundle = { manifest: fixture.manifest, source: fixture.source };
    const fixtureStamps = bundle.manifest.capabilities.includes(RASTER_CAPABILITY) ? RASTER_PROGRAM_STAMPS : bundle.manifest.capabilities.includes(CYCLIC_CAPABILITY) ? CYCLIC_PROGRAM_STAMPS : bundle.manifest.capabilities.includes(MEDIUM_CAPABILITY) ? MEDIUM_PROGRAM_STAMPS : stamps;
    const sealed = await sealProgram(bundle, { ...fixtureStamps, schemaVersion: draftSchemaVersion(bundle) });
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
  // Task 9.4: the owner's answer names the sources the result was made from (identity only; a share link's names none).
  return { ok: true, artifact: parsed.value, ...(Array.isArray(answer.sources) ? { sources: answer.sources } : {}) };
}

// ---- learner state ----------------------------------------------------------------------------------------------------

export const programInputs = (manifest, block) => resolveInputs(manifest, block.inputs);
// Time helpers. composition (interact-composition.js CardComposition, new /interact cards only) makes the endpoint, pacing, markers and
// displayed origin depend on the current inputs: pass it with the inputs the card is at. Absent composition = exactly the legacy
// behaviour, so saved cards are unchanged. manifest.duration stays the maximum admitted duration across the input range.
const timelineOf = (composition, inputs) => (composition ? resolveTimeline(composition, inputs) : null);
export const programDuration = (manifest, composition = null, inputs = {}) => {
  const timeline = timelineOf(composition, inputs);
  return timeline ? (manifest.duration ? Math.min(timeline.end, manifest.duration) : timeline.end) : manifest.duration ?? 0;
};
// A time within half a step of a timeline marker is the marker (see snapToMarker): the saved moment keeps four decimals, the marker has more, so every evaluation uses the exact one.
export const clampTime = (manifest, time, composition = null, inputs = {}) => snapToMarker(manifest, Math.min(programDuration(manifest, composition, inputs), Math.max(0, Number.isFinite(time) ? time : 0)), composition, inputs);
export const programTime = (manifest, block, composition = null) => clampTime(manifest, block.time ?? 0, composition, composition ? programInputs(manifest, block) : {});
// Optional manifest.timeline (interact.md INT-01 mode.timeline). Elapsed time always starts at zero; the label shows elapsed + displayOffset.
export const playbackRate = (manifest, composition = null, inputs = {}) => timelineOf(composition, inputs)?.playbackRate ?? manifest.timeline?.playbackRate ?? 1;
export const scrubStep = (manifest, composition = null) => (composition?.main?.timeline || manifest.timeline ? 0.001 : 0.05);
export const savedTime = (manifest, time, composition = null, inputs = {}) => Number(clampTime(manifest, time, composition, inputs).toFixed(composition?.main?.timeline || manifest.timeline ? 4 : 2));
// A scrub within half a step of a named marker lands exactly on it, so a pointer or key seek reaches the stated moment.
export const snapToMarker = (manifest, value, composition = null, inputs = {}) => {
  const markers = timelineOf(composition, inputs)?.markers ?? manifest.timeline?.markers ?? [];
  const near = markers.find(marker => Math.abs(marker.time - value) <= scrubStep(manifest, composition) / 2);
  return near ? near.time : value;
};
export const timeLabel = (manifest, elapsed, composition = null, inputs = {}) => {
  const timeline = timelineOf(composition, inputs) ?? manifest.timeline;
  if (!timeline) return `${elapsed.toFixed(1)}s`;
  const shown = Number((elapsed + (timeline.displayOffset ?? 0)).toFixed(2));
  return `${shown > 0 && timeline.displayOffset ? '+' : shown < 0 ? '\u2212' : ''}${Math.abs(shown).toFixed(2)}s`;
};

// A changed input: same block when nothing changes (so no write and no revision bump), else new inputs and a new revision.
export function setProgramInput(block, manifest, name, value) {
  const current = programInputs(manifest, block);
  if (!Object.hasOwn(current, name)) return block;
  const next = resolveInputs(manifest, { ...current, [name]: value });
  return next[name] === current[name] ? block : { ...block, inputs: next, inputRevision: (block.inputRevision || 0) + 1 };
}
// The same change under a composition (new /interact cards): a timed scene's onInputChange policy is reset_pause, so a changed input also returns time to zero
// (the caller pauses; frames in flight for the old inputs are dropped by the new inputRevision). recompute_still and a legacy card keep their time.
export const resetsOnInput = composition => composition?.main?.onInputChange === 'reset_pause';
export function setProgramInputUnder(block, manifest, name, value, composition = null) {
  const next = setProgramInput(block, manifest, name, value);
  return next !== block && resetsOnInput(composition) ? { ...next, time: 0 } : next;
}
// What ProgramScene does for a changed input (INT-04-C08): null when nothing changed, else the block to save, the moment the card goes to and that it is
// paused. A timed composition (reset_pause) returns to time zero, so the endpoint, markers and supporting comparison are read for the new inputs from the
// start; the caller also bumps the card's epoch (a jump in time), and the new inputRevision keys out frames still in flight for the old inputs.
export function inputChange(block, manifest, name, value, composition = null, time = 0) {
  const next = setProgramInputUnder(block, manifest, name, value, composition);
  return next === block ? null : { block: next, time: resetsOnInput(composition) ? 0 : time, playing: false };
}
// The one transport button (Play, Pause, Replay): where it seeks first (null: stays) and whether it then toggles playing. At the endpoint of the CURRENT
// inputs it is Replay: back to zero and play, the inputs untouched. Reduced motion shows the end instead of travelling to it.
export function pressPlay({ time, duration, playing, reduced }) {
  const end = time >= duration - 0.001;
  return reduced ? { seek: end ? 0 : duration, toggle: false } : { seek: end && !playing ? 0 : null, toggle: true };
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
export const evaluateRequestFor = (manifest, block, time, requestId, state = null, composition = null) => ({
  requestId: String(requestId), inputs: programInputs(manifest, block), time: clampTime(manifest, time, composition, composition ? programInputs(manifest, block) : {}), seed: programSeed(block), state,
});

// What a learner sees for a failure: only the fixed message of the normalised code (contract.js).
export const programErrorMessage = error => new RuntimeError(error?.code).message;

// Task 9.3: what this page has already loaded of each program card, for its context (Tutor, composer) without fetching the program
// again. Keyed by the saved card identity (card, bundle, result), so a new artifact or an applied revision is a different entry;
// it holds the host-verified manifest and the last drawn frame's readouts with the inputs and time they were drawn at. Never source.
const loaded = new Map();
const LOADED_CARDS = 64;
export function rememberProgram(block, manifest, drawn = null) {
  const key = savedKey(block), { playing = false, committed = null } = loaded.get(key) || {};
  loaded.delete(key);
  // revision: the committed state revision the frame was drawn from (schema 2; null for schema 1).
  loaded.set(key, { manifest, playing, committed, drawn: drawn && { inputs: JSON.stringify(drawn.inputs), time: drawn.time, readouts: drawn.readouts, revision: drawn.revision ?? null } });
  if (loaded.size > LOADED_CARDS) loaded.delete(loaded.keys().next().value);
}
export const loadedProgram = block => loaded.get(savedKey(block)) ?? null;
// Whether the card is playing: while it plays, the shown moment runs ahead of the saved block.time (saved again at Pause).
export function programPlayback(block, playing) {
  const entry = loaded.get(savedKey(block));
  if (entry) entry.playing = playing;
}
// FX-61: the card's committed state revision and the learner event it came from (use-program-state.js envelope and last). The
// description binds both the action and the readouts to the revision of the frame actually displayed.
export function programActivity(block, event, revision = null) {
  const entry = loaded.get(savedKey(block));
  if (entry) entry.committed = { event: event ?? null, revision };
}

const labelOf = (list, id) => (list || []).find(item => item.id === id)?.label ?? null;
// The last learner event in the words the card shows (its declared labels); null for anything the manifest does not name.
function activityText(manifest, event) {
  const target = labelOf(manifest.targets, event?.target), input = manifest.inputs.find(item => item.id === event?.input);
  if (event?.type === 'action') { const label = labelOf(manifest.actions, event.action); return label && `pressed "${label}"`; }
  if (event?.type === 'select') return target && `selected "${target}"`;
  if (event?.type === 'drag_end' || event?.type === 'drag_move') return target && `moved "${target}"`;
  if (event?.type === 'input') return input ? `set ${input.label} to ${valueText(input, event.value)}` : null;
  return null;
}
const valueText = (input, value) => `${input.type === 'select' ? input.options.find(option => option.value === value)?.label ?? value : input.type === 'boolean' ? (value ? 'On' : 'Off') : input.type === 'index' ? input.items[value]?.label ?? value : value}${input.unit ? ` ${input.unit}` : ''}`;
// The SceneControls widget a manifest select, boolean or index input is drawn with (a number input has its own slider): { declaration, data } for InputWidget. inputs_v2 types reuse the
// spec scenes' BoolToggle, IndexPicker and IndexSlider; the value is a boolean or the item position.
export function programInputWidget(input) {
  if (input.type === 'boolean') return { declaration: { name: input.id, type: 'bool', label: input.label }, data: {} };
  if (input.type === 'index') return { declaration: { name: input.id, type: 'index', label: input.label, of: 'items', presentation: input.presentation ?? 'picker' }, data: { items: input.items.map(item => item.label) } };
  return { declaration: { name: input.id, type: 'choice', label: input.label, options: input.options.map(option => ({ id: option.value, label: option.label })) }, data: {} };
}
export const PROGRAM_DESCRIPTION = 2000;
// The composer and tutor context for a program card: what the learner can see and has set, never source. manifest: the resolved
// artifact's (by default what this page loaded for this exact card). The moment and readouts are the drawn frame's, and only while
// it was drawn at the card's current inputs (the shown moment runs ahead of the saved time during Play); else the saved time, with
// the readouts said to be not drawn. Without a loaded manifest it says what is not known rather than guessing.
export function describeProgram(block, manifest = loadedProgram(block)?.manifest ?? null, composition = undefined) {
  // An /interact card states the endpoint of its own inputs: its saved composition (null for a legacy card or one that does not hold together) unless the caller gave one.
  if (composition === undefined) { const saved = compositionOf(block); composition = saved && !saved.problems ? saved : null; }
  const lines = [`Interactive explanation on the canvas: ${block.title}`];
  if (manifest) {
    lines.push(manifest.summary, `What it shows: ${manifest.description}`);
    if (manifest.assumptions.length) lines.push(`Assumptions: ${manifest.assumptions.join(' ')}`);
    const inputs = programInputs(manifest, block), entry = loadedProgram(block);
    for (const input of manifest.inputs) lines.push(`${input.label}: ${valueText(input, inputs[input.id])}`);
    // The drawn frame counts only at the card's current inputs and, for a stateful card, its current committed state: a frame of an
    // older state (the newer one is still being drawn) is never described as current.
    const current = entry?.committed ? entry.committed.revision : block.programState?.revision ?? null;
    const drawn = entry?.drawn?.inputs === JSON.stringify(inputs) && entry.drawn.revision === current ? entry.drawn : null, time = drawn ? clampTime(manifest, drawn.time, composition, inputs) : programTime(manifest, block, composition);
    const total = programDuration(manifest, composition, inputs);
    if (total) lines.push(`${drawn && entry.playing ? 'Playing, now at' : 'Paused at'} ${time.toFixed(1)}s of ${composition ? Number(total.toFixed(3)) : total}s`);
    // Schema 2 (FX-61): what the learner can press and select, by the card's own labels, and the action the shown state came from.
    const actions = manifest.actions || [], targets = manifest.targets || [], dragged = targets.filter(target => target.drag);
    if (actions.length) lines.push(`Buttons: ${actions.map(action => action.label).join(', ')}`);
    if (targets.length) lines.push(`Parts the learner can select: ${targets.map(target => target.label).join(', ')}${dragged.length ? ` (${dragged.map(target => target.label).join(', ')} can also be dragged)` : ''}`);
    const last = entry?.committed?.event && activityText(manifest, entry.committed.event);
    if (last) lines.push(drawn ? `The learner last ${last}; the picture shows the result.` : `The learner last ${last}; its result is not drawn yet; do not state its values.`);
    if (drawn) { if (drawn.readouts.length) lines.push(`Shown now: ${drawn.readouts.map(r => `${r.label} ${r.text}`).join('; ')}`); }
    else if (manifest.readouts.length) lines.push(`Its readouts (${manifest.readouts.map(r => r.label).join(', ')}) are not drawn for these settings yet; do not state their values.`);
  } else lines.push('Its controls, settings and readouts are not loaded on this page yet; do not state their values.');
  return { kind: 'Explanation', title: block.title, text: lines.join('\n').slice(0, PROGRAM_DESCRIPTION) };
}
