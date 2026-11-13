// /interact Scene Builder stage (INT-04, docs/features/interact.md section 5 and the INT-04 checklist). buildScene(job, ctx) turns ONE approved
// ScenePlan into the main and supporting artifacts, with the existing author/validation infrastructure doing the trusted work:
//   - the approved plan is the authoritative content, forwarded whole; the Story, Title and cardDescription are never rewritten here;
//   - one role call (build_author) returns every artifact: { main:{kind,spec|program}, supporting:[{id, artifact}] };
//   - each program is checked against the frozen contract (checkProgramDraft) and sealed with EXACTLY the panel's approved tuple;
//     each spec goes through the existing compiler gates (validateStage). A reply that needs another renderer or SDK is refused;
//   - the envelope is validated against the plan (control bindings, runtime per panel, supports, timeline, copy) and compiled to a
//     CardComposition before anything is captured (so the reviewer sees the actual complete card).
// The same validation re-runs on every repaired candidate (validateBuildOutput), so a repair can fix the implementation and can
// never change the approved plan. Model calls go through callInteractRole (bounded, admitted, counted); nothing here has a transport.
import { canonicalJson } from '../../web/src/explain-contract.js';
import { parseScenePlan, planHash } from '../../web/src/interact-plan.js';
import { CompositionError, compileCardComposition, controlDeclarations, timelineBrief, validateCompositionBindings } from '../../web/src/interact-composition.js';
import { catalogue } from '../../web/src/visual-components/registry.js';
import { MANIFEST_SENTENCES, INTERACT_BUILD_SYSTEM, INTERACT_BUILD_TOOL_NAME, interactBuildSchema, programContext } from './agents/explain-author.js';
import { SPEC_LIMITS, authorComposition, capabilityGap, validateStage } from './explain-author.js';
import { PROGRAM_CAPABILITIES, PROGRAM_LIMITS, buildProgramArtifact, checkProgramDraft } from './explain-program.js';
import { modelEvidence } from './explain-evidence.js';
import { InteractModelError, callInteractRole } from './interact-models.js';
import { stripUnknown } from './learn-primitives.js';
import { literalBreaksDeep } from './literal-breaks.js';
import { frameIdsOf } from './interact-convention.js';

const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
const bytes = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;

export class InteractBuildError extends Error {
  constructor(code, message, extra = {}) { super(message); this.name = 'InteractBuildError'; this.code = code; Object.assign(this, extra); }
}

