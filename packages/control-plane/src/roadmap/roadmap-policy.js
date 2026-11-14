// DRAFT CONTRACT, unmounted and unreferenced (Tutor ladder R4 contracts lane; docs/features/explain-on-canvas/contracts/planning.md 13).
// The one versioned runtime policy (implementation checklist BASE.02, R4.01; v1.3 5.5, 8.3): every operational limit of the roadmap in one
// object. Pure, no env, no clock. Each leaf is marked `existing` (a number the repository already enforces, with its source) or `proposed`
// (an engineering setting to freeze with fixtures and a bounded real-model run; NOT a spending approval). 5/10/15 steps and three cards per
// step are provisional upper bounds, never quotas: the planner uses fewer when sufficient.
import { DEPTHS } from './roadmap-contract.js';
import { depthOf } from '../chat-depth.js';

export const ROADMAP_POLICY_VERSION = 'roadmap-limits-1';

const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };

export const ROADMAP_LIMITS = deepFreeze({
  version: ROADMAP_POLICY_VERSION,
  // Step ceilings by Depth (v1.3 2.2) and cards per step (D45). R4 plans one card per step where sufficient.
  stepCeiling: { brief: 5, balanced: 10, detailed: 15 },
  cardsPerStep: { ceiling: 3, r4Default: 1 },
  // Input and output bounds.
  source: { chars: 40000, passageChars: 8000, instructionChars: 1000, requestBodyBytes: 20000, contextChars: 8000 },
  summary: { subjectSourceChars: 3000, claimsPerCard: 6 },
  // maxTokens per model role (the proposed central tasks, planning.md 2). Opus 5.5 thinks inside maxTokens.
  maxTokens: { roadmap_subject: 1000, roadmap_draft: 12000, roadmap_revise: 12000, roadmap_proposal: 3000, roadmap_grounding_check: 1500,
    roadmap_grounding_escalation: 4000, roadmap_safety_adjudicate: 1500, artifact: 4000 },
  // Call counts.
  calls: { generationPerCard: 1, automaticRetriesPerCard: 1, groundingEscalationsPerCard: 1, adjudicationsPerResult: 1, toolCallsPerPlan: 8, repairsPerPlan: 1 },
  // Platform-work quotas per learner and window (D14): provisional counters, not budget approval.
  quotas: { windowSeconds: { hour: 3600, day: 86400 },
    perHour: { invite: 6, plan: 6, propose: 20, check: 60 }, perDay: { invite: 20, plan: 20, propose: 80, check: 240 } },
  // Stage deadlines in milliseconds. safety* mirror the JEV transport the screen reuses.
  deadlineMs: { subject: 15000, draft: 120000, revise: 120000, proposal: 45000, generatePerCall: 90000, groundingCheck: 30000,
    safetyFetch: 20000, safetyRetrySleep: 1000, adjudication: 45000,
    // Overall deadlines. checking / readiness / stepWork are validated against the arithmetic below, never hand-trimmed.
    checking: 150000, readiness: 200000, stepWork: 660000 },
  retries: { safetyFetch: 1, checkingRetries: 1 },
  retention: { unacceptedBodyDays: 30, actionDays: 30, processedEventDays: 30, deliveryDeadlineHours: 24 },
  // The usage hold window a roadmap step must stay inside (learn-usage.js HOLD_SECONDS.artifact).
  hold: { artifactSeconds: 3600 },
});

// existing = enforced by repository code today (source cited); proposed = engineering setting to freeze with fixtures.
export const LIMIT_BASIS = deepFreeze({
  'stepCeiling': ['proposed', 'v1.3 2.2/5.5 provisional upper bounds, not quotas'],
  'cardsPerStep': ['proposed', 'v1.3 D45 provisional maximum three; R4 starts with one'],
  'source.chars': ['proposed', 'planning.md 4; measured in the R4 smoke'],
  'source.passageChars': ['existing', 'learn-artifact.js:177 context cap 8000'],
  'source.contextChars': ['existing', 'learn-artifact.js:177 context cap 8000'],
  'source.instructionChars': ['existing', 'learn-artifact.js:177 args cap 1000'],
  'source.requestBodyBytes': ['existing', 'learn-artifact.js:175 raw cap 20000'],
  'summary': ['proposed', 'planning.md 4 and 10'],
  'maxTokens.artifact': ['existing', 'learn-models.js:113 LEARN_TASKS.artifact maxTokens 4000'],
  'maxTokens': ['proposed', 'planning.md 2 precedent: journey_path 12000, journey_section 3000, tutor_next_steps 1500/4000'],
  'calls.generationPerCard': ['existing', 'owner MVP 2026-11-06 (CORE.04): one ordinary author call per accepted card, repairs 0 (roadmap-generate.js)'],
  'calls': ['proposed', 'billing.md 6'],
  'quotas': ['proposed', 'D14 provisional counters, not budget approval'],
  'deadlineMs.safetyFetch': ['existing', 'webpage-screen.js:14 SCREEN_LIMITS.timeoutMs 20000'],
  'deadlineMs.safetyRetrySleep': ['existing', 'learn-grade-jev.js askJev retry sleep is capped at 1000 ms'],
  'deadlineMs': ['proposed', 'planning.md 13; latency not measured by this lane'],
  'retries.safetyFetch': ['existing', 'learn-grade-jev.js askJev retries a 429/529 once'],
  'retries': ['proposed', 'v1.3 6.4 one bounded retry'],
  'retention': ['proposed', 'D16 carried default'],
  'hold.artifactSeconds': ['existing', 'learn-usage.js:461 HOLD_SECONDS.artifact 3600'],
  'quotas.windowSeconds': ['proposed', 'D14'],
});

