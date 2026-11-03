// /animation durable job (AN-05; plan sections 3, 5 "State and recovery rules" and 7). One Durable Object per canvas (AnimationJobs,
// idFromName(boardId)), with the same request fence, short locked mutations, alarm-driven stages, call ledger, Stop and Retry as
// /explain's ExplainJobs (explain-job.js), and animation's own policy (animation-policy.js) and artifacts.
//
// Stages: queued -> preparing -> awaiting_approval -> authoring -> validating -> rendering -> reviewing -> ready, with at most ONE
// repairing -> validating per confirmed build for a candidate that fails to validate or run, and one for a review rejection
// (ANIMATION_LIMITS.repairs); failed and cancelled are terminal. A
// repaired artifact reaches ready only through validating, rendering and a final review of exactly that artifact (its hash).
// The stage work (plan, author, validate, render, review, repair) is a pipeline injected at construction; the route is off unless
// ANIMATION_ENABLED is 'true'.
//
// Money: every model call is admitted on its own by spendTransport under one usage action per phase (preparation, generation); a
// review is kind evaluation. Before generation starts (Generate, and each paid Retry) the build's full worst case
// (animationReservation) must fit the learner's available allowance. That is a check, not a hold (see animation-policy.js): the job
// itself never sends more calls than ANIMATION_LIMITS.calls, nor more than the worst case in summed per-call bounds.
//
// Results bind to the canvas (this object), the card, the request, the approved plan hash, the source set and the artifact hash;
// a late stage result (after Stop, Retry or another stage) is dropped under the lock and never applied.
import { repositoryIdentity } from './repositories.js';
import { boundEvidence, mergeRefs, resolveExplainRefs } from './explain-context-refs.js';
import { anthropic } from './ask.js';
import { LEARN_TASKS, MESSAGE_LIMIT, costUsd } from './learn-models.js';
import { platformCaps, spendEnforced, spendTransport } from './learn-spend.js';
import { refusalBody } from './learn-spend-ledger.js';
import { finishAction, noteUsageIdentity, recordMedia, toMicros, usagePayer, usageTotals, withUsage } from './learn-usage.js';
import { allowanceFor } from './learn-entitlement.js';
import { sha256Hex } from './learn-grade-jev.js';
import { consumeProposal, envelopeFor, proposalRecord, proposalState, publishRevision, signProposal, verifyProposal } from './generation-proposal.js';
import { blockedBody, referencesKey, resolveReferences } from './generation-review-refs.js';
import { isReviewProposal } from '../../web/src/generation-review.js';
import { canonicalJson } from './explain-render.js';
import { beginStage, countStage, endStage, markTiming, newTiming, timingSummary } from './explain-policy.js';
import { hashAnimationPlan } from '../../web/src/animation3d/contract.js';
import { ASKED_FOR, approvedPlan, prepareStage } from './animation-brief.js';
import { artifactIntact, authorStage, sealArtifact, validateStage } from './animation-author.js';
import { renderProbe, renderStage } from './animation-render.js';
import { ANIMATION_FIXTURES } from '../../web/src/animation3d/fixtures.js';
import { LEARNING_EXAMPLES } from '../../web/src/animation3d/learning-examples.js';
import { validateAnimationArtifact } from '../../web/src/animation3d/contract.js';
import { artifactHashOf } from './animation-author.js';
import { reviewStage } from './animation-review.js';
import { repairStage } from './animation-repair.js';
import { ANIMATION_LIMITS, ANIMATION_POLICY_VERSION, AnimationPolicyError, animationModelConfigured, modelNotConfigured, animationRequest, animationReservation, callAnimationRole, checkAnimationRequest } from './animation-policy.js';

export const ANIMATION_PREFIX = '/api/learn/animation/jobs';
export const ANIMATION_COMMAND = 'animation';
export const animationEnabled = env => env.ANIMATION_ENABLED === 'true';
export const ANIMATION_DISABLED = 'Animations are not available here yet.';
// Server-owned execution eligibility of an accepted artifact, separate from generation (kill switch ANIMATION_EXECUTION_KILL=true).
export const animationExecution = env => ({ allowed: env.ANIMATION_EXECUTION_KILL !== 'true' });

// The stage work: plan (animation-brief.js), author and validate (animation-author.js), render (animation-render.js, the env.BROWSER
// seam), review (animation-review.js), repair (animation-repair.js); approvedPlan applies the reviewed proposal; intact checks a stored result.
export const animationPipeline = Object.freeze({ prepare: prepareStage, approvedPlan, author: authorStage, validate: validateStage, render: renderStage(), review: reviewStage, repair: repairStage, intact: artifactIntact });

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (message, status = 400, code = null) => Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
const KEY = /^[A-Za-z0-9_-]{8,128}$/;
const TERMINAL = new Set(['ready', 'failed', 'cancelled']);
const SOURCES = ['explicit', 'picker', 'command', 'suggestion', 'classified', 'tutor'];
const KIND = { brief: 'generation', author: 'generation', review: 'evaluation', repair: 'repair' };
const JOBS_KEPT = 50;
const jobKey = id => `job:${id}`;
// Plan calls: one per preparation plus its one correction, for the first plan and each refinement.
const briefLimit = ANIMATION_LIMITS.calls.brief * (1 + ANIMATION_LIMITS.planCorrections) * (1 + ANIMATION_LIMITS.refinements);
const hex = () => crypto.randomUUID().replaceAll('-', '');
const hash16 = async value => (await sha256Hex(canonicalJson(value ?? null))).slice(0, 16);
const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Learner-facing view: credits, never dollars; no prompt, findings, draft, artifact source or private diagnostics.
const credits = micros => Math.ceil((micros || 0) / 10000);
export function publicAnimationJob(job) {
  const settled = job.calls.reduce((t, c) => t + (c.costMicros || 0), 0);
  return {
    id: job.id, version: 1, boardId: job.boardId, cardId: job.cardId, stage: job.stage, attempt: job.attempt, terminal: TERMINAL.has(job.stage),
    repairs: job.repairs, stopReason: job.stopReason, failure: job.failure && { ...job.failure, message: failureText(job) }, recovery: recoveryOf(job),
    usage: { credits: credits(settled), unknown: job.calls.some(c => c.status === 'unknown') },
    // Revise plan's new job for the same card and request (revise): a card still bound to this one follows it (Animation3DCard reconcile).
    result: job.result, ...(job.plan ? { plan: job.plan, planHash: job.planHash } : {}), ...(job.successor ? { successor: job.successor } : {}),
    timing: timingSummary(job.timing), createdAt: job.createdAt, updatedAt: job.updatedAt,
  };
}
const diagnostics = job => ({ plan: job.plan, draft: job.draft, artifactHash: job.artifactHash, artifact: job.artifact && { ...job.artifact, program: job.artifact.program ? { bytes: job.artifact.program.source.length, sourceHash: job.artifact.program.sourceHash } : undefined },
  findings: job.findings, reviews: job.reviews ?? [], candidates: job.candidates, calls: job.calls, captures: (job.captures || []).map(({ data: _bytes, ...capture }) => capture), coverage: job.coverage ?? null, counts: job.counts, bounds: job.bounds, timing: job.timing });

// Only the actions that can run now. retry_render: the retained validated artifact, rendered again (no reauthoring). new_attempt:
// a paid retry within this job's remaining ceiling (never a reset one). revise_plan: when this build cannot go on, a NEW job for the
// same card and request whose planner revises the approved plan from the recorded failure; the learner reviews it in Chat and its
// Generate is admitted again (its own ceiling). edit_request: always.
const CANDIDATE_STOPS = new Set(['rounds', 'no_progress', 'unsupported_repair']);
const REVISABLE = new Set(['size_limit', 'checks', 'deadline', 'limit', 'transient']);
const AUTO_RETRY = new Set(['provider_unavailable', 'render_failed', 'captures_missing']);
export function recoveryOf(job) {
  if (job.stage !== 'failed') return [];
  if (job.inFlight) return ['reconcile'];
  const actions = [];
  if (job.failure?.stage === 'rendering' && job.artifact && !CANDIDATE_STOPS.has(job.stopReason)) actions.push('retry_render');
  else if (job.failure?.category === 'provider_unavailable' || job.failure?.retryable && withinCeiling(job)) actions.push('new_attempt');
  else if (job.approval && job.plan && REVISABLE.has(failureClass(job))) actions.push('revise_plan');
  return [...actions, 'edit_request'];
}
const withinCeiling = job => job.counts.author < ANIMATION_LIMITS.calls.author || (!!(job.draft || job.artifact) && job.repairs < ANIMATION_LIMITS.repairs);

