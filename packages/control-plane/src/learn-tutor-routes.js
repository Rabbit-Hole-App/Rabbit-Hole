// Tutor v1 routes on the dev worker (docs/features/tutor-v1-implementation-map.md §5, §6):
//   POST /api/learn/tutor/evaluate  free text -> evidence events: JEV (800 ms, one batched request),
//                                   then the larger evaluator only when JEV is uncertain (8 s)
//   POST /api/learn/tutor/plan      one forced-tool planner call -> TutorResponse
// Nothing is stored here: evidence is session-scoped in the browser (§2).
import { authorizedBoardApp } from './learn-board.js';
import { JEV_TRANSPORTS, THRESHOLDS, askJev } from './learn-grade-jev.js';
import { anthropic } from './ask.js';
import { modelFailure } from './learn-research.js';
import { LEARN_TASKS, loggedModel } from './learn-models.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { evaluationFrom, largerInstruction, parseLarger, plannerRequest, readTutorAnswers, tutorJevRequest, TUTOR_TOOL } from './agents/learn-tutor.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export const JEV_TIMEOUT_MS = 800;
export const LARGER_TIMEOUT_MS = 8000;
const CONTEXT_LIMIT = 60000; // characters of planner context (about 12k tokens, §9)

const text = (value, max) => typeof value === 'string' && value.length <= max;
export function validateEvaluateBody(body) {
  const { message, spec } = body || {};
  if (typeof message !== 'string' || !message.trim() || message.length > 4000) return { error: 'message must be 1-4000 characters' };
  if (!spec || typeof spec !== 'object' || !Array.isArray(spec.claims) || !Array.isArray(spec.gaps)) return { error: 'spec.claims and spec.gaps are required' };
  if (spec.claims.length > 6 || spec.gaps.length > 4) return { error: 'at most 6 claims and 4 gaps' };
  for (const claim of spec.claims) {
    if (!text(claim?.id, 120) || !text(claim.concept, 60) || !text(claim.statement, 600) || !text(claim.drawn, 300)
      || !Array.isArray(claim.ideas) || claim.ideas.length > 4 || claim.ideas.some(idea => !text(idea, 300) || !idea)
      || !Array.isArray(claim.misconceptions) || claim.misconceptions.length > 5 || claim.misconceptions.some(wrong => !text(wrong?.id, 80) || !text(wrong?.check, 300))) return { error: 'invalid claim' };
  }
  for (const gap of spec.gaps) if (!text(gap?.concept, 60) || !text(gap.statement, 600) || !Array.isArray(gap.claims)) return { error: 'invalid gap' };
  if (spec.question != null && !text(spec.question, 1200)) return { error: 'invalid question' };
  return { value: { message, spec: { answering: !!spec.answering, ...(spec.question ? { question: spec.question } : {}), claims: spec.claims, gaps: spec.gaps } } };
}

// The JEV rung. A timeout, a missing key or a bad answer is `error`: the caller stores nothing
// settled and no state changes. No retry: a 429/529 wait would outlast the 800 ms budget.
export async function jevRung(env, spec, message, { ask = askJev } = {}) {
  const transport = env.TYPESAFE_API_KEY ? 'direct' : env.VERCEL_TYPESAFE_API_KEY ? 'gateway' : null;
  if (!transport || env.SUBSCRIPTION_ONLY === 'true') return { status: 'error', evaluator: 'jev', events: [], error: 'Jev is not configured on this worker.' };
  try {
    const request = tutorJevRequest(spec, message, JEV_TRANSPORTS[transport].model);
    const { body } = await ask(env, request, { transport, timeoutMs: JEV_TIMEOUT_MS, sleep: () => Promise.reject(new Error('Jev busy')) });
    return { ...evaluationFrom(spec, readTutorAnswers(body, spec), THRESHOLDS, 'jev'), evaluator: 'jev' };
  } catch (error) { return { status: 'error', evaluator: 'jev', events: [], error: error.message }; }
}

// The larger rung: the grading model task (the one behind /api/learn/assess) with a structured
// instruction. On error or timeout: `error`, nothing settled.
export async function largerRung(env, spec, message, { callModel = loggedModel('grading', anthropic), timeoutMs = LARGER_TIMEOUT_MS } = {}) {
  let timer;
  try {
    const call = (async () => {
      const response = await callModel(env, { max_tokens: LEARN_TASKS.grading.maxTokens, messages: [{ role: 'user', content: largerInstruction(spec, message) }] }, LEARN_TASKS.grading.model, null);
      if (!response.ok) throw await modelFailure(response, 'Evaluator unavailable');
      const result = await response.json();
      return result.content?.filter(block => block.type === 'text').map(block => block.text).join('\n') || '';
    })();
    const reply = await Promise.race([call, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The evaluator timed out')), timeoutMs); })]);
    return { ...evaluationFrom(spec, parseLarger(reply, spec), THRESHOLDS, 'larger'), evaluator: 'larger' };
  } catch (error) { return { status: 'error', evaluator: 'larger', events: [], error: error.message }; }
  finally { clearTimeout(timer); }
}

// Deterministic -> JEV -> larger (§3). The deterministic rung runs in the browser (the grade is
// already in the card's attemptLog), so this route starts at JEV.
export async function evaluateFreeText(env, spec, message, deps = {}) {
  const jev = await jevRung(env, spec, message, deps);
  if (jev.status !== 'uncertain') return jev;
  const larger = await largerRung(env, spec, message, deps);
  // An errored larger rung keeps JEV's unsettled events (§3.3: stored unsettled, no state change).
  return larger.status === 'error' ? { ...jev, larger_error: larger.error } : larger;
}

export async function planTurn(env, context, { callModel = loggedModel('tutor', anthropic) } = {}) {
  const response = await callModel(env, plannerRequest(context, LEARN_TASKS.tutor.maxTokens), LEARN_TASKS.tutor.model, null);
  if (!response.ok) throw await modelFailure(response, 'The tutor is unavailable');
  const result = await response.json();
  const call = result.content?.find(block => block.type === 'tool_use' && block.name === TUTOR_TOOL.name);
  if (!call?.input || !Array.isArray(call.input.actions)) throw new Error('The tutor returned no turn');
  return call.input;
}

export async function tutorRoute(path, req, env, deps = {}) {
  if (path !== '/api/learn/tutor/evaluate' && path !== '/api/learn/tutor/plan') return null;
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const access = await (deps.authorize || authorizedBoardApp)(req, env, body?.app, body?.pending || null);
  if (access instanceof Response) return access;
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  const ownerRefused = subscriptionOwnerRefusal(env, access);
  if (ownerRefused) return ownerRefused;
  if (path === '/api/learn/tutor/evaluate') {
    const input = validateEvaluateBody(body);
    if (input.error) return json({ error: input.error }, 400);
    return json(await evaluateFreeText(env, input.value.spec, input.value.message, deps));
  }
  const serialized = JSON.stringify(body?.context ?? null);
  if (!body?.context || typeof body.context !== 'object' || serialized.length > CONTEXT_LIMIT) return json({ error: `context must be an object of at most ${CONTEXT_LIMIT} characters` }, 400);
  try { return json(await planTurn(env, body.context, deps)); } catch (error) { return json({ error: error.message }, 502); }
}
