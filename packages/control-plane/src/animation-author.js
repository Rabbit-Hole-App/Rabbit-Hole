// /animation authoring and deterministic validation (AN-05; plan sections 5 and 7). author: one animation_author call writes an
// original scene and behavior program for the APPROVED plan (or says what is missing). validate: no model call; the host seals the
// draft into an animation-scene/1 artifact (its id, revision, plan hash, capability version, program version tuple, source hash and
// provenance are the host's, never the model's), checks it with the shared contract (animation3d/contract.js), checks it keeps the
// approved plan's experience, behavior, controls and parameters, and checks that the review and repair requests that must read it
// fit their roles' limits. Problems are repairable, one sentence each; the job allows one repair (animation-job.js).
import { ANIMATION_PROGRAM_VERSIONS, SCENE_SCHEMA, clientFeatureUses, hashProgramSource, validateAnimationArtifact } from '../../web/src/animation3d/contract.js';
import { canonicalJson, sha256Hex } from '../../web/src/explain-program/contract.js';
import GOLDEN from '../../web/src/animation3d/testdata/sgd-golden.json' with { type: 'json' };
import { ANIMATION_AUTHOR_SYSTEM, authorTool } from './agents/animation-author.js';
import { archetypeRules } from './agents/animation-archetypes.js';
import { actionCapability, clientFeatures, enabledCapabilities, surfaceCapability } from './animation-brief.js';
import { AnimationPolicyError } from './animation-policy.js';
import { estimateDraftBytes } from './animation-feasibility.js';
import { draftOf, fitProblems, withProgram } from './animation-repair.js';
import { modelEvidence } from './explain-evidence.js';

const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
// What the author is told about the enabled phase (the same object the validator checks against).
export const authorCapabilities = (caps = enabledCapabilities()) => ({ phase: caps.phase, geometry: caps.geometry, events: caps.events, features: caps.features, speeds: caps.speeds, stepSeconds: caps.stepSeconds, limits: caps.limits });

// AN-20 (owner decision 13): a plan that names an archetype gives the author that archetype's rules and its ONE exemplar, in the user content (never the cached
// system block). The exemplar is the golden SGD artifact as a draft, without its title and description (a fixture says so in both; the author writes its own), at the
// hash below (over the draft): a changed golden fails the job loudly instead of silently changing what a measurement sent. It is sent in the tool-call shape the author must
// answer in, { kind: 'artifact', artifact } (FX-AN-056). It is never served as a result (decision 13).
export const EXEMPLARS = Object.freeze({ loss_surface: { artifact: GOLDEN.artifact, sha256: '3a0d8049f1ed20c7f709f3b5793243c2e4367c143c9ff019cae605daf91d1546' } });
export const exemplarDraft = artifact => { const { title: _title, description: _description, ...rest } = draftOf(artifact); return rest; };
export async function archetypeContent(name, exemplars = EXEMPLARS) {
  const rules = archetypeRules(name), exemplar = exemplars[name];
  if (!rules || !exemplar) return null;
  const draft = exemplarDraft(exemplar.artifact), hash = await sha256Hex(canonicalJson(draft));
  if (hash !== exemplar.sha256) throw new AnimationPolicyError('exemplar_changed', `The ${name} exemplar is ${hash}, not the frozen ${exemplar.sha256}.`);
  return { name, rules, exemplar: { kind: 'artifact', artifact: draft }, note: 'The exemplar is one finished scene of this shape, for its structure only. Write your own for this plan: its formula, controls, words and numbers, and your own title and description.' };
}

// FX-AN-056 (Gate 1, C3': 5 of 20 replies ended "The author returned no artifact"; the shape they had is not known). A reply that carries the artifact in the tool input's
// own fields (kind absent or artifact, and title, scene and parameters at the top level) is taken as the artifact, as withProgram takes a misplaced program. Never invented:
// a reply with fewer fields is asked once more.
const FLAT_FIELDS = ['title', 'scene', 'parameters'];
export const artifactIn = input => {
  if (plain(input.artifact)) return input.artifact;
  if ((input.kind ?? 'artifact') !== 'artifact' || !FLAT_FIELDS.every(key => input[key] !== undefined)) return null;
  const { kind: _kind, artifact: _artifact, gap: _gap, ...fields } = input;
  return fields;
};
// The one more ask when neither shape is present (the same pattern as animation-repair.js PROGRAM_CORRECTION: user content, never the system prompt). It is a second author call
// (spec.again: animation-job.js paidCall admits one beyond the author ceiling, so an attempt's ceiling and recovery are unchanged).
export const ARTIFACT_CORRECTION = 'Your previous reply had no artifact. Call animation_artifact again with kind artifact and the whole artifact in its artifact field.';