// What kind of failure ended the job, from what it recorded (stop reason, failure stage, category and code, the last findings),
// never from model text. size_limit: the candidate's only problems were that the review or repair request could not carry it.
// shortcut: matched on fitProblems' wording (animation-repair.js) until validateStage returns its own category for it.
const TOO_LARGE = /is too large for the (?:independent review|repair) request/;
export function failureClass(job) {
  const f = job.failure || {}, last = job.findings?.at(-1);
  if (job.stopReason === 'capability_gap') return 'capability';
  if (f.category === 'review_validation') return 'review_validation';
  if (f.category === 'size_limit' || CANDIDATE_STOPS.has(job.stopReason) && last?.problems?.length && last.problems.every(p => TOO_LARGE.test(p))) return 'size_limit';
  if (CANDIDATE_STOPS.has(job.stopReason)) return 'checks';
  if (job.stopReason === 'deadline') return 'deadline';
  if (['spend_refused', 'spend_limited'].includes(f.code)) return 'credits';
  if (job.stopReason === 'budget') return 'limit';
  if (['provider_unavailable', 'transport', 'model_output', 'renderer'].includes(f.category)) return 'transient';
  return 'error';
}
// What the failed step's AI calls cost, from the job's call ledger (paidCall) only, which follows the usage records' learner rule
// (learn-usage.js, owner 2026-10-25): a refused call, and one that ended without a measured cost, charge nothing; a measured cost is
// used. A call whose outcome was never recorded (the isolate died while it ran) may have been charged, so zero is never promised for
// it. No call recorded for the step (or a record saved before callsFrom existed): nothing is said.
function chargeWords(job) {
  const from = job.failure?.callsFrom, ran = Number.isInteger(from) && from >= 0 ? job.calls.slice(from) : [];
  if (!ran.length) return '';
  if (ran.some(c => !['settled', 'failed', 'refused'].includes(c.status))) return 'It may have used AI credits.';
  const used = credits(ran.reduce((t, c) => t + (c.costMicros || 0), 0));
  return used ? `It used ${used} AI credit${used === 1 ? '' : 's'}.` : 'You are not charged for it.';
}
// The learner's words for a failure (card and Chat alike): what could not be done, what was tried, and the action offered now.
// Mapped from the recorded class, stage and finding categories; raw findings, model text and logs are never quoted.
const CHECKS = { validating: 'The scene did not pass its structure checks.', rendering: 'The scene failed when its program ran.' };
const AREAS = { spec: 'how the scene is drawn or computed', source: 'how it matches your sources', component: 'the shared 3D drawing', renderer: 'the shared 3D drawing', budget: 'its size' };
// transport: the service did not give a usable answer (interrupted, refused before sending); model_output: the model answered, and
// that answer could not be used (an invalid turn, its output limit, an incomplete review). Whether either was charged is chargeWords'.
const TRANSIENT = { provider_unavailable: 'The AI service was busy.', transport: 'An AI step was interrupted.', model_output: 'The AI answer could not be used.', renderer: 'The sample views could not be rendered.' };
function reviewWords(found) {
  const serious = (found?.findings || []).filter(f => f.severity !== 'minor'), areas = [...new Set(serious.map(f => AREAS[f.category]).filter(Boolean))];
  return serious.length ? `The visual review found ${serious.length} serious problem${serious.length === 1 ? '' : 's'} with ${areas.join(' and ') || 'the scene'}.` : 'The visual review did not accept the scene.';
}
export function failureText(job) {
  const kind = failureClass(job), f = job.failure || {}, action = recoveryOf(job).find(a => a !== 'edit_request');
  const what = { review_validation: 'The visual review returned an answer in the wrong form, and it could not be corrected within its limit, so this scene was neither accepted nor found faulty.', size_limit: 'The scene was too large to check.', deadline: 'The build ran out of time.', limit: 'The build reached its spending limit.',
    checks: f.stage === 'reviewing' ? reviewWords(job.findings?.filter(x => x.stage === 'reviewing').at(-1)) : CHECKS[f.stage] ?? 'The scene did not pass its checks.',
    transient: TRANSIENT[f.category] }[kind] ?? f.message ?? 'The animation could not be made.';
  const candidate = kind === 'checks' || kind === 'size_limit';
  const tried = [job.stopReason === 'no_progress' ? 'An automatic correction changed nothing.' : job.stopReason === 'unsupported_repair' ? 'It needs a change the automatic correction cannot make.'
    : job.repairs ? `It was corrected automatically ${job.repairs === 1 ? 'once' : 'twice'}${candidate ? ', but it still did not pass' : ''}.` : '', job.autoRetried ? 'It was retried automatically.' : ''];
  const next = { retry_render: 'Render again renders the built scene again.', new_attempt: 'Try again continues from where it stopped.',
    revise_plan: `Revise plan prepares a simpler plan from your request for you to review, using up to ${credits(job.reservation?.preparationMicros)} AI credits; nothing is built until you press Generate.` }[action]
    ?? (candidate || ['deadline', 'limit', 'review_validation'].includes(kind) ? 'Edit the request to start a new animation.' : '');
  return [what, ['transient', 'error', 'review_validation'].includes(kind) ? chargeWords(job) : '', ...tried, next].filter(Boolean).join(' ');
}
// The planner's instruction for a revised plan (prepareStage's refinement, with the approved plan as `previous`): server words only.
const REVISE_WHY = { size_limit: 'was too large to check', checks: 'did not pass its checks', deadline: 'ran out of time', limit: 'reached its spending limit', transient: 'could not be finished' };
const reviseNote = job => `The previous plan was built and ${REVISE_WHY[failureClass(job)] || 'could not be finished'}. Revise it so the scene is smaller and simpler to build: fewer objects, shorter labels and simpler rules. Keep the learning goal and every parameter of the previous plan; leave one out only if the scene cannot work with it.`;
// A revised plan says, in the review card's "you asked for" lines, each control of the approved plan it leaves out (never silent).
function revisedPlan(before, plan) {
  const kept = new Set((plan.parameters || []).flatMap(p => [p.id, p.label]));
  const dropped = (before?.parameters || []).filter(p => !kept.has(p.id) && !kept.has(p.label)).map(p => clean(`${ASKED_FOR}the ${p.label} control; this revised plan leaves it out so the animation can be built.`, 300));
  return dropped.length ? { ...plan, limitations: [...dropped, ...(plan.limitations || [])].slice(0, 8) } : plan;
}

function validateCreate(p) {
  if (!KEY.test(p.requestId || '')) throw fail('requestId is required.');
  if (typeof p.cardId !== 'string' || !KEY.test(p.cardId)) throw fail('cardId is required.');
  if (typeof p.prompt !== 'string' || !p.prompt.trim() || p.prompt.length > MESSAGE_LIMIT) throw fail('Describe what to animate.');
  if (p.context != null && JSON.stringify(p.context).length > 60000) throw fail('The attached context is too large.', 413);
  if (p.threadId != null && (typeof p.threadId !== 'string' || !p.threadId || p.threadId.length > 64)) throw fail('Invalid chat thread.');
  if (p.source != null && !SOURCES.includes(p.source)) throw fail('Unknown request source.');
}

// The plan as the proposal's review lines (generation-review.js lists, max 20 x 300): the recommendation and its reason, the
// interactions, controls, behavior and parameters, so the learner reviews what will be built in the existing card (no new widget).
export function planLines(plan) {
  const lines = [`Recommended: ${plan.experience}. ${plan.reason}`, `Behavior: ${plan.behavior}`, `Controls: ${plan.controlProfile}`,
    ...(plan.interactions || []).map(i => `Interaction: ${typeof i === 'string' ? i : i.label || i.description || i.id}`),
    ...(plan.parameters || []).map(p => `Parameter: ${p.label}${p.unit ? ` (${p.unit})` : ''}${p.type === 'number' ? `, ${p.min} to ${p.max}, default ${p.default}` : p.options ? `, one of ${p.options.map(o => o.label ?? o.value ?? o).join(', ')}` : ''}`),
    ...(plan.learningGoal ? [`Goal: ${plan.learningGoal}`] : [])];
  return lines.map(l => clean(l, 300)).filter(Boolean).slice(0, 20);
}
// The plan's learner-facing parts for the review card's short summary (web animation3d/PlanSummary.jsx, owner 2026-10-31): its
// parameters (label, unit, range or choices, starting value), what the learner can do, and the server's own "you asked for" lines,
// which stay in view. planLines above stays the signed full plan; ids, behavior and control enums never reach this summary.
export function planScene(plan) {
  return {
    parameters: (plan.parameters || []).map(({ id: _id, ...p }) => p),
    interactions: (plan.interactions || []).map(i => clean(typeof i === 'string' ? i : i.label || i.description || '', 200)).filter(Boolean),
    notices: (plan.limitations || []).filter(l => typeof l === 'string' && l.startsWith(ASKED_FOR)),
  };
}