// A reply the schema refused is not thrown away on the first slip: real Opus runs lost the whole design to one over-long entry, one nested key or one malformed object, while the same call
// usually succeeds. The role gets ONE correction call that names the exact problems and must return the whole corrected reply (the same rule as authorDesign, interact-design.js). The
// correction is an ordinary call: admitted, counted and bounded by INTERACT_LIMITS.calls (build_author 2, build_review 5, build_repair 4). Only a refusal of the reply's own content is corrected;
// a transport, budget or capability failure is not, and a correction that cannot be sent (no call left, no allowance) leaves the first refusal as the error.
//   check(output) -> problems: for a reply the schema accepted but its consumer cannot use (a review that skips a capture). The second answer is returned as it is, used or not.
//   onDone(done): called with every call that returned, so a caller that records calls records the paid ones.
const CORRECTABLE = new Set(['schema_mismatch', 'not_object', 'no_result', 'conflicting_results']);
export const correctable = error => error instanceof InteractModelError && error.sent !== false && CORRECTABLE.has(error.code);
// A manifest text over its limit is named with its field, its limit and its sentence range.
const withRange = problem => String(problem).replace(/manifest\.(summary|description|instructions): longer than (\d+)/, (_, field, n) => `manifest.${field}: longer than ${n} characters; it must be ${MANIFEST_SENTENCES[field]}, at most ${n} characters`);
export const refusalProblems = error => (error.problems?.length ? error.problems : [error.message]).slice(0, 12).map(problem => withRange(problem).slice(0, 400));
const withCorrection = (input, instruction, problems) => (typeof input === 'string' ? `${input}\n\n${instruction}\n${problems.map(problem => `- ${problem}`).join('\n')}` : { ...input, correction: { instruction, problems } });
// A role with fallbacks (interact-models.js callInteractRole) corrects on the step that answered; a correction still refused moves the SAME request to the next step (item 4).
export async function callWithCorrection(ctx, role, args, { instruction, check, onDone } = {}) {
  const ask = async (extra, step) => { const done = await callInteractRole(ctx, role, extra ?? args, step ? { step } : undefined); onDone?.(done); return done; };
  let first, at = 0;
  try {
    const done = await ask(), problems = check?.(done.output) ?? [];
    if (!problems.length) return done;
    first = { done, problems }; at = done.step ?? 0;
  } catch (error) {
    if (!correctable(error)) throw error;
    first = { error, problems: refusalProblems(error) }; at = error.step ?? 0;
  }
  try { return await ask({ ...args, input: withCorrection(args.input, instruction, first.problems.slice(0, 12)) }, at); }
  catch (second) {
    if (correctable(second) && ctx.profile?.roles?.[role]?.fallbacks?.[at]) {
      try { return await ask(args, at + 1); } catch (third) { if (third?.code !== 'call_ceiling' && third?.stopReason !== 'budget') throw third; throw second; }
    }
    // No call left (the runner's call_ceiling, the job's budget stop): the first refusal stands. Anything else (the job moved on, the deadline, the allowance, a failed call) is its own error.
    if (second?.code !== 'call_ceiling' && second?.stopReason !== 'budget') throw second;
    if (first.error) throw first.error;
    return first.done;
  }
}
export const AUTHOR_CORRECTION = 'Your previous reply was refused by the validator. Return the WHOLE corrected reply (the same build of the same approved plan) and change only what these problems name. Respect every limit in the instructions.';

// The plan a build may use: valid for the capabilities it was designed against AND the exact approved identity. A plan that is not the
// approved one (an edit, another revision, a model's copy) is refused before any call. -> { plan, hash }
export async function approvedPlanOf(job) {
  if (!job?.plan || !job.capabilities) throw new InteractBuildError('plan_missing', 'The build needs the approved plan and the capabilities it was designed against.');
  const parsed = parseScenePlan(job.plan, job.capabilities);
  if (!parsed.ok) throw new InteractBuildError('plan_invalid', `The plan is not valid for this runtime: ${parsed.problems[0].path} ${parsed.problems[0].message}`, { problems: parsed.problems });
  const hash = await planHash(parsed.value);
  if (typeof job.planHash !== 'string' || job.planHash !== hash) throw new InteractBuildError('plan_not_approved', 'This plan is not the one the learner approved; a changed plan needs a new review and approval. Nothing was built.');
  return { plan: parsed.value, hash };
}

const panelsOf = plan => [{ id: 'main', runtime: plan.scene.runtime }, ...plan.supportingVisuals.map(s => ({ id: s.id, runtime: s.runtime }))];
const usesSpec = plan => panelsOf(plan).some(p => p.runtime.renderer === 'spec');
const isStateful = plan => panelsOf(plan).some(p => p.runtime.renderer === 'program' && p.runtime.schemaVersion === 2);

