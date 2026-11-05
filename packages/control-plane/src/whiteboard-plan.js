// /whiteboard planner stage (roadmap v1 W1.2/W1.3, sections 5.1, 6.1 and 6.3): one whiteboard_plan call, its reply normalised into the 6.4
// WhiteboardPlan (the server owns the duration, frames, ids, voice and quality), the deterministic fit check against whiteboard-policy.js, and
// the learner's words of roadmap 1.3: the proposal body, the refusal and the failure message. No other learner-visible string is written here.
import { PLAN_TOOL, WHITEBOARD_PLAN_SYSTEM } from './agents/whiteboard-plan.js';
import { WHITEBOARD_LIMITS as L, maxScenesFor } from './whiteboard-policy.js';
import { WHITEBOARD_QUALITY, WHITEBOARD_VOICE, validatePlan } from './whiteboard-schema.js';

const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const listOf = (value, n, max) => (Array.isArray(value) ? value.map(v => clean(v, max)).filter(Boolean).slice(0, n) : []);

// Roadmap 1.3, verbatim.
export const CONTEXT_CUT = 'Used the first part of the selected text.';
export const FAILURE_PLAN = 'the plan could not be written';
export const failureText = (title, reason) => `"${title}" was not finished: ${reason}. Your request and plan are kept; nothing was charged for the part that failed.`;
// ponytail: an unsafe request has no alternative (6.3); its "It can ..." sentence is left out, the rest is the approved sentence.
export const refusalText = (asked, alternative) => [`Whiteboard makes a narrated video, so it can't ${asked}.`, ...(alternative ? [`It can ${alternative}.`] : []), 'Edit the request or try /animation for something you can run.'].join(' ');
// The proposal body: <goal>, one line per scene, then the narration line.
export function planLines(plan) {
  return [plan.goal, ...plan.scenes.map((s, i) => `Scene ${i + 1} (${(s.endFrame - s.startFrame) / L.fps} s): ${s.learningPoint}`),
    `Narrated by one voice; ${plan.scenes.length} ${plan.scenes.length === 1 ? 'scene' : 'scenes'}; ${plan.durationSeconds} seconds.`].join('\n');
}

// The planner's reply as the contract's plan. The model gives each scene's seconds; frames, ids and every fixed field are the server's.
// -> { plan, title } (fit not yet checked) | { unsupported: { asked, alternative } } | { issues }
export function normalisePlan(input, { planId, revision, durationSeconds }) {
  if (input?.kind === 'unsupported') {
    const asked = clean(input.asked, 80), alternative = clean(input.alternative, 80);
    return asked ? { unsupported: { asked, alternative } } : { issues: ['asked: is required for an unsupported request'] };
  }
  if (input?.kind !== 'supported' || !Array.isArray(input.scenes)) return { issues: ['kind: must be supported with scenes, or unsupported'] };
  let frame = 0;
  const scenes = input.scenes.map((s, i) => {
    const startFrame = frame;
    frame += (Number.isInteger(s?.seconds) ? s.seconds : NaN) * L.fps;
    return { id: `s${i + 1}`, startFrame, endFrame: frame, learningPoint: clean(s?.learningPoint, 200), visualIntent: clean(s?.visualIntent, 400), narrationSummary: clean(s?.narrationSummary, 600),
      facts: (Array.isArray(s?.facts) ? s.facts : []).slice(0, 8).map(f => ({ text: clean(f?.text, 200), ...(f?.value !== undefined ? { value: f.value } : {}), ...(f?.unit ? { unit: clean(f.unit, 24) } : {}), provenance: f?.provenance })),
      illustration: false }; // W1 is vector-only
  });
  const plan = { schema: 'whiteboard-plan/1', planId, revision, goal: clean(input.goal, 300), audience: clean(input.audience, 120) || 'a curious learner', durationSeconds,
    language: 'en', voice: WHITEBOARD_VOICE, quality: WHITEBOARD_QUALITY, sourceRefs: [], scenes,
    substitutions: (Array.isArray(input.substitutions) ? input.substitutions : []).slice(0, 8).map(x => ({ requested: clean(x?.requested, 200), proposed: clean(x?.proposed, 200), reason: clean(x?.reason, 200) })),
    limitations: listOf(input.limitations, 8, 200) };
  return { plan, title: clean(input.title, 60) || clean(input.goal, 60) };
}

// The deterministic fit (6.1 planning row): the contract and policy checks of validatePlan, and the duration this release serves.
export function fitIssues(plan) {
  const issues = validatePlan(plan);
  if (plan?.durationSeconds > L.servedMaxSeconds) issues.push(`durationSeconds: this release serves at most ${L.servedMaxSeconds} seconds`);
  return issues;
}

// The planner's input. context: { text, cut } as the job holds it (already bounded to 8,000 characters).
export const planContent = job => JSON.stringify({ request: job.prompt, durationSeconds: job.durationSeconds, context: job.context?.text ? { text: job.context.text, cut: !!job.context.cut } : null,
  refinement: job.refinement ?? null, previous: job.plan ?? null,
  limits: { maxScenes: maxScenesFor(job.durationSeconds), minSceneSeconds: L.minWindowFrames / L.fps, beatsPerScene: L.beatsPerScene, narrationWords: L.narrationWords } });

// The planning stage: one call, then the reply normalised and fitted. A reply that does not fit is refused here (no simplified plan is shown
// as the full one). -> { plan, title } | { unsupported } ; throws { code: 'plan_unfit', issues } when it does not fit.
export async function planStage(job, ctx) {
  const reply = await ctx.call('plan', { system: WHITEBOARD_PLAN_SYSTEM, tool: PLAN_TOOL, content: planContent(job) });
  const out = normalisePlan(reply.input, { planId: job.id, revision: (job.plan?.revision ?? 0) + 1, durationSeconds: job.durationSeconds });
  if (out.unsupported) return out;
  const issues = out.issues ?? fitIssues(out.plan);
  if (issues.length) throw Object.assign(new Error(`The plan does not fit the policy: ${issues.slice(0, 6).join('; ')}`), { code: 'plan_unfit', issues, answer: reply.input });
  return out;
}