// Dev-only render probe (owner priority, 2026-10-30): a contract fixture rendered through the real review capture path, with no model call
// and no job. Live only when ANIMATION_ENABLED and ANIMATION_DIAGNOSTICS are both 'true' (production never sets the second), for any
// signed-in user, same origin. POST { fixture: <a fixtures.js or learning-examples.js name> } -> renderProbe's JSON (200 ok, 502 failed).
export const ANIMATION_PROBE_PATH = '/api/learn/animation/diagnostics/render-fixture';
// The same probe for a STORED accepted result: POST { boardId, resultId }, for the owner of that canvas only, read through the normal
// authorized result read (owner, canvas and artifact hash checked by the job object), then the same capture path. 404 as any other.
export const ANIMATION_RESULT_PROBE_PATH = '/api/learn/animation/diagnostics/render-result';
// The same probe for a job's LAST CANDIDATE (FX-AN-025: replay a failed scene with no model call): POST { boardId, jobId }, for the
// owner of that canvas only. The job's own saved draft is sealed as validating seals it and drawn through the review capture path
// (its states and views); nothing is stored and the job is not changed.
export const ANIMATION_CANDIDATE_PROBE_PATH = '/api/learn/animation/diagnostics/render-candidate';
async function probeGuard(req, env, deps) {
  if (!animationEnabled(env) || env.ANIMATION_DIAGNOSTICS !== 'true') return { refused: json({ error: 'Not found' }, 404) };
  if (req.method !== 'POST') return { refused: json({ error: 'POST required' }, 405) };
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return { refused: json({ error: 'Invalid origin' }, 403) };
  const user = await (deps.identity || repositoryIdentity)(req, env);
  if (user instanceof Response) return { refused: user };
  try { return { user, body: await req.json() }; } catch { return { refused: json({ error: 'Invalid JSON' }, 400) }; }
}
async function resultProbeRoute(req, env, deps) {
  const { refused, user, body } = await probeGuard(req, env, deps);
  if (refused) return refused;
  if (!env.ANIMATION_JOBS || !env.LEARN_DB) return json({ error: 'Animations are not configured on this preview.' }, 503);
  if (typeof body?.boardId !== 'string' || typeof body?.resultId !== 'string') return json({ error: 'boardId and resultId are required' }, 400);
  const board = await env.LEARN_DB.prepare('SELECT id, app, board FROM learn_boards WHERE id = ? AND org = ? AND owner_email = ?').bind(body.boardId, user.org, user.email).first();
  if (!board) return json({ error: 'Not available' }, 404);
  const stub = env.ANIMATION_JOBS.get(env.ANIMATION_JOBS.idFromName(board.id));
  const read = await stub.fetch('https://animation/action', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'result', id: body.resultId, payload: {}, board, user: { org: user.org, email: user.email, userId: user.userId || user.user_id || null } }) });
  const saved = await read.json().catch(() => null);
  if (!read.ok) return json({ ok: false, read: read.status, error: saved?.error || 'the result could not be read', ...(saved?.code ? { code: saved.code } : {}) }, read.status);
  // The read already checked the stored artifact against its hash; the capture echoes that same hash.
  const out = await renderProbe(env, saved.artifact, saved.identity.artifactHash, deps.render, body.states ?? null);
  return json({ resultId: body.resultId, identity: saved.identity, artifact: saved.artifact, ...out }, out.ok ? 200 : 502);
}
async function candidateProbeRoute(req, env, deps) {
  const { refused, user, body } = await probeGuard(req, env, deps);
  if (refused) return refused;
  if (!env.ANIMATION_JOBS || !env.LEARN_DB) return json({ error: 'Animations are not configured on this preview.' }, 503);
  if (typeof body?.boardId !== 'string' || typeof body?.jobId !== 'string') return json({ error: 'boardId and jobId are required' }, 400);
  const board = await env.LEARN_DB.prepare('SELECT id, app, board FROM learn_boards WHERE id = ? AND org = ? AND owner_email = ?').bind(body.boardId, user.org, user.email).first();
  if (!board) return json({ error: 'Not available' }, 404);
  const stub = env.ANIMATION_JOBS.get(env.ANIMATION_JOBS.idFromName(board.id));
  const read = await stub.fetch('https://animation/action', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get', id: body.jobId, payload: {}, board, user: { org: user.org, email: user.email, userId: user.userId || user.user_id || null }, detail: true }) });
  const saved = await read.json().catch(() => null);
  const draft = saved?.diagnostics?.draft;
  if (!read.ok || !draft) return json({ ok: false, error: read.ok ? 'this job has no saved candidate' : saved?.error || 'the job could not be read' }, read.ok ? 404 : read.status);
  const artifact = await sealArtifact(draft, { artifactId: `ar_${body.jobId.replace(/^aj_/, '').slice(0, 32).padEnd(32, '0')}`, revision: 1, planHash: saved.job.planHash, createdAt: new Date(saved.job.createdAt ?? 0).toISOString() });
  const checked = validateAnimationArtifact(artifact);
  if (!checked.ok) return json({ ok: false, error: `candidate_invalid: ${checked.issues.slice(0, 5).map(i => `${i.path}: ${i.message}`).join('; ')}` }, 422);
  const out = await renderProbe(env, checked.value, await artifactHashOf(checked.value), deps.render);
  return json({ jobId: body.jobId, artifact: checked.value, ...out }, out.ok ? 200 : 502);
}
async function renderProbeRoute(req, env, deps) {
  const { refused, body } = await probeGuard(req, env, deps);
  if (refused) return refused;
  const fixtures = [...ANIMATION_FIXTURES, ...LEARNING_EXAMPLES];
  const fixture = fixtures.find(f => f.name === body?.fixture);
  if (!fixture) return json({ error: `fixture must be one of ${fixtures.map(f => f.name).join(', ')}` }, 400);
  // The validated value, as a job's artifact is, so the page hashes exactly what a review round sends.
  const checked = validateAnimationArtifact(fixture.artifact);
  if (!checked.ok) return json({ ok: false, error: `fixture_invalid: ${checked.issues.map(i => `${i.path}: ${i.message}`).join('; ')}` }, 500);
  const out = await renderProbe(env, checked.value, await artifactHashOf(checked.value), deps.render);
  return json({ fixture: fixture.name, ...out }, out.ok ? 200 : 502);
}

// The route: owner-only, same origin, behind ANIMATION_ENABLED. Off, it answers 404 as if absent.
export async function animationRoute(path, req, env, deps = {}) {
  if (path === ANIMATION_PROBE_PATH) return renderProbeRoute(req, env, deps);
  if (path === ANIMATION_RESULT_PROBE_PATH) return resultProbeRoute(req, env, deps);
  if (path === ANIMATION_CANDIDATE_PROBE_PATH) return candidateProbeRoute(req, env, deps);
  if (path !== ANIMATION_PREFIX && !path.startsWith(`${ANIMATION_PREFIX}/`)) return null;
  if (!animationEnabled(env)) return json({ error: ANIMATION_DISABLED, code: 'animation_disabled' }, 404);
  if (!env.ANIMATION_JOBS || !env.LEARN_DB) return json({ error: 'Animations are not configured on this preview.' }, 503);
  const url = new URL(req.url);
  if (req.method !== 'GET' && req.headers.has('origin') && req.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin' }, 403);
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Method not allowed' }, 405);
  const user = await (deps.identity || repositoryIdentity)(req, env);
  if (user instanceof Response) return user;
  let body = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); } }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid JSON' }, 400);
  const boardId = req.method === 'GET' ? url.searchParams.get('board') : body.boardId;
  if (typeof boardId !== 'string' || !boardId) return json({ error: 'board is required' }, 400);
  const board = await env.LEARN_DB.prepare('SELECT id, app, board FROM learn_boards WHERE id = ? AND org = ? AND owner_email = ?').bind(boardId, user.org, user.email).first();
  if (!board) return json({ error: 'Not available' }, 404);
  const rest = path.slice(ANIMATION_PREFIX.length).split('/').filter(Boolean).map(decodeURIComponent);
  const results = req.method === 'GET' && rest[0] === 'results' && rest.length === 2;
  const action = results ? 'result' : req.method === 'GET' ? (rest[0] ? 'get' : 'list') : (rest[0] ? rest[1] : 'create');
  if (!['get', 'list', 'create', 'cancel', 'retry', 'approve', 'refine', 'result'].includes(action) || (rest.length > 2 && !results)) return json({ error: 'Not found' }, 404);
  // Sources are read here, on the server, under this learner's access (explain-context-refs.js), never from text the browser sent.
  delete body.evidence; delete body.approved_refs;
  if (body.context && typeof body.context === 'object' && !Array.isArray(body.context)) { const { refs: _refs, refText: _text, ...kept } = body.context; body.context = kept; }
  if (action === 'create' && body.context_refs != null) {
    let got;
    try { got = await (deps.readRefs || resolveExplainRefs)(req, env, { user, board }, body.context_refs, deps.readers); } catch (error) { return json({ error: error.message }, error.status || 400); }
    body.context = { ...(body.context && typeof body.context === 'object' ? body.context : {}), refs: got.refs, ...(got.text ? { refText: got.text } : {}) };
    body.evidence = got.evidence;
  }
  delete body.context_refs;
  // Generate on a reviewed plan with references: each is read again now under this learner's access; a deleted, changed or refused one
  // answers 409 with every state, before anything is consumed.
  if (action === 'approve' && body.proposal?.references?.length && isReviewProposal(body.proposal)) {
    const found = await (deps.resolveReferences || resolveReferences)(env, { ...body.proposal, command: ANIMATION_COMMAND }, { req, user, app: board.app }, { read: deps.read });
    if (found.blocked.length) return json(blockedBody(found.states), 409);
    body.approved_refs = { key: referencesKey(body.proposal.references), refs: found.refs, text: found.text, evidence: found.evidence || [] };
  }
  const stub = env.ANIMATION_JOBS.get(env.ANIMATION_JOBS.idFromName(board.id));
  return stub.fetch('https://animation/action', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, id: results ? rest[1] : rest[0] || null, payload: body, board, user: { org: user.org, email: user.email, userId: user.userId || user.user_id || null }, origin: url.origin,
      detail: req.method === 'GET' && url.searchParams.get('detail') === '1' && env.ANIMATION_DIAGNOSTICS === 'true' }) });
}

