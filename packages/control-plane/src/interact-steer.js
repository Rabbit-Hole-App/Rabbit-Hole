// JEV steer and triage for the /interact build half (item 5; the pattern of explanation-planner.js planExplanation). Two classifier calls to TypeSafe System One
// (jev-latest), both OFF unless INTERACT_STEER=jev and TYPESAFE_API_KEY are set, both fail-open: any error or timeout is null, one log line, and the build runs exactly as
// it does today (the card is never blocked on a classifier). The questions CLASSIFY only (a kind, which composites, a class of failure); every rule stays the server's
// (explanation-planner.js: a rule put into a question flipped 53 plans at the wrong depths). Consumers are seams: interact-build.js buildInput(job, plan, hash, steer)
// and explain-program-stage.js programRepairContent(job, failure) with failure.triage; with null, their request is byte-identical to today's.
// TODO(integrator): explain-job.js / interact-job.js call steerBuild(env, plan) before buildScene (passed as ctx.steer) and triageFailure(env, problems) before a repair
// (as failure.triage), and add the returned ms as msSteer on the timing record (item 1 column).
import { FIX_AT, PHYSICAL_AT, PLANNER_MODEL, PLANNER_TIMEOUT_MS } from './explanation-planner.js';

export const STEER_SETTING = 'INTERACT_STEER';
export const steerEnabled = env => env?.[STEER_SETTING] === 'jev' && typeof env.TYPESAFE_API_KEY === 'string' && env.TYPESAFE_API_KEY.length > 0;

export const SCENE_KINDS = Object.freeze(['static', 'time', 'experiment']);
export const COMPOSITES = Object.freeze(['vector', 'gate', 'groundMark', 'axis', 'plot', 'diagram']);
export const BUDGETS = Object.freeze(['small', 'medium', 'large']);
export const FAILURE_CLASSES = Object.freeze(['geometry', 'binding', 'physics', 'readout', 'other']);

const COMPOSITE_QUESTION = {
  vector: 'Does the scene draw a quantity as an arrow from a point (a velocity, force or acceleration) whose length follows a value?',
  gate: 'Does the scene hold something back and release it (a gate, latch or release point)?',
  groundMark: 'Does the scene need a fixed reference mark on the ground or a baseline (a launch mark, a floor, a datum)?',
  axis: 'Does the scene draw a labelled axis with ticks and units?',
  plot: 'Does the scene draw a curve or points of one quantity against another?',
  diagram: 'Does the scene embed a written diagram (a graph of steps, parts or relations)?',
};
export const STEER_QUESTIONS = {
  sceneKind: { type: 'choice', instructions: 'What kind of scene is this?',
    criteria: { static: 'One picture that does not change with time, with perhaps a few adjustable values.', time: 'A scene that plays or scrubs over time.', experiment: 'A scene the learner changes by controls to see an effect, with no time axis of its own.' } },
  objectBudget: { type: 'choice', instructions: 'How many drawn objects does the scene need for the largest input?',
    criteria: { small: 'A handful of objects.', medium: 'Dozens of objects.', large: 'Many dozens of objects.' } },
  stateful: { type: 'noul', instructions: 'Must the card remember what the learner did (buttons, selections, a run step by step) beyond its control values?' },
  ...Object.fromEntries(COMPOSITES.map(name => [`uses_${name}`, { type: 'noul', instructions: COMPOSITE_QUESTION[name] }])),
};
export const TRIAGE_QUESTIONS = {
  failureClass: { type: 'choice', instructions: 'Which kind of defect do these failed checks describe?',
    criteria: { geometry: 'Objects overlap, sit outside the frame or are placed wrongly.', binding: 'A control, readout or support is not wired to what the plan names.', physics: 'A computed number, sign, unit or trend is wrong.', readout: 'A displayed value or label does not match the quantity.', other: 'None of these.' } },
};

const clip = (v, n = 2000) => String(v ?? '').slice(0, n);
const now = () => Date.now();