// The author stage. -> { draft, askedAgain? } | { gap }
export async function authorStage(job, ctx) {
  const archetype = job.plan?.archetype ? await archetypeContent(job.plan.archetype) : null;
  const content = JSON.stringify({ request: job.prompt, plan: job.plan, context: job.context?.refText ? { refText: job.context.refText } : null, evidence: modelEvidence(job.evidence), capabilities: { ...authorCapabilities(), ...surfaceCapability(job), ...actionCapability(job) }, ...(archetype ? { archetype } : {}) });
  const spec = { system: ANIMATION_AUTHOR_SYSTEM, tool: authorTool(job.plan), content };
  let { input } = await ctx.call('author', spec), askedAgain = false, artifact = input.kind === 'capability_gap' ? null : artifactIn(input);
  if (input.kind !== 'capability_gap' && !artifact) {
    askedAgain = true;
    ({ input } = await ctx.call('author', { ...spec, content: [{ type: 'text', text: content }, { type: 'text', text: ARTIFACT_CORRECTION }], again: true }));
    artifact = input.kind === 'capability_gap' ? null : artifactIn(input);
  }
  if (input.kind === 'capability_gap') {
    if (!input.gap?.reason) throw new AnimationPolicyError('invalid_turn', 'The author reported a gap without saying what is needed.');
    return { gap: { capability: 'animation', needs: ['other'], source: 'author', reason: String(input.gap.reason).slice(0, 300), message: 'This animation needs something that is not available yet, so edit the request.' } };
  }
  if (!artifact) throw new AnimationPolicyError('invalid_turn', 'The author returned no artifact.');
  return { draft: withProgram({ ...input, artifact }), ...(askedAgain ? { askedAgain } : {}) };
}

// The host's seal: the draft's own fields, with every binding field set here. A draft's own value for one of them is replaced.
export async function sealArtifact(draft, { artifactId, revision = 1, planHash, model = null, createdAt = new Date().toISOString(), caps = enabledCapabilities() }) {
  const { program, ...rest } = draft;
  return { ...rest, schema: SCENE_SCHEMA, artifactId, revision, planHash, capabilityVersion: caps.version, sourceRefs: [],
    provenance: { origin: 'generated', ...(model ? { model: String(model).slice(0, 64) } : {}), createdAt },
    ...(program !== undefined ? { program: { ...ANIMATION_PROGRAM_VERSIONS, source: typeof program?.source === 'string' ? program.source : '', sourceHash: await hashProgramSource(typeof program?.source === 'string' ? program.source : '') } } : {}) };
}
// The artifact's identity: SHA-256 of its canonical JSON. Stored beside it, never inside it (the artifact schema is strict).
export const artifactHashOf = artifact => sha256Hex(canonicalJson(artifact));
// A stored artifact is served only if it is still valid for the phase, its program is the source its hash names, and its hash matches.
export async function artifactIntact(artifact, artifactHash) {
  try {
    if (!plain(artifact) || !/^[0-9a-f]{64}$/.test(artifactHash || '')) return false;
    if (!validateAnimationArtifact(artifact, enabledCapabilities()).ok) return false;
    if (artifact.program && artifact.program.sourceHash !== await hashProgramSource(artifact.program.source)) return false;
    return await artifactHashOf(artifact) === artifactHash;
  } catch { return false; }
}

