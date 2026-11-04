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
// review is kind evaluation. The build is an ESCROW (owner 2026-11-03; docs/features/animation/billing-escrow.md): its calls settle as
// they run; an attempt that fails or is stopped has every one of its calls refunded, once, the moment it ends (refundEscrow; the plan
// phase stays charged unless ANIMATION_BILLING.planPhaseRefunded), so a job that reaches ready is charged only its FINAL attempt: the
// calls whose record says attempt === the job's attempt when it was accepted (a Try again or Render again starts the next attempt).
// Before generation starts (Generate, and each paid Retry) the build's full worst case
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
import { finishAction, noteUsageIdentity, recordMedia, refundActionByKey, toMicros, usagePayer, usageTotals, withUsage } from './learn-usage.js';
import { allowanceFor } from './learn-entitlement.js';
import { sha256Hex } from './learn-grade-jev.js';
import { consumeProposal, envelopeFor, proposalRecord, proposalState, publishRevision, signProposal, verifyProposal } from './generation-proposal.js';
import { blockedBody, referencesKey, resolveReferences } from './generation-review-refs.js';
import { isReviewProposal } from '../../web/src/generation-review.js';
import { canonicalJson } from './explain-render.js';
import { beginStage, countStage, endStage, markTiming, newTiming, timingSummary } from './explain-policy.js';
import { hashAnimationPlan } from '../../web/src/animation3d/contract.js';
import { ANIMATION_CLIENT_FEATURES } from '../../web/src/animation3d/capabilities.js';
import { ASKED_FOR, approvedPlan, clientFeatures, prepareStage } from './animation-brief.js';
import { artifactIntact, authorStage, sealArtifact, validateStage } from './animation-author.js';
import { renderProbe, renderStage } from './animation-render.js';
import { ANIMATION_FIXTURES } from '../../web/src/animation3d/fixtures.js';
import { LEARNING_EXAMPLES } from '../../web/src/animation3d/learning-examples.js';
import { validateAnimationArtifact } from '../../web/src/animation3d/contract.js';
import { artifactHashOf } from './animation-author.js';
import { reviewStage } from './animation-review.js';
import { repairStage } from './animation-repair.js';
import { CHANGED, GAP_ALTERNATIVES, GAP_FALLBACK, SIMPLER_ALTERNATIVE, clarificationFor, learnerReason, sizeCheck } from './animation-feasibility.js';
import { seededJobs } from './animation-outcomes-fixture.js';
import { ANIMATION_BILLING, ANIMATION_LIMITS, ANIMATION_POLICY_VERSION, AnimationPolicyError, animationModelConfigured, modelNotConfigured, animationRequest, animationReservation, callAnimationRole, checkAnimationRequest } from './animation-policy.js';

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
// A scene that uses what an older browser build cannot draw (capabilities.js ANIMATION_CLIENT_FEATURES) is not sent to a reader that does
// not declare it: that build would refuse it with a generic message (storage.js 'mismatch'); a current build shows this one (owner 2026-11-02).
export const CLIENT_UPDATE = 'This scene needs the newest version of Rabbit Hole. Reload the page to update it.';
export const needsFeatures = artifact => [...((artifact?.scene?.geometries || []).some(g => g?.kind === 'curve' && g.radius !== undefined) ? ['curve_radius'] : []), ...((artifact?.actions || []).some(a => a?.startsMotion !== undefined) ? ['action_motion'] : [])];
const KEY = /^[A-Za-z0-9_-]{8,128}$/;
const TERMINAL = new Set(['ready', 'failed', 'cancelled']);
const SOURCES = ['explicit', 'picker', 'command', 'suggestion', 'classified', 'tutor'];
const KIND = { brief: 'generation', author: 'generation', review: 'evaluation', repair: 'repair' };
const JOBS_KEPT = 50;
// The ledger's reason for what the escrow gave back (suffixed with the attempt that failed), and the learner's one phrase for it (credits
// only; owner 2026-11-03).
export const ANIMATION_REFUND = 'animation_failed_refund';
export const NOT_CHARGED = 'You have not been charged.';
const jobKey = id => `job:${id}`;
// Plan calls: one per preparation plus its one correction, for the first plan and each refinement.
const briefLimit = ANIMATION_LIMITS.calls.brief * (1 + ANIMATION_LIMITS.planCorrections) * (1 + ANIMATION_LIMITS.refinements);
const hex = () => crypto.randomUUID().replaceAll('-', '');
const hash16 = async value => (await sha256Hex(canonicalJson(value ?? null))).slice(0, 16);
const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Learner-facing view: credits, never dollars; no prompt, findings, draft, artifact source or private diagnostics.
const credits = micros => Math.ceil((micros || 0) / 10000);
// The phases whose calls come back when a job ends without a result, and whether this job is billed that way: made after the escrow
// (job.escrow), and past Generate (or the policy refunds the plan too). A job made before it keeps the rules it was made under.
const refundedPhases = () => (ANIMATION_BILLING.planPhaseRefunded ? ['preparation', 'generation'] : ['generation']);
const escrowed = job => job.escrow === true && (!!job.approval || ANIMATION_BILLING.planPhaseRefunded);
const refundKeys = job => [job.actionKey, ...(ANIMATION_BILLING.planPhaseRefunded ? [job.prepKey] : [])].filter(Boolean);
export function publicAnimationJob(job) {
  const ended = escrowed(job) && TERMINAL.has(job.stage) && job.stage !== 'ready';
  // What the learner keeps paying for: the plan phase, and of the build only the current attempt's calls while it runs or once it is ready
  // (earlier attempts failed and were refunded); nothing of the build once the job ended without a result.
  const kept = c => !escrowed(job) || !refundedPhases().includes(c.phase) || (!ended && c.attempt === job.attempt);
  const settled = job.calls.filter(kept).reduce((t, c) => t + (c.costMicros || 0), 0);
  return {
    id: job.id, version: 1, boardId: job.boardId, cardId: job.cardId, stage: job.stage, attempt: job.attempt, terminal: TERMINAL.has(job.stage),
    repairs: job.repairs, stopReason: job.stopReason, failure: job.failure && (({ gap: _private, ...failure }) => ({ ...failure, message: failureText(job) }))(job.failure), recovery: recoveryOf(job),
    outcome: outcomeOf(job), choiceOpen: !!job.sizeChoice?.open, ...(job.threadId ? { threadId: job.threadId } : {}), chatPending: reportPending(job),
    usage: { credits: credits(settled), unknown: job.calls.some(c => c.status === 'unknown'), ...(ended ? { note: NOT_CHARGED } : {}) },
    // Revise plan's new job for the same card and request (revise): a card still bound to this one follows it (Animation3DCard reconcile).
    result: job.result, ...(job.plan ? { plan: job.plan, planHash: job.planHash } : {}), ...(job.successor ? { successor: job.successor } : {}),
    timing: timingSummary(job.timing), createdAt: job.createdAt, updatedAt: job.updatedAt,
  };
}
const diagnostics = job => ({ plan: job.plan, draft: job.draft, artifactHash: job.artifactHash, artifact: job.artifact && { ...job.artifact, program: job.artifact.program ? { bytes: job.artifact.program.source.length, sourceHash: job.artifact.program.sourceHash } : undefined },
  findings: job.findings, reviews: job.reviews ?? [], candidates: job.candidates, calls: job.calls, captures: (job.captures || []).map(({ data: _bytes, ...capture }) => capture), coverage: job.coverage ?? null, gap: job.failure?.gap ?? null, estimate: job.estimate ?? null, counts: job.counts, bounds: job.bounds, timing: job.timing });

