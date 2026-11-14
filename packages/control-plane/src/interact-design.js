// /interact reviewed design (INT-02, docs/features/interact.md sections 3 and 5): Author -> Reviewer -> Reviser, then a deterministic
// closure, before Chat can offer Generate. Every function here is a pipeline stage body for the ExplainJobs object (explain-job.js):
//   authorDesign(job, ctx)   -> { plan, planHash, bindingProblems } | { problems }
//   reviewDesign(job, ctx)   -> { review, overridden } | { problems }
//   reviseDesign(job, ctx)   -> { revision } | { problems }
//   verifyDesign(job, ctx)   -> the design_verifying decision (no model call): { next: 'revise', feedback } | { next: 'review' } | { next: 'done' } | { stop } | { gap }
//   verifyDesignRevision(previous, revision, review, capabilities) -> { plan, planHash, diff, needsReview, problems, unresolved }
// A model call goes through ctx.interact(role, { system, schema, input, name, description }) = callInteractRole under the job's pinned
// profile, fence and call ceilings (explain-job.js interactCall). Nothing here trusts a model hash, a "fixed" flag or a verdict that a
// finding contradicts: hashes and diffs are computed here, a blocker or major finding overrides a claimed pass, and a remaining
// blocker stops the design with its message. Bounds per plan attempt: author 1, reviewer 3, reviser 2 (INTERACT_LIMITS.calls).
import { canonicalJson } from '../../web/src/explain-contract.js';
import { DesignReviewSchema, DesignRevisionSchema, PLAN_LIMITS, ScenePlanSchema, captureBudgetProblems, contentHash, descriptionFitProblems, parseScenePlan, planHash, revisionProblems } from '../../web/src/interact-plan.js';
import { interactCapabilities } from '../../web/src/interact-control-catalogue.js';
import { CAPABILITIES as PROGRAM_CAPABILITIES } from '../../web/src/explain-program/contract.js';
import { SUPPORTED_PROGRAM_TUPLES } from '../../web/src/explain-program/stamps.js';
import { programSdkSource } from '../../web/src/explain-program/sdk.js';
import { catalogue as componentCatalogue } from '../../web/src/visual-components/registry.js';
import { capabilityGap, compilerSupport } from './explain-author.js';
import { programEnabled, programTupleFor, statefulEnabled } from './explain-program.js';
import { modelEvidence } from './explain-evidence.js';
import { INTERACT_LIMITS, InteractModelError } from './interact-models.js';
import { INTERACT_FAMILIES } from './interact-families.js';
import { pickFamily, pickThreshold } from './interact-design-pick.js';
import { fillSystem, formulaProblems } from './interact-design-fill.js';
import { DESIGN_AUTHOR_SYSTEM, DESIGN_AUTHOR_TOOL, DESIGN_AUTHOR_VERSION, designAuthorSchema } from './agents/interact-design-author.js';
import { DESIGN_REVIEW_SYSTEM, DESIGN_REVIEW_TOOL, DESIGN_REVIEW_VERSION, designReviewSchema } from './agents/interact-design-review.js';
import { DESIGN_REVISE_SYSTEM, DESIGN_REVISE_TOOL, DESIGN_REVISE_VERSION, designReviseSchema } from './agents/interact-design-revise.js';

export const DESIGN_FLOW_VERSION = 1;
export const DESIGN_STAGES = Object.freeze(['design_authoring', 'design_reviewing', 'design_revising', 'design_verifying']);
// INT-03-C10: what the learner reads for each server state. The real state stays in diagnostics.
export const DESIGN_PUBLIC_STATE = Object.freeze({ design_authoring: 'Designing scene', design_reviewing: 'Reviewing scene design', design_revising: 'Updating scene plan', design_verifying: 'Checking scene plan', awaiting_approval: 'Ready to review' });
export const DESIGN_ROLE_KEY = Object.freeze({ design_author: 'author', design_review: 'review', design_revise: 'revise', design_fill: 'fill' });
export const DESIGN_BOUNDS = Object.freeze({ author: INTERACT_LIMITS.calls.design_author, review: INTERACT_LIMITS.calls.design_review, revise: INTERACT_LIMITS.calls.design_revise });
// rev: the design revision number (an Edit makes the next one); pending: a revision from the reviser that awaits verification. Large bodies (every draft, review and
// revision) are kept under their own storage keys by the job (design:<job>:<rev>:<name>), only the working set lives on the job record.
export const freshDesign = () => ({ version: DESIGN_FLOW_VERSION, rev: 1, attempts: 1, refinements: 0, counts: { author: 0, review: 0, revise: 0 }, plan: null, planHash: null, review: null, pending: null,
  changes: [], problems: [], reviews: [], revisions: [], draftHash: null, finalHash: null, runtimeHash: null, approvalHash: null, fit: null, open: [], carried: [] });

