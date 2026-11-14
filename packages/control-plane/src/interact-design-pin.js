// DEV-ONLY seam (owner 2026-11-12): INTERACT_DESIGN_FIXTURE=<fixtureId> pins a new-flow job's design stages to the canonical fixture plan, so the build half
// (build_author, validate, render, build_review, build_repair) can be tested with the real builder against a fixed plan. The gate is the environment, not the
// request: it is read only when SMALL_ENV is dev/test or EXPLAIN_DIAGNOSTICS is "true", so production (neither) never takes it. Everything else about the job
// (hashes, approval, fit receipt, bounds) is the real path; only the three design roles' model calls are answered here, with no call, no reservation and no cost.
// Two deliberate deviations from the fixture, because the real validators refuse it otherwise: the card description is the short copy that the estimated fit
// accepts (the canonical 209 characters render in 6 lines at 320 px by the estimate), and claim evidence ids that the job did not supply are dropped.
// ONE pin family (owner 2026-11-13): INTERACT_DESIGN_FIXTURE=toss pins by the job's Depth: brief -> toss-overview, balanced -> toss-standard, detailed -> toss-deep
// (the three reference toss-and-drop cards). A single plan id (toss-overview, toss-standard, toss-deep) pins that plan at its own Depth only. The older ids
// toss-drop-standard and toss-drop-standard-controls stay valid and pin the Standard (balanced) as before.
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { depthOf } from './chat-depth.js';

// The family: a Depth -> the plan id that Depth pins. Each id names its fixture plan and the one Depth it answers.
export const FIXTURE_DEPTHS = Object.freeze({ brief: 'toss-overview', balanced: 'toss-standard', detailed: 'toss-deep' });
// id -> [the plan's name, its Depth, the fixtures group it lives in]
const PLAN_OF = Object.freeze({ 'toss-overview': ['tossOverview', 'brief', 'referencePlans'], 'toss-standard': ['tossStandard', 'balanced', 'referencePlans'], 'toss-deep': ['tossDeep', 'detailed', 'referencePlans'], 'ledge-toss-moon': ['ledgeTossMoon', 'brief', 'referencePlans'], 'toss-drop-standard': ['standard', 'balanced', 'plans'], 'toss-drop-standard-controls': ['standardControls', 'balanced', 'plans'] });
// The second family (brief 7 section 5): INTERACT_DESIGN_FIXTURE=ledge pins the Moon ledge toss for brief only, to show a template build on a plan no template was written for.
export const LEDGE_DEPTHS = Object.freeze({ brief: 'ledge-toss-moon' });
export const PIN_FIXTURES = Object.freeze(['toss', 'ledge', ...Object.keys(PLAN_OF)]);
const PINNED_DESCRIPTION = 'A ball tossed at 3.0 m/s has zero velocity at its top, yet its acceleration stays -9.8 m/s^2 there and at every instant of the flight.';
const text = value => value;

export const designPinOf = env => ((env.SMALL_ENV === 'dev' || env.SMALL_ENV === 'test' || env.EXPLAIN_DIAGNOSTICS === 'true') && PIN_FIXTURES.includes(env.INTERACT_DESIGN_FIXTURE) ? env.INTERACT_DESIGN_FIXTURE : null);

// The plan id a pin answers for a job's Depth, or null when this Depth is not pinned (the real design runs): `toss` follows the Depth, a plan id answers its own Depth only.
export const pinnedFixtureId = (pin, depth) => { const d = depthOf(depth), id = pin === 'toss' ? FIXTURE_DEPTHS[d] : pin === 'ledge' ? LEDGE_DEPTHS[d] : pin; return id && PLAN_OF[id]?.[1] === d ? id : null; };

export async function pinnedPlan(fixtureId, job) {
  const id = pinnedFixtureId(fixtureId, job.depth) ?? fixtureId, fixtures = await interactFixtures(), [name, , group] = PLAN_OF[id];
  // toss-drop-standard-controls and the three reference plans already carry a description the estimated fit accepts; the original Standard needs the short copy.
  const plan = structuredClone(fixtures[group][name]), supplied = new Set((job.evidence || []).map(record => record.id));
  if (id === 'toss-drop-standard') plan.cardDescription = PINNED_DESCRIPTION;
  for (const claim of plan.claims) claim.evidenceIds = claim.evidenceIds.filter(id => supplied.has(id));
  return plan;
}

const passingReview = planHash => ({ planHash,
  learning: { goal: text('Explain why acceleration is not zero at the top.'), likelyUnderstanding: text('Pinned fixture plan: no design model ran.'), visualEvidence: text('Pinned fixture plan: no design model ran.'), transfer: { prompt: text('A jumper at the top of a jump.'), expectedReasoning: text('Gravity still acts.') }, teachBack: { prompt: text('Explain it to a friend.'), expectedReasoning: text('Velocity is zero for an instant; acceleration is not.') }, improvement: text('None: pinned fixture plan.'), score: 5 },
  sceneQuality: { accuracy: text('Pinned fixture plan.'), clarity: text('Pinned fixture plan.'), modeControls: text('Pinned fixture plan.'), buildability: text('Pinned fixture plan.'), score: 5 },
  findings: [], openChecks: [], verdict: 'pass' });

// The design roles' answer in the shape callInteractRole returns ({ output }), or null when this job/role is not pinned (the real call runs).
export async function pinnedDesignCall(fixtureId, job, role, args) {
  const id = pinnedFixtureId(fixtureId, job.depth);
  if (!id) return null;
  if (role === 'design_author') {
    const plan = await pinnedPlan(id, job);
    // The pinned plan binds to the catalogue this job was offered (the model's own input names it), never to the fixture's.
    const offered = args?.input?.capabilities?.catalogueHash; if (offered) plan.scene.runtime.catalogueHash = offered;
    console.log(JSON.stringify({ event: 'interact_design_pinned', job: job.id, fixture: id, note: 'design stages answered by the fixture plan; no design model call' }));
    return { output: plan };
  }
  if (role === 'design_review') return { output: passingReview(args.input.planHash) };
  if (role === 'design_revise') return { output: { plan: args.input.plan, changes: [], unresolvedFindingIds: [] } };
  return null;
}
