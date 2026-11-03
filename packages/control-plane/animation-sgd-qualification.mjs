// SGD qualification assertions (owner 2026-11-02, answer 5): a deterministic check that a candidate /animation artifact for the SGD
// request declares and computes the four required readouts: step, passes through the data, loss and distance from the lowest point,
// with the right values. It runs the candidate's own program on the real pinned engine and compares with this file's own model. No model
// call, no browser, no label matching: readouts are found by id only.
//
// Stable identifiers: the approved plan supplies the PARAMETER ids (learningRate, batchSize) and the quantities in prose only
// (assumptions[5]: "step number, passes through the data, full-data loss, distance from the lowest point"). It supplies no readout or
// action ids, so they are explicit options (DEFAULT_IDS: the ids of the saved job aj_086fd46 and of the offline fixture). A candidate
// that names a readout differently fails this check until the ids are passed; the check never guesses from a label.
// This checks one deterministic scene shape (a quadratic bowl, one learning rate, one batch size). It does not prove that every future
// generation keeps its readouts, and it is not a general schema for required outputs.
//   node animation-sgd-qualification.mjs <file> [--ids step=stepNo,passes=passes,loss=loss,dist=dist] [--actions step=oneStep,keep=keepPath]
// <file>: an offline fixture ({draft, plan, ...}), a saved job export ({authorDraft, repairedDraft, ...}: both are checked, the repaired
// one is the "after repair" case) or a sealed artifact. Exit 1 when any check fails.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ANIMATION_CAPABILITIES } from '../web/src/animation3d/capabilities.js';
import { runReviewProgram } from '../web/src/animation3d/review.js';
import { loadEngine, runProgram } from '../web/src/explain-program/runtime.js';
import { sha256Hex, canonicalJson } from '../web/src/explain-program/contract.js';
import { sealArtifact } from './src/animation-author.js';
import { captureViews } from './src/animation-render.js';

export const DEFAULT_IDS = Object.freeze({ readouts: Object.freeze({ step: 'stepNo', passes: 'passes', loss: 'loss', dist: 'dist' }), actions: Object.freeze({ step: 'oneStep', keep: 'keepPath' }), params: Object.freeze({ learningRate: 'learningRate', batchSize: 'batchSize' }) });
// The model the qualification compares with: loss = 0.5 (A w^2 + C b^2), a run starts at (w0, b0); the plan: steeper along the intercept.
export const DEFAULT_MODEL = Object.freeze({ A: 0.5, C: 2, start: Object.freeze([-2.8, 1.3]), dataPoints: 64 });

let engine;
const workerFactory = () => {
  const worker = { terminated: false, terminate() { worker.terminated = true; },
    postMessage(message) { queueMicrotask(() => { if (!worker.terminated) worker.onmessage?.({ data: { id: message.id, ...runProgram(engine, message) } }); }); } };
  queueMicrotask(() => worker.onmessage?.({ data: { ready: true } }));
  return worker;
};

const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
// The plan's own update on the model, with no noise (batch = all data): w and b after k steps at learning rate lr.
export function fullBatchAfter(k, lr, model = DEFAULT_MODEL) {
  let [w, b] = model.start;
  for (let i = 0; i < k; i++) { w += -lr * model.A * w; b += -lr * model.C * b; }
  return { w, b };
}
const lossOf = (w, b, m) => 0.5 * (m.A * w * w + m.C * b * b);