export class AnimationJobs {
  // pipeline: the stage work (animationPipeline; tests inject stubs). options.tasks: the model task table (LEARN_TASKS).
  constructor(state, env, pipeline = animationPipeline, { tasks = LEARN_TASKS } = {}) {
    this.state = state; this.env = env; this.pipeline = pipeline; this.tasks = tasks; this.active = new Set();
  }
  async locked(fn) {
    const out = await this.state.blockConcurrencyWhile(async () => { try { return { value: await fn() }; } catch (error) { return { error }; } });
    if (out.error) throw out.error;
    return out.value;
  }
  get(id) { return this.state.storage.get(jobKey(id)); }
  async save(job) { job.updatedAt = Date.now(); await this.state.storage.put(jobKey(job.id), job); }
  async wake(delay = 50) { const at = Date.now() + delay, current = await this.state.storage.getAlarm?.(); if (!current || current > at) await this.state.storage.setAlarm(at); }

  async fetch(req) {
    try {
      const input = await req.json();
      return await this.locked(() => this.action(input));
    } catch (error) {
      if (error.refusal) return json(refusalBody(error.refusal), error.status || 429);
      return json({ error: error.status ? error.message : 'The animation could not be updated.', ...(error.code ? { code: error.code } : {}) }, error.status || 503);
    }
  }

  async action({ action, id, payload = {}, board, user, origin, detail = false }) {
    if (action === 'list') {
      const jobs = [...(await this.state.storage.list({ prefix: 'job:' })).values()].filter(j => j.owner.email === user.email && j.boardId === board.id);
      return json({ jobs: jobs.sort((a, b) => a.createdAt - b.createdAt).map(publicAnimationJob) });
    }
    if (action === 'create') return this.create(payload, board, user, origin);
    if (action === 'result') return this.readResult(id, board, user);
    const job = id && await this.get(id);
    if (!job || job.owner.email !== user.email || job.boardId !== board.id) throw fail('Not available', 404);
    if (action === 'get') {
      const block = job.stage === 'ready' ? await this.block(job) : null;
      return json({ job: publicAnimationJob(job), ...(block ? { block } : {}), ...(detail ? { diagnostics: diagnostics(job) } : {}) });
    }
    if (action === 'cancel') return this.stop(job);
    if (action === 'retry') return this.retry(job, payload);
    if (action === 'approve') return this.approve(job, payload);
    if (action === 'refine') return this.refine(job, payload);
    throw fail('Not found', 404);
  }

  // The accepted artifact of a card on this canvas, for its owner only, checked against its host-computed hash: the player's only
  // source of the scene and its program. Never served by hash alone, by another canvas or by another learner.
  async readResult(resultId, board, user) {
    const saved = typeof resultId === 'string' && await this.state.storage.get(`result:${resultId}`);
    if (!saved || saved.owner?.email !== user.email || saved.boardId !== board.id) throw fail('Not available', 404);
    if (!await this.pipeline.intact(saved.artifact, saved.identity?.artifactHash)) throw fail('This animation could not be opened. Your saved version is kept.', 409, 'version_unavailable');
    return json({ artifact: saved.artifact, identity: saved.identity, execution: animationExecution(this.env) });
  }

  async create(payload, board, user, origin) {
    validateCreate(payload);
    const fingerprint = await sha256Hex(JSON.stringify([payload.cardId, payload.prompt, payload.context ?? null]));
    const fence = await this.state.storage.get(`request:${payload.requestId}`);
    if (fence) {
      if (fence.fingerprint !== fingerprint) throw fail('This request id belongs to a different animation.', 409);
      return json({ job: publicAnimationJob(await this.get(fence.id)) });
    }
    const jobs = [...(await this.state.storage.list({ prefix: 'job:' })).values()];
    if (jobs.some(j => j.cardId === payload.cardId && !TERMINAL.has(j.stage))) throw fail('This card already has an animation in progress.', 409);
    const job = this.newJob({ boardId: board.id, app: board.app, board: board.board, owner: { org: user.org, email: user.email, userId: user.userId || null }, origin,
      cardId: payload.cardId, requestId: payload.requestId, prompt: payload.prompt.trim(), context: payload.context ?? null, evidence: payload.evidence ?? [],
      source: payload.source ?? 'explicit', threadId: payload.threadId ?? null });
    if (job.threadId && !await this.env.LEARN_DB.prepare('SELECT id FROM threads WHERE id = ? AND org = ? AND user = ? AND scope_ref = ?').bind(job.threadId, user.org, user.email, board.app).first()) throw fail('Not available', 404);
    await this.prune(jobs);
    await this.wake();
    await this.state.storage.put({ [jobKey(job.id)]: job, [`request:${payload.requestId}`]: { id: job.id, fingerprint } });
    return json({ job: publicAnimationJob(job) }, 202);
  }
  // A new job record: its own ceiling, keys, result id and timing, for one request (the fields create or a revision passes).
  newJob(request) {
    const now = Date.now();
    return {
      id: `aj_${hex()}`, version: 1, policyVersion: ANIMATION_POLICY_VERSION, ...request, refinement: null, pendingProposal: null, proposal: null, settings: null,
      stage: 'queued', attempt: 1, repairs: 0, stopped: false, stopReason: null, failure: null, inFlight: null,
      counts: { brief: 0, author: 0, review: 0, repair: 0 }, bounds: { preparation: 0, generation: 0 }, calls: [], renders: 0,
      prepKey: `ap${hex()}`, actionKey: `ag${hex()}`, resultId: `ar_${hex()}`, revision: `av_${hex()}`,
      plan: null, planHash: null, approval: null, draft: null, artifact: null, artifactHash: null, captures: null, coverage: null, findings: [], candidates: [], result: null,
      timing: newTiming('simple', now), createdAt: now, updatedAt: now, deadline: now + ANIMATION_LIMITS.deadlines.jobMs,
      reservation: animationReservation(this.tasks),
    };
  }
  // Revise plan: one new job for the same card, request, sources and thread, whose planner revises the approved plan from this
  // job's recorded failure (a brief call, admitted on its own like any plan). It waits for the learner's Generate, admitted again.
  // Pressed again (or from another tab) it answers the same new job; the request fence now names it, and this job stays failed.
  async revise(job) {
    const made = job.successor && await this.get(job.successor);
    if (made) return json({ job: publicAnimationJob(made) });
    const jobs = [...(await this.state.storage.list({ prefix: 'job:' })).values()];
    if (jobs.some(j => j.cardId === job.cardId && !TERMINAL.has(j.stage))) throw fail('This card already has an animation in progress.', 409);
    const pick = ['boardId', 'app', 'board', 'owner', 'origin', 'cardId', 'requestId', 'prompt', 'context', 'evidence', 'source', 'threadId'];
    const next = Object.assign(this.newJob(Object.fromEntries(pick.map(k => [k, job[k]]))), { plan: job.plan, approvedBefore: job.plan, refinement: reviseNote(job), revisedFrom: job.id });
    const fence = await this.state.storage.get(`request:${job.requestId}`);
    job.successor = next.id;
    await this.prune(jobs);
    await this.save(job);
    await this.state.storage.put({ [jobKey(next.id)]: next, ...(fence ? { [`request:${job.requestId}`]: { ...fence, id: next.id } } : {}) });
    await this.wake();
    return json({ job: publicAnimationJob(next) }, 202);
  }
  async prune(jobs) {
    const old = jobs.filter(j => TERMINAL.has(j.stage)).sort((a, b) => b.updatedAt - a.updatedAt).slice(JOBS_KEPT - 1);
    // An accepted result stays (the card reads it); a pruned job's request fence goes with it.
    for (const j of old) { await this.state.storage.delete?.(jobKey(j.id)); await this.state.storage.delete?.(`request:${j.requestId}`); }
  }