// Mode kind -> the existing presentation setting of the /explain proposal. Steps is never produced for a new plan (INT-03-C05).
export const modeToPresentation = kind => ({ static: 'static', time: 'time', experiment: 'experiment' })[kind];

// ---- production prompt contracts (INT-02-C03): versions and hashes recorded with the job's receipts ----
const CONTRACTS = Object.freeze({
  design_author: { version: DESIGN_AUTHOR_VERSION, tool: DESIGN_AUTHOR_TOOL, system: DESIGN_AUTHOR_SYSTEM, schema: designAuthorSchema() },
  design_review: { version: DESIGN_REVIEW_VERSION, tool: DESIGN_REVIEW_TOOL, system: DESIGN_REVIEW_SYSTEM, schema: designReviewSchema() },
  design_revise: { version: DESIGN_REVISE_VERSION, tool: DESIGN_REVISE_TOOL, system: DESIGN_REVISE_SYSTEM, schema: designReviseSchema() },
});
export const designContract = role => CONTRACTS[role];
export async function designPromptContracts() {
  const out = {};
  for (const [role, c] of Object.entries(CONTRACTS)) out[role] = { version: c.version, tool: c.tool.name, hash: await contentHash({ version: c.version, tool: c.tool, system: c.system, schema: c.schema }) };
  return out;
}

// ---- capabilities and per-panel runtime binding (the owner's rule: every panel, control-free ones too) ----
// ponytail: componentControls lists the four declarative input types; deriving them from the enabled components' declared inputs waits for the build lane's component audit.
const COMPONENT_CONTROLS = ['choice', 'bool', 'index', 'indices'];
export const designCapabilities = (env, job) => interactCapabilities({ renderers: ['spec', ...(programEnabled(env) ? ['program'] : [])], stateful: statefulEnabled(env), inputsV2: env.INTERACT_INPUTS_V2 === 'on', seek: env.INTERACT_SEEK === 'on', componentControls: COMPONENT_CONTROLS, evidenceIds: (job.evidence || []).map(record => record.id) });

const sdkHelpers = sdkVersion => new Set([...(programSdkSource(sdkVersion) || '').matchAll(/\bsdk\.([A-Za-z_]\w*)\s*=/g)].map(match => match[1]));
const EXTENSIONS = [[[], 'default visual helpers'], [['medium_visuals'], 'medium visuals'], [['cyclic_networks'], 'cyclic networks'], [['raster_visuals'], 'raster visuals'], [['heat_grid'], 'heat grid'], [['props'], 'physical props (sdk.vector, sdk.gate, sdk.groundMark)'], [['figures'], 'semantic figures (sdk.axis, sdk.plot with axes, sdk.diagram)']];
// The exact runtime records a plan may carry, as the server would seal them. A model copies one; the server re-derives it (runtimeProblems).
export function runtimeChoices(capabilities) {
  const renderers = new Set(capabilities.catalogue.map(entry => entry.renderer)), choices = [];
  if (renderers.has('spec')) choices.push({ runtime: { renderer: 'spec', schemaVersion: 1, sdkVersion: null, programTuple: null, requiredHelpers: [], requiredCapabilities: [], catalogueHash: capabilities.catalogueHash }, useWhen: 'the declarative components draw the main scene or panel', availableHelpers: [] });
  if (renderers.has('program')) {
    for (const schemaVersion of capabilities.stateful ? [1, 2] : [1]) {
      for (const [extension, label] of EXTENSIONS) {
        const tuple = programTupleFor(extension, schemaVersion === 2);
        choices.push({ runtime: { renderer: 'program', schemaVersion, sdkVersion: tuple.sdkVersion, programTuple: tuple, requiredHelpers: [], requiredCapabilities: [...extension], catalogueHash: capabilities.catalogueHash },
          useWhen: `a program${schemaVersion === 2 ? ' with buttons, selections or state (schema 2)' : ''} using ${label}; add time_playback, number_inputs or select_inputs to requiredCapabilities as the controls need, which never changes the tuple`, availableHelpers: [...sdkHelpers(tuple.sdkVersion)].sort() });
      }
    }
  }
  return choices;
}
const capabilitiesForModel = capabilities => ({ catalogue: capabilities.catalogue, catalogueHash: capabilities.catalogueHash, stateful: capabilities.stateful, evidenceIds: capabilities.evidenceIds, runtimeChoices: runtimeChoices(capabilities) });
const capabilitiesForReview = capabilities => ({ catalogue: capabilities.catalogue, catalogueHash: capabilities.catalogueHash, stateful: capabilities.stateful, renderers: [...new Set(capabilities.catalogue.map(entry => entry.renderer))] });