// The steer (interact-steer.js steerBuild, off unless INTERACT_STEER=jev; null otherwise and then NOTHING changes): the authoring docs list only the helpers it named.
// shortcut: only the composite groups (props: vector, gate, groundMark; figures: axis, plot, diagram) are filtered; the base helpers stay listed. Upgrade when composites grow.
const HELPER_GROUPS = { props: ['vector', 'gate', 'groundMark'], figures: ['axis', 'plot', 'diagram'] };
function steeredProgram(program, steer) {
  if (!steer) return program;
  const sdk = { ...program.sdk };
  for (const [group, names] of Object.entries(HELPER_GROUPS)) {
    if (!sdk[group]) continue;
    const keep = names.filter(name => steer.composites?.includes(name));
    if (keep.length) sdk[group] = { usage: sdk[group].usage, ...Object.fromEntries(keep.map(name => [name, sdk[group][name]])) }; else delete sdk[group];
  }
  return { ...program, sdk };
}
// What the builder reads: the whole approved plan and the trusted derivations of it (the exact native declarations, the exact timeline).
export function buildInput(job, plan, hash, steer = null) {
  const { declarations } = controlDeclarations(plan), frameIds = frameIdsOf(plan);
  return {
    approvedPlan: plan, planHash: hash, depth: plan.depth,
    panels: [{ id: 'main', role: 'main', runtime: plan.scene.runtime, readoutIds: plan.scene.readoutIds },
      ...plan.supportingVisuals.map(s => ({ id: s.id, role: 'support', runtime: s.runtime, readoutIds: s.readoutIds, parameterBindings: s.parameterBindings }))],
    controlBindings: declarations, timeline: timelineBrief(plan), ...(frameIds.length ? { frameIds } : {}), // frameIds: the frame object ids the plan names, each to be used verbatim (interact-convention.js)
    program: steeredProgram(programContext(PROGRAM_LIMITS, PROGRAM_CAPABILITIES, { stateful: isStateful(plan) }), steer),
    ...(steer?.sceneKind ? { steer: { sceneKind: steer.sceneKind, objectBudget: steer.objectBudget } } : {}),
    ...(usesSpec(plan) ? { spec: { catalogue: catalogue(), composition: authorComposition(), limits: SPEC_LIMITS } } : {}),
    ...(job.evidence?.length ? { evidence: modelEvidence(job.evidence) } : {}),
  };
}
// The provider-facing schema options for this plan's panels: the declarative catalogue only when a panel was approved as a spec.
export const schemaOptions = plan => ({ catalogue: usesSpec(plan) ? catalogue() : [], stateful: isStateful(plan), specPanels: usesSpec(plan) });
export const buildSchema = plan => interactBuildSchema(schemaOptions(plan));

// One panel's draft -> a sealed program or a compiler-accepted spec, or the problems. The panel's approved runtime decides the renderer and
// the tuple it is sealed with; nothing the model wrote can select another.
async function sealPanel(draft, panel, plan, job, ctx, bad) {
  const { id, runtime } = panel, at = id === 'main' ? 'main' : `supporting.${id}`;
  if (!plain(draft) || draft.kind !== runtime.renderer) { bad(at, 'renderer_mismatch', `panel "${id}" was approved as ${runtime.renderer}; return it as kind ${runtime.renderer}`); return null; }
  if (runtime.renderer === 'program') {
    if (!plain(draft.program)) { bad(at, 'invalid_program', `panel "${id}" returned no program`); return null; }
    const checked = checkProgramDraft(draft.program, { stateful: runtime.schemaVersion === 2 });
    if (checked.gap) return { gap: capabilityGap(checked.gap.needs, checked.gap.reason, 'compiler') };
    if (checked.problems) { for (const p of checked.problems) bad(at, 'invalid_program', p); return null; }
    if (checked.schemaVersion !== runtime.schemaVersion) { bad(at, 'tuple_mismatch', `panel "${id}" was approved as schema ${runtime.schemaVersion} and was written as schema ${checked.schemaVersion}`); return null; }
    try { return { artifact: { kind: 'program', program: await buildProgramArtifact(checked.bundle, runtime.programTuple) } }; } // sealed with the approved tuple, never an inferred one
    catch (error) { bad(at, 'seal_refused', `panel "${id}" cannot be sealed with its approved SDK tuple: ${String(error.message).slice(0, 300)}`); return null; }
  }
  if (!plain(draft.spec)) { bad(at, 'invalid_spec', `panel "${id}" returned no spec`); return null; }
  // The declarative gates (registry, parameters, limits, anchors, scene gates). The program route flag must not reject an approved timed spec.
  const checked = validateStage({ spec: draft.spec, prompt: JSON.stringify(plan), brief: null, context: null, evidence: job.evidence || [], examples: [] }, { env: { ...(ctx.env || {}), EXPLAIN_PROGRAM_ENABLED: 'false' } });
  if (checked.gap) return { gap: checked.gap };
  if (checked.problems) { for (const p of checked.problems) bad(at, 'invalid_spec', p); return null; }
  return { artifact: { kind: 'spec', spec: draft.spec } };
}