// -> System One answers | null. The failure reason goes to the log, never to the learner.
async function ask(env, call, state, questions, { fetchImpl = globalThis.fetch, timeoutMs = PLANNER_TIMEOUT_MS } = {}) {
  const started = now();
  try {
    const response = await fetchImpl('https://api.typesafe.ai/v1/systemone', { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'rabbit-hole-interact/1' },
      body: JSON.stringify({ model: PLANNER_MODEL, state, questions }) });
    if (!response.ok) throw new Error(`http ${response.status}`);
    const out = await response.json();
    if (Object.keys(questions).some(k => !out?.answers?.[k])) throw new Error('incomplete answers');
    const ms = now() - started;
    console.log(JSON.stringify({ event: 'interact_steer', call, ms, inputTokens: out.usage?.input_tokens ?? null }));
    return { answers: out.answers, ms, inputTokens: out.usage?.input_tokens ?? null };
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError' || /timeout|aborted/i.test(String(error?.message || ''));
    console.log(JSON.stringify({ event: 'interact_steer_failed', call, reason: timedOut ? 'timeout' : String(error?.message || error).slice(0, 120), timeout: timedOut, ms: now() - started }));
    return null;
  }
}
const top = (answer, valid) => (valid.includes(answer?.choice) && (answer.confidence ?? 0) >= FIX_AT ? answer.choice : null);

// The plan as the classifier reads it: what the scene is and does, never the program rules.
export const steerState = plan => ({ title: clip(plan.title, 300), learningGoal: clip(plan.learningGoal, 600), depth: plan.depth, mode: plan.mode, description: clip(plan.scene?.description),
  entities: clip((plan.scene?.entities ?? []).map(e => e.label).join(', ')), quantities: clip((plan.scene?.quantities ?? []).map(q => `${q.label}${q.unit ? ` (${q.unit})` : ''}`).join(', ')),
  controls: clip((plan.controls ?? []).map(c => `${c.id}:${c.type}`).join(', ')), supports: clip((plan.supportingVisuals ?? []).map(s => s.description ?? s.id).join(' | ')) });

// steerBuild(env, plan) -> { sceneKind: 'static'|'time'|'experiment'|null, composites: [...], stateful, objectBudget: 'small'|'medium'|'large', ms, inputTokens } | null.
// sceneKind is null and objectBudget 'medium' when the classifier is not sure (top probability under FIX_AT, as the planner fixes a kind).
export async function steerBuild(env, plan, options = {}) {
  if (!steerEnabled(env)) return null;
  const got = await ask(env, 'steer', steerState(plan), STEER_QUESTIONS, options);
  if (!got) return null;
  const { answers: a } = got;
  return { sceneKind: top(a.sceneKind, SCENE_KINDS), composites: COMPOSITES.filter(name => (a[`uses_${name}`]?.noul ?? 0) >= FIX_AT), stateful: (a.stateful?.noul ?? 0) >= PHYSICAL_AT,
    objectBudget: top(a.objectBudget, BUDGETS) ?? 'medium', ms: got.ms, inputTokens: got.inputTokens };
}

// The object ids a failed check names: ids a problem carries (`ids`), else quoted tokens in its message.
const idsOf = p => [...(Array.isArray(p?.ids) ? p.ids : []), ...[...String(typeof p === 'string' ? p : p?.message ?? '').matchAll(/["'`]([A-Za-z0-9_.:-]{1,64})["'`]/g)].map(m => m[1])];
// triageFailure(env, problems) -> { class: 'geometry'|'binding'|'physics'|'readout'|'other', objectIds: [...], ms, inputTokens } | null.
// problems: the failed rules/oracle problems, strings or { message, ids? }.
export async function triageFailure(env, problems, options = {}) {
  if (!steerEnabled(env) || !Array.isArray(problems) || !problems.length) return null;
  const list = problems.slice(0, 12).map(p => clip(typeof p === 'string' ? p : p?.message, 300));
  const got = await ask(env, 'triage', { problems: clip(list.join('\n')) }, TRIAGE_QUESTIONS, options);
  if (!got) return null;
  return { class: top(got.answers.failureClass, FAILURE_CLASSES) ?? 'other', objectIds: [...new Set(problems.flatMap(idsOf))].slice(0, 24), ms: got.ms, inputTokens: got.inputTokens };
}