  // The learner's available allowance must cover the build's full worst case before any of it starts (a check, not a hold).
  async admitGeneration(job) {
    if (!spendEnforced(this.env)) return;
    if (!platformCaps(this.env).usd) throw Object.assign(fail('AI is paused.', 429), { refusal: { reason: 'cap_unset' } });
    const payer = await usagePayer(this.usageEnv(job, job.actionKey));
    if (payer?.chargeClass !== 'would_charge') return; // platform-funded work: the per-call platform guard still applies
    const allowance = await allowanceFor(this.env.LEARN_DB, this.env, payer.userId, payer.period);
    let reason = null;
    try {
      const { used, reserved } = await usageTotals(this.env.LEARN_DB, payer.userId, payer.period);
      const left = (allowance ?? 0) - used, need = job.reservation.generationMicros - job.bounds.generation;
      if (allowance == null) reason = 'allowance_unavailable';
      else if (left <= 0) reason = 'allowance_exhausted';
      else if (left - reserved < need) reason = reserved > 0 && left >= need ? 'allowance_reserved' : 'allowance_insufficient';
    } catch { reason = 'allowance_unavailable'; }
    if (reason) throw Object.assign(fail('Not enough AI credits.', reason === 'allowance_unavailable' ? 503 : 429), { refusal: { reason, period: payer.period } });
  }

  // Stop: durable at once. A call already sent finishes and settles; its result is dropped. No paid step starts after this.
  async stop(job) {
    if (TERMINAL.has(job.stage)) return json({ job: publicAnimationJob(job) });
    endStage(job.timing, 'stopped');
    Object.assign(job, { stopped: true, stage: 'cancelled', stopReason: 'stopped', approval: job.approval });
    await this.save(job);
    await this.finishUsage(job, 'cancelled');
    return json({ job: publicAnimationJob(job) });
  }

  // Retry of the same job and card; a duplicate Retry (it carries the attempt it saw) changes nothing. The ceiling is never reset.
  // action (optional): the recovery action the learner pressed; one no longer offered is refused, never swapped for another.
  async retry(job, payload) {
    if (payload.expectedAttempt !== job.attempt) return json({ job: publicAnimationJob(job) });
    const actions = recoveryOf(job);
    if (payload.action === 'revise_plan' && job.successor) return this.revise(job);
    if (payload.action != null && (payload.action === 'edit_request' || !actions.includes(payload.action))) throw fail('This choice is no longer available. The card shows what you can do now.', 409, 'recovery_stale');
    if (payload.action === 'revise_plan') return this.revise(job);
    if (actions.includes('retry_render')) {
      Object.assign(job, { stage: 'rendering', failure: null, stopReason: null, attempt: job.attempt + 1, deadline: Date.now() + ANIMATION_LIMITS.deadlines.jobMs });
    } else if (actions.includes('new_attempt')) {
      const paused = job.failure?.category === 'provider_unavailable' ? job.failure.stage : null;
      // A plan that was never approved is prepared again: a Retry never skips the learner's review.
      const stage = paused || (!job.approval ? 'preparing' : job.draft || job.artifact ? 'validating' : 'authoring');
      if (stage !== 'preparing' && job.approval) await this.admitGeneration(job);
      Object.assign(job, { stage, failure: null, stopReason: null, attempt: job.attempt + 1, deadline: Date.now() + ANIMATION_LIMITS.deadlines.jobMs });
    } else throw fail(job.stage === 'failed' ? 'This animation reached its limit. Edit the request to start a new one.' : 'Only a failed animation can be retried.', 409);
    beginStage(job.timing, job.stage);
    await this.save(job); await this.wake();
    return json({ job: publicAnimationJob(job) }, 202);
  }

  // The plan as the common signed proposal on the learner's chat thread. A refinement is the next version of the same proposal,
  // published by compare-and-swap on its one state (generation-proposal.js); a Generate or an edit that landed first wins.
  async postPlan(job) {
    const db = this.env.LEARN_DB, previous = job.pendingProposal, plan = job.plan;
    const record = previous ? await proposalRecord(db, job.owner.email, job.app, previous.id) : null;
    if (record?.state?.used) return;
    const notes = (job.context?.refs || []).filter(r => r.note).map(r => `${r.name}: ${r.note}.`);
    const p = await signProposal(this.env, { command: ANIMATION_COMMAND, title: plan.title, description: plan.description, settings: { experience: plan.experience }, source_refs: [],
      assumptions: (plan.assumptions || []).map(a => clean(a, 300)).filter(Boolean).slice(0, 20),
      limitations: [...notes, ...(plan.limitations || [])].map(a => clean(a, 300)).filter(Boolean).slice(0, 20), requirements: planLines(plan),
      input: { org: job.owner.org, app: job.app, job: job.id, plan_hash: job.planHash, request: job.prompt.slice(0, 500), scene: planScene(plan) } }, job.owner.email,
    { envelope: envelopeFor(this.env, { org: job.owner.org, app: job.app }), ...(previous ? { id: previous.id, version: (record?.current?.version ?? previous.version) + 1 } : {}) });
    const row = await db.prepare('INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?) RETURNING id').bind(job.threadId, 'assistant', job.revisedFrom && !previous ? 'Here is a revised plan for your animation. Generate makes it.' : 'Here is the plan for your animation. Generate makes it.').first();
    const meta = { version: 1, mode: 'ask', kind: 'answer', contextRefs: [], actions: [], followUps: [], syllabus: null, proposal: p, ...(previous ? {} : { proposalState: proposalState(p) }) };
    await db.prepare("INSERT INTO chat_message_meta (message_id, thread_id, role, alternative_of, meta_json) VALUES (?, ?, 'assistant', NULL, ?)").bind(row.id, job.threadId, JSON.stringify(meta)).run();
    if (previous && !(record?.root && await publishRevision(db, record, p))) return;
    job.pendingProposal = { id: p.proposal_id, version: p.version, messageId: String(row.id) };
  }
  // The canvas's open Chat thread for the owner (canvases.js activeChat's key), or a new canvas thread made the open one.
  async planThread(job) {
    const db = this.env.LEARN_DB, { org, email } = job.owner, key = `active:${job.app}:${org}:${email}`;
    const open = await db.prepare('SELECT context_json FROM chat_thread_state WHERE thread_id = ?').bind(key).first().catch(() => null);
    let id = null;
    try { id = JSON.parse(open?.context_json || 'null')?.threadId ?? null; } catch { /* unreadable: none */ }
    if (id && await db.prepare('SELECT id FROM threads WHERE id = ? AND org = ? AND user = ? AND scope_ref = ?').bind(id, org, email, job.app).first()) return id;
    id = `canvaschat-${crypto.randomUUID()}`;
    const at = new Date().toISOString();
    await db.batch([
      db.prepare("INSERT INTO threads (id, org, user, scope_ref, commit_sha, title) VALUES (?, ?, ?, ?, '', ?)").bind(id, org, email, job.app, (job.plan?.title || 'Animation plan').slice(0, 120)),
      db.prepare('INSERT INTO chat_thread_state (thread_id, context_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(thread_id) DO UPDATE SET context_json = excluded.context_json, updated_at = excluded.updated_at').bind(key, JSON.stringify({ threadId: id }), at),
    ]);
    return id;
  }
  // A conversational Edit of the plan: prepared again with the learner's words (an admitted brief call); the earlier approval no
  // longer counts. Only while awaiting approval, only on the published current revision, within the refinement limit.
  async refine(job, payload) {
    if (job.stage !== 'awaiting_approval') throw fail('This plan can no longer be changed.', 409, 'plan_stale');
    const message = typeof payload.message === 'string' ? payload.message.trim() : '';
    if (!message || message.length > MESSAGE_LIMIT) throw fail('Say what to change.');
    if (payload.proposal !== undefined) {
      const record = job.pendingProposal ? await proposalRecord(this.env.LEARN_DB, job.owner.email, job.app, job.pendingProposal.id).catch(() => null) : null;
      if (!record?.current || record.state?.used || payload.proposal?.proposal_id !== job.pendingProposal.id || payload.proposal?.version !== record.current.version) throw fail('This plan changed since you chose Edit. Review the latest version, then press Edit on it.', 409, 'plan_stale');
    }
    if (job.counts.brief >= briefLimit) throw fail('This plan reached its change limit. Start a new request.', 429);
    endStage(job.timing, 'refined');
    Object.assign(job, { refinement: message, approval: null, stage: 'preparing' });
    beginStage(job.timing, 'preparing');
    await this.save(job); await this.wake();
    return json({ job: publicAnimationJob(job) }, 202);
  }