// -> { ok, checks: [{ name, ok, detail? }] }. artifact: a sealed artifact (schema animation-scene/1).
export async function qualifySgd(artifact, { ids = DEFAULT_IDS, model = DEFAULT_MODEL } = {}) {
  engine ??= await loadEngine();
  const rid = { ...DEFAULT_IDS.readouts, ...ids.readouts }, aid = { ...DEFAULT_IDS.actions, ...ids.actions }, pid = { ...DEFAULT_IDS.params, ...ids.params };
  const checks = [], check = (name, ok, detail) => checks.push({ name, ok: !!ok, ...(detail === undefined ? {} : { detail }) });
  const declared = new Set((artifact.readouts ?? []).map(r => r.id));
  for (const [quantity, id] of Object.entries(rid)) check(`readout ${quantity}: declared with id ${id}`, declared.has(id), declared.has(id) ? undefined : `readouts declared: ${[...declared].join(', ') || 'none'}`);
  // One press is one step (aj_086fd46 owner review): in a stepped scene the host starts the step clock after an action unless the action declares startsMotion false.
  const stepAction = (artifact.actions ?? []).find(action => action.id === aid.step);
  check(`action ${aid.step}: declared${artifact.stepped ? ' with startsMotion false, so one press is one step and the scene stays paused' : ''}`, stepAction && (!artifact.stepped || stepAction.startsMotion === false), stepAction ? (artifact.stepped && stepAction.startsMotion !== false ? 'startsMotion is not false: the host plays on after every press' : undefined) : `actions declared: ${(artifact.actions ?? []).map(action => action.id).join(', ') || 'none'}`);

  const artifactHash = await sha256Hex(canonicalJson(artifact)), view = captureViews(artifact)[0];
  const defaults = Object.fromEntries((artifact.parameters ?? []).map(p => [p.id, p.default]));
  const lr = defaults[pid.learningRate], hasParams = Object.hasOwn(defaults, pid.learningRate) && Object.hasOwn(defaults, pid.batchSize);
  check(`parameters ${pid.learningRate} and ${pid.batchSize} declared (ids from the plan)`, hasParams);
  const act = id => ({ type: 'action', action: id });
  const run = async (inputs, events = []) => {
    const r = await runReviewProgram({ artifact, artifactHash, view, inputs, time: 0, events, leadTicks: 0, ticks: 0, seed: artifact.seed, theme: 'light', width: 960, height: 540 }, { workerFactory });
    return r.ok ? r.trace.readouts : { error: r.error ?? r.message ?? JSON.stringify(r).slice(0, 160) };
  };
  const expect = (name, got, want) => {
    if (got.error) return check(name, false, `run failed: ${String(got.error).slice(0, 160)}`);
    const bad = Object.entries(want).filter(([quantity, v]) => !declared.has(rid[quantity]) || !near(got[rid[quantity]], v));
    check(name, !bad.length, bad.length ? bad.map(([quantity, v]) => `${quantity} (${rid[quantity]}): got ${got[rid[quantity]]}, want ${v}`).join('; ') : undefined);
  };
  if (!hasParams) return { ok: false, checks };

  const [w0, b0] = model.start, d0 = Math.hypot(w0, b0);
  expect('initial state: step 0, passes 0, loss and distance at the start', await run(defaults), { step: 0, passes: 0, loss: lossOf(w0, b0, model), dist: d0 });
  const k = 3, full = fullBatchAfter(k, lr, model), steps = Array(k).fill(act(aid.step));
  expect(`full batch, ${k} steps: step ${k}, passes ${k}, loss and distance of the noise-free update`, await run({ ...defaults, [pid.batchSize]: String(model.dataPoints) }, steps),
    { step: k, passes: k, loss: lossOf(full.w, full.b, model), dist: Math.hypot(full.w, full.b) });
  const B = 4, noisy = await run({ ...defaults, [pid.batchSize]: String(B) }, steps);
  expect(`batch ${B}, ${k} steps: step ${k}, passes ${k * B / model.dataPoints}`, noisy, { step: k, passes: k * B / model.dataPoints });
  // Noise moves the point, so loss and distance cannot be recomputed; they must still agree with each other: 0.25 d^2 <= loss <= 1.0 d^2.
  const lo = Math.min(model.A, model.C) / 2, hi = Math.max(model.A, model.C) / 2, L = noisy[rid.loss], D = noisy[rid.dist];
  check(`batch ${B}, ${k} steps: loss agrees with distance (${lo} d^2 <= loss <= ${hi} d^2)`, !noisy.error && L >= lo * D * D - 1e-9 && L <= hi * D * D + 1e-9, noisy.error ? String(noisy.error).slice(0, 160) : `loss ${L}, distance ${D}`);
  // The action that keeps the path starts a new run: step and passes back to 0, loss and distance back to the start (the repair keeps this).
  expect('after Keep Path: step 0, passes 0, loss and distance at the start', await run({ ...defaults, [pid.batchSize]: String(model.dataPoints) }, [act(aid.step), act(aid.step), act(aid.keep)]),
    { step: 0, passes: 0, loss: lossOf(w0, b0, model), dist: d0 });
  return { ok: checks.every(c => c.ok), checks };
}

// ---- command line ----
const optionMap = (args, flag) => { const i = args.indexOf(flag); return i < 0 ? {} : Object.fromEntries(args[i + 1].split(',').map(p => p.split('='))); };
// The candidates of a file: [{ name, artifact }].
export async function candidatesOf(data) {
  const seal = draft => sealArtifact(draft, { artifactId: data.resultId, planHash: data.planHash, createdAt: new Date(data.approvalAt ?? 0).toISOString() });
  if (data.schema === 'animation-scene/1') return [{ name: 'artifact', artifact: data }];
  if (data.draft) return [{ name: 'draft', artifact: await seal(data.draft) }];
  return Promise.all([['authorDraft', 'author draft (before repair)'], ['repairedDraft', 'repaired draft (after repair)']].filter(([key]) => data[key]).map(async ([key, name]) => ({ name, artifact: await seal(data[key]) })));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), file = args[0];
  if (!file) { console.error('usage: node animation-sgd-qualification.mjs <file> [--ids step=stepNo,passes=passes,loss=loss,dist=dist] [--actions step=oneStep,keep=keepPath]'); process.exit(2); }
  const ids = { readouts: optionMap(args, '--ids'), actions: optionMap(args, '--actions') };
  let failed = false;
  for (const { name, artifact } of await candidatesOf(JSON.parse(readFileSync(file, 'utf8')))) {
    const result = await qualifySgd(artifact, { ids });
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${name}`);
    for (const c of result.checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? ` -- ${c.detail}` : ''}`);
    failed ||= !result.ok;
  }
  process.exit(failed ? 1 : 0);
}