// Reviewer and repair must be able to read the plan and the artifacts: a deterministic early size check against the profile (no model call).
function fitProblems(plan, artifacts, ctx, bad) {
  const limit = Math.min(...['build_review', 'build_repair'].map(role => ctx.profile?.roles?.[role]?.maxInputBytes).filter(Boolean), Infinity);
  if (!Number.isFinite(limit)) return;
  const programs = [artifacts.main, ...artifacts.supporting.map(s => s.artifact)].filter(a => a.kind === 'program').map(a => ({ source: a.program.source, manifest: a.program.manifest }));
  const total = bytes(plan) + bytes(programs);
  if (total > limit * 0.75) bad('artifacts', 'too_large', `the plan and programs are ${total} bytes; the review and repair requests allow ${limit} bytes in all: write shorter programs`);
}

// The trusted stage after any model reply (the first build or a repair). -> { artifacts, composition } | { gap } | { problems, details, category: 'spec', repairable: true }
// reply: { main, supporting }. A problem is { path, code, message }; `problems` are the same as one-line strings for the repair role.
export async function validateBuildOutput(job, reply, ctx = {}) {
  const { plan } = await approvedPlanOf(job);
  const details = [], bad = (path, code, message) => details.push({ path, code, message });
  if (!plain(reply) || !plain(reply.main) || !Array.isArray(reply.supporting)) {
    return { problems: ['the reply is {main, supporting:[{id, artifact}]}'], details: [{ path: 'reply', code: 'artifacts_shape', message: 'the reply is {main, supporting:[{id, artifact}]}' }], category: 'spec', repairable: true };
  }
  const sealed = { main: null, supporting: [] };
  for (const panel of panelsOf(plan)) {
    const draft = panel.id === 'main' ? reply.main : reply.supporting.find(s => s?.id === panel.id)?.artifact;
    if (draft === undefined) continue; // a dropped panel is reported by the envelope check below, with its exact id
    const made = await sealPanel(draft, panel, plan, job, ctx, bad);
    if (made?.gap) return { gap: made.gap };
    if (!made) continue;
    if (panel.id === 'main') sealed.main = made.artifact; else sealed.supporting.push({ id: panel.id, artifact: made.artifact });
  }
  // Panels the plan does not list ride through unsealed only so the envelope check can name them; they are never composed.
  // A surplus or repeated entry rides through unsealed so the envelope check can name it; only the first entry of an approved id is composed.
  reply.supporting.forEach((entry, i) => { if (!(plan.supportingVisuals.some(p => p.id === entry?.id) && reply.supporting.findIndex(x => x?.id === entry.id) === i)) sealed.supporting.push({ id: entry?.id, artifact: entry?.artifact }); });
  if (!details.length) {
    for (const p of validateCompositionBindings(plan, sealed)) bad(p.path, p.code, p.message);
    if (!details.length) fitProblems(plan, sealed, ctx, bad);
  }
  if (details.length) return { problems: [...new Set(details.map(d => `${d.path}: ${d.message}`.slice(0, 400)))], details, category: 'spec', repairable: true };
  try { return { artifacts: sealed, composition: await compileCardComposition(plan, sealed) }; }
  catch (error) {
    if (!(error instanceof CompositionError)) throw error;
    return { problems: error.problems.map(p => `${p.path}: ${p.message}`.slice(0, 400)), details: error.problems, category: 'spec', repairable: true };
  }
}