// Early, parser-free checks of the program text with a one-line fix each (the isolated runtime is the boundary, not these).
const exportsName = name => new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function\\s*\\*?|const|let|var)\\s+${name}\\b|\\bexport\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`);
export const interactiveArtifact = a => (a.actions?.length || 0) > 0 || a.stepped === true || (a.scene?.nodes || []).some(n => n?.selectable || n?.drag);
export function programProblems(artifact) {
  const source = artifact.program?.source;
  if (source === undefined) return [];
  if (typeof source !== 'string' || !source.trim()) return ['program.source: must be JavaScript text'];
  const out = [];
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source)) out.push('program.source: contains a control character');
  if (/^\s*import\b/m.test(source)) out.push('program.source: no import is available; remove the import statement');
  // The host names an action by event.action (ANIMATION_PROGRAM_CONTRACT.events); a program that only reads event.id ignores every press.
  if ((artifact.actions || []).length && /\bevent\s*\.\s*id\b/.test(source) && !/\bevent\s*\.\s*action\b/.test(source)) out.push('program.source: reduce reads event.id, but an action event is { type: "action", action: <action id> }; read event.action');
  const needs = interactiveArtifact(artifact) ? ['evaluate', 'initialState', 'reduce'] : ['evaluate'];
  for (const name of needs) if (!exportsName(name).test(source)) out.push(`program.source: the module must export ${name} (${ANIMATION_PROGRAM_VERSIONS.kind}: ${name === 'evaluate' ? 'evaluate({ inputs, time, seed, state }) returning a frame' : name === 'initialState' ? 'initialState({ inputs, seed }) returning the first state' : 'reduce({ state, event, inputs, time, seed }) returning the next state'})`);
  return out;
}

// The approved plan is binding: the same experience, behavior and control profile, and every planned parameter with its type, range or
// options, unit and default, listed first and in the plan's order (the card's first parameter is the main control; owner 2026-10-31: the
// learner's stated range, unit and default must reach the final control). The plan was what the learner reviewed; a different artifact is
// a repairable problem, never a silent change. Checked on new drafts only: a stored artifact is served by artifactIntact, unchanged.
export function planProblems(artifact, plan) {
  const out = [];
  for (const key of ['experience', 'behavior', 'controlProfile']) if (artifact[key] !== plan[key]) out.push(`${key}: the approved plan says ${plan[key]}, the artifact says ${String(artifact[key]).slice(0, 40)}`);
  const list = Array.isArray(artifact.parameters) ? artifact.parameters : [];
  const params = new Map(list.map(p => [p?.id, p]));
  let missing = false;
  for (const p of plan.parameters || []) {
    const a = params.get(p.id);
    if (!a) { missing = true; out.push(`parameters: the approved plan's parameter ${p.id} (${p.label}) is missing`); continue; }
    if (a.type !== p.type) { out.push(`parameters.${p.id}: the approved plan makes it a ${p.type}`); continue; }
    if (p.type === 'number' && (a.min !== p.min || a.max !== p.max)) out.push(`parameters.${p.id}: the approved range is ${p.min} to ${p.max}`);
    if (p.type === 'number' && (a.unit ?? '') !== (p.unit ?? '')) out.push(`parameters.${p.id}: the approved unit is ${p.unit ? `"${p.unit}"` : 'none'}`);
    if (p.type === 'select' && canonicalJson(p.options.map(o => o.value).sort()) !== canonicalJson((a.options || []).map(o => o?.value).sort())) out.push(`parameters.${p.id}: the approved options are ${p.options.map(o => o.value).join(', ')}`);
    if (a.default !== p.default) out.push(`parameters.${p.id}: the approved default is ${JSON.stringify(p.default)}`);
  }
  const ids = (plan.parameters || []).map(p => p.id);
  if (!missing && list.slice(0, ids.length).some((a, i) => a?.id !== ids[i])) out.push(`parameters: list the approved plan's parameters first and in its order (${ids.join(', ')})`);
  if (plan.experience === 'watch' && plan.duration && artifact.timeline && artifact.timeline.duration !== plan.duration) out.push(`timeline.duration: the approved loop is ${plan.duration} seconds`);
  if (plan.assertions?.length) out.push(...assertionProblems(artifact, plan)); // only a plan that carries assertions is held to them (AN-20, owner decision 13)
  return out;
}

