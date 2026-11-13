// DEV-ONLY seam (owner 2026-11-12): INTERACT_DESIGN_FIXTURE=<fixtureId> pins a new-flow job's design stages to the canonical fixture plan, so the build half
// (build_author, validate, render, build_review, build_repair) can be tested with the real builder against a fixed plan. The gate is the environment, not the
// request: it is read only when SMALL_ENV is dev/test or EXPLAIN_DIAGNOSTICS is "true", so production (neither) never takes it. Everything else about the job
// (hashes, approval, fit receipt, bounds) is the real path; only the three design roles' model calls are answered here, with no call, no reservation and no cost.
// Two deliberate deviations from the fixture, because the real validators refuse it otherwise: the card description is the short copy that the estimated fit
// accepts (the canonical 209 characters render in 6 lines at 320 px by the estimate), and claim evidence ids that the job did not supply are dropped.
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';

export const PIN_FIXTURES = Object.freeze(['toss-drop-standard', 'toss-drop-standard-controls']);
const PINNED_DESCRIPTION = 'A ball tossed at 3.0 m/s has zero velocity at its top, yet its acceleration stays -9.8 m/s^2 there and at every instant of the flight.';
const text = value => value;

export const designPinOf = env => ((env.SMALL_ENV === 'dev' || env.SMALL_ENV === 'test' || env.EXPLAIN_DIAGNOSTICS === 'true') && PIN_FIXTURES.includes(env.INTERACT_DESIGN_FIXTURE) ? env.INTERACT_DESIGN_FIXTURE : null);

export async function pinnedPlan(fixtureId, job) {
  const { plans } = await interactFixtures();
  // toss-drop-standard-controls already carries a description the estimated fit accepts; the original Standard needs the short copy.
  const plan = structuredClone(fixtureId === 'toss-drop-standard-controls' ? plans.standardControls : plans.standard), supplied = new Set((job.evidence || []).map(record => record.id));
  if (fixtureId === 'toss-drop-standard') plan.cardDescription = PINNED_DESCRIPTION;
  for (const claim of plan.claims) claim.evidenceIds = claim.evidenceIds.filter(id => supplied.has(id));
  return plan;
}

const passingReview = planHash => ({ planHash,
  learning: { goal: text('Explain why acceleration is not zero at the top.'), likelyUnderstanding: text('Pinned fixture plan: no design model ran.'), visualEvidence: text('Pinned fixture plan: no design model ran.'), transfer: { prompt: text('A jumper at the top of a jump.'), expectedReasoning: text('Gravity still acts.') }, teachBack: { prompt: text('Explain it to a friend.'), expectedReasoning: text('Velocity is zero for an instant; acceleration is not.') }, improvement: text('None: pinned fixture plan.'), score: 5 },
  sceneQuality: { accuracy: text('Pinned fixture plan.'), clarity: text('Pinned fixture plan.'), modeControls: text('Pinned fixture plan.'), buildability: text('Pinned fixture plan.'), score: 5 },
  findings: [], openChecks: [], verdict: 'pass' });

// The design roles' answer in the shape callInteractRole returns ({ output }), or null when this job/role is not pinned (the real call runs).
export async function pinnedDesignCall(fixtureId, job, role, args) {
  if (job.depth !== 'balanced') return null;
  if (role === 'design_author') { console.log(JSON.stringify({ event: 'interact_design_pinned', job: job.id, fixture: fixtureId, note: 'design stages answered by the fixture plan; no design model call' })); return { output: await pinnedPlan(fixtureId, job) }; }
  if (role === 'design_review') return { output: passingReview(args.input.planHash) };
  if (role === 'design_revise') return { output: { plan: args.input.plan, changes: [], unresolvedFindingIds: [] } };
  return null;
}