// Only the actions that can run now. retry_render: the retained validated artifact, rendered again (no reauthoring). new_attempt:
// a paid retry within this job's remaining ceiling (never a reset one). revise_plan: when this build cannot go on, a NEW job for the
// same card and request whose planner revises the approved plan from the recorded failure; the learner reviews it in Chat and its
// Generate is admitted again (its own ceiling). edit_request: always.
const CANDIDATE_STOPS = new Set(['rounds', 'no_progress', 'unsupported_repair']);
const REVISABLE = new Set(['size_limit', 'output_limit', 'checks', 'deadline', 'limit', 'transient']);
// Which of the four outcomes before Generate this job is (FX-AN-031): null until it is known. "supported" is what the checks found, never a
// promise that the scene will fit or pass.
function outcomeOf(job) {
  if (job.stopReason === 'capability_gap') return 'unsupported';
  if (job.stopReason === 'needs_clarification') return 'clarify';
  if (!job.plan) return null;
  return job.sizeChoice?.open || planScene(job.plan).notices.length ? 'changes' : 'supported';
}
// A Chat explanation not written yet stays pending until it is written: the alarm tries it every 30 s for the first REPORT_RAPID tries, then
// with a backoff capped at REPORT_BACKOFF_MAX_MS; a status read (the card's poll, a reopen) tries it at once and starts the backoff again.
const REPORT_RAPID = 5, REPORT_RETRY_MS = 30000, REPORT_BACKOFF_MAX_MS = 30 * 60000;
const reportPending = job => job.stage === 'failed' && !!job.reportTries && job.reported !== job.attempt;
const reportDue = (job, now = Date.now()) => reportPending(job) && !(job.reportAt > now);
const reportDelay = tries => (tries < REPORT_RAPID ? REPORT_RETRY_MS : Math.min(REPORT_BACKOFF_MAX_MS, REPORT_RETRY_MS * 2 ** (tries - REPORT_RAPID + 1)));
const reportKey = job => `${job.id}:${job.attempt}`;
const plannerGap = job => job.stopReason === 'capability_gap' && job.failure?.gap?.source === 'brief';
const AUTO_RETRY = new Set(['provider_unavailable', 'render_failed', 'captures_missing']);
export function recoveryOf(job) {
  if (job.stage !== 'failed') return [];
  if (job.inFlight) return ['reconcile'];
  if (plannerGap(job)) return ['plan_alternative', 'edit_request'];
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
  if (job.stopReason === 'needs_clarification') return 'clarification';
  if (f.code === 'output_limit') return 'output_limit';
  if (f.category === 'review_validation') return 'review_validation';
  if (f.category === 'size_limit' || CANDIDATE_STOPS.has(job.stopReason) && last?.problems?.length && last.problems.every(p => TOO_LARGE.test(p))) return 'size_limit';
  if (CANDIDATE_STOPS.has(job.stopReason)) return 'checks';
  if (job.stopReason === 'deadline') return 'deadline';
  if (['spend_refused', 'spend_limited'].includes(f.code)) return 'credits';
  if (job.stopReason === 'budget') return 'limit';
  // model_http_*: any other provider failure keeps the provider's own reason in f.message, which stays private (TRANSIENT's fallback).
  if (['provider_unavailable', 'transport', 'model_output', 'renderer'].includes(f.category) || /^model_http_/.test(f.code || '')) return 'transient';
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
  return used ? `It used ${used} AI credit${used === 1 ? '' : 's'}.` : NOT_CHARGED;
}
// The learner's words for a failure (card and Chat alike): what could not be done, what was tried, and the action offered now.
// Mapped from the recorded class, stage and finding categories; raw findings, model text and logs are never quoted.
const CHECKS = { validating: 'The scene did not pass its structure checks.', rendering: 'The scene failed when its program ran.' };
const AREAS = { spec: 'how the scene is drawn or computed', source: 'how it matches your sources', component: 'the shared 3D drawing', renderer: 'the shared 3D drawing', budget: 'its size' };
// transport: the service did not give a usable answer (interrupted, refused before sending); model_output: the model answered, and
// that answer could not be used (an invalid turn, its output limit, an incomplete review). Whether either was charged is chargeWords'.
const OUTPUT_WHO = { preparing: 'The planner', authoring: 'The scene builder', reviewing: 'The visual review', repairing: 'The automatic correction' };
const TRANSIENT = { provider_unavailable: 'The AI service was busy.', transport: 'An AI step was interrupted.', model_output: 'The AI answer could not be used.', renderer: 'The sample views could not be rendered.' };
function reviewWords(found) {
  const serious = (found?.findings || []).filter(f => f.severity !== 'minor'), areas = [...new Set(serious.map(f => AREAS[f.category]).filter(Boolean))];
  return serious.length ? `The visual review found ${serious.length} serious problem${serious.length === 1 ? '' : 's'} with ${areas.join(' and ') || 'the scene'}.` : 'The visual review did not accept the scene.';
}
// What Try again may use: its next paid step's worst case, when it has one (the plan call of a plan never approved, or what is left of the build's).
function attemptCost(job) {
  const r = job.reservation, most = !job.approval ? r?.preparationMicros : r?.generationMicros != null ? r.generationMicros - (job.bounds?.generation || 0) : 0;
  return most > 0 ? `, using up to ${credits(most)} AI credits` : '';
}
export function failureText(job) {
  const kind = failureClass(job), f = job.failure || {}, action = recoveryOf(job).find(a => a !== 'edit_request');
  if (kind === 'clarification') return f.message;
  const what = { capability: f.gap?.shown ?? GAP_FALLBACK, output_limit: `${OUTPUT_WHO[f.stage] ?? 'An AI step'} reached its output limit before it finished. That does not prove your request is impossible; a smaller plan may fit.`, review_validation: 'The visual review returned an answer in the wrong form, and it could not be corrected within its limit, so this scene was neither accepted nor found faulty.', size_limit: 'The scene was too large to check.', deadline: 'The build ran out of time.', limit: 'The build reached its spending limit.',
    checks: f.stage === 'reviewing' ? reviewWords(job.findings?.filter(x => x.stage === 'reviewing').at(-1)) : CHECKS[f.stage] ?? 'The scene did not pass its checks.',
    transient: TRANSIENT[f.category] ?? TRANSIENT.transport }[kind] ?? f.message ?? 'The animation could not be made.';
  const candidate = kind === 'checks' || kind === 'size_limit';
  const tried = [job.stopReason === 'no_progress' ? 'An automatic correction changed nothing.' : job.stopReason === 'unsupported_repair' ? 'It needs a change the automatic correction cannot make.'
    : job.repairs ? `It was corrected automatically ${job.repairs === 1 ? 'once' : 'twice'}${candidate ? ', but it still did not pass' : ''}.` : '', job.autoRetried ? 'It was retried automatically.' : ''];
  const next = { retry_render: 'Render again renders the built scene again.', new_attempt: `Try again continues from where it stopped${attemptCost(job)}.`,
    revise_plan: `Revise plan prepares a simpler plan from your request for you to review, using up to ${credits(job.reservation?.preparationMicros)} AI credits; nothing is built until you press Generate.` }[action]
    ?? (plannerGap(job) ? 'Choose an alternative in Chat, or edit the request to start a new animation.' : candidate || ['capability', 'output_limit', 'deadline', 'limit', 'review_validation'].includes(kind) ? 'Edit the request to start a new animation.' : '');
  // A generation that ended without a result states what became of its credits; before Generate (the plan phase) the charge words stand.
  const charge = escrowed(job) ? NOT_CHARGED : ['transient', 'output_limit', 'error', 'review_validation'].includes(kind) ? chargeWords(job) : '';
  return [what, charge, ...tried, next].filter(Boolean).join(' ');
}
// The planner's instruction for a revised plan (prepareStage's refinement, with the approved plan as `previous`): server words only.
const REVISE_WHY = { size_limit: 'was too large to check', output_limit: 'reached an output limit before it was finished', checks: 'did not pass its checks', deadline: 'ran out of time', limit: 'reached its spending limit', transient: 'could not be finished' };
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
  if (p.features != null && (!Array.isArray(p.features) || p.features.length > 16 || p.features.some(f => typeof f !== 'string' || f.length > 40))) throw fail('Invalid client features.');
}