// Problems with the runtime record of the main scene and of every supporting panel, against what this server would really seal and run
// (stamps.js SUPPORTED_PROGRAM_TUPLES, explain-program.js programTupleFor, the SDK's helpers). validatePlanBindings (interact-plan.js) checks the
// catalogue, the supported-tuple list and the capability names; this adds the sealing rule, so a plan cannot name a supported but wrong tuple.
export function runtimeProblems(plan, capabilities) {
  const out = [], panels = [{ path: ['scene', 'runtime'], runtime: plan.scene.runtime }, ...plan.supportingVisuals.map((panel, i) => ({ path: ['supportingVisuals', i, 'runtime'], runtime: panel.runtime }))];
  const bad = (path, code, message) => out.push({ path: path.join('.'), code, message });
  for (const { path, runtime } of panels) {
    if (runtime.renderer === 'spec') {
      const components = new Set(componentCatalogue().map(entry => entry.name)), can = compilerSupport();
      if (runtime.schemaVersion !== 1) bad([...path, 'schemaVersion'], 'unsupported_schema', 'the declarative renderer is schema version 1');
      runtime.requiredHelpers.forEach(name => { if (!components.has(name)) bad([...path, 'requiredHelpers'], 'unsupported_helper', `"${name}" is not a component the declarative renderer offers`); });
      runtime.requiredCapabilities.forEach(name => { if (can[name] !== true) bad([...path, 'requiredCapabilities'], 'unsupported_capability', `"${name}" is not a feature the declarative compiler can draw`); });
      continue;
    }
    if (runtime.schemaVersion === 2 && !capabilities.stateful) bad([...path, 'schemaVersion'], 'stateful_unavailable', 'the stateful program schema is not enabled');
    runtime.requiredCapabilities.forEach(name => { if (!PROGRAM_CAPABILITIES.includes(name)) bad([...path, 'requiredCapabilities'], 'unsupported_capability', `"${name}" is not a program capability`); });
    const sealed = programTupleFor(runtime.requiredCapabilities, runtime.schemaVersion === 2);
    if (canonicalJson(sealed) !== canonicalJson(runtime.programTuple)) bad([...path, 'programTuple'], 'tuple_mismatch', `a program needing ${runtime.requiredCapabilities.join(', ') || 'no extension capability'} is sealed as ${sealed.sdkVersion} schema ${sealed.schemaVersion}, not ${runtime.programTuple.sdkVersion} schema ${runtime.programTuple.schemaVersion}`);
    if (!SUPPORTED_PROGRAM_TUPLES.some(tuple => canonicalJson(tuple) === canonicalJson(sealed))) bad([...path, 'programTuple'], 'unsupported_tuple', 'the sealed tuple is not one the player runs');
    const have = sdkHelpers(sealed.sdkVersion);
    runtime.requiredHelpers.forEach(name => { if (!have.has(name)) bad([...path, 'requiredHelpers'], 'unsupported_helper', `${sealed.sdkVersion} has no sdk.${name} helper`); });
  }
  return out;
}
// Codes that mean "the design asks for something this runtime cannot do" rather than "the plan is malformed".
const CAPABILITY_CODES = new Set(['renderer_unavailable', 'catalogue_mismatch', 'unsupported_tuple', 'tuple_mismatch', 'unsupported_capability', 'unsupported_helper', 'unsupported_schema', 'stateful_unavailable', 'unsupported_control', 'unknown_native_control', 'incompatible_control', 'limit_exceeded']);
export const isCapabilityGap = problems => problems.length > 0 && problems.every(problem => CAPABILITY_CODES.has(problem.code));
const problemText = problems => problems.slice(0, 4).map(problem => `${problem.path || 'plan'}: ${problem.message}`).join('; ');
const dedupe = problems => [...new Map(problems.map(problem => [`${problem.path}|${problem.code}`, problem])).values()];