// A call's persistable record: identity, usage and timing, never the output (the artifacts are stored by hash).
export const callRecord = (role, done) => ({ role, requested: done.requested, served: done.served, usage: done.usage, costMicros: done.costMicros ?? null, priceKnown: done.priceKnown ?? false, timing: done.timing, stopReason: done.stopReason,
  fallbackFired: done.fallbackFired ?? false }); // true when a later step of the role's chain answered (a failure of the first step in a benchmark)

// What a fast model's reply is cleaned of before it is checked (capabilities.sanitize, never Opus): keys the schema does not declare (Gemini wrote `layers`), double-escaped line breaks
// in the manifest's prose (the program source is code and is never touched) and a repeated state label in a readout (the first occurrence stays: google-low wrote "state labels must be unique" failures
// twice). Server-side, never a repair call.
export function cleanBuildReply(reply, schema) {
  const uniqueLabels = manifest => (Array.isArray(manifest.readouts) ? { ...manifest, readouts: manifest.readouts.map(r => (plain(r) && Array.isArray(r.labels) ? { ...r, labels: [...new Set(r.labels)] } : r)) } : manifest);
  const out = stripUnknown(reply, schema, null, []), fix = a => (plain(a?.program?.manifest) ? { ...a, program: { ...a.program, manifest: uniqueLabels(literalBreaksDeep(a.program.manifest)) } } : a);
  if (!plain(out)) return out;
  return { ...out, ...(plain(out.main) ? { main: fix(out.main) } : {}), ...(Array.isArray(out.supporting) ? { supporting: out.supporting.map(entry => (plain(entry) ? { ...entry, artifact: fix(entry.artifact) } : entry)) } : {}) };
}

// buildScene(job, ctx) -> { artifacts, composition, planHash, draft, call } | { gap, call } | { problems, details, category, repairable, draft, call }
//   draft: the model's own reply ({main, supporting}); the repair step starts from it, valid or not.
//   job: { id, plan, planHash (the APPROVED identity), capabilities (the control catalogue the plan was designed against), depth?, evidence? }
//   ctx: the interact role context of callInteractRole (env, profile, adapters, admit, settle, signal, fixture ...).
// Throws InteractBuildError before any call when the plan is not the approved one; a role-call failure propagates as the InteractModelError it is
// (provider failure, distinct from a build problem). A build problem is returned for the repair loop, never thrown.
// ctx.steer: the JEV steer or null (interact-job.js buildStage sets it from steerBuild(env, plan); see interact-steer.js).
export async function buildScene(job, ctx) {
  const { plan, hash } = await approvedPlanOf(job);
  const before = canonicalJson(plan);
  const schema = buildSchema(plan);
  const done = await callWithCorrection(ctx, 'build_author', { system: INTERACT_BUILD_SYSTEM, schema, sanitize: reply => cleanBuildReply(reply, schema), input: buildInput(job, plan, hash, ctx.steer ?? null), name: INTERACT_BUILD_TOOL_NAME, description: 'Build the approved scene plan.' }, { instruction: AUTHOR_CORRECTION });
  const call = callRecord('build_author', done), reply = done.output;
  if (reply.kind === 'capability_gap') {
    if (!Array.isArray(reply.gap?.needs) || !reply.gap.needs.length) throw new InteractBuildError('invalid_turn', 'The builder reported a gap without saying what is needed.', { call });
    return { gap: capabilityGap(reply.gap.needs, reply.gap.reason, 'builder'), call };
  }
  if (reply.kind !== 'scene') throw new InteractBuildError('invalid_turn', 'The builder returned neither a scene nor a gap.', { call });
  const result = await validateBuildOutput(job, reply, ctx);
  if (canonicalJson(plan) !== before) throw new InteractBuildError('plan_changed', 'The approved plan changed during the build; it is immutable.', { call });
  return { ...result, planHash: hash, draft: { main: reply.main, supporting: reply.supporting }, call };
}