  // Generate on the prepared plan: the signed /animation proposal for this job and its current plan, consumed through its one state
  // with the job id as the press key, so a repeated Generate of the same job is idempotent and any other use is refused. The
  // allowance is checked first: a refused Generate consumes nothing and the proposal stays current.
  async approve(job, payload) {
    const stale = () => fail('This plan changed. Review it again before generating.', 409, 'plan_stale');
    if (job.proposal && job.proposal.id === payload.proposal?.proposal_id && job.proposal.version === payload.proposal?.version) return json({ job: publicAnimationJob(job) });
    if (job.stage === 'cancelled') throw fail('This animation was stopped. Ask for it again to make one.', 409, 'plan_stale');
    if (job.stage !== 'awaiting_approval') throw stale();
    const p = payload.proposal, refused = await verifyProposal(this.env, p, job.owner.email);
    if (refused) throw fail(refused, 409, 'proposal_invalid');
    if (p.command !== ANIMATION_COMMAND || p.input?.job !== job.id || p.input?.plan_hash !== job.planHash) throw stale();
    // The executed plan is the approved one: the person's title, description, assumptions and experience over the prepared plan,
    // checked again against the enabled capabilities (an unsupported choice is refused here, before anything is consumed).
    let executed;
    try { executed = this.pipeline.approvedPlan(job.plan, p); } catch (error) { throw fail(error.message || 'This plan cannot be generated as edited.', 409, 'plan_invalid'); }
    await this.admitGeneration(job);
    if (isReviewProposal(p) && p.references?.length && payload.approved_refs?.key !== referencesKey(p.references)) throw fail('The attached references were not checked. Review the plan again.', 409, 'reference_blocked');
    const used = await consumeProposal(this.env.LEARN_DB, p, job.owner.email, { org: job.owner.org, app: job.app }, job.id);
    if (used) throw fail(used.error, 409, used.code);
    job.proposal = { id: p.proposal_id, version: p.version };
    job.settings = p.settings;
    if (isReviewProposal(p) && p.references?.length) {
      const refs = mergeRefs(job.context?.refs || [], payload.approved_refs.refs), ids = new Set(refs.map(r => r.evidence));
      const bounded = boundEvidence(refs, [...(payload.approved_refs.evidence || []), ...(job.evidence || [])].filter(r => ids.has(r.id)));
      job.context = { ...(job.context && typeof job.context === 'object' ? job.context : {}), refs: bounded.refs, refText: [job.context?.refText, payload.approved_refs.text].filter(Boolean).join('\n\n').slice(0, 24000) };
      job.evidence = bounded.evidence;
    }
    job.plan = executed; job.planHash = await hashAnimationPlan(executed);
    markTiming(job.timing, 'generate');
    Object.assign(job, { approval: { planHash: job.planHash, proposal: job.proposal, ...(isReviewProposal(p) ? { reviewHash: p.review_hash } : {}), sources: await this.sourcesKey(job), at: Date.now() },
      stage: 'authoring', deadline: Date.now() + ANIMATION_LIMITS.deadlines.jobMs });
    beginStage(job.timing, 'authoring');
    await this.save(job); await this.wake();
    return json({ job: publicAnimationJob(job) }, 202);
  }
  // The source set a result is bound to: the evidence records' ids and content hashes and the refs' identities (never their text).
  sourcesKey(job) { return hash16([(job.evidence || []).map(r => [r.id, r.contentHash ?? r.revision ?? null]), (job.context?.refs || []).map(r => [r.sourceId, r.version ?? null, r.status ?? null])]); }

  // What the card keeps on the canvas: a reference to the accepted artifact, never its program or scene (read through the result route).
  async block(job) {
    const saved = await this.state.storage.get(`result:${job.resultId}`);
    return saved && { type: 'animation3d', id: job.cardId, title: saved.artifact.title,
      animation3d: { resultId: job.resultId, artifactHash: saved.identity.artifactHash, revision: saved.identity.revision, experience: saved.identity.experience } };
  }

  usageEnv(job, key) {
    const scoped = withUsage(this.env, { feature: 'artifact', req: new Request('https://animation/job', { headers: { 'x-rh-action-key': key } }) });
    noteUsageIdentity(scoped, job.owner);
    return scoped;
  }
  transport(job, role) {
    return (env, body, model) => spendTransport(this.usageEnv(job, role === 'brief' ? job.prepKey : job.actionKey), body, model, null,
      admitted => anthropic(admitted, body, model, null), { userId: job.owner.userId || job.owner.email, category: 'animation', provider: 'anthropic', kind: KIND[role] });
  }
  async finishUsage(job, status) {
    const db = this.env.LEARN_DB, user = job.owner.userId || job.owner.email;
    if (!db) return;
    for (const key of [job.prepKey, job.actionKey].filter(Boolean)) {
      try { await db.prepare("UPDATE usage_actions SET status = ?, result = ?, ended_at = ? WHERE user_id = ? AND client_key = ? AND status = 'running'")
        .bind(status, status === 'completed' ? 'full' : 'none', Math.floor(Date.now() / 1000), user, key).run(); } catch { /* best effort, as finishAction */ }
    }
  }

  // One paid role call. Under the lock: the job is still this stage and attempt, not stopped, nothing else in flight, within the
  // role's call ceiling, the phase's summed worst case and the deadline; the intent is stored before anything is sent.
  async paidCall(job, role, spec) {
    // Refused before admission: no provider key here means nothing could be sent, so nothing is reserved or recorded as spent.
    if (!animationModelConfigured(this.env)) throw modelNotConfigured();
    const body = animationRequest(this.env, role, spec, this.tasks), { boundMicros, images } = checkAnimationRequest(this.env, role, body, this.tasks);
    const phase = role === 'brief' ? 'preparation' : 'generation';
    const key = await this.locked(async () => {
      const current = await this.get(job.id);
      if (!current || current.stopped || current.attempt !== job.attempt || current.stage !== job.stage || current.inFlight) return null;
      const limit = role === 'brief' ? briefLimit : ANIMATION_LIMITS.calls[role];
      if (current.counts[role] + 1 > limit) throw Object.assign(fail(`This animation reached its ${role} limit.`, 429), { stopReason: 'budget' });
      const ceiling = phase === 'generation' ? current.reservation.generationMicros : current.reservation.preparationMicros * (1 + ANIMATION_LIMITS.refinements);
      if (current.bounds[phase] + boundMicros > ceiling) throw Object.assign(fail('This animation reached its spending limit.', 429), { stopReason: 'budget' });
      if (Date.now() >= current.deadline) throw Object.assign(fail('This animation reached its time limit.', 409), { stopReason: 'deadline' });
      current.counts[role]++; current.bounds[phase] += boundMicros;
      // Unique per call record: a refused call gives its count back, so the count alone would name the retried call like the refused one.
      const callKey = `${current.id}-${role}-${current.calls.length + 1}`;
      current.inFlight = { key: callKey, role, at: Date.now() };
      current.calls.push({ key: callKey, role, phase, attempt: current.attempt, requested: null, served: null, status: 'running', boundMicros, images, costMicros: null, inputTokens: null, outputTokens: null, startedAt: Date.now(), endedAt: null });
      await this.save(current);
      return callKey;
    });
    if (!key) throw Object.assign(fail('This animation changed while it was working.', 409), { abandoned: true });
    this.active.add(job.id);
    let out, error;
    try { out = await callAnimationRole(this.env, role, spec, { callModel: this.transport(job, role), tasks: this.tasks }); } catch (e) { error = e; } finally { this.active.delete(job.id); }
    await this.locked(async () => {
      const current = await this.get(job.id), call = current.calls.find(c => c.key === key);
      // A reply refused after the provider answered (invalid turn, output limit) was billed: its usage is recorded like a settled call's.
      const usage = out?.usage ?? error?.billed?.usage, cost = usage ? costUsd({ model: out?.identity.served || error?.billed?.served || out?.identity.requested || 'claude-opus-5-5', ...usage }) : null;
      // A refusal (provider cap or overload, our own admission) ran nothing and cost nothing: it does not use the ceiling.
      const refused = ['provider_unavailable', 'spend_refused'].includes(error?.code);
      if (refused) { current.counts[role]--; current.bounds[phase] -= call.boundMicros; }
      Object.assign(call, { requested: out?.identity.requested ?? error?.reply?.requested ?? null, served: out?.identity.served ?? error?.served ?? error?.billed?.served ?? null, status: refused ? 'refused' : error ? 'failed' : 'settled', stopReason: out?.stopReason ?? error?.billed?.stopReason ?? null,
        costMicros: refused ? 0 : toMicros(cost), inputTokens: usage?.input_tokens ?? null, outputTokens: usage?.output_tokens ?? null, endedAt: Date.now(), error: error?.code || (error ? 'failed' : null), ...(error?.reply ? { reply: error.reply } : {}) });
      if (current.inFlight?.key === key) current.inFlight = null;
      countStage(current.timing, { calls: 1, inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens, images });
      await this.save(current);
    });
    if (error) throw error;
    return out;
  }