// Dotted paths of every numeric leaf.
export function leafPaths(value = ROADMAP_LIMITS, prefix = '') {
  return Object.entries(value).flatMap(([k, v]) => (v && typeof v === 'object' ? leafPaths(v, `${prefix}${k}.`) : typeof v === 'number' ? [`${prefix}${k}`] : []));
}
// The basis of a leaf: the longest registered prefix.
export function basisOf(path) {
  const parts = path.split('.');
  for (let n = parts.length; n > 0; n--) { const hit = LIMIT_BASIS[parts.slice(0, n).join('.')]; if (hit) return { status: hit[0], source: hit[1] }; }
  return null;
}

export const ceilingFor = (depth, limits = ROADMAP_LIMITS) => (DEPTHS.includes(depthOf(depth)) ? limits.stepCeiling[depthOf(depth)] : limits.stepCeiling.balanced);

// --- deadline arithmetic (BASE.02: the overall checking deadline includes every admitted retry and the adjudication) ------------------
// One safety screen = a JEV fetch, plus its one admitted retry on 429/529 (askJev), plus the retry sleep. The per-fetch timeout alone
// (20 s) is never the screen's deadline. Chunks of one screen run concurrently (screenCapture), so they do not add.
export const safetyScreenMs = (L = ROADMAP_LIMITS) => L.deadlineMs.safetyFetch * (1 + L.retries.safetyFetch) + (L.retries.safetyFetch > 0 ? L.deadlineMs.safetyRetrySleep : 0);
// Conservative sequential worst case for one result's checking: the grounding check and its one escalation, the screen with its retry,
// and one contextual adjudication. Running them in parallel can only be faster.
export const checkingBudgetMs = (L = ROADMAP_LIMITS) =>
  L.deadlineMs.groundingCheck * (1 + L.calls.groundingEscalationsPerCard) + safetyScreenMs(L) + L.deadlineMs.adjudication * L.calls.adjudicationsPerResult;
// Proposal readiness = compose + the checks of the proposal's own text.
export const readinessBudgetMs = (L = ROADMAP_LIMITS) => L.deadlineMs.proposal + checkingBudgetMs(L);
// Accepted-step work = (every generation call + checking), once, plus the automatic retry's copy.
export const stepWorkBudgetMs = (L = ROADMAP_LIMITS) =>
  (1 + L.calls.automaticRetriesPerCard) * (L.deadlineMs.generatePerCall * L.calls.generationPerCard + checkingBudgetMs(L));

// -> a list of problems; [] when the policy is internally consistent.
export function validateLimits(L = ROADMAP_LIMITS) {
  const problems = [];
  for (const path of leafPaths(L)) {
    const value = path.split('.').reduce((o, k) => o[k], L);
    if (path !== 'version' && !(Number.isInteger(value) && value >= 0)) problems.push(`${path} is not a non-negative integer`);
    if (!basisOf(path)) problems.push(`${path} has no existing/proposed basis`);
  }
  if (!(L.stepCeiling.brief < L.stepCeiling.balanced && L.stepCeiling.balanced < L.stepCeiling.detailed)) problems.push('step ceilings must grow with Depth');
  if (L.cardsPerStep.r4Default > L.cardsPerStep.ceiling) problems.push('R4 default cards exceed the ceiling');
  if (L.source.passageChars > L.source.contextChars) problems.push('a step passage must fit the adapter context cap');
  if (L.source.passageChars > L.source.chars) problems.push('a passage cannot exceed the source bound');
  if (L.deadlineMs.checking < checkingBudgetMs(L)) problems.push(`checking deadline ${L.deadlineMs.checking} ms is below its arithmetic ${checkingBudgetMs(L)} ms`);
  if (L.deadlineMs.readiness < readinessBudgetMs(L)) problems.push(`readiness deadline ${L.deadlineMs.readiness} ms is below its arithmetic ${readinessBudgetMs(L)} ms`);
  if (L.deadlineMs.stepWork < stepWorkBudgetMs(L)) problems.push(`step work deadline ${L.deadlineMs.stepWork} ms is below its arithmetic ${stepWorkBudgetMs(L)} ms`);
  if (L.deadlineMs.stepWork >= (L.hold.artifactSeconds * 1000) / 2) problems.push('step work must stay well inside the usage hold window');
  if (L.deadlineMs.safetyFetch * (1 + L.retries.safetyFetch) > L.deadlineMs.checking) problems.push('one screen with its retry must fit the checking deadline');
  if (L.calls.automaticRetriesPerCard > 1) problems.push('v1.3 5.2 allows one automatic retry');
  return problems;
}