// The plan's assertions against the artifact (plan section 8, AN-20): one repairable line each, found before any review is paid. clamp: that node has clampTo (no node named: some sphere node does);
// compare: the parameter is a number whose range includes both values; pathLength: a trail node with max at least min. Pure; tolerant of a draft that is not valid.
// FX-AN-111 (C9 owner item 2): the default step count a path must hold one point for, so the trail is drawn at every step. Read, in order, from (1) a number parameter named steps, stepCount,
// numSteps, nSteps, maxSteps or iterations (the artifact's, else the plan's): its DEFAULT; (2) the plan's own words, the step count its description states for a run ("up to 40 steps per run";
// the reading the size estimate already uses, animation-feasibility.js estimateDraftBytes, only when the plan describes a trail). -> { n, from } | null.
const STEP_PARAMETER = /^(?:steps?|stepCount|numSteps|nSteps|maxSteps|iterations?)$/i;
const TRAIL_MAX = 512; // contract.js: a trail holds at most 512 points
export function defaultStepCount(artifact, plan) {
  const parameters = [...(Array.isArray(artifact?.parameters) ? artifact.parameters : []), ...(Array.isArray(plan?.parameters) ? plan.parameters : [])];
  const parameter = parameters.find(p => p?.type === 'number' && STEP_PARAMETER.test(String(p.id ?? '')) && Number.isFinite(p.default));
  if (parameter) return { n: parameter.default, from: `the default of its parameter ${parameter.id}` };
  let stated = 0;
  try { stated = plan ? estimateDraftBytes(plan).stated : 0; } catch { /* a plan the estimate cannot read (not a checked plan) states no steps */ }
  return stated > 0 ? { n: stated, from: "the plan's own step count" } : null;
}
export function assertionProblems(artifact, plan) {
  const out = [], nodes = Array.isArray(artifact?.scene?.nodes) ? artifact.scene.nodes : [], geometries = Array.isArray(artifact?.scene?.geometries) ? artifact.scene.geometries : [];
  (Array.isArray(plan?.assertions) ? plan.assertions : []).forEach((item, i) => {
    const at = `assertions.${i}`;
    if (item?.kind === 'clamp' && item.node === undefined) {
      const sphere = n => n?.clampTo && geometries.some(g => g?.id === n.geometry && g.kind === 'sphere');
      if (!nodes.some(sphere)) out.push(`${at}: the approved plan clamps a marker to its surface; give a sphere node clampTo { node: <the surface node> }`);
    } else if (item?.kind === 'clamp') {
      const node = nodes.find(n => n?.id === item.node);
      if (!node) out.push(`${at}: the approved plan clamps node ${item.node}, which the scene does not declare`);
      else if (!node.clampTo) out.push(`${at}: the approved plan clamps node ${item.node} to its surface; give that node clampTo { node: <the surface node> }`);
    } else if (item?.kind === 'compare') {
      const p = (Array.isArray(artifact?.parameters) ? artifact.parameters : []).find(x => x?.id === item.parameter);
      const [low, high] = [...(item.values || [])].sort((a, b) => a - b);
      if (!p) out.push(`${at}: the approved plan compares values of parameter ${item.parameter}, which the scene does not declare`);
      else if (p.type !== 'number' || !(p.min <= low && p.max >= high)) out.push(`${at}: parameter ${item.parameter} must cover both compared values, ${low} and ${high} (it has ${p.type === 'number' ? `${p.min} to ${p.max}` : p.type})`);
    } else if (item?.kind === 'pathLength') {
      // The assertion's min is a floor; the path must also hold one point per step of the default run (FX-AN-111), at most what a trail can hold.
      const steps = defaultStepCount(artifact, plan), need = Math.min(TRAIL_MAX, Math.max(item.min, Math.ceil(steps?.n ?? 0)));
      const trail = id => geometries.some(g => g?.id === id && g.kind === 'trail' && g.max >= need);
      if (!nodes.some(n => n?.geometry !== undefined && trail(n.geometry))) out.push(`${at}: the approved plan needs a path of at least ${need} points${need > item.min ? ` (one for each of its ${Math.ceil(steps.n)} steps, ${steps.from})` : ''}; use a trail geometry with max ${need} or more on a node`);
    }
  });
  return out;
}

// A scene the browser that asked for it cannot draw (capabilities.js ANIMATION_CLIENT_FEATURES; none declared is an older build).
export function clientProblems(artifact, job) {
  const has = clientFeatures(job?.features), out = [];
  if (!has.includes('curve_radius')) out.push(...(artifact.scene?.geometries || []).flatMap((g, i) => (g?.kind === 'curve' && g.radius !== undefined ? [`scene.geometries.${i}.radius: the browser that asked for this scene cannot draw tube curves; remove radius`] : [])));
  if (!has.includes('action_motion')) out.push(...(artifact.actions || []).flatMap((a, i) => (a?.startsMotion !== undefined ? [`actions.${i}.startsMotion: the browser that asked for this scene does not know it; remove startsMotion`] : [])));
  // surface_grid, trail_points, text_readout, arrow_anchor and clamp (AN-18, owner decisions 11 and 12): one line per field, found by the contract.
  out.push(...clientFeatureUses(artifact).filter(use => !has.includes(use.feature)).map(use => `${use.path}: ${use.message}`));
  return out;
}

// The validate stage. -> { artifact, artifactHash } | { problems, category, repairable }
export async function validateStage(job, ctx = {}) {
  const caps = enabledCapabilities();
  if (!plain(job.draft)) return { problems: ['the artifact must be an object'], category: 'spec', repairable: true };
  const made = job.calls?.filter(c => ['author', 'repair'].includes(c.role) && c.status === 'settled').at(-1);
  // createdAt is the approval time, so the same draft always seals to the same artifact (and hash).
  const artifact = await sealArtifact(job.draft, { artifactId: job.resultId, revision: 1, planHash: job.planHash, model: made?.served ?? made?.requested ?? null, createdAt: new Date(job.approval?.at ?? 0).toISOString(), caps });
  const problems = [...programProblems(artifact), ...planProblems(artifact, job.plan), ...clientProblems(artifact, job)];
  const checked = validateAnimationArtifact(artifact, caps, { draft: true });
  if (!checked.ok) problems.push(...checked.issues.map(i => `${i.path || 'artifact'}: ${i.message} (${i.code})`));
  if (problems.length) return { problems: [...new Set(problems)].slice(0, 20).map(p => p.slice(0, 400)), category: 'spec', repairable: true };
  // The review and the one repair must be able to read this artifact: measured now, before any review is spent.
  const fit = fitProblems(ctx.env ?? {}, checked.value, job, ctx.tasks, job.draft);
  if (fit.length) return { problems: fit, category: 'size_limit', repairable: true }; // animation-job.js failureClass: size_limit
  return { artifact: checked.value, artifactHash: await artifactHashOf(checked.value) };
}