// What approval binds besides the plan: each panel's resolved runtime and the catalogue it was designed against.
export const runtimeBindingHash = (plan, capabilities) => contentHash({ catalogueHash: capabilities.catalogueHash, panels: [{ id: 'main', runtime: plan.scene.runtime }, ...plan.supportingVisuals.map(panel => ({ id: panel.id, runtime: panel.runtime }))] });
// The one identity Generate consumes: this owner's job, canvas and revision, the design revision, the plan, the profile and the runtime binding.
export const approvalHashOf = (job, d) => contentHash({ version: DESIGN_FLOW_VERSION, job: job.id, board: job.boardId, owner: job.owner.email, revision: job.revision, planRevision: d.rev, scenePlanHash: d.finalHash, profileHash: job.flow.profile.hash, runtimeHash: d.runtimeHash });

// ---- diff and classification ----
export function planDiff(a, b, path = []) {
  if (canonicalJson(a) === canonicalJson(b)) return [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return a.flatMap((item, i) => planDiff(item, b[i], [...path, i]));
  if (object(a) && object(b)) return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().flatMap(key => planDiff(a[key], b[key], [...path, key]));
  return [path.join('.')];
}
// ponytail: only these paths are cosmetic (wording of names); every other change can alter a fact, unit, timeline, control, assumption, conclusion
// or capability commitment, so it earns a follow-up review. Widen the list only with a reason.
const COSMETIC = /^(title|supportingVisuals\.\d+\.title|scene\.entities\.\d+\.(label|purpose))$/;
export const isBlocking = finding => finding.severity === 'blocker' || finding.severity === 'major';
const touches = (diff, claimed) => {
  const wanted = String(claimed).replace(/^plan\./, '').replace(/\[(\d+)\]/g, '.$1');
  return diff.some(path => path === wanted || path.startsWith(`${wanted}.`) || wanted.startsWith(`${path}.`));
};

// ---- the model calls ----
const OUTPUT_CODES = new Set(['schema_mismatch', 'truncated', 'malformed_json', 'fenced_json', 'no_result', 'conflicting_results', 'not_object', 'refused', 'unexpected_tool']);
// An answer that arrived but cannot be used is the role's problem to report (its call was made and counted); any other error is the job's.
async function invoke(ctx, role, input) {
  const contract = CONTRACTS[role];
  try {
    const result = await ctx.interact(role, { system: contract.system, schema: contract.schema, input, name: contract.tool.name, description: contract.tool.description });
    return { output: result.output };
  } catch (error) {
    if (!(error instanceof InteractModelError) || !OUTPUT_CODES.has(error.code)) throw error;
    return { problems: (error.problems?.length ? error.problems : [error.message]).map(message => ({ path: '', code: error.code, message: String(message).slice(0, 300) })) };
  }
}
const issueProblems = error => dedupe(error.issues.map(issue => ({ path: issue.path.join('.'), code: issue.params?.code || issue.code, message: issue.message })));

async function authorOnce(job, ctx, extra = {}) {
  const d = job.design, capabilities = ctx.capabilities;
  const input = { request: job.prompt, depth: job.depth, context: job.context ?? null, evidence: modelEvidence(job.evidence),
    ...(d.plan && job.refinement ? { previous: d.plan, edit: job.refinement } : {}), ...(d.problems?.length ? { constraints: d.problems } : {}),
    capabilities: capabilitiesForModel(capabilities), limits: PLAN_LIMITS, ...extra };
  const reply = await invoke(ctx, 'design_author', input);
  if (reply.problems) return reply;
  // Shape first: a plan missing Mode, Controls or anything required is rejected whole (never completed or stripped). A well-formed plan whose
  // controls or runtimes the catalogue cannot back is kept as the draft with those problems, so the reviewer and reviser can revise it before approval.
  const parsed = parseScenePlan(reply.output, capabilities);
  let plan = parsed.ok ? parsed.value : null, bindingProblems = parsed.ok ? [] : parsed.problems;
  if (!plan) {
    const shape = ScenePlanSchema.safeParse(reply.output);
    if (!shape.success) return { problems: dedupe(parsed.problems) };
    plan = shape.data;
  }
  if (plan.depth !== job.depth) return { problems: [{ path: 'depth', code: 'depth_changed', message: `the plan's depth is "${plan.depth}"; the request's depth "${job.depth}" is never changed by a model` }] };
  return { plan, planHash: await planHash(plan), bindingProblems: dedupe([...bindingProblems, ...runtimeProblems(plan, capabilities)]) };
}

// ---- the fast design path (INTERACT_DESIGN_KIND=fast, brief 12) ----
// ONE fill call (role design_fill, Gemini Flash Lite) writes a plan brief; code expands it (interact-plan-brief.js) and checks the result: the brief's own schema, the expansion, the plan's schema and bindings,
// the runtime and capture budget, the description fit and the reference formulas (no range-match rule). A refusal gets ONE fill correction that names the first problem line; a second refusal sends the same
// job to the Opus author below (the learner sees no difference). -> { plan, planHash, bindingProblems, fast: { kind: 'fast', ... } } on a pass, { fast: { kind: 'opus', fallback: 'after_correction', ... } } on a fallback.
const line = problem => (typeof problem === 'string' ? problem : `${problem.path ?? ''} ${problem.message ?? ''}`.trim());
async function fillProblems(raw, depth, info, ctx, { expandBrief, referenceFormulaCheck }) {
  const parsed = info.parse(raw);
  if (!parsed.ok) return { problems: parsed.problems };
  let plan;
  try { plan = expandBrief(parsed.value, depth, { catalogueHash: ctx.capabilities.catalogueHash }); } catch (error) { return { problems: [`expand: ${String(error.message).slice(0, 300)}`] }; }
  // The family's claims cite the reference note (kinematics_note); a job supplies only its own evidence, and a claim with none is checked as a fact, as the Opus plans are.
  const supplied = new Set(ctx.capabilities.evidenceIds || []);
  plan = { ...plan, claims: plan.claims.map(c => ({ ...c, evidenceIds: c.evidenceIds.filter(id => supplied.has(id)) })) };
  const checked = parseScenePlan(plan, ctx.capabilities);
  if (!checked.ok) return { problems: checked.problems.map(line) };
  const issues = [...runtimeProblems(checked.value, ctx.capabilities), ...captureBudgetProblems(checked.value)];
  if (issues.length) return { problems: issues.map(line) };
  // Without a fit measurement the close (design_verifying) stops with its own reason; with one, a bad description is a fill problem the correction can fix.
  const fit = typeof ctx.descriptionFit === 'function' ? await descriptionFitProblems(checked.value, await ctx.descriptionFit(checked.value)) : [];
  if (fit.length) return { problems: fit.map(line) };
  const wrong = formulaProblems(referenceFormulaCheck(parsed.value, depth));
  return wrong.length ? { problems: wrong } : { plan: checked.value };
}
// The pick (brief 13) runs first: one System One call names the family that fits, or none. A gap (none, below the threshold, a failed or timed out call, no key) goes straight to the Opus design with no fill.
const pickOf = async (job, ctx) => ctx.env.TYPESAFE_API_KEY
  ? pickFamily(ctx.env, { request: job.prompt, depth: job.depth }, { families: INTERACT_FAMILIES, threshold: pickThreshold(ctx.env, INTERACT_FAMILIES) })
  : { family: null, confidence: null, probabilities: null, ms: 0, reason: 'no_key' };
export async function fastDesign(job, ctx) {
  const depth = job.depth, fast = { kind: 'fast', model: null, calls: 0, fallback: 'none', firstProblem: null, costUsd: 0 };
  const pick = await pickOf(job, ctx); fast.pick = pick;
  const family = INTERACT_FAMILIES.find(f => f.id === pick.family);
  if (!family) return { fast: { ...fast, kind: 'opus', fallback: 'gap' } };
  const mod = family.module, info = mod.briefSchema(depth);
  let problems = [], previous = null;
  for (let round = 0; round < INTERACT_LIMITS.calls.design_fill; round++) {
    fast.calls++;
    try {
      const done = await ctx.interact('design_fill', { system: fillSystem(depth, info, mod.familyDescription), schema: info.jsonSchema, name: 'return_plan_brief', description: 'Return the plan brief of the scene.',
        input: { request: job.prompt, depth, ...(round ? { ...(previous ? { previous } : {}), correction: { instruction: 'Your previous brief was refused. Return the WHOLE corrected brief and change only what this problem names.', problems: problems.slice(0, 1) } } : {}) } });
      fast.model = done.requested?.model ?? fast.model; fast.costUsd += (done.costMicros ?? 0) / 1e6; previous = done.output;
      const checked = await fillProblems(done.output, depth, info, ctx, mod);
      if (checked.plan) return { plan: checked.plan, planHash: await planHash(checked.plan), bindingProblems: [], fast };
      problems = checked.problems;
    } catch (error) {
      // A reply that cannot be used, or a provider that did not answer, is a failed fill; a refused spend, a stopped job and a deadline are the job's.
      if (!(error instanceof InteractModelError) || error.code === 'spend_refused') throw error;
      fast.costUsd += (error.costMicros ?? 0) / 1e6; problems = [(error.problems?.length ? error.problems[0] : `${error.code}: ${error.message}`).toString().slice(0, 300)];
      if (error.sent === false) { fast.firstProblem ??= problems[0]; break; } // nothing was sent (a missing credential): a second call would say the same
    }
    fast.firstProblem ??= problems[0]; fast.lastProblem = problems[0];
  }
  return { fast: { ...fast, kind: 'opus', fallback: 'after_correction' } };
}

// A plan the schema refuses is not thrown away on the first slip: real Opus runs lost the whole plan to one over-long entry, a result nested under one key and a malformed timeline
// (3 of 3 live runs, while the same call usually succeeds). The Author gets ONE correction call that names the exact problems and must return the whole corrected plan; a second
// refusal stops the design with the problems, as before. The second call is counted and bounded like any other (INTERACT_LIMITS.calls.design_author is 2).
export async function authorDesign(job, ctx) {
  // The fast path runs once per design (design.fast is stored by the first result); an Edit or a retried Opus author never re-enters it.
  let fast;
  if (ctx.designKind === 'fast' && !job.design.fast) { const out = await fastDesign(job, ctx); if (out.plan) return out; fast = out.fast; }
  const result = await opusAuthor(job, ctx);
  return fast ? { ...result, fast } : result;
}
async function opusAuthor(job, ctx) {
  const first = await authorOnce(job, ctx);
  if (!first.problems || job.design.counts.author >= DESIGN_BOUNDS.author || !corrects(first.problems)) return first;
  const problems = first.problems.slice(0, 12).map(problem => (problem.path ? problem.path + ': ' : '') + problem.message);
  return authorOnce(job, ctx, { correction: { instruction: 'Your previous plan was refused by the validator. Return the WHOLE corrected plan (same design, same request, same depth) and change only what these problems name. Respect every length limit in limits.', problems } });
}
// Only a refusal of the plan's own content is worth a correction call: a transport, budget or capability failure is not.
const correctionOf = (problems, what) => ({ instruction: `Your previous ${what} was refused by the validator. Return the WHOLE corrected ${what} and change only what these problems name. Respect every length limit.`, problems: problems.slice(0, 12).map(problem => (problem.path ? problem.path + ': ' : '') + problem.message) });
const corrects = problems => problems.length > 0 && problems.every(problem => ['schema_mismatch', 'not_object', 'no_result', 'conflicting_results'].includes(problem.code) || /^(missing_field|invalid_|too_|unrecognized|expr|runtime)/.test(String(problem.code || '')) || problem.code === undefined);

export async function reviewDesign(job, ctx) {
  const d = job.design, followUp = d.revisions.length > 0;
  const input = { request: job.prompt, depth: job.depth, plan: d.plan, planHash: d.planHash, evidence: modelEvidence(job.evidence), capabilities: capabilitiesForReview(ctx.capabilities),
    deterministicChecks: d.problems || [], followUp, ...(followUp ? { previous: { findings: d.review?.findings || [], changes: d.changes || [] } } : {}) };
  let reply = await invoke(ctx, 'design_review', input);
  if (reply.problems && job.design.counts.review < DESIGN_BOUNDS.review && corrects(reply.problems)) reply = await invoke(ctx, 'design_review', { ...input, correction: correctionOf(reply.problems, 'review') }); // live reviews were refused by the schema twice in one run
  if (reply.problems) return reply;
  // A blocker or major finding overrides a claimed pass (interact-plan.js would reject the pair; the finding wins, the review is kept).
  const raw = reply.output;
  const overridden = raw?.verdict === 'pass' && Array.isArray(raw.findings) && raw.findings.some(finding => finding && isBlocking(finding));
  const parsed = DesignReviewSchema.safeParse(overridden ? { ...raw, verdict: 'revise' } : raw);
  if (!parsed.success) return { problems: issueProblems(parsed.error) };
  if (parsed.data.planHash !== d.planHash) return { problems: [{ path: 'planHash', code: 'review_plan_mismatch', message: 'the review is for a different plan than the one sent' }] };
  return { review: parsed.data, overridden };
}

export async function reviseDesign(job, ctx) {
  const d = job.design;
  const input = { request: job.prompt, depth: job.depth, plan: d.plan, planHash: d.planHash, review: d.review, deterministicChecks: d.problems || [], evidence: modelEvidence(job.evidence),
    capabilities: capabilitiesForModel(ctx.capabilities), attempt: d.counts.revise + 1, followUp: d.revisions.length > 0 };
  let reply = await invoke(ctx, 'design_revise', input);
  if (reply.problems && job.design.counts.revise < DESIGN_BOUNDS.revise && corrects(reply.problems)) reply = await invoke(ctx, 'design_revise', { ...input, correction: correctionOf(reply.problems, 'revision') });
  if (reply.problems) return reply;
  const parsed = DesignRevisionSchema.safeParse(reply.output);
  return parsed.success ? { revision: parsed.data } : { problems: issueProblems(parsed.error) };
}

// ---- deterministic closure (design_verifying) ----
// Never trusts the reviser: the new hash and the diff are computed here, every claimed change must really have changed something, every
// blocker or major finding must be answered by a change or listed unresolved, and the plan must pass the same schema, binding and runtime checks as the draft.
// deterministic: the server's own checks the reviser was shown (description fit, bindings); it may answer one by its code or path as it answers a finding by id (a live run did: "description_fit").
export async function verifyDesignRevision(previous, revision, review, capabilities, deterministic = []) {
  const parsed = parseScenePlan(revision.plan, capabilities);
  const problems = [...(parsed.ok ? [] : parsed.problems), ...runtimeProblems(revision.plan, capabilities), ...revisionProblems(previous, revision)];
  const bad = (path, code, message) => problems.push({ path, code, message });
  // The description-fit codes are always answerable: the check runs after closure, so the problem list may not hold it yet when the reviser (rightly) answers it.
  const ids = new Set([...review.findings.map(finding => finding.id), 'description_fit', 'capture_budget', 'stale_receipt', 'invalid_receipt', ...deterministic.flatMap(check => [check.code, check.path].filter(Boolean))]);
  revision.changes.forEach((change, i) => { if (!ids.has(change.findingId)) bad(`changes.${i}.findingId`, 'unknown_finding', `"${change.findingId}" is not a finding of the review`); });
  revision.unresolvedFindingIds.forEach((id, i) => { if (!ids.has(id)) bad(`unresolvedFindingIds.${i}`, 'unknown_finding', `"${id}" is not a finding of the review`); });
  const diff = planDiff(previous, revision.plan);
  revision.changes.forEach((change, i) => { if (!change.paths.some(path => touches(diff, path))) bad(`changes.${i}.paths`, 'change_not_applied', `${change.findingId} claims a change at ${change.paths.slice(0, 3).join(', ')} but the plan did not change there`); });
  const answered = new Set([...revision.changes.map(change => change.findingId), ...revision.unresolvedFindingIds]);
  const blocking = review.findings.filter(isBlocking);
  for (const finding of blocking) if (!answered.has(finding.id)) bad('changes', 'finding_ignored', `${finding.id} (${finding.severity}) is neither answered by a change nor listed as unresolved`);
  const substantive = diff.filter(path => !COSMETIC.test(path));
  return { plan: revision.plan, planHash: parsed.ok || ScenePlanSchema.safeParse(revision.plan).success ? await planHash(revision.plan) : null, diff, substantive,
    needsReview: blocking.length > 0 || substantive.length > 0, problems: dedupe(problems), unresolved: blocking.filter(finding => revision.unresolvedFindingIds.includes(finding.id)) };
}

// The deterministic description-fit stand-in (INT-06-C17's trusted render-service measurement is not in this branch): a character-width
// estimate at three card widths, shaped as the real receipt (DescriptionFitSchema). Tests and the integration seam use it; production wires
// the real measurement as ctx.descriptionFit. It is a fixture: it proves the wiring, not that the real card styles fit the copy.
export async function fixtureDescriptionFit(plan) {
  const perLine = { 400: 70, 520: 90, 640: 110 }, length = plan.cardDescription.length;
  return { descriptionHash: await contentHash(plan.cardDescription), styleVersion: 'fixture-1', widths: Object.entries(perLine).map(([cardWidth, chars]) => ({ cardWidth: Number(cardWidth), lines: Math.ceil(length / chars) })) };
}

const stop = (reason, category, message) => ({ stop: { reason, category, message } });
const planFailure = (problems, what) => (isCapabilityGap(problems)
  ? { gap: capabilityGap(['other'], `The scene design asks for something that cannot be built yet: ${problemText(problems)}`, 'design') }
  : stop('design_invalid', 'spec', `${what} ${problemText(problems)}. Try again or edit the request.`));

// The design_verifying stage. d.pending set: a revision from the reviser awaits verification. d.pending null: a review of the current plan
// found nothing blocking and the design is closed. -> the decision applyDesign (explain-job.js) acts on.
export async function verifyDesign(job, ctx) {
  const d = job.design, capabilities = ctx.capabilities;
  if (d.pending) {
    const v = await verifyDesignRevision(d.plan, d.pending, d.review, capabilities, d.problems || []);
    if (v.unresolved.length) return stop('design_unresolved', v.unresolved[0].category === 'fact' ? 'fact' : 'spec', `The design cannot settle ${v.unresolved.length === 1 ? 'a point' : 'some points'} with what was supplied: ${v.unresolved.slice(0, 3).map(finding => finding.message).join(' ')} Add the missing information and try again.`);
    if (v.problems.length) return d.counts.revise < DESIGN_BOUNDS.revise ? { next: 'revise', feedback: v.problems, rejected: { planHash: v.planHash, diff: v.diff } } : planFailure(v.problems, 'The revised scene plan was not valid after two revisions:');
    if (v.needsReview) return d.counts.review < DESIGN_BOUNDS.review ? { next: 'review', plan: v.plan, planHash: v.planHash, diff: v.diff, substantive: v.substantive } : stop('design_exhausted', 'spec', 'The scene plan changed after its last allowed review, so it was not offered. Edit the request and try again.');
    return close(job, ctx, v.plan, v.planHash, v.diff);
  }
  return close(job, ctx, d.plan, d.planHash, []);
}

async function close(job, ctx, plan, hash, diff) {
  const d = job.design, capabilities = ctx.capabilities;
  const parsed = parseScenePlan(plan, capabilities);
  let problems = dedupe([...(parsed.ok ? [] : parsed.problems), ...runtimeProblems(plan, capabilities), ...(parsed.ok ? captureBudgetProblems(plan) : [])]);
  let fit = null;
  if (!problems.length) {
    if (typeof ctx.descriptionFit !== 'function') return stop('description_fit_unavailable', 'internal', 'The card description cannot be measured yet, so this scene plan cannot be offered.');
    fit = await ctx.descriptionFit(plan);
    problems = await descriptionFitProblems(plan, fit);
  }
  // A fast design has no review to revise from: its checks ran in the fill stage, so a late failure here stops with its reason.
  if (problems.length) return d.counts.revise < DESIGN_BOUNDS.revise && !(d.fast?.kind === 'fast' && !d.review) ? { next: 'revise', feedback: problems } : planFailure(problems, 'The scene plan could not be closed:');
  const checks = d.review?.openChecks || [];
  return { next: 'done', plan, planHash: hash, diff, fit, runtimeHash: await runtimeBindingHash(plan, capabilities),
    // INT-02-C11/C12: an unsettled fact stays open and a visual check is carried to the builder and rendered reviewer; neither is called passed.
    open: checks.filter(check => check.kind === 'fact_needs_evidence').map(check => check.text), carried: checks.filter(check => check.kind === 'visual_needs_render').map(check => check.text) };
}

export const designPipeline = Object.freeze({ designAuthor: authorDesign, designReview: reviewDesign, designRevise: reviseDesign, designVerify: verifyDesign });