// The words above a plan in Chat: what differs from the request, in the server's own lines, is said here as well as on the card.
function planWords(job, previous) {
  if (job.revisedFrom && !previous) return 'Here is a revised plan for your animation. Generate makes it.';
  const notices = planScene(job.plan).notices;
  return notices.length ? `Here is the plan for your animation. It differs from what you asked: ${notices.join(' ')} Generate makes it.` : 'Here is the plan for your animation. Generate makes it.';
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
    notices: (plan.limitations || []).filter(l => typeof l === 'string' && (l.startsWith(ASKED_FOR) || l.startsWith(CHANGED))),
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
// The probe draws with this build, so it declares this build's features: a tube scene is read like any other, not refused as for an older browser.
async function resultProbeRoute(req, env, deps) {
  const { refused, user, body } = await probeGuard(req, env, deps);
  if (refused) return refused;
  if (!env.ANIMATION_JOBS || !env.LEARN_DB) return json({ error: 'Animations are not configured on this preview.' }, 503);
  if (typeof body?.boardId !== 'string' || typeof body?.resultId !== 'string') return json({ error: 'boardId and resultId are required' }, 400);
  const board = await env.LEARN_DB.prepare('SELECT id, app, board FROM learn_boards WHERE id = ? AND org = ? AND owner_email = ?').bind(body.boardId, user.org, user.email).first();
  if (!board) return json({ error: 'Not available' }, 404);
  const stub = env.ANIMATION_JOBS.get(env.ANIMATION_JOBS.idFromName(board.id));
  const read = await stub.fetch('https://animation/action', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'result', id: body.resultId, payload: { features: [...ANIMATION_CLIENT_FEATURES] }, board, user: { org: user.org, email: user.email, userId: user.userId || user.user_id || null } }) });
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
// Dev-only fixtures for the owner's review of every outcome (the launcher): real job records and real Chat messages, no model call. Live
// only with ANIMATION_DIAGNOSTICS, like the probes above; production never sets it.
export const ANIMATION_SEED_PATH = '/api/learn/animation/diagnostics/seed-outcomes';
// An OFFLINE FIXTURE stored as an ordinary saved result for the owner's canvas, so the owner can open and click it with no model call (owner 2026-11-02). The same
// guard as the other diagnostics routes (ANIMATION_DIAGNOSTICS, which production never sets, and the canvas owner). The artifact comes in the request: no fixture is
// bundled here. It must validate, hash intact, and say it is an offline fixture in its title and description, so it is never mistaken for generated work.
export const ANIMATION_SEED_FIXTURE_PATH = '/api/learn/animation/diagnostics/seed-fixture';
const FIXTURE_TITLE = /^Offline fixture/, FIXTURE_DESCRIPTION = /^OFFLINE FIXTURE, not generated by a model/;
async function seedRoute(req, env, deps) {
  const { refused, user, body } = await probeGuard(req, env, deps);
  if (refused) return refused;
  if (!env.ANIMATION_JOBS || !env.LEARN_DB || typeof body?.boardId !== 'string') return json({ error: 'boardId is required' }, 400);
  const board = await env.LEARN_DB.prepare('SELECT id, app, board FROM learn_boards WHERE id = ? AND org = ? AND owner_email = ?').bind(body.boardId, user.org, user.email).first();
  if (!board) return json({ error: 'Not available' }, 404);
  return env.ANIMATION_JOBS.get(env.ANIMATION_JOBS.idFromName(board.id)).fetch('https://animation/action', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'seed', payload: {}, board, user: { org: user.org, email: user.email, userId: user.userId || user.user_id || null }, origin: new URL(req.url).origin }) });
}
async function seedFixtureRoute(req, env, deps) {
  const { refused, user, body } = await probeGuard(req, env, deps);
  if (refused) return refused;
  if (!env.ANIMATION_JOBS || !env.LEARN_DB || typeof body?.boardId !== 'string') return json({ error: 'boardId is required' }, 400);
  const board = await env.LEARN_DB.prepare('SELECT id, app, board FROM learn_boards WHERE id = ? AND org = ? AND owner_email = ?').bind(body.boardId, user.org, user.email).first();
  if (!board) return json({ error: 'Not available' }, 404);
  return env.ANIMATION_JOBS.get(env.ANIMATION_JOBS.idFromName(board.id)).fetch('https://animation/action', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'seed_fixture', payload: { artifact: body.artifact }, board, user: { org: user.org, email: user.email, userId: user.userId || user.user_id || null } }) });
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
  if (path === ANIMATION_SEED_PATH) return seedRoute(req, env, deps);
  if (path === ANIMATION_SEED_FIXTURE_PATH) return seedFixtureRoute(req, env, deps);
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
  if (!['get', 'list', 'create', 'cancel', 'retry', 'approve', 'refine', 'choose', 'result'].includes(action) || (rest.length > 2 && !results)) return json({ error: 'Not found' }, 404);
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
    body: JSON.stringify({ action, id: results ? rest[1] : rest[0] || null, payload: results ? { features: (url.searchParams.get('features') || '').split(',').filter(Boolean) } : body, board, user: { org: user.org, email: user.email, userId: user.userId || user.user_id || null }, origin: url.origin,
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
    if (action === 'result') return this.readResult(id, board, user, payload.features);
    if (action === 'seed') return this.seed(board, user, origin);
    if (action === 'seed_fixture') return this.seedFixture(payload, board, user);
    const job = id && await this.get(id);
    if (!job || job.owner.email !== user.email || job.boardId !== board.id) throw fail('Not available', 404);
    if (action === 'get') {
      // A pending Chat explanation is tried again by any status read, and its backoff starts over.
      if (reportPending(job) && !job.inFlight) { job.reportTries = 1; job.reportAt = 0; await this.report(job); }
      // A refund that did not land when the job ended is made now (idempotent: nothing is refunded twice).
      if (['failed', 'cancelled'].includes(job.stage) && !job.inFlight) await this.refundEscrow(job);
      const block = job.stage === 'ready' ? await this.block(job) : null;
      return json({ job: publicAnimationJob(job), ...(block ? { block } : {}), ...(detail ? { diagnostics: diagnostics(job) } : {}) });
    }
    if (action === 'cancel') return this.stop(job);
    if (action === 'retry') return this.retry(job, payload);
    if (action === 'approve') return this.approve(job, payload);
    if (action === 'refine') return this.refine(job, payload);
    if (action === 'choose') return this.choose(job, payload);
    throw fail('Not found', 404);
  }

  // The accepted artifact of a card on this canvas, for its owner only, checked against its host-computed hash: the player's only
  // source of the scene and its program. Never served by hash alone, by another canvas or by another learner.
  async readResult(resultId, board, user, features) {
    const saved = typeof resultId === 'string' && await this.state.storage.get(`result:${resultId}`);
    if (!saved || saved.owner?.email !== user.email || saved.boardId !== board.id) throw fail('Not available', 404);
    if (!await this.pipeline.intact(saved.artifact, saved.identity?.artifactHash)) throw fail('This animation could not be opened. Your saved version is kept.', 409, 'version_unavailable');
    if (needsFeatures(saved.artifact).some(f => !clientFeatures(features).includes(f))) throw fail(CLIENT_UPDATE, 409, 'client_update_required');
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
      source: payload.source ?? 'explicit', threadId: payload.threadId ?? null, features: clientFeatures(payload.features) }); // none: an older browser build
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
      id: `aj_${hex()}`, version: 1, policyVersion: ANIMATION_POLICY_VERSION, escrow: true, ...request, refinement: null, pendingProposal: null, proposal: null, settings: null,
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
  async revise(job, note = reviseNote(job)) {
    const made = job.successor && await this.get(job.successor);
    if (made) return json({ job: publicAnimationJob(made) });
    const jobs = [...(await this.state.storage.list({ prefix: 'job:' })).values()];
    if (jobs.some(j => j.cardId === job.cardId && !TERMINAL.has(j.stage))) throw fail('This card already has an animation in progress.', 409);
    const pick = ['boardId', 'app', 'board', 'owner', 'origin', 'cardId', 'requestId', 'prompt', 'context', 'evidence', 'source', 'threadId', 'features'];
    const next = Object.assign(this.newJob(Object.fromEntries(pick.map(k => [k, job[k]]))), { plan: job.plan, approvedBefore: job.plan, refinement: note, revisedFrom: job.id });
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
      // A failed generation is free to the learner and costs the platform its model price, so only so many a day: the attempts
      // refunded in the last 24 hours.
      else if (await this.refundedToday(payer.userId) >= ANIMATION_BILLING.freeFailuresPerDay) reason = 'free_retries_exhausted';
    } catch { reason = 'allowance_unavailable'; }
    if (reason) throw Object.assign(fail('Not enough AI credits.', reason === 'allowance_unavailable' ? 503 : 429), { refusal: { reason, period: payer.period } });
  }

  // The failed attempts refunded to this learner in the last 24 hours: one per (job, attempt), each costing the platform its model price.
  async refundedToday(userId) {
    const row = await this.env.LEARN_DB.prepare('SELECT COUNT(*) AS n FROM (SELECT DISTINCT action_id, reason FROM usage_adjustments WHERE user_id = ? AND reason LIKE ? AND created_at >= ?)')
      .bind(userId, `${ANIMATION_REFUND}:%`, Math.floor(Date.now() / 1000) - 86400).first();
    return Number(row?.n || 0);
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
    // An alternative to a request the planner called a gap: a new plan the learner reviews, its cost said on the button. Nothing is built.
    // The first press is the job's choice: kept with the new job it made, so a press from another tab answers that job and never relabels it,
    // and a press again repairs the Chat message's answer if writing it failed.
    if (payload.action === 'plan_alternative') {
      const alternative = GAP_ALTERNATIVES.find(a => a.id === (job.chosenAlternative ?? payload.alternative));
      if (!alternative) throw fail('This choice is no longer available. The card shows what you can do now.', 409, 'recovery_stale');
      if (!job.chosenAlternative) { job.chosenAlternative = alternative.id; await this.save(job); }
      const made = await this.revise(job, alternative.note);
      await this.resolveChoice(job, reportKey(job), alternative.id);
      return made;
    }
    // The attempt that failed gives its calls back before the next one starts, even if the refund at its end did not land.
    if (actions.includes('retry_render') || actions.includes('new_attempt')) await this.refundEscrow(job);
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

  // An oversized plan (FX-AN-031): what is too large and the changes on offer, in Chat, with no Generate until one is accepted. Written once
  // per plan. Nothing is signed here: only the accepted plan becomes a proposal (postPlan).
  async postChoice(job, size) {
    const paid = !size.alternatives.length;
    const alternatives = [...size.alternatives.map(a => ({ id: a.id, title: a.title, changes: a.changes })), ...(paid ? [{ id: SIMPLER_ALTERNATIVE.id, title: SIMPLER_ALTERNATIVE.title, changes: SIMPLER_ALTERNATIVE.changes, credits: credits(job.reservation.preparationMicros) }] : []),
      ...(size.keep ? [{ id: 'keep', title: 'Keep my plan', changes: ['Nothing changes. The size is only an estimate, but this plan may stop at a size check after using AI credits.'] }] : [])];
    const key = `${job.id}:choice:${job.planHash}`;
    job.sizeChoice = { open: true, key, why: size.why, alternatives: size.alternatives, keep: size.keep };
    await this.writeChat(job, key, `"${clean(job.plan.title, 120)}" needs a change before it can be made. ${size.why} Choose below: each option says exactly what changes, and nothing is built until you press Generate.`,
      { animationChoice: { jobId: job.id, attempt: job.attempt, kind: 'size', key, alternatives, chosen: null } });
  }
  // Accepting a change. A server-made alternative or Keep my plan costs nothing: it posts the plan with its Generate. A simpler plan is a
  // plan call, its cost said on the button. Pressed again it answers the same job; a choice that is gone is refused.
  async choose(job, payload) {
    const open = job.sizeChoice, id = payload.choice;
    // A button answers only the plan it was offered for (its key names the job and the plan hash): one from an earlier plan never picks on a newer one.
    if (!open || payload.key !== open.key) throw fail('This choice belongs to an earlier version of the plan. Review the latest plan.', 409, 'plan_stale');
    // The same press again: the choice already took effect; only the Chat message's answer is written again, never another plan.
    if (open.chosen === id) { await this.resolveChoice(job, open.key, id); return json({ job: publicAnimationJob(job) }); }
    if (job.stage !== 'awaiting_approval' || !open.open) throw fail('This choice is no longer available. Review the latest plan.', 409, 'plan_stale');
    const alternative = open.alternatives.find(a => a.id === id);
    if (id === SIMPLER_ALTERNATIVE.id && !open.alternatives.length) {
      if (job.counts.brief >= briefLimit) throw fail('This plan reached its change limit. Start a new request.', 429);
      endStage(job.timing, 'refined');
      Object.assign(job, { refinement: SIMPLER_ALTERNATIVE.note, approval: null, stage: 'preparing', sizeChoice: { open: false, chosen: id, key: open.key, planHash: null } });
      beginStage(job.timing, 'preparing');
      await this.save(job); await this.wake();
      await this.resolveChoice(job, open.key, id);
      return json({ job: publicAnimationJob(job) }, 202);
    }
    if (!alternative && !(id === 'keep' && open.keep)) throw fail('This choice is no longer available. Review the latest plan.', 409, 'plan_stale');
    if (alternative) { job.plan = alternative.plan; job.planHash = await hashAnimationPlan(job.plan); }
    // The accepted decision belongs to this exact plan: Generate on it is not asked again (approve), an edited plan is.
    job.sizeChoice = { open: false, chosen: id, key: open.key, planHash: job.planHash };
    await this.postPlan(job);
    await this.save(job);
    await this.resolveChoice(job, open.key, id);
    return json({ job: publicAnimationJob(job) });
  }
  // The choice's buttons stay answered after a reload: the message itself records what was chosen.
  async resolveChoice(job, key, id) {
    if (!job.threadId) return;
    await this.env.LEARN_DB.prepare("UPDATE chat_message_meta SET meta_json = json_set(meta_json, '$.animationChoice.chosen', ?) WHERE thread_id = ? AND json_extract(meta_json, '$.reportKey') = ?").bind(id, job.threadId, key).run();
  }
  // One assistant message with its meta row, in one batch, found again by its key: a retry after a lost answer never writes a second one.
  async writeChat(job, key, content, meta = {}) {
    const db = this.env.LEARN_DB;
    job.threadId ??= await this.planThread(job);
    if (await db.prepare("SELECT message_id FROM chat_message_meta WHERE thread_id = ? AND json_extract(meta_json, '$.reportKey') = ?").bind(job.threadId, key).first()) return;
    await db.batch([
      db.prepare('INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?)').bind(job.threadId, 'assistant', content),
      db.prepare("INSERT INTO chat_message_meta (message_id, thread_id, role, alternative_of, meta_json) SELECT max(id), ?, 'assistant', NULL, ? FROM messages WHERE thread_id = ?")
        .bind(job.threadId, JSON.stringify({ version: 1, mode: 'ask', kind: 'answer', contextRefs: [], actions: [], followUps: [], syllabus: null, reportKey: key, ...meta }), job.threadId),
    ]);
  }
  // The offline fixture as a saved result (ANIMATION_SEED_FIXTURE_PATH): stored as accept() stores one, read back through the normal result route and its hash check.
  async seedFixture(payload, board, user) {
    const artifact = payload?.artifact, checked = validateAnimationArtifact(artifact);
    if (!checked.ok) throw fail(`The fixture does not validate: ${checked.issues.slice(0, 3).map(i => `${i.path}: ${i.message}`).join('; ')}`, 400);
    if (!FIXTURE_TITLE.test(checked.value.title) || !FIXTURE_DESCRIPTION.test(checked.value.description)) throw fail('A seeded fixture must say it is an offline fixture in its title and description.', 400);
    const artifactHash = await artifactHashOf(checked.value);
    if (!await this.pipeline.intact(checked.value, artifactHash)) throw fail('The fixture is not intact.', 400);
    const cardId = `fixture-${checked.value.artifactId.slice(3, 15)}`, identity = { resultId: checked.value.artifactId, artifactHash, planHash: checked.value.planHash, cardId, canvas: board.id };
    await this.state.storage.put(`result:${checked.value.artifactId}`, { kind: 'animation3d', artifact: checked.value, identity, owner: { org: user.org, email: user.email }, boardId: board.id, cardId, fixture: true });
    return json({ resultId: checked.value.artifactId, artifactHash, cardId });
  }
  // Dev fixtures (ANIMATION_SEED_PATH): one record per outcome, written and reported as a real job would be. Nothing is sent to a model.
  async seed(board, user, origin) {
    const made = [];
    for (const [name, { plan = null, request, fields = {} }] of Object.entries(seededJobs())) {
      const id = hex().slice(0, 12), job = this.newJob({ boardId: board.id, app: board.app, board: board.board, owner: { org: user.org, email: user.email, userId: user.userId || null }, origin, cardId: `seed-${name.replaceAll('_', '-')}-${id}`, requestId: `seed-${id}`, prompt: request, context: null, evidence: [], source: 'explicit', threadId: null });
      Object.assign(job, { plan, planHash: plan ? await hashAnimationPlan(plan) : null, ...fields });
      await this.state.storage.put(`request:${job.requestId}`, { id: job.id, fingerprint: await sha256Hex(JSON.stringify([job.cardId, job.prompt, null])) });
      await this.settlePlan(job);
      await this.report(job);
      await this.save(job);
      made.push({ name, id: job.id, cardId: job.cardId, requestId: job.requestId, prompt: job.prompt, stage: job.stage, threadId: job.threadId });
    }
    return json({ jobs: made });
  }
  // A checked plan's next step: the plan with its Generate, or, when it looks too large, the choice first.
  async settlePlan(job) {
    if (job.stage !== 'awaiting_approval') return;
    job.threadId ??= await this.planThread(job);
    const size = sizeCheck(this.env, job, job.plan, this.tasks);
    job.estimate = size.estimate; // diagnostics only: bytes never reach the learner view
    if (size.over) await this.postChoice(job, size); else { job.sizeChoice = null; await this.postPlan(job); }
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
      input: { org: job.owner.org, app: job.app, job: job.id, plan_hash: job.planHash, request: job.prompt.slice(0, 500), scene: { ...planScene(plan), planCredits: credits(job.reservation?.preparationMicros) } } }, job.owner.email,
    { envelope: envelopeFor(this.env, { org: job.owner.org, app: job.app }), ...(previous ? { id: previous.id, version: (record?.current?.version ?? previous.version) + 1 } : {}) });
    const row = await db.prepare('INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?) RETURNING id').bind(job.threadId, 'assistant', planWords(job, previous)).first();
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
    if (job.stage !== 'awaiting_approval' || job.sizeChoice?.open) throw stale();
    const p = payload.proposal, refused = await verifyProposal(this.env, p, job.owner.email);
    if (refused) throw fail(refused, 409, 'proposal_invalid');
    if (p.command !== ANIMATION_COMMAND || p.input?.job !== job.id || p.input?.plan_hash !== job.planHash) throw stale();
    // The executed plan is the approved one: the person's title, description, assumptions and experience over the prepared plan,
    // checked again against the enabled capabilities (an unsupported choice is refused here, before anything is consumed).
    let executed;
    try { executed = this.pipeline.approvedPlan(job.plan, p); } catch (error) { throw fail(error.message || 'This plan cannot be generated as edited.', 409, 'plan_invalid'); }
    // The executed plan, with the sources it will be built from, is checked for size again before anything is admitted or consumed, unless
    // the learner already accepted the size decision for exactly this plan. Needing a change, the edited plan is kept and its choices are
    // posted; the job keeps waiting, and the proposal it was pressed on is spent by nothing.
    const decided = job.sizeChoice && !job.sizeChoice.open && job.sizeChoice.planHash === job.planHash && canonicalJson(executed) === canonicalJson(job.plan);
    if (!decided) {
      const sources = isReviewProposal(p) && p.references?.length && payload.approved_refs ? this.withApprovedRefs(job, payload.approved_refs) : {};
      const size = sizeCheck(this.env, { ...job, ...sources, plan: executed }, executed, this.tasks);
      job.estimate = size.estimate;
      if (size.over) {
        job.plan = executed; job.planHash = await hashAnimationPlan(executed);
        job.threadId ??= await this.planThread(job);
        await this.postChoice(job, size);
        await this.save(job);
        return json({ job: publicAnimationJob(job) });
      }
    }
    await this.admitGeneration(job);
    if (isReviewProposal(p) && p.references?.length && payload.approved_refs?.key !== referencesKey(p.references)) throw fail('The attached references were not checked. Review the plan again.', 409, 'reference_blocked');
    const used = await consumeProposal(this.env.LEARN_DB, p, job.owner.email, { org: job.owner.org, app: job.app }, job.id);
    if (used) throw fail(used.error, 409, used.code);
    job.proposal = { id: p.proposal_id, version: p.version };
    job.settings = p.settings;
    if (isReviewProposal(p) && p.references?.length) Object.assign(job, this.withApprovedRefs(job, payload.approved_refs));
    job.plan = executed; job.planHash = await hashAnimationPlan(executed);
    markTiming(job.timing, 'generate');
    Object.assign(job, { approval: { planHash: job.planHash, proposal: job.proposal, ...(isReviewProposal(p) ? { reviewHash: p.review_hash } : {}), sources: await this.sourcesKey(job), at: Date.now() },
      stage: 'authoring', deadline: Date.now() + ANIMATION_LIMITS.deadlines.jobMs });
    beginStage(job.timing, 'authoring');
    await this.save(job); await this.wake();
    return json({ job: publicAnimationJob(job) }, 202);
  }
  // The job's context and evidence with the references Generate approved, bounded as the build reads them. -> { context, evidence }
  withApprovedRefs(job, approved) {
    const refs = mergeRefs(job.context?.refs || [], approved.refs), ids = new Set(refs.map(r => r.evidence));
    const bounded = boundEvidence(refs, [...(approved.evidence || []), ...(job.evidence || [])].filter(r => ids.has(r.id)));
    return { context: { ...(job.context && typeof job.context === 'object' ? job.context : {}), refs: bounded.refs, refText: [job.context?.refText, approved.text].filter(Boolean).join('\n\n').slice(0, 24000) }, evidence: bounded.evidence };
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
    if (status !== 'completed') await this.refundEscrow(job);
  }
  // The escrow's one move on the usage ledger, safe to repeat: an attempt that ends without a result gets its settled calls back, at
  // its end, again by a late settlement, by a status read and by the Retry that starts the next attempt. Nothing is ever taken back, so
  // the earlier attempts of a job that reaches ready stay refunded. A write that fails is logged and left for the next of those: the
  // job's own state is never held for it.
  async refundEscrow(job) {
    const db = this.env.LEARN_DB, user = job.owner.userId || job.owner.email;
    if (!db || job.escrow !== true) return;
    for (const key of refundKeys(job)) {
      try { await refundActionByKey(db, user, key, `${ANIMATION_REFUND}:${job.attempt}`); } catch (error) { console.warn('animation refund not made:', error?.message); }
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
      // A call that settles after Stop belongs to a job that already ended without a result: its charge goes back with the rest.
      if (TERMINAL.has(current.stage) && current.stage !== 'ready') await this.refundEscrow(current);
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
      if (job && reportPending(job) && !job.inFlight) { if (reportDue(job)) await this.locked(async () => { const current = await this.get(job.id); if (current && reportDue(current)) await this.report(current); }); continue; }
      if (!job || TERMINAL.has(job.stage) && !job.inFlight || job.stage === 'awaiting_approval') continue;
      active = true;
      try { await this.advance(job); } catch (error) { await this.failed(job, error); }
    }
    if (active) await this.wake(1000);
    else {
      // A Chat explanation still to write keeps an alarm for the soonest one due; none left, no alarm.
      const pending = [...(await this.state.storage.list({ prefix: 'job:' })).values()].filter(reportPending);
      if (pending.length) await this.state.storage.setAlarm(Math.max(Date.now() + 1000, Math.min(...pending.map(j => j.reportAt || 0))));
      else await this.state.storage.deleteAlarm?.();
    }
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
    // A request with no subject is asked about, before any paid plan call.
    const clarify = stage === 'preparing' && !job.counts.brief ? clarificationFor(job) : null;
    if (clarify) return this.locked(async () => { const current = await this.get(job.id); if (current?.stage === stage && current.attempt === attempt && !current.stopped) await this.stopWith(current, 'needs_clarification', 'clarification', clarify.question); });
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
    // The planner's reason is shown only as a checked sentence (learnerReason); the unedited reply stays in the diagnostics.
    if (out.gap) return this.stopWith(job, 'capability_gap', 'capability', out.gap.message, false, { gap: { ...out.gap, shown: learnerReason(out.gap.reason) } });
    if (stage === 'preparing') {
      job.plan = job.revisedFrom ? revisedPlan(job.approvedBefore, out.plan) : out.plan; job.planHash = await hashAnimationPlan(job.plan); job.approval = null; job.refinement = null;
      await this.finishUsage({ ...job, actionKey: null }, 'completed');
      // A prepared plan always waits for the learner's Generate; only approve() moves it on.
      endStage(job.timing, 'done'); job.stage = 'awaiting_approval'; beginStage(job.timing, 'awaiting_approval'); markTiming(job.timing, 'proposalReady');
      await this.settlePlan(job);
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
      job.candidates.push({ repairs: job.repairs, ...(job.draft ? { previousDraft: job.draft } : {}), operation: out.operation || null, progress: out.progress !== false, ...(out.draft ? { draftHash: await hash16(out.draft), hasProgram: !!out.draft.program } : {}), ...(out.inputKeys ? { inputKeys: out.inputKeys } : {}), ...(out.artifactKeys ? { artifactKeys: out.artifactKeys } : {}), ...(out.rejected ? { rejected: out.rejected } : {}), ...(out.forwarded ? { forwarded: out.forwarded } : {}) });
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
  async stopWith(job, stopReason, category, message, retryable = false, extra = {}) {
    endStage(job.timing, stopReason);
    Object.assign(job, { stage: 'failed', stopReason, failure: { stage: job.stage, category, message, retryable, ...extra } });
    await this.save(job); await this.finishUsage(job, 'failed'); await this.report(job);
  }
  // The failure, explained once in the canvas Chat (one message per job and attempt; reloads, polling and retries never repeat it, found
  // again by its key): the same words the card shows (failureText). No model call. A Chat write that fails is tried again by the alarm,
  // and the card reloads the thread once it lands (chatPending); the card's explanation and actions stand meanwhile.
  async report(job) {
    if (job.stage !== 'failed' || job.inFlight || job.reported === job.attempt || !this.env.LEARN_DB) return;
    const clarifying = job.stopReason === 'needs_clarification', gap = plannerGap(job);
    const head = clarifying ? '' : gap ? 'This animation cannot be made as asked.' : job.plan?.title ? `"${clean(job.plan.title, 120)}" was not finished.` : 'Your animation was not finished.';
    const tail = clarifying ? '' : job.plan ? 'Your request and plan are kept.' : 'Your request is kept.';
    const choice = gap ? { animationChoice: { jobId: job.id, attempt: job.attempt, kind: 'gap', key: reportKey(job), alternatives: GAP_ALTERNATIVES.map(({ id, title, changes }) => ({ id, title, changes, credits: credits(job.reservation?.preparationMicros) })), chosen: null } } : {};
    try {
      await this.writeChat(job, reportKey(job), [head, failureText(job), tail].filter(Boolean).join(' '), choice);
      job.reported = job.attempt; job.reportTries = 0;
      await this.save(job);
    } catch {
      job.reportTries = (job.reportTries || 0) + 1;
      job.reportAt = Date.now() + reportDelay(job.reportTries);
      await this.save(job);
      const current = await this.state.storage.getAlarm?.();
      if (!current || current > job.reportAt) await this.state.storage.setAlarm?.(job.reportAt);
    }
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
      // A repair refused by a spending cap before it ran made nothing: Try again resumes at validation (retry), which counts the repair
      // again, so its turn comes back instead of the build stopping as "corrected once" (FX-AN-036: aj_0bb9a9d, platform daily limit).
      // A busy provider is not this: its Try again resumes at the repair itself, still counted.
      if (current.stage === 'repairing' && error.code !== 'provider_unavailable' && (['spend_limited', 'spend_refused'].includes(error.code) || error.status === 429)) {
        current.repairs = Math.max(0, current.repairs - 1); current.repairKinds?.pop();
      }
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
