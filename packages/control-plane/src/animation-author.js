// /animation authoring and deterministic validation (AN-05; plan sections 5 and 7). author: one animation_author call writes an
// original scene and behavior program for the APPROVED plan (or says what is missing). validate: no model call; the host seals the
// draft into an animation-scene/1 artifact (its id, revision, plan hash, capability version, program version tuple, source hash and
// provenance are the host's, never the model's), checks it with the shared contract (animation3d/contract.js), checks it keeps the
// approved plan's experience, behavior, controls and parameters, and checks that the review and repair requests that must read it
// fit their roles' limits. Problems are repairable, one sentence each; the job allows one repair (animation-job.js).
import { ANIMATION_PROGRAM_VERSIONS, SCENE_SCHEMA, hashProgramSource, validateAnimationArtifact } from '../../web/src/animation3d/contract.js';
import { canonicalJson, sha256Hex } from '../../web/src/explain-program/contract.js';
import { ANIMATION_AUTHOR_SYSTEM, authorTool } from './agents/animation-author.js';
import { enabledCapabilities } from './animation-brief.js';
import { AnimationPolicyError } from './animation-policy.js';
import { fitProblems } from './animation-repair.js';
import { modelEvidence } from './explain-evidence.js';

const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
// What the author is told about the enabled phase (the same object the validator checks against).
export const authorCapabilities = (caps = enabledCapabilities()) => ({ phase: caps.phase, geometry: caps.geometry, events: caps.events, features: caps.features, speeds: caps.speeds, stepSeconds: caps.stepSeconds, limits: caps.limits });

// The author stage. -> { draft } | { gap }
export async function authorStage(job, ctx) {
  const content = JSON.stringify({ request: job.prompt, plan: job.plan, context: job.context?.refText ? { refText: job.context.refText } : null, evidence: modelEvidence(job.evidence), capabilities: authorCapabilities() });
  const { input } = await ctx.call('author', { system: ANIMATION_AUTHOR_SYSTEM, tool: authorTool(job.plan), content });
  if (input.kind === 'capability_gap') {
    if (!input.gap?.reason) throw new AnimationPolicyError('invalid_turn', 'The author reported a gap without saying what is needed.');
    return { gap: { capability: 'animation', needs: ['other'], source: 'author', reason: String(input.gap.reason).slice(0, 300), message: 'This animation needs something that is not available yet, so edit the request.' } };
  }
  if (input.kind !== 'artifact' || !plain(input.artifact)) throw new AnimationPolicyError('invalid_turn', 'The author returned no artifact.');
  return { draft: input.artifact };
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
  const needs = interactiveArtifact(artifact) ? ['evaluate', 'initialState', 'reduce'] : ['evaluate'];
  for (const name of needs) if (!exportsName(name).test(source)) out.push(`program.source: the module must export ${name} (${ANIMATION_PROGRAM_VERSIONS.kind}: ${name === 'evaluate' ? 'evaluate({ inputs, time, seed, state }) returning a frame' : name === 'initialState' ? 'initialState({ inputs, seed }) returning the first state' : 'reduce({ state, event, inputs, time, seed }) returning the next state'})`);
  return out;
}

// The approved plan is binding: the same experience, behavior and control profile, and every planned parameter with its type, range or
// options. (The plan was what the learner reviewed; a different artifact is a repairable problem, never a silent change.)
export function planProblems(artifact, plan) {
  const out = [];
  for (const key of ['experience', 'behavior', 'controlProfile']) if (artifact[key] !== plan[key]) out.push(`${key}: the approved plan says ${plan[key]}, the artifact says ${String(artifact[key]).slice(0, 40)}`);
  const params = new Map((Array.isArray(artifact.parameters) ? artifact.parameters : []).map(p => [p?.id, p]));
  for (const p of plan.parameters || []) {
    const a = params.get(p.id);
    if (!a) { out.push(`parameters: the approved plan's parameter ${p.id} (${p.label}) is missing`); continue; }
    if (a.type !== p.type) out.push(`parameters.${p.id}: the approved plan makes it a ${p.type}`);
    else if (p.type === 'number' && (a.min !== p.min || a.max !== p.max)) out.push(`parameters.${p.id}: the approved range is ${p.min} to ${p.max}`);
    else if (p.type === 'select' && canonicalJson(p.options.map(o => o.value).sort()) !== canonicalJson((a.options || []).map(o => o?.value).sort())) out.push(`parameters.${p.id}: the approved options are ${p.options.map(o => o.value).join(', ')}`);
  }
  if (plan.experience === 'watch' && plan.duration && artifact.timeline && artifact.timeline.duration !== plan.duration) out.push(`timeline.duration: the approved loop is ${plan.duration} seconds`);
  return out;
}

// The validate stage. -> { artifact, artifactHash } | { problems, category, repairable }
export async function validateStage(job, ctx = {}) {
  const caps = enabledCapabilities();
  if (!plain(job.draft)) return { problems: ['the artifact must be an object'], category: 'spec', repairable: true };
  const made = job.calls?.filter(c => ['author', 'repair'].includes(c.role) && c.status === 'settled').at(-1);
  // createdAt is the approval time, so the same draft always seals to the same artifact (and hash).
  const artifact = await sealArtifact(job.draft, { artifactId: job.resultId, revision: 1, planHash: job.planHash, model: made?.served ?? made?.requested ?? null, createdAt: new Date(job.approval?.at ?? 0).toISOString(), caps });
  const problems = [...programProblems(artifact), ...planProblems(artifact, job.plan)];
  const checked = validateAnimationArtifact(artifact, caps);
  if (!checked.ok) problems.push(...checked.issues.map(i => `${i.path || 'artifact'}: ${i.message} (${i.code})`));
  if (problems.length) return { problems: [...new Set(problems)].slice(0, 20).map(p => p.slice(0, 400)), category: 'spec', repairable: true };
  // The review and the one repair must be able to read this artifact: measured now, before any review is spent.
  const fit = fitProblems(ctx.env ?? {}, checked.value, job, ctx.tasks);
  if (fit.length) return { problems: fit, category: 'spec', repairable: true };
  return { artifact: checked.value, artifactHash: await artifactHashOf(checked.value) };
}