  // One review reply, kept beside the call that made it the moment it is known (diagnostics only: never in the learner view). Also what
  // the shared review retry reads (reviewStage).
  async noteReview(job, record) {
    await this.locked(async () => {
      const current = await this.get(job.id);
      if (!current) return;
      const call = current.calls.filter(c => c.role === 'review').at(-1);
      (current.reviews ??= []).push({ ...record, call: call ? { key: call.key, status: call.status, costMicros: call.costMicros, served: call.served } : null });
      await this.save(current);
    });
  }

  async alarm() {
    await this.state.storage.setAlarm(Date.now() + 30000); // re-armed first: a terminated isolate still gets a recovery turn
    let active = false;
    for (const [, snapshot] of await this.state.storage.list({ prefix: 'job:' })) {
      const job = await this.get(snapshot.id);
      if (!job || TERMINAL.has(job.stage) && !job.inFlight || job.stage === 'awaiting_approval') continue;
      active = true;
      try { await this.advance(job); } catch (error) { await this.failed(job, error); }
    }
    if (active) await this.wake(1000); else await this.state.storage.deleteAlarm?.();
  }
  // An in-flight call this object is not running was interrupted: whether the provider accepted it is unknown. Never resent; it
  // counts against the ceiling, and the job fails retryably.
  async reconcile(job) {
    const at = job.calls.findIndex(c => c.key === job.inFlight.key), call = job.calls[at];
    if (call) Object.assign(call, { status: 'unknown', endedAt: Date.now() });
    job.inFlight = null;
    if (!TERMINAL.has(job.stage)) {
      endStage(job.timing, 'interrupted');
      Object.assign(job, { stage: 'failed', stopReason: 'error', failure: { stage: call?.role === 'review' ? 'reviewing' : job.stage, category: 'transport', message: 'An AI step was interrupted.', retryable: true, ...(call ? { callsFrom: at } : {}) } });
      await this.finishUsage(job, 'interrupted');
    }
    await this.save(job);
    await this.report(job);
  }

  async advance(job) {
    if (job.inFlight) { if (!this.active.has(job.id)) await this.locked(async () => { const current = await this.get(job.id); if (current.inFlight && !this.active.has(job.id)) await this.reconcile(current); }); return; }
    if (Date.now() > job.deadline) throw Object.assign(fail('This animation reached its time limit.', 409), { stopReason: 'deadline' });
    if (job.resumeAt > Date.now()) return; // a transient failure waits before the same stage runs again (resumeLater)
    if (job.stage === 'queued') return this.move(job, job.approval ? 'authoring' : 'preparing');
    const ctx = { env: this.env, call: (role, spec) => this.paidCall(job, role, spec), noteReview: record => this.noteReview(job, record), limits: ANIMATION_LIMITS, tasks: this.tasks };
    const stage = job.stage, attempt = job.attempt;
    const run = { preparing: 'prepare', authoring: 'author', validating: 'validate', rendering: 'render', reviewing: 'review', repairing: 'repair' }[stage];
    const out = await this.pipeline[run](structuredClone(job), ctx);
    // A late result (after Stop, Retry or another stage) never overwrites what happened meanwhile.
    await this.locked(async () => {
      const current = await this.get(job.id);
      if (!current || current.stopped || current.attempt !== attempt || current.stage !== stage) return;
      await this.apply(current, stage, out || {});
    });
  }
  async move(job, stage) {
    await this.locked(async () => {
      const current = await this.get(job.id);
      if (!current || current.stopped || current.attempt !== job.attempt || current.stage !== job.stage) return;
      current.stage = stage; beginStage(current.timing, stage); markTiming(current.timing, 'firstFeedback');
      await this.save(current);
    });
  }
  async apply(job, stage, out) {
    const next = to => { endStage(job.timing, 'done'); job.stage = to; beginStage(job.timing, to); };
    // The planner's own replies, as given, with the issues of a refused one (diagnostics only: candidates never reach the learner view).
    if (stage === 'preparing' && Array.isArray(out.answers)) (job.candidates ??= []).push(...out.answers.map(a => ({ stage: 'preparing', input: a.input, issues: a.issues })));
    // A capability the enabled phase lacks ends the job with what is missing: no repair, no simpler substitute scene.
    if (out.gap) { await this.stopWith(job, 'capability_gap', 'capability', out.gap.message); job.failure.gap = out.gap; return this.save(job); }
    if (stage === 'preparing') {
      job.plan = job.revisedFrom ? revisedPlan(job.approvedBefore, out.plan) : out.plan; job.planHash = await hashAnimationPlan(job.plan); job.approval = null; job.refinement = null;
      await this.finishUsage({ ...job, actionKey: null }, 'completed');
      // A prepared plan always waits for the learner's Generate; only approve() moves it on.
      endStage(job.timing, 'done'); job.stage = 'awaiting_approval'; beginStage(job.timing, 'awaiting_approval'); markTiming(job.timing, 'proposalReady');
      job.threadId ??= await this.planThread(job);
      await this.postPlan(job);
    } else if (stage === 'authoring') {
      Object.assign(job, { draft: out.draft, artifact: null, artifactHash: null, captures: null, coverage: null });
      next('validating');
    } else if (stage === 'validating') {
      if (out.problems?.length) { job.findings.push({ repairs: job.repairs, stage, problems: out.problems }); return this.repairOrStop(job, out, 'run'); }
      // The artifact is the host's: sealed from the approved plan and sources, its hash computed here, never taken from the model.
      if (out.artifact?.planHash !== job.planHash) throw Object.assign(fail('The animation was built from another plan.', 409), { category: 'internal' });
      if (!/^[0-9a-f]{64}$/.test(out.artifactHash || '')) throw Object.assign(fail('The animation was not sealed.', 500), { category: 'internal' });
      // A repair whose sealed result is the candidate it was asked to fix made no progress: stop rather than render and review it again.
      if (job.repairs && out.artifactHash === job.repairedFrom) return this.stopWith(job, 'no_progress', 'spec', 'The animation could not be repaired. Edit the request and try again.');
      job.artifact = out.artifact; job.artifactHash = out.artifactHash;
      next('rendering');
    } else if (stage === 'rendering') {
      if (out.problems?.length) {
        job.findings.push({ repairs: job.repairs, stage, problems: out.problems });
        if (out.renders?.length) { job.renders += out.renders.length; await this.recordRenders(job, out.renders); }
        return this.repairOrStop(job, out, 'run');
      }
      if (!out.captures?.length || out.captures.some(c => c.artifactHash !== job.artifactHash)) throw Object.assign(fail('The animation could not be rendered for review (captures_missing). Retry rendering.', 503, 'captures_missing'), { category: 'renderer' });
      job.captures = out.captures; job.coverage = out.coverage ?? null; job.renders += out.renders?.length || 0;
      countStage(job.timing, { captures: job.captures.length });
      await this.recordRenders(job, out.renders || []);
      next('reviewing');
    } else if (stage === 'reviewing') {
      // A verdict counts only for exactly the artifact under review: a stale or unbound one is never an acceptance.
      if (!job.artifactHash || out.artifactHash !== job.artifactHash) throw Object.assign(fail('The review was not of this animation.', 409, 'review_stale'), { category: 'internal' });
      job.findings.push({ repairs: job.repairs, stage, accepted: out.accepted === true, findings: out.findings || [] });
      if (out.accepted === true) return this.accept(job);
      return this.repairOrStop(job, out, 'review');
    } else if (stage === 'repairing') {
      // The draft this repair replaced (diagnostics only): FX-AN-030's first draft was lost when its repair overwrote it.
      job.candidates.push({ repairs: job.repairs, ...(job.draft ? { previousDraft: job.draft } : {}), operation: out.operation || null, progress: out.progress !== false, ...(out.draft ? { draftHash: await hash16(out.draft), hasProgram: !!out.draft.program } : {}), ...(out.inputKeys ? { inputKeys: out.inputKeys } : {}), ...(out.artifactKeys ? { artifactKeys: out.artifactKeys } : {}), ...(out.rejected ? { rejected: out.rejected } : {}) });
      if (out.rejected) return this.stopWith(job, 'unsupported_repair', 'spec', 'This animation needs a change the repair step cannot make. Edit the request and try again.');
      if (out.progress === false || !out.draft) return this.stopWith(job, 'no_progress', 'spec', 'The animation could not be repaired. Edit the request and try again.');
      Object.assign(job, { draft: out.draft, artifact: null, artifactHash: null, captures: null, coverage: null });
      next('validating');
    }
    await this.save(job);
  }
  // kind: 'run' (the candidate failed to validate or run) or 'review' (the review rejected it); each is repaired at most once.
  async repairOrStop(job, out, kind) {
    job.repairKinds ??= [];
    if (job.repairs >= ANIMATION_LIMITS.repairs || job.repairKinds.includes(kind)) return this.stopWith(job, 'rounds', out.category || 'spec', 'The animation did not pass its checks, even after a correction. Edit the request and try again.');
    if (out.repairable === false) return this.stopWith(job, 'unsupported_repair', out.category || 'spec', out.message || 'This animation needs a change the repair step cannot make. Edit the request.');
    job.repairKinds.push(kind); job.repairs++; job.repairedFrom = job.artifactHash; endStage(job.timing, 'rejected'); job.stage = 'repairing'; beginStage(job.timing, 'repairing');
    await this.save(job);
  }
  async stopWith(job, stopReason, category, message, retryable = false) {
    endStage(job.timing, stopReason);
    Object.assign(job, { stage: 'failed', stopReason, failure: { stage: job.stage, category, message, retryable } });
    await this.save(job); await this.finishUsage(job, 'failed'); await this.report(job);
  }
  // The failure, explained once in the canvas Chat (one message per job and attempt; reloads and polling never repeat it): the same
  // words the card shows (failureText). Best effort: a Chat write that fails leaves the card's explanation and actions as they are.
  async report(job) {
    if (job.stage !== 'failed' || job.inFlight || job.reported === job.attempt || !this.env.LEARN_DB) return;
    try {
      job.threadId ??= await this.planThread(job);
      await this.env.LEARN_DB.prepare('INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?)').bind(job.threadId, 'assistant',
        `${job.plan?.title ? `"${clean(job.plan.title, 120)}" was not finished.` : 'Your animation was not finished.'} ${failureText(job)} Your request and plan are kept.`).run();
      job.reported = job.attempt;
      await this.save(job);
    } catch { /* best effort, as finishUsage */ }
  }
  // A transient failure (the provider busy, a sample render that failed) waits and runs the same stage again, once per attempt and
  // only before the deadline; a refused call cost nothing and gave its count back, and a render is platform compute. -> resumed?
  async resumeLater(job, error) {
    const at = Date.now() + ANIMATION_LIMITS.autoRetry.delayMs;
    if (!AUTO_RETRY.has(error.code) || job.autoRetried === job.attempt || at >= job.deadline) return false;
    job.findings.push({ repairs: job.repairs, stage: job.stage, error: error.code, autoRetry: true });
    Object.assign(job, { autoRetried: job.attempt, resumeAt: at });
    await this.save(job);
    return true;
  }
  // The accepted result: the sealed artifact stored behind this canvas's ownership, with its identity (what the card saves) and the
  // provenance of what it was made from. Prior results of the card are untouched: a new revision never overwrites a good one.
  async accept(job) {
    const artifact = job.artifact, author = job.calls.filter(c => c.role === 'author' && c.status === 'settled').at(-1);
    job.result = { jobId: job.id, resultId: job.resultId, cardId: job.cardId, canvas: { boardId: job.boardId }, requestRef: (await sha256Hex(`${job.requestId}|${job.prompt}`)).slice(0, 16),
      revision: job.revision, planHash: job.planHash, sources: job.approval?.sources ?? null, artifactHash: job.artifactHash, experience: job.plan?.experience ?? null,
      capabilityVersion: artifact.capabilityVersion ?? null, policyVersion: job.policyVersion };
    await this.state.storage.put(`result:${job.resultId}`, { kind: 'animation3d', artifact, identity: job.result, owner: { org: job.owner.org, email: job.owner.email }, boardId: job.boardId, cardId: job.cardId,
      authoredBy: author ? { requested: author.requested, served: author.served } : null,
      provenance: { evidence: (job.evidence || []).map(r => r.id).slice(0, 64), sources: (job.context?.refs || []).map(({ sourceId, kind, name, version, status, evidence }) => ({ sourceId, kind, name, version: version ?? '', ...(status ? { status } : {}), ...(evidence ? { evidence } : {}) })) } });
    endStage(job.timing, 'accepted'); markTiming(job.timing, 'result');
    Object.assign(job, { stage: 'ready', stopReason: 'accepted' });
    await this.save(job); await this.finishUsage(job, 'completed');
  }
  // Review renders are platform compute (feature render, free to the learner), recorded once per capture.
  async recordRenders(job, renders) {
    for (const render of renders) {
      const scoped = withUsage(this.env, { feature: 'render' });
      noteUsageIdentity(scoped, job.owner);
      await recordMedia(scoped, { provider: 'animation_renderer', ok: render.ok !== false });
      await finishAction(scoped, render.ok !== false ? { status: 'completed', result: 'full' } : { status: 'failed', result: 'none' });
    }
  }
  async failed(job, error) {
    await this.locked(async () => {
      const current = await this.get(job.id);
      if (!current || TERMINAL.has(current.stage) || current.inFlight || error.abandoned) return;
      // The planner's replies before the failure, on every failure route (diagnostics only: candidates never reach the learner view).
      if (Array.isArray(error.answers)) (current.candidates ??= []).push(...error.answers.map(a => ({ stage: 'preparing', input: a.input, issues: a.issues })));
      if (await this.resumeLater(current, error)) return;
      endStage(current.timing, 'failed');
      // The calls this stage run made (job is the snapshot it started from): what its explanation may say about charges (chargeWords).
      const callsFrom = job.calls.length;
      if (error.code === 'provider_unavailable') {
        Object.assign(current, { stage: 'failed', stopReason: 'provider_unavailable', failure: { stage: current.stage, category: 'provider_unavailable', message: error.message, retryable: true, callsFrom } });
        await this.save(current); await this.finishUsage(current, 'failed'); await this.report(current);
        return;
      }
      const refused = ['spend_limited', 'spend_refused'].includes(error.code) || error.status === 429;
      const policy = error instanceof AnimationPolicyError;
      // A model reply refused after the provider answered (billed, or its call settled before the stage refused what it said) is an
      // unusable answer, not an interruption.
      const answered = !!error.billed || current.calls.slice(callsFrom).at(-1)?.status === 'settled';
      // A missing capture binding or renderer is an explicit, structured blocker at rendering (Retry rendering keeps the artifact).
      Object.assign(current, { stage: 'failed', stopReason: error.stopReason || (refused ? 'budget' : 'error'),
        failure: { stage: current.stage, category: refused ? 'budget' : policy || error.category === 'transport' ? (answered ? 'model_output' : 'transport') : error.category || 'internal', ...(error.code ? { code: error.code } : {}), callsFrom,
          message: error.status || policy ? error.message : 'The animation stopped unexpectedly.', retryable: !error.stopReason && error.code !== 'model_unavailable' && error.code !== 'task_unconfigured' } });
      // The underlying code and message, bounded (FX: a bare "Error" hid a missing provider key). Messages are ours or the provider's
      // error text; no request, key or cookie is ever part of one.
      current.findings.push({ repairs: current.repairs, stage: current.failure.stage, error: error.code || error.name || 'error', message: String(error.message || '').replace(/\s+/g, ' ').slice(0, 1500) }); // diagnostics only: findings never reach the learner view
      await this.save(current); await this.finishUsage(current, 'failed'); await this.report(current);
    });
  }
}
